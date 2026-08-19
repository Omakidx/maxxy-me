import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDatabase } from "./client";
import { ControlPlaneRepository } from "./control-plane";
import { runMigrations } from "./migrator";
import { SchedulerService } from "./scheduler";
import { TaskStateMachine } from "./task-state-machine";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;
let database: ReturnType<typeof createDatabase> | undefined;

function requireRow<T>(row: T | null | undefined, label: string): T {
  if (!row) {
    throw new Error(`${label} was not returned from the database`);
  }
  return row;
}

function capacitySourceIdFor(connection: {
  capacitySourceId?: string;
  capacity_source_id?: string;
}) {
  return connection.capacitySourceId ?? connection.capacity_source_id ?? "";
}

async function createSchedulerFixture(label: string) {
  if (!database) {
    throw new Error("Database fixture is not initialized");
  }

  const control = new ControlPlaneRepository(database);
  const suffix = crypto.randomUUID();
  const [host] = await database.sql<{ id: string }[]>`
    insert into hosts (id, name, status, max_concurrent_agents, last_heartbeat_at)
    values (${`host_${label}_${suffix}`}, ${`host ${label}`}, 'online', 2, now())
    returning id
  `;
  const connection = await control.setupCodexConnection({
    hostId: requireRow(host, "host").id,
    label: `connection ${label}`,
    authMode: "chatgpt",
    credentialSlotId: `slot_${suffix}`,
    capacitySourceLabel: `source ${label}`,
    capacitySourceKind: "chatgpt_account",
    maxConcurrentRuns: 1,
  });
  await control.updateCodexConnectionStatus({
    connectionId: connection.id,
    status: "ready_chatgpt",
    action: "codex.connection_ready",
  });
  const pool = await control.createCapacityPool({
    name: `pool ${label}`,
    members: [{ connectionId: connection.id, priority: 10, maxActiveRuns: 1 }],
  });
  const workspace = await control.createWorkspace({
    name: `workspace ${label}`,
    repository: {
      owner: `owner-${label}-${suffix}`,
      name: "maxxy-me",
      remoteUrl: `https://github.com/example/${label}-${suffix}.git`,
      defaultBranch: "main",
    },
    defaultHostId: requireRow(host, "host").id,
    projectPath: `/tmp/${label}`,
    worktreeRoot: `/tmp/${label}/worktrees`,
    baseBranch: "main",
    maximumConcurrentAgents: 2,
  });
  await control.patchWorkspace({
    workspaceId: workspace.id,
    codexPoolId: pool.id,
  });

  return {
    control,
    host: requireRow(host, "host"),
    connection,
    pool,
    workspace,
  };
}

beforeAll(async () => {
  if (!databaseUrl) {
    return;
  }
  await runMigrations({ databaseUrl, releaseVersion: "test" });
  database = createDatabase(databaseUrl);
});

afterAll(async () => {
  await database?.close();
});

describe("task state machine and scheduler", () => {
  integrationTest(
    "moves tasks through the state service and records ordered events",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }

      const { control, workspace } = await createSchedulerFixture("state");
      const task = await control.createTask({
        workspaceId: workspace.id,
        title: "State machine task",
        prompt: "Move through the queue",
      });
      const state = new TaskStateMachine(database);

      await state.start(task.id, "usr_test");
      await state.cancel(task.id, "usr_test");

      const [stored] = await control.getTask(task.id);
      const events = await control.listEvents({
        workspaceId: workspace.id,
        afterSequence: -1,
        limit: 20,
      });

      expect(stored?.status).toBe("cancelled");
      expect(events.map((event) => event.sequence)).toEqual([
        ...events.map((_, index) => index),
      ]);
      expect(events.map((event) => event.type)).toContain("task.transitioned");
    },
  );

  integrationTest(
    "assigns ready tasks with host and Codex connection leases",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }

      const { control, connection, host, workspace } =
        await createSchedulerFixture("assign");
      const state = new TaskStateMachine(database);
      const first = await control.createTask({
        workspaceId: workspace.id,
        title: "First",
        prompt: "First",
        priority: 0,
      });
      const second = await control.createTask({
        workspaceId: workspace.id,
        title: "Second",
        prompt: "Second",
        priority: 1,
      });
      await state.start(first.id, "usr_test");
      await state.start(second.id, "usr_test");

      const scheduler = new SchedulerService(database, {
        maxAssignmentsPerTick: 2,
        taskLeaseSeconds: 60,
        codexLeaseSeconds: 60,
      });
      const result = await scheduler.tick();
      const assigned = await database.sql<
        {
          id: string;
          assigned_host_id: string;
          assigned_codex_connection_id: string;
          status: string;
        }[]
      >`
      select id, assigned_host_id, assigned_codex_connection_id, status
      from tasks
      where id in (${first.id}, ${second.id}) and status = 'assigned'
    `;
      const taskLeases = await database.sql<{ count: number }[]>`
      select count(*)::int as count from task_leases where status = 'active' and host_id = ${host.id}
    `;
      const codexLeases = await database.sql<{ count: number }[]>`
      select count(*)::int as count from codex_connection_leases where status = 'active' and codex_connection_id = ${connection.id}
    `;
      const attempts = await database.sql<{ count: number }[]>`
      select count(*)::int as count from task_runtime_attempts where codex_connection_id = ${connection.id}
    `;

      expect(result.assignedTasks).toBeGreaterThanOrEqual(1);
      expect(assigned).toHaveLength(1);
      expect(taskLeases[0]?.count).toBe(1);
      expect(codexLeases[0]?.count).toBe(1);
      expect(attempts[0]?.count).toBe(1);
    },
  );

  integrationTest(
    "waits for dependencies before marking queued work ready",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }

      const { control, workspace } = await createSchedulerFixture("deps");
      const state = new TaskStateMachine(database);
      const parent = await control.createTask({
        workspaceId: workspace.id,
        title: "Parent",
        prompt: "Parent",
      });
      const child = await control.createTask({
        workspaceId: workspace.id,
        title: "Child",
        prompt: "Child",
        dependencies: [{ dependsOnTaskId: parent.id, condition: "merged" }],
      });
      await state.transition({ taskId: child.id, to: "queued" });

      const scheduler = new SchedulerService(database, {
        maxAssignmentsPerTick: 1,
      });
      const blocked = await scheduler.tick();
      let [storedChild] = await control.getTask(child.id);
      expect(blocked.readiedTasks).toBe(0);
      expect(storedChild?.status).toBe("queued");

      await database.sql`update tasks set status = 'merged' where id = ${parent.id}`;
      const unblocked = await scheduler.tick();
      [storedChild] = await control.getTask(child.id);

      expect(unblocked.readiedTasks).toBe(1);
      expect(["ready", "assigned"]).toContain(storedChild?.status);
    },
  );

  integrationTest("stops tasks assigned to revoked hosts", async () => {
    if (!database) {
      throw new Error("Database fixture is not initialized");
    }

    const { control, host, workspace } =
      await createSchedulerFixture("revoked");
    const task = await control.createTask({
      workspaceId: workspace.id,
      title: "Revoked",
      prompt: "Revoked",
      priority: 0,
    });
    await new TaskStateMachine(database).start(task.id, "usr_test");
    await new SchedulerService(database, { maxAssignmentsPerTick: 10 }).tick();
    let [stored] = await control.getTask(task.id);
    expect(stored?.assigned_host_id).toBe(host.id);
    expect(stored?.status).toBe("assigned");

    await control.revokeHost(host.id, "usr_test");

    const result = await new SchedulerService(database, {
      maxAssignmentsPerTick: 10,
    }).tick();
    [stored] = await control.getTask(task.id);

    expect(result.stoppedRevokedHostTasks).toBeGreaterThanOrEqual(1);
    expect(stored?.status).toBe("failed");
  });

  integrationTest(
    "skips limited connections while another pool member is eligible",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }

      const { connection, control, host, pool, workspace } =
        await createSchedulerFixture("limited");
      const fallback = await control.setupCodexConnection({
        hostId: host.id,
        label: "fallback limited connection",
        authMode: "chatgpt",
        credentialSlotId: `fallback_slot_${crypto.randomUUID()}`,
        capacitySourceLabel: "fallback limited source",
        capacitySourceKind: "chatgpt_account",
        maxConcurrentRuns: 1,
      });
      await control.updateCodexConnectionStatus({
        connectionId: fallback.id,
        status: "ready_chatgpt",
        action: "codex.connection_ready",
      });
      await control.patchCapacityPool({
        poolId: pool.id,
        members: [
          { connectionId: connection.id, priority: 1, maxActiveRuns: 1 },
          { connectionId: fallback.id, priority: 2, maxActiveRuns: 1 },
        ],
      });
      await database.sql`
        insert into codex_capacity_snapshots (
          id, capacity_source_id, reporting_connection_id, availability,
          remaining_percent, observation_source, observed_at, payload
        ) values (
          ${`capsnap_${crypto.randomUUID()}`}, ${capacitySourceIdFor(connection)},
          ${connection.id}, 'limited', 0, 'manual', now(), '{}'::jsonb
        )
      `;
      await database.sql`
        insert into codex_capacity_snapshots (
          id, capacity_source_id, reporting_connection_id, availability,
          remaining_percent, observation_source, observed_at, payload
        ) values (
          ${`capsnap_${crypto.randomUUID()}`}, ${capacitySourceIdFor(fallback)},
          ${fallback.id}, 'available', 100, 'manual', now(), '{}'::jsonb
        )
      `;

      const task = await control.createTask({
        workspaceId: workspace.id,
        title: "Limited routing",
        prompt: "Use the eligible fallback",
        priority: 0,
      });
      await new TaskStateMachine(database).start(task.id, "usr_test");

      const result = await new SchedulerService(database, {
        maxAssignmentsPerTick: 1,
      }).tick();
      const [stored] = await control.getTask(task.id);

      expect(result.assignedTasks).toBe(1);
      expect(stored?.assigned_codex_connection_id).toBe(fallback.id);
    },
  );

  integrationTest(
    "failover creates a new attempt without rewriting the original thread connection",
    async () => {
      if (!database) {
        throw new Error("Database fixture is not initialized");
      }

      const { connection, control, host, pool, workspace } =
        await createSchedulerFixture("failover");
      const fallback = await control.setupCodexConnection({
        hostId: host.id,
        label: "fallback failover connection",
        authMode: "chatgpt",
        credentialSlotId: `failover_slot_${crypto.randomUUID()}`,
        capacitySourceLabel: "fallback failover source",
        capacitySourceKind: "chatgpt_account",
        maxConcurrentRuns: 1,
      });
      await control.updateCodexConnectionStatus({
        connectionId: fallback.id,
        status: "ready_chatgpt",
        action: "codex.connection_ready",
      });
      await control.patchCapacityPool({
        poolId: pool.id,
        members: [
          { connectionId: connection.id, priority: 1, maxActiveRuns: 1 },
          { connectionId: fallback.id, priority: 2, maxActiveRuns: 1 },
        ],
      });
      const task = await control.createTask({
        workspaceId: workspace.id,
        title: "Failover routing",
        prompt: "Create a fresh attempt",
        priority: 0,
      });
      await new TaskStateMachine(database).start(task.id, "usr_test");
      await new SchedulerService(database, { maxAssignmentsPerTick: 1 }).tick();

      const [firstAttemptRow] = await database.sql<
        { id: string; codex_connection_id: string }[]
      >`
        select id, codex_connection_id
        from task_runtime_attempts
        where task_id = ${task.id}
        order by attempt_number asc
        limit 1
      `;
      const firstAttempt = requireRow(firstAttemptRow, "first attempt");
      expect(firstAttempt.codex_connection_id).toBe(connection.id);
      const originalThreadId = `thread_${crypto.randomUUID()}`;
      await database.sql`
        insert into threads (id, task_id, attempt_id, codex_connection_id, provider_thread_id, status)
        values (${originalThreadId}, ${task.id}, ${firstAttempt.id}, ${connection.id}, 'provider-old', 'failed')
      `;
      await database.sql`
        update task_runtime_attempts
        set thread_id = ${originalThreadId}, updated_at = now()
        where id = ${firstAttempt.id}
      `;
      await database.sql`
        update task_leases set status = 'released', released_at = now(), updated_at = now()
        where task_id = ${task.id} and status = 'active'
      `;
      await database.sql`
        update codex_connection_leases set status = 'released', released_at = now(), updated_at = now()
        where task_id = ${task.id} and status = 'active'
      `;
      await database.sql`
        insert into codex_capacity_snapshots (
          id, capacity_source_id, reporting_connection_id, availability,
          remaining_percent, observation_source, observed_at, payload
        ) values (
          ${`capsnap_${crypto.randomUUID()}`}, ${capacitySourceIdFor(connection)},
          ${connection.id}, 'limited', 0, 'manual', now(), '{}'::jsonb
        )
      `;
      await database.sql`
        update tasks
        set status = 'ready', assigned_host_id = null, assigned_codex_connection_id = null, updated_at = now()
        where id = ${task.id}
      `;

      await new SchedulerService(database, { maxAssignmentsPerTick: 1 }).tick();
      const attempts = await database.sql<
        { id: string; attempt_number: number; codex_connection_id: string }[]
      >`
        select id, attempt_number, codex_connection_id
        from task_runtime_attempts
        where task_id = ${task.id}
        order by attempt_number asc
      `;
      const [thread] = await database.sql<{ codex_connection_id: string }[]>`
        select codex_connection_id from threads where id = ${originalThreadId}
      `;

      expect(attempts).toHaveLength(2);
      expect(attempts[0]?.codex_connection_id).toBe(connection.id);
      expect(attempts[1]?.codex_connection_id).toBe(fallback.id);
      expect(thread?.codex_connection_id).toBe(connection.id);
    },
  );
});
