import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { createDatabase } from "../client";
import { runMigrations } from "../migrator";
import {
  HostRepository,
  PullRequestRepository,
  recoverExpiredLeases,
  TaskRepository,
  WorkspaceRepository,
} from "./index";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;
let database: ReturnType<typeof createDatabase> | undefined;
let rawSql: ReturnType<typeof postgres> | undefined;

function requireRow<T>(row: T | null | undefined, label: string): T {
  if (!row) {
    throw new Error(`${label} was not returned from the database`);
  }
  return row;
}

async function createWorkspaceFixture(label: string) {
  if (!database) {
    throw new Error("Database fixture is not initialized");
  }

  const hosts = new HostRepository(database.db);
  const workspaces = new WorkspaceRepository(database.db);
  const suffix = `${Date.now()}_${crypto.randomUUID()}`;
  const host = requireRow(
    await hosts.upsertHost({
      id: `host_${label}_${suffix}`,
      name: `host ${label}`,
      status: "online",
    }),
    "host",
  );
  const repository = requireRow(
    await workspaces.upsertRepository({
      id: `repo_${label}_${suffix}`,
      owner: `owner_${label}_${suffix}`,
      name: "maxxy-me",
      remoteUrl: `https://github.com/example/${label}-${suffix}.git`,
    }),
    "repository",
  );
  const workspace = requireRow(
    await workspaces.createWorkspace({
      id: `ws_${label}_${suffix}`,
      name: `workspace ${label}`,
      repositoryId: repository.id,
      defaultHostId: host.id,
      projectPath: `/tmp/${label}`,
      worktreeRoot: `/tmp/${label}/worktrees`,
    }),
    "workspace",
  );

  return { host, repository, workspace };
}

beforeAll(async () => {
  if (!databaseUrl) {
    return;
  }
  await runMigrations({ databaseUrl, releaseVersion: "test" });
  database = createDatabase(databaseUrl);
  rawSql = postgres(databaseUrl, { max: 1 });
});

afterAll(async () => {
  await database?.close();
  await rawSql?.end({ timeout: 1 });
});

describe("database repositories", () => {
  integrationTest(
    "enforces task status constraints and repository transition rules",
    async () => {
      if (!database || !rawSql) {
        throw new Error("Database fixture is not initialized");
      }

      const { workspace } = await createWorkspaceFixture("status");
      const tasks = new TaskRepository(database.db);
      const task = requireRow(
        await tasks.createTask({
          workspaceId: workspace.id,
          title: "Plan work",
          prompt: "Plan the work",
        }),
        "task",
      );

      await expect(tasks.transitionTask(task.id, "running")).rejects.toThrow(
        "Invalid task transition",
      );
      const [constraint] = await rawSql<{ conname: string }[]>`
        select conname
        from pg_constraint
        where conrelid = 'tasks'::regclass
          and conname = 'tasks_status_check'
      `;
      expect(constraint?.conname).toBe("tasks_status_check");
    },
  );

  integrationTest("ignores duplicate GitHub webhook deliveries", async () => {
    if (!database) {
      throw new Error("Database fixture is not initialized");
    }

    const pullRequests = new PullRequestRepository(database.db);
    const deliveryId = `delivery_${crypto.randomUUID()}`;

    const first = await pullRequests.recordWebhookDelivery({
      deliveryId,
      eventName: "pull_request",
      action: "opened",
      signatureVerified: true,
      payload: { number: 1 },
    });
    const duplicate = await pullRequests.recordWebhookDelivery({
      deliveryId,
      eventName: "pull_request",
      action: "opened",
      signatureVerified: true,
      payload: { number: 1 },
    });

    expect(first.duplicate).toBe(false);
    expect(first.row?.deliveryId).toBe(deliveryId);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.row).toBeNull();
  });

  integrationTest(
    "recovers expired task leases after a worker crash",
    async () => {
      if (!database || !rawSql) {
        throw new Error("Database fixture is not initialized");
      }

      const { host, workspace } = await createWorkspaceFixture("lease");
      const tasks = new TaskRepository(database.db);
      const task = requireRow(
        await tasks.createTask({
          workspaceId: workspace.id,
          title: "Lease work",
          prompt: "Lease the work",
        }),
        "task",
      );
      const lease = requireRow(
        await tasks.acquireTaskLease({
          taskId: task.id,
          hostId: host.id,
          leaseSeconds: 60,
        }),
        "task lease",
      );

      expect(lease.status).toBe("active");

      await rawSql`update task_leases set expires_at = now() - interval '1 hour' where id = ${lease.id}`;
      const recovered = await recoverExpiredLeases(database.db);

      expect(recovered.expiredTaskLeases).toHaveLength(1);
      expect(recovered.expiredTaskLeases[0]?.id).toBe(lease.id);
      expect(recovered.expiredTaskLeases[0]?.status).toBe("expired");
    },
  );
});
