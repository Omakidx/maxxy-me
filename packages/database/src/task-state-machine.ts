import { canTransitionTask, type TaskStatus } from "@maxxy/contracts";
import type postgres from "postgres";
import type { DatabaseHandle } from "./client";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

type Queryable = postgres.TransactionSql;

type TaskRow = {
  id: string;
  workspace_id: string;
  status: TaskStatus;
};

export type TaskTransitionInput = {
  taskId: string;
  to: TaskStatus;
  actorUserId?: string | undefined;
  reason?: string | undefined;
  idempotencyKey?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export class TaskStateMachine {
  constructor(private readonly database: DatabaseHandle) {}

  async transition(input: TaskTransitionInput) {
    const sql = this.database.sql;

    return sql.begin(async (tx) => {
      const [task] = await tx<TaskRow[]>`
        select id, workspace_id, status
        from tasks
        where id = ${input.taskId}
        for update
      `;

      if (!task) {
        throw new Error(`Task not found: ${input.taskId}`);
      }

      if (task.status === input.to) {
        return task;
      }

      if (!canTransitionTask(task.status, input.to)) {
        throw new Error(
          `Invalid task transition: ${task.status} -> ${input.to}`,
        );
      }

      const [updated] = await tx<TaskRow[]>`
        update tasks
        set status = ${input.to}, updated_at = now()
        where id = ${task.id}
        returning id, workspace_id, status
      `;

      if (!updated) {
        throw new Error(`Task transition failed: ${task.id}`);
      }

      await appendEvent(tx, {
        workspaceId: updated.workspace_id,
        taskId: updated.id,
        type: "task.transitioned",
        idempotencyKey: input.idempotencyKey,
        payload: {
          from: task.status,
          to: input.to,
          reason: input.reason,
          actorUserId: input.actorUserId,
          ...(input.metadata ?? {}),
        },
      });

      return updated;
    });
  }

  async start(taskId: string, actorUserId?: string) {
    const current = await this.currentStatus(taskId);
    if (current === "draft") {
      await this.transition(
        this.input(taskId, "queued", actorUserId, "manual_start"),
      );
      return this.transition(
        this.input(taskId, "ready", actorUserId, "manual_start"),
      );
    }
    if (current === "queued") {
      return this.transition(
        this.input(taskId, "ready", actorUserId, "manual_start"),
      );
    }
    if (current === "failed") {
      return this.transition(
        this.input(taskId, "queued", actorUserId, "manual_start"),
      );
    }
    return { id: taskId, status: current };
  }

  async cancel(taskId: string, actorUserId?: string) {
    const current = await this.currentStatus(taskId);
    if (
      current === "cancelled" ||
      current === "merged" ||
      current === "failed"
    ) {
      return { id: taskId, status: current };
    }
    return this.transition(
      this.input(taskId, "cancelled", actorUserId, "manual_cancel"),
    );
  }

  async retry(taskId: string, actorUserId?: string) {
    return this.transition(
      this.input(taskId, "queued", actorUserId, "manual_retry"),
    );
  }

  async currentStatus(taskId: string) {
    const [row] = await this.database.sql<{ status: TaskStatus }[]>`
      select status from tasks where id = ${taskId}
    `;
    if (!row) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return row.status;
  }

  private input(
    taskId: string,
    to: TaskStatus,
    actorUserId: string | undefined,
    reason: string,
  ): TaskTransitionInput {
    return {
      taskId,
      to,
      reason,
      ...(actorUserId ? { actorUserId } : {}),
    };
  }
}

export async function appendWorkspaceEvent(
  database: DatabaseHandle,
  input: {
    workspaceId?: string | undefined;
    taskId?: string | undefined;
    hostId?: string | undefined;
    runId?: string | undefined;
    attemptId?: string | undefined;
    codexConnectionId?: string | undefined;
    capacitySourceId?: string | undefined;
    type: string;
    payload?: Record<string, unknown> | undefined;
    idempotencyKey?: string | undefined;
  },
) {
  return database.sql.begin((tx) => appendEvent(tx, input));
}

async function appendEvent(
  tx: Queryable,
  input: {
    workspaceId?: string | undefined;
    taskId?: string | undefined;
    hostId?: string | undefined;
    runId?: string | undefined;
    attemptId?: string | undefined;
    codexConnectionId?: string | undefined;
    capacitySourceId?: string | undefined;
    type: string;
    payload?: Record<string, unknown> | undefined;
    idempotencyKey?: string | undefined;
  },
) {
  if (input.workspaceId) {
    await tx`select pg_advisory_xact_lock(hashtext(${input.workspaceId}))`;
  }

  if (input.workspaceId && input.idempotencyKey) {
    const [existing] = await tx<{ id: string; sequence: number }[]>`
      select id, sequence from events
      where workspace_id = ${input.workspaceId}
        and idempotency_key = ${input.idempotencyKey}
      limit 1
    `;
    if (existing) {
      return existing;
    }
  }

  const [sequence] = await tx<{ next_sequence: number }[]>`
    select (coalesce(max(sequence), -1) + 1)::int as next_sequence
    from events
    where ${input.workspaceId ?? null}::text is not distinct from workspace_id
  `;

  const [event] = await tx<{ id: string; sequence: number }[]>`
    insert into events (
      id, type, workspace_id, task_id, host_id, run_id, attempt_id,
      codex_connection_id, capacity_source_id, sequence, payload, idempotency_key
    ) values (
      ${id("evt")}, ${input.type}, ${input.workspaceId ?? null}, ${input.taskId ?? null},
      ${input.hostId ?? null}, ${input.runId ?? null}, ${input.attemptId ?? null},
      ${input.codexConnectionId ?? null}, ${input.capacitySourceId ?? null},
      ${sequence?.next_sequence ?? 0}, ${JSON.stringify(input.payload ?? {})}::jsonb, ${input.idempotencyKey ?? null}
    )
    returning id, sequence::int as sequence
  `;

  if (!event) {
    throw new Error("Event insert failed");
  }

  return event;
}
