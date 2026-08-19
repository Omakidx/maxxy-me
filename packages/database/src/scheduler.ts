import type { TaskStatus } from "@maxxy/contracts";
import type { DatabaseHandle } from "./client";
import { appendWorkspaceEvent } from "./task-state-machine";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

type SchedulerTask = {
  id: string;
  workspace_id: string;
  assigned_host_id: string | null;
  assigned_codex_connection_id: string | null;
  preferred_codex_pool_id?: string | null;
  status: TaskStatus;
};

type SchedulerHost = {
  id: string;
  max_concurrent_agents: number;
};

type SchedulerConnection = {
  id: string;
  capacity_source_id: string;
  max_concurrent_runs: number;
};

export type SchedulerTickResult = {
  expiredTaskLeases: number;
  expiredCodexConnectionLeases: number;
  recoveredTasks: number;
  stoppedRevokedHostTasks: number;
  readiedTasks: number;
  assignedTasks: number;
};

export type SchedulerOptions = {
  taskLeaseSeconds?: number;
  codexLeaseSeconds?: number;
  maxAssignmentsPerTick?: number;
};

export class SchedulerService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly options: SchedulerOptions = {},
  ) {}

  async tick(): Promise<SchedulerTickResult> {
    const expiredTaskLeases = await this.expireTaskLeases();
    const expiredCodexConnectionLeases =
      await this.expireCodexConnectionLeases();
    const recoveredTasks = await this.recoverExpiredLeaseTasks(
      expiredTaskLeases.map((lease) => lease.task_id),
    );
    const stoppedRevokedHostTasks = await this.stopRevokedHostTasks();
    const readiedTasks = await this.readyDependencyResolvedTasks();
    const assignedTasks = await this.assignReadyTasks();

    return {
      expiredTaskLeases: expiredTaskLeases.length,
      expiredCodexConnectionLeases: expiredCodexConnectionLeases.length,
      recoveredTasks,
      stoppedRevokedHostTasks,
      readiedTasks,
      assignedTasks,
    };
  }

  private expireTaskLeases() {
    return this.database.sql<
      { id: string; task_id: string; host_id: string }[]
    >`
      update task_leases
      set status = 'expired', updated_at = now()
      where status = 'active' and expires_at <= now()
      returning id, task_id, host_id
    `;
  }

  private expireCodexConnectionLeases() {
    return this.database.sql<
      {
        id: string;
        task_id: string;
        codex_connection_id: string;
        capacity_source_id: string;
      }[]
    >`
      update codex_connection_leases
      set status = 'expired', updated_at = now()
      where status = 'active' and expires_at <= now()
      returning id, task_id, codex_connection_id, capacity_source_id
    `;
  }

  private async recoverExpiredLeaseTasks(taskIds: string[]) {
    if (taskIds.length === 0) {
      return 0;
    }

    const rows = await this.database.sql<SchedulerTask[]>`
      update tasks
      set status = 'queued', assigned_host_id = null, assigned_codex_connection_id = null, updated_at = now()
      where id in ${this.database.sql(taskIds)}
        and status in ('assigned','claimed','starting','running')
      returning id, workspace_id, assigned_host_id, assigned_codex_connection_id, status
    `;

    for (const task of rows) {
      await appendWorkspaceEvent(this.database, {
        workspaceId: task.workspace_id,
        taskId: task.id,
        type: "scheduler.task_recovered",
        payload: { reason: "expired_task_lease" },
      });
    }

    return rows.length;
  }

  private async stopRevokedHostTasks() {
    const rows = await this.database.sql<SchedulerTask[]>`
      update tasks t
      set status = 'failed', assigned_host_id = null, assigned_codex_connection_id = null, updated_at = now()
      from hosts h
      where t.assigned_host_id = h.id
        and h.revoked_at is not null
        and t.status in ('assigned','claimed','starting','running','awaiting_approval','blocked')
      returning t.id, t.workspace_id, t.assigned_host_id, t.assigned_codex_connection_id, t.status
    `;

    for (const task of rows) {
      await appendWorkspaceEvent(this.database, {
        workspaceId: task.workspace_id,
        taskId: task.id,
        type: "scheduler.task_stopped",
        payload: { reason: "revoked_host" },
      });
    }

    return rows.length;
  }

  private async readyDependencyResolvedTasks() {
    const rows = await this.database.sql<SchedulerTask[]>`
      update tasks t
      set status = 'ready', updated_at = now()
      where t.status = 'queued'
        and not exists (
          select 1
          from task_dependencies d
          join tasks dep on dep.id = d.depends_on_task_id
          where d.task_id = t.id
            and dep.status <> d.condition
        )
      returning t.id, t.workspace_id, t.assigned_host_id, t.assigned_codex_connection_id, t.status
    `;

    for (const task of rows) {
      await appendWorkspaceEvent(this.database, {
        workspaceId: task.workspace_id,
        taskId: task.id,
        type: "scheduler.task_ready",
        payload: { reason: "dependencies_resolved" },
      });
    }

    return rows.length;
  }

  private async assignReadyTasks() {
    const maxAssignments = this.options.maxAssignmentsPerTick ?? 5;
    let assigned = 0;

    for (let index = 0; index < maxAssignments; index += 1) {
      const assignment = await this.assignOneReadyTask();
      if (!assignment) {
        break;
      }
      assigned += 1;
    }

    return assigned;
  }

  private async assignOneReadyTask() {
    const taskLeaseSeconds = this.options.taskLeaseSeconds ?? 60;
    const codexLeaseSeconds = this.options.codexLeaseSeconds ?? 60;

    return this.database.sql
      .begin(async (tx) => {
        const [task] = await tx<SchedulerTask[]>`
        select t.id, t.workspace_id, t.assigned_host_id, t.assigned_codex_connection_id, t.preferred_codex_pool_id, t.status
        from tasks t
        where t.status = 'ready'
          and not exists (
            select 1 from task_leases tl
            where tl.task_id = t.id and tl.status = 'active' and tl.expires_at > now()
          )
          and exists (
            select 1
            from hosts h
            join codex_connections c on c.host_id = h.id
            join codex_capacity_pool_members m on m.connection_id = c.id and m.enabled = true
            join codex_capacity_pools p on p.id = m.pool_id
            join workspaces w on w.id = t.workspace_id
            left join lateral (
              select availability, reset_at
              from codex_capacity_snapshots snap
              where snap.capacity_source_id = c.capacity_source_id
              order by snap.observed_at desc
              limit 1
            ) latest on true
            where h.status = 'online'
              and h.revoked_at is null
              and c.disabled_at is null
              and c.status in ('ready_chatgpt','ready_api_key','ready_enterprise_access_token')
              and (w.codex_pool_id is null or w.codex_pool_id = p.id)
              and (t.preferred_codex_pool_id is null or t.preferred_codex_pool_id = p.id)
              and (p.workspace_id is null or p.workspace_id = t.workspace_id)
              and (latest.availability is null or latest.availability <> 'cooldown' or latest.reset_at <= now())
              and (
                select count(*)::int
                from task_leases tl
                where tl.host_id = h.id
                  and tl.status = 'active'
                  and tl.expires_at > now()
              ) < h.max_concurrent_agents
              and (
                select count(*)::int
                from codex_connection_leases cl
                where cl.codex_connection_id = c.id
                  and cl.status = 'active'
                  and cl.expires_at > now()
              ) < least(c.max_concurrent_runs, m.max_active_runs)
              and (
                select count(*)::int
                from codex_connection_leases cl
                where cl.capacity_source_id = c.capacity_source_id
                  and cl.status = 'active'
                  and cl.expires_at > now()
              ) < (
                select max_concurrent_runs
                from codex_capacity_sources s
                where s.id = c.capacity_source_id
                  and s.disabled_at is null
              )
          )
        order by t.priority asc, t.created_at asc
        for update skip locked
        limit 1
      `;

        if (!task) {
          return null;
        }

        const [host] = await tx<SchedulerHost[]>`
        select h.id, h.max_concurrent_agents
        from hosts h
        where h.status = 'online'
          and h.revoked_at is null
          and (
            select count(*)::int
            from task_leases tl
            where tl.host_id = h.id
              and tl.status = 'active'
              and tl.expires_at > now()
          ) < h.max_concurrent_agents
          and exists (
            select 1
            from codex_connections c
            join codex_capacity_pool_members m on m.connection_id = c.id and m.enabled = true
            join codex_capacity_pools p on p.id = m.pool_id
            join workspaces w on w.id = ${task.workspace_id}
            left join lateral (
              select availability, reset_at
              from codex_capacity_snapshots snap
              where snap.capacity_source_id = c.capacity_source_id
              order by snap.observed_at desc
              limit 1
            ) latest on true
            where c.host_id = h.id
              and c.disabled_at is null
              and c.status in ('ready_chatgpt','ready_api_key','ready_enterprise_access_token')
              and (w.codex_pool_id is null or w.codex_pool_id = p.id)
              and (${task.preferred_codex_pool_id ?? null}::text is null or p.id = ${task.preferred_codex_pool_id ?? null})
              and (p.workspace_id is null or p.workspace_id = ${task.workspace_id})
              and (latest.availability is null or latest.availability <> 'cooldown' or latest.reset_at <= now())
              and (
                select count(*)::int
                from codex_connection_leases cl
                where cl.codex_connection_id = c.id
                  and cl.status = 'active'
                  and cl.expires_at > now()
              ) < least(c.max_concurrent_runs, m.max_active_runs)
              and (
                select count(*)::int
                from codex_connection_leases cl
                where cl.capacity_source_id = c.capacity_source_id
                  and cl.status = 'active'
                  and cl.expires_at > now()
              ) < (
                select max_concurrent_runs
                from codex_capacity_sources s
                where s.id = c.capacity_source_id
                  and s.disabled_at is null
              )
          )
        order by h.last_heartbeat_at desc nulls last, h.created_at asc
        for update skip locked
        limit 1
      `;

        if (!host) {
          return null;
        }

        const [connection] = await tx<SchedulerConnection[]>`
        select c.id, c.capacity_source_id, c.max_concurrent_runs
        from codex_connections c
        join codex_capacity_pool_members m on m.connection_id = c.id and m.enabled = true
        join codex_capacity_pools p on p.id = m.pool_id
        join workspaces w on w.id = ${task.workspace_id}
        left join lateral (
          select availability, reset_at
          from codex_capacity_snapshots snap
          where snap.capacity_source_id = c.capacity_source_id
          order by snap.observed_at desc
          limit 1
        ) latest on true
        where c.host_id = ${host.id}
          and c.disabled_at is null
          and c.status in ('ready_chatgpt','ready_api_key','ready_enterprise_access_token')
          and (w.codex_pool_id is null or w.codex_pool_id = p.id)
          and (${task.preferred_codex_pool_id ?? null}::text is null or p.id = ${task.preferred_codex_pool_id ?? null})
          and (p.workspace_id is null or p.workspace_id = ${task.workspace_id})
          and (latest.availability is null or latest.availability <> 'cooldown' or latest.reset_at <= now())
          and (
            select count(*)::int
            from codex_connection_leases cl
            where cl.codex_connection_id = c.id
              and cl.status = 'active'
              and cl.expires_at > now()
          ) < least(c.max_concurrent_runs, m.max_active_runs)
          and (
            select count(*)::int
            from codex_connection_leases cl
            where cl.capacity_source_id = c.capacity_source_id
              and cl.status = 'active'
              and cl.expires_at > now()
          ) < (
            select max_concurrent_runs
            from codex_capacity_sources s
            where s.id = c.capacity_source_id
              and s.disabled_at is null
          )
        order by m.priority asc, c.last_health_at desc nulls last, c.created_at asc
        for update of c skip locked
        limit 1
      `;

        if (!connection) {
          return null;
        }

        const taskLeaseId = id("tasklease");
        const codexLeaseId = id("codexlease");
        const attemptId = id("attempt");

        const [taskLease] = await tx`
        insert into task_leases (id, task_id, host_id, status, expires_at, heartbeat_at)
        values (${taskLeaseId}, ${task.id}, ${host.id}, 'active', now() + (${taskLeaseSeconds} || ' seconds')::interval, now())
        on conflict do nothing
        returning id
      `;
        if (!taskLease) {
          return null;
        }

        const [codexLease] = await tx`
        insert into codex_connection_leases (id, codex_connection_id, capacity_source_id, task_id, status, expires_at)
        values (${codexLeaseId}, ${connection.id}, ${connection.capacity_source_id}, ${task.id}, 'active', now() + (${codexLeaseSeconds} || ' seconds')::interval)
        on conflict do nothing
        returning id
      `;
        if (!codexLease) {
          return null;
        }

        const [attempt] = await tx<{ id: string }[]>`
        insert into task_runtime_attempts (id, task_id, attempt_number, host_id, codex_connection_id, capacity_source_id, runtime_snapshot)
        values (
          ${attemptId}, ${task.id},
          coalesce((select max(attempt_number) + 1 from task_runtime_attempts where task_id = ${task.id}), 1),
          ${host.id}, ${connection.id}, ${connection.capacity_source_id},
          ${JSON.stringify({ scheduler: "phase4" })}::jsonb
        )
        returning id
      `;
        if (!attempt) {
          throw new Error("Task attempt was not created");
        }

        const [updatedTask] = await tx<SchedulerTask[]>`
        update tasks
        set status = 'assigned',
            assigned_host_id = ${host.id},
            assigned_codex_connection_id = ${connection.id},
            updated_at = now()
        where id = ${task.id}
        returning id, workspace_id, assigned_host_id, assigned_codex_connection_id, status
      `;
        if (!updatedTask) {
          throw new Error("Task assignment failed");
        }

        return {
          task: updatedTask,
          host,
          connection,
          attempt,
          taskLeaseId,
          codexLeaseId,
        };
      })
      .then(async (assignment) => {
        if (!assignment) {
          return null;
        }
        await appendWorkspaceEvent(this.database, {
          workspaceId: assignment.task.workspace_id,
          taskId: assignment.task.id,
          hostId: assignment.host.id,
          attemptId: assignment.attempt.id,
          codexConnectionId: assignment.connection.id,
          capacitySourceId: assignment.connection.capacity_source_id,
          type: "scheduler.task_assigned",
          payload: {
            taskLeaseId: assignment.taskLeaseId,
            codexLeaseId: assignment.codexLeaseId,
          },
        });
        return assignment;
      });
  }
}
