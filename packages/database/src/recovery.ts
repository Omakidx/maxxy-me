import type { DatabaseHandle } from "./client";
import { appendWorkspaceEvent } from "./task-state-machine";

export type StartupReconciliationResult = {
  staleHostsMarkedOffline: number;
  expiredTaskLeases: number;
  expiredCodexConnectionLeases: number;
  recoveredTasks: number;
  preservedWorktrees: number;
};

export type StartupReconciliationOptions = {
  staleHostSeconds?: number;
};

export class RecoveryService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly options: StartupReconciliationOptions = {},
  ) {}

  async reconcileStartup(): Promise<StartupReconciliationResult> {
    const staleHosts = await this.markStaleHostsOffline();
    const expiredTaskLeases = await this.expireTaskLeasesForUnavailableHosts();
    const expiredCodexConnectionLeases =
      await this.expireCodexLeasesForRecoveredTasks(
        expiredTaskLeases.map((lease) => lease.task_id),
      );
    const recoveredTasks = await this.recoverTasks(
      expiredTaskLeases.map((lease) => lease.task_id),
      "startup_reconciliation",
    );
    const preservedWorktrees = await this.preserveUncertainWorktrees(
      recoveredTasks.map((task) => task.id),
    );

    await appendWorkspaceEvent(this.database, {
      type: "recovery.startup_reconciled",
      payload: {
        staleHostsMarkedOffline: staleHosts.length,
        expiredTaskLeases: expiredTaskLeases.length,
        expiredCodexConnectionLeases: expiredCodexConnectionLeases.length,
        recoveredTasks: recoveredTasks.length,
        preservedWorktrees,
      },
      idempotencyKey: `recovery.startup_reconciled:${Date.now()}`,
    });

    return {
      staleHostsMarkedOffline: staleHosts.length,
      expiredTaskLeases: expiredTaskLeases.length,
      expiredCodexConnectionLeases: expiredCodexConnectionLeases.length,
      recoveredTasks: recoveredTasks.length,
      preservedWorktrees,
    };
  }

  private markStaleHostsOffline() {
    const staleHostSeconds = this.options.staleHostSeconds ?? 90;
    return this.database.sql<{ id: string }[]>`
      update hosts
      set status = 'offline', updated_at = now()
      where status in ('online','degraded','connecting')
        and revoked_at is null
        and (
          last_heartbeat_at is null
          or last_heartbeat_at <= now() - (${staleHostSeconds} || ' seconds')::interval
        )
      returning id
    `;
  }

  private expireTaskLeasesForUnavailableHosts() {
    return this.database.sql<
      { id: string; task_id: string; host_id: string }[]
    >`
      update task_leases tl
      set status = 'expired', updated_at = now()
      from hosts h
      where tl.host_id = h.id
        and tl.status = 'active'
        and h.status in ('offline','revoked','authentication_required')
      returning tl.id, tl.task_id, tl.host_id
    `;
  }

  private expireCodexLeasesForRecoveredTasks(taskIds: string[]) {
    if (taskIds.length === 0) {
      return [];
    }
    return this.database.sql<{ id: string; task_id: string }[]>`
      update codex_connection_leases
      set status = 'expired', updated_at = now()
      where status = 'active'
        and task_id in ${this.database.sql(taskIds)}
      returning id, task_id
    `;
  }

  private async recoverTasks(taskIds: string[], reason: string) {
    if (taskIds.length === 0) {
      return [];
    }
    const rows = await this.database.sql<
      { id: string; workspace_id: string }[]
    >`
      update tasks
      set status = 'queued', assigned_host_id = null, assigned_codex_connection_id = null, updated_at = now()
      where id in ${this.database.sql(taskIds)}
        and status in ('assigned','claimed','starting','running','awaiting_approval','blocked','validating','pushing','opening_pull_request')
      returning id, workspace_id
    `;

    for (const task of rows) {
      await appendWorkspaceEvent(this.database, {
        workspaceId: task.workspace_id,
        taskId: task.id,
        type: "recovery.task_requeued",
        payload: { reason },
      });
    }

    return rows;
  }

  private async preserveUncertainWorktrees(taskIds: string[]) {
    if (taskIds.length === 0) {
      return 0;
    }
    const rows = await this.database.sql<{ id: string }[]>`
      update worktrees
      set status = 'preserved', dirty = true, updated_at = now()
      where task_id in ${this.database.sql(taskIds)}
        and status = 'active'
      returning id
    `;
    return rows.length;
  }
}
