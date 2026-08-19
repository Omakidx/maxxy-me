import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type {
  HostCommandName,
  HostCommandResultMessage,
} from "@maxxy/contracts";
import {
  createDatabase,
  type DatabaseHandle,
  runMigrations,
} from "@maxxy/database";
import { makeMaxxyBranchName, makeMaxxyWorktreePath } from "@maxxy/git";
import { Phase7WorkflowService } from "./phase7-workflow";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;
let database: DatabaseHandle | undefined;

beforeAll(async () => {
  if (!databaseUrl) {
    return;
  }
  await runMigrations({ databaseUrl, releaseVersion: "phase7-test" });
  database = createDatabase(databaseUrl);
});

afterAll(async () => {
  await database?.close();
});

describe("Phase7WorkflowService", () => {
  integrationTest(
    "runs an assigned task through draft PR creation",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }
      const db = database;
      const fixture = await createWorkflowFixture(db);
      const commands: HostCommandName[] = [];
      const service = new Phase7WorkflowService(
        db,
        async (_hostId, command) => {
          commands.push(command);
          return commandResult(command, outputFor(command, fixture));
        },
      );

      await service.dispatchAssignedTasksForHost(fixture.hostId);
      await waitFor(async () => {
        const [row] = await db.sql<{ status: string }[]>`
        select status from tasks where id = ${fixture.taskId}
      `;
        return row?.status === "awaiting_review";
      });

      const [task] = await db.sql<
        {
          status: string;
          branch_name: string | null;
          base_sha: string | null;
        }[]
      >`
      select status, branch_name, base_sha from tasks where id = ${fixture.taskId}
    `;
      expect(task).toMatchObject({
        status: "awaiting_review",
        branch_name: fixture.branchName,
        base_sha: "base-sha-test",
      });

      const [worktree] = await db.sql<
        { path: string; branch_name: string; status: string; dirty: boolean }[]
      >`
      select path, branch_name, status, dirty from worktrees where task_id = ${fixture.taskId}
    `;
      expect(worktree).toMatchObject({
        path: fixture.worktreePath,
        branch_name: fixture.branchName,
        status: "active",
        dirty: false,
      });

      const [pullRequest] = await db.sql<
        { number: number; status: string; head_branch: string; url: string }[]
      >`
      select number, status, head_branch, url from pull_requests where task_id = ${fixture.taskId}
    `;
      expect(pullRequest).toMatchObject({
        number: 42,
        status: "draft",
        head_branch: fixture.branchName,
        url: "https://github.com/example/repo/pull/42",
      });

      const gitOperations = await db.sql<{ operation: string }[]>`
      select operation from git_operations where task_id = ${fixture.taskId} order by created_at asc
    `;
      expect(gitOperations.map((row) => row.operation)).toEqual([
        "repository.prepare",
        "repository.fetch",
        "worktree.create",
        "git.validate",
        "git.status",
        "git.commit",
        "git.push",
      ]);
      expect(commands).toEqual([
        "repository.prepare",
        "repository.fetch",
        "worktree.create",
        "codex.runtime.start",
        "codex.turn.start",
        "git.validate",
        "command.run",
        "git.status",
        "git.commit",
        "git.push",
        "github.pull_request.create",
      ]);

      const [taskLease] = await db.sql<{ status: string }[]>`
      select status from task_leases where task_id = ${fixture.taskId}
    `;
      const [codexLease] = await db.sql<{ status: string }[]>`
      select status from codex_connection_leases where task_id = ${fixture.taskId}
    `;
      expect(taskLease?.status).toBe("released");
      expect(codexLease?.status).toBe("released");
    },
  );
});

type WorkflowFixture = Awaited<ReturnType<typeof createWorkflowFixture>>;

async function createWorkflowFixture(database: DatabaseHandle) {
  const suffix = crypto.randomUUID();
  const hostId = `host_phase7_${suffix}`;
  const repositoryId = `repo_phase7_${suffix}`;
  const workspaceId = `workspace_phase7_${suffix}`;
  const capacitySourceId = `capsrc_phase7_${suffix}`;
  const connectionId = `codexconn_phase7_${suffix}`;
  const profileId = `profile_phase7_${suffix}`;
  const taskId = `task_phase7_${suffix}`;
  const attemptId = `attempt_phase7_${suffix}`;
  const agentRole = "backend";
  const repositoryOwner = `example_${suffix}`;
  const branchName = makeMaxxyBranchName({ taskId, agentRole });
  const worktreeRoot = `/tmp/maxxy-phase7-test/${workspaceId}/worktrees`;
  const worktreePath = makeMaxxyWorktreePath({
    worktreeRoot,
    workspaceId,
    taskId,
    agentRole,
  });

  await database.sql`
    insert into hosts (id, name, status, max_concurrent_agents, last_heartbeat_at)
    values (${hostId}, 'phase 7 host', 'online', 1, now())
  `;
  await database.sql`
    insert into repositories (id, provider, owner, name, remote_url, default_branch)
    values (${repositoryId}, 'github', ${repositoryOwner}, 'repo', ${`https://github.com/${repositoryOwner}/repo.git`}, 'main')
  `;
  await database.sql`
    insert into workspaces (
      id, name, repository_id, default_host_id, base_branch, project_path,
      worktree_root, validation_profile
    ) values (
      ${workspaceId}, 'phase 7 workspace', ${repositoryId}, ${hostId}, 'main',
      '/tmp/maxxy-phase7-test/repo', ${worktreeRoot},
      ${JSON.stringify({ commands: [{ command: "bun", args: ["test"], profile: "default" }] })}::jsonb
    )
  `;
  await database.sql`
    insert into codex_capacity_sources (id, label, kind, max_concurrent_runs)
    values (${capacitySourceId}, 'phase 7 source', 'chatgpt_account', 1)
  `;
  await database.sql`
    insert into codex_connections (
      id, host_id, capacity_source_id, label, auth_mode, status, credential_slot_id, max_concurrent_runs
    ) values (
      ${connectionId}, ${hostId}, ${capacitySourceId}, 'phase 7 connection',
      'chatgpt', 'ready_chatgpt', ${`slot_${suffix}`}, 1
    )
  `;
  await database.sql`
    insert into agent_profiles (id, workspace_id, name, role, instructions)
    values (${profileId}, ${workspaceId}, 'Backend', ${agentRole}, 'Implement the task')
  `;
  await database.sql`
    insert into tasks (
      id, workspace_id, title, prompt, status, assigned_host_id,
      assigned_codex_connection_id, assigned_profile_id, priority
    ) values (
      ${taskId}, ${workspaceId}, 'Phase 7 task', 'Change README', 'assigned',
      ${hostId}, ${connectionId}, ${profileId}, 1
    )
  `;
  await database.sql`
    insert into task_leases (id, task_id, host_id, status, expires_at)
    values (${`tasklease_${suffix}`}, ${taskId}, ${hostId}, 'active', now() + interval '10 minutes')
  `;
  await database.sql`
    insert into codex_connection_leases (
      id, codex_connection_id, capacity_source_id, task_id, status, expires_at
    ) values (
      ${`codexlease_${suffix}`}, ${connectionId}, ${capacitySourceId}, ${taskId},
      'active', now() + interval '10 minutes'
    )
  `;
  await database.sql`
    insert into task_runtime_attempts (
      id, task_id, attempt_number, host_id, codex_connection_id, capacity_source_id
    ) values (${attemptId}, ${taskId}, 1, ${hostId}, ${connectionId}, ${capacitySourceId})
  `;

  return {
    hostId,
    taskId,
    repositoryId,
    workspaceId,
    connectionId,
    capacitySourceId,
    attemptId,
    branchName,
    worktreePath,
  };
}

function commandResult(
  command: HostCommandName,
  output: string,
): HostCommandResultMessage {
  const now = new Date().toISOString();
  return {
    type: "host.command_result",
    commandId: `cmd_${command}`,
    command,
    status: "completed",
    output,
    outputTruncated: false,
    startedAt: now,
    completedAt: now,
  };
}

function outputFor(command: HostCommandName, fixture: WorkflowFixture) {
  switch (command) {
    case "repository.prepare":
      return JSON.stringify({
        repositoryPath: "/tmp/maxxy-phase7-test/repo",
        remoteUrl: "https://github.com/example/repo.git",
        defaultBranch: "main",
        baseRef: "origin/main",
        baseSha: "base-sha-test",
        clean: true,
      });
    case "repository.fetch":
      return "fetched";
    case "worktree.create":
      return JSON.stringify({
        worktreePath: fixture.worktreePath,
        branchName: fixture.branchName,
        baseSha: "base-sha-test",
      });
    case "codex.runtime.start":
      return JSON.stringify({ runId: "run_phase7_test" });
    case "codex.turn.start":
      return JSON.stringify({ terminal: { type: "turn.completed" } });
    case "git.validate":
      return "";
    case "command.run":
      return "ok";
    case "git.status":
      return "## maxxy/task/backend\n M README.md\n?? src/new-file.ts\n";
    case "git.commit":
      return JSON.stringify({ commitSha: "commit-sha-test" });
    case "git.push":
      return JSON.stringify({ branchName: fixture.branchName });
    case "github.pull_request.create":
      return JSON.stringify({
        number: 42,
        url: "https://github.com/example/repo/pull/42",
        nodeId: "PR_phase7_test",
        title: "Phase 7 task",
        status: "draft",
      });
    default:
      throw new Error(
        `Unexpected command in Phase 7 workflow test: ${command}`,
      );
  }
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await Bun.sleep(25);
  }
  throw new Error("Timed out waiting for Phase 7 workflow condition");
}
