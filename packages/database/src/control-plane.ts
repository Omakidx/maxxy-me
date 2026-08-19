import type { DatabaseHandle } from "./client";
import { appendWorkspaceEvent } from "./task-state-machine";

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

const defaultAgentProfiles = [
  {
    role: "manager",
    name: "Manager",
    sandboxMode: "read-only",
    canCreateSubagents: true,
    instructions:
      "Break owner goals into safe, dependency-aware tasks and identify ownership boundaries before execution.",
  },
  {
    role: "architect",
    name: "Architect",
    sandboxMode: "read-only",
    canCreateSubagents: false,
    instructions:
      "Design implementation approaches, review architecture constraints, and keep task boundaries small.",
  },
  {
    role: "frontend",
    name: "Frontend",
    sandboxMode: "workspace-write",
    canCreateSubagents: false,
    instructions:
      "Implement user-facing UI changes within declared frontend ownership paths.",
  },
  {
    role: "backend",
    name: "Backend",
    sandboxMode: "workspace-write",
    canCreateSubagents: false,
    instructions:
      "Implement server, database, API, and orchestration changes within declared backend ownership paths.",
  },
  {
    role: "testing",
    name: "Testing",
    sandboxMode: "workspace-write",
    canCreateSubagents: false,
    instructions:
      "Add and run focused validation for completed implementation tasks.",
  },
  {
    role: "reviewer",
    name: "Reviewer",
    sandboxMode: "read-only",
    canCreateSubagents: false,
    instructions:
      "Review combined changes, report findings, and never merge pull requests.",
  },
  {
    role: "integrator",
    name: "Integrator",
    sandboxMode: "workspace-write",
    canCreateSubagents: false,
    instructions:
      "Resolve approved integration work without bypassing owner-controlled pull-request review.",
  },
] as const;

const activeOwnershipStatuses = [
  "queued",
  "ready",
  "assigned",
  "claimed",
  "starting",
  "running",
  "awaiting_approval",
  "blocked",
  "validating",
  "integrating",
  "finalizing",
  "pushing",
  "opening_pull_request",
  "changes_requested",
] as const;

function normalizeOwnershipPattern(pattern: string) {
  return pattern.trim().replace(/^\.\//, "").replace(/\/+$/g, "");
}

function changedFilesFromPayload(operation: Record<string, unknown>) {
  const payload = operation.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const changedFiles = (payload as { changedFiles?: unknown }).changedFiles;
  return Array.isArray(changedFiles)
    ? changedFiles.filter((file): file is string => typeof file === "string")
    : [];
}

function outputFromPayload(operation: Record<string, unknown>) {
  const payload = operation.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const output = (payload as { output?: unknown }).output;
  return typeof output === "string" ? output : undefined;
}

function summaryForTask(task: Record<string, unknown>, changedFiles: string[]) {
  const status = String(task.status ?? "unknown");
  const title = String(task.title ?? "Task");
  return `${title} is ${status} with ${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"} recorded.`;
}

function risksForTask(
  task: Record<string, unknown>,
  failedChecks: Record<string, unknown>[],
  changedFiles: string[],
) {
  const risks: string[] = [];
  if (failedChecks.length > 0) {
    risks.push(
      `${failedChecks.length} pull-request check result needs attention.`,
    );
  }
  if (String(task.status) === "failed") {
    risks.push("The task failed before producing a merge-ready pull request.");
  }
  if (changedFiles.length === 0) {
    risks.push("No changed-file summary has been recorded yet.");
  }
  return risks;
}

export class ControlPlaneRepository {
  constructor(private readonly database: DatabaseHandle) {}

  listHosts() {
    return this.database.sql`
      select h.*,
        coalesce(active.active_leases, 0)::int as active_leases
      from hosts h
      left join (
        select host_id, count(*) as active_leases
        from task_leases
        where status = 'active' and expires_at > now()
        group by host_id
      ) active on active.host_id = h.id
      order by h.created_at desc
    `;
  }

  async revokeHost(hostId: string, actorUserId?: string) {
    const [host] = await this.database.sql`
      update hosts
      set status = 'revoked', revoked_at = now(), updated_at = now()
      where id = ${hostId}
      returning *
    `;
    if (!host) {
      return null;
    }
    await appendWorkspaceEvent(this.database, {
      hostId,
      type: "host.revoked",
      payload: { actorUserId },
      idempotencyKey: `host.revoked:${hostId}:${Date.now()}`,
    });
    return host;
  }

  listHostCodexConnections(hostId: string) {
    return this.database.sql`
      select c.*, s.label as capacity_source_label, s.kind as capacity_source_kind
      from codex_connections c
      join codex_capacity_sources s on s.id = c.capacity_source_id
      where c.host_id = ${hostId}
      order by c.created_at desc
    `;
  }

  async setupCodexConnection(input: {
    hostId: string;
    label: string;
    authMode: string;
    credentialSlotId: string;
    capacitySourceId?: string;
    capacitySourceLabel?: string;
    capacitySourceKind?: string;
    providerScopeHint?: string;
    maxConcurrentRuns?: number;
    actorUserId?: string;
  }) {
    const sourceId = input.capacitySourceId ?? id("capsrc");
    const connectionId = id("codexconn");
    const maxConcurrentRuns = input.maxConcurrentRuns ?? 1;

    return this.database.sql
      .begin(async (tx) => {
        await tx`
        insert into codex_capacity_sources (id, label, kind, provider_scope_hint, max_concurrent_runs)
        values (${sourceId}, ${input.capacitySourceLabel ?? input.label}, ${input.capacitySourceKind ?? "chatgpt_account"}, ${input.providerScopeHint ?? null}, ${maxConcurrentRuns})
        on conflict (id) do update
        set label = excluded.label,
            kind = excluded.kind,
            provider_scope_hint = excluded.provider_scope_hint,
            max_concurrent_runs = excluded.max_concurrent_runs,
            updated_at = now()
      `;
        const [connection] = await tx`
        insert into codex_connections (id, host_id, capacity_source_id, label, auth_mode, status, credential_slot_id, max_concurrent_runs)
        values (${connectionId}, ${input.hostId}, ${sourceId}, ${input.label}, ${input.authMode}, 'signed_out', ${input.credentialSlotId}, ${maxConcurrentRuns})
        returning *
      `;
        if (!connection) {
          throw new Error("Codex connection was not created");
        }
        return connection;
      })
      .then(async (connection) => {
        await appendWorkspaceEvent(this.database, {
          hostId: input.hostId,
          codexConnectionId: connection.id,
          capacitySourceId: sourceId,
          type: "codex.connection_added",
          payload: { actorUserId: input.actorUserId, authMode: input.authMode },
        });
        return connection;
      });
  }

  async updateCodexConnectionStatus(input: {
    connectionId: string;
    status: string;
    action: string;
    actorUserId?: string;
  }) {
    const [connection] = await this.database.sql`
      update codex_connections
      set status = ${input.status},
          disabled_at = case when ${input.status} = 'disabled' then now() else disabled_at end,
          updated_at = now()
      where id = ${input.connectionId}
      returning *
    `;
    if (!connection) {
      return null;
    }
    await appendWorkspaceEvent(this.database, {
      hostId: connection.host_id,
      codexConnectionId: connection.id,
      capacitySourceId: connection.capacity_source_id,
      type: input.action,
      payload: { actorUserId: input.actorUserId, status: input.status },
    });
    return connection;
  }

  async deleteCodexConnection(connectionId: string, actorUserId?: string) {
    const [connection] = await this.database.sql`
      delete from codex_connections
      where id = ${connectionId}
        and not exists (
          select 1 from codex_connection_leases
          where codex_connection_id = ${connectionId} and status = 'active'
        )
      returning *
    `;
    if (!connection) {
      return null;
    }
    await appendWorkspaceEvent(this.database, {
      hostId: connection.host_id,
      capacitySourceId: connection.capacity_source_id,
      type: "codex.connection_removed",
      payload: { actorUserId, codexConnectionId: connection.id },
    });
    return connection;
  }

  listCapacityPools() {
    return this.database.sql`
      select p.*,
        coalesce(json_agg(json_build_object(
          'connectionId', m.connection_id,
          'priority', m.priority,
          'maxActiveRuns', m.max_active_runs,
          'enabled', m.enabled
        ) order by m.priority) filter (where m.connection_id is not null), '[]'::json) as members
      from codex_capacity_pools p
      left join codex_capacity_pool_members m on m.pool_id = p.id
      group by p.id
      order by p.created_at desc
    `;
  }

  async createCapacityPool(input: {
    workspaceId?: string | undefined;
    name: string;
    routingPolicy?: string | undefined;
    members?:
      | {
          connectionId: string;
          priority?: number | undefined;
          maxActiveRuns?: number | undefined;
        }[]
      | undefined;
  }) {
    const poolId = id("pool");
    return this.database.sql.begin(async (tx) => {
      const [pool] = await tx`
        insert into codex_capacity_pools (id, workspace_id, name, routing_policy)
        values (${poolId}, ${input.workspaceId ?? null}, ${input.name}, ${input.routingPolicy ?? "balanced"})
        returning *
      `;
      if (!pool) {
        throw new Error("Capacity pool was not created");
      }
      for (const member of input.members ?? []) {
        await tx`
          insert into codex_capacity_pool_members (pool_id, connection_id, priority, max_active_runs)
          values (${poolId}, ${member.connectionId}, ${member.priority ?? 100}, ${member.maxActiveRuns ?? 1})
          on conflict (pool_id, connection_id) do update
          set priority = excluded.priority, max_active_runs = excluded.max_active_runs, enabled = true, updated_at = now()
        `;
      }
      return pool;
    });
  }

  async patchCapacityPool(input: {
    poolId: string;
    name?: string | undefined;
    routingPolicy?: string | undefined;
    members?:
      | {
          connectionId: string;
          priority?: number | undefined;
          maxActiveRuns?: number | undefined;
          enabled?: boolean | undefined;
        }[]
      | undefined;
  }) {
    return this.database.sql.begin(async (tx) => {
      const [pool] = await tx`
        update codex_capacity_pools
        set name = coalesce(${input.name ?? null}, name),
            routing_policy = coalesce(${input.routingPolicy ?? null}, routing_policy),
            updated_at = now()
        where id = ${input.poolId}
        returning *
      `;
      if (!pool) {
        return null;
      }
      for (const member of input.members ?? []) {
        await tx`
          insert into codex_capacity_pool_members (pool_id, connection_id, priority, max_active_runs, enabled)
          values (${input.poolId}, ${member.connectionId}, ${member.priority ?? 100}, ${member.maxActiveRuns ?? 1}, ${member.enabled ?? true})
          on conflict (pool_id, connection_id) do update
          set priority = excluded.priority, max_active_runs = excluded.max_active_runs, enabled = excluded.enabled, updated_at = now()
        `;
      }
      return pool;
    });
  }

  capacitySummary() {
    return this.database.sql`
      select s.id as capacity_source_id,
        s.label,
        s.kind,
        s.max_concurrent_runs,
        count(distinct c.id)::int as connections,
        count(l.id)::int as active_leases,
        latest.availability,
        latest.remaining_percent,
        latest.reset_at
      from codex_capacity_sources s
      left join codex_connections c on c.capacity_source_id = s.id and c.disabled_at is null
      left join codex_connection_leases l on l.capacity_source_id = s.id and l.status = 'active' and l.expires_at > now()
      left join lateral (
        select availability, remaining_percent, reset_at
        from codex_capacity_snapshots snap
        where snap.capacity_source_id = s.id
        order by observed_at desc
        limit 1
      ) latest on true
      group by s.id, latest.availability, latest.remaining_percent, latest.reset_at
      order by s.created_at desc
    `;
  }

  listWorkspaces() {
    return this.database.sql`
      select w.*, r.owner as repository_owner, r.name as repository_name, r.remote_url
      from workspaces w
      join repositories r on r.id = w.repository_id
      order by w.created_at desc
    `;
  }

  getWorkspace(workspaceId: string) {
    return this.database.sql`
      select w.*, r.owner as repository_owner, r.name as repository_name, r.remote_url
      from workspaces w
      join repositories r on r.id = w.repository_id
      where w.id = ${workspaceId}
      limit 1
    `;
  }

  async createWorkspace(input: {
    name: string;
    repository: {
      owner: string;
      name: string;
      remoteUrl: string;
      defaultBranch?: string | undefined;
    };
    defaultHostId?: string | undefined;
    projectPath: string;
    worktreeRoot: string;
    baseBranch?: string | undefined;
    maximumConcurrentAgents?: number | undefined;
  }) {
    const repoId = id("repo");
    const workspaceId = id("ws");
    return this.database.sql.begin(async (tx) => {
      const [repository] = await tx`
        insert into repositories (id, provider, owner, name, remote_url, default_branch)
        values (${repoId}, 'github', ${input.repository.owner}, ${input.repository.name}, ${input.repository.remoteUrl}, ${input.repository.defaultBranch ?? "main"})
        on conflict (provider, owner, name) do update
        set remote_url = excluded.remote_url, default_branch = excluded.default_branch, updated_at = now()
        returning *
      `;
      if (!repository) {
        throw new Error("Repository was not created");
      }
      const [workspace] = await tx`
        insert into workspaces (id, name, repository_id, default_host_id, project_path, worktree_root, base_branch, maximum_concurrent_agents)
        values (${workspaceId}, ${input.name}, ${repository.id}, ${input.defaultHostId ?? null}, ${input.projectPath}, ${input.worktreeRoot}, ${input.baseBranch ?? "main"}, ${input.maximumConcurrentAgents ?? 1})
        returning *
      `;
      if (!workspace) {
        throw new Error("Workspace was not created");
      }
      return workspace;
    });
  }

  async patchWorkspace(input: {
    workspaceId: string;
    name?: string | undefined;
    defaultHostId?: string | null | undefined;
    baseBranch?: string | undefined;
    projectPath?: string | undefined;
    worktreeRoot?: string | undefined;
    maximumConcurrentAgents?: number | undefined;
    codexPoolId?: string | null | undefined;
    codexRoutingPolicy?: string | undefined;
    validationProfile?: unknown;
  }) {
    const [workspace] = await this.database.sql`
      update workspaces
      set name = coalesce(${input.name ?? null}, name),
          default_host_id = coalesce(${input.defaultHostId ?? null}, default_host_id),
          base_branch = coalesce(${input.baseBranch ?? null}, base_branch),
          project_path = coalesce(${input.projectPath ?? null}, project_path),
          worktree_root = coalesce(${input.worktreeRoot ?? null}, worktree_root),
          maximum_concurrent_agents = coalesce(${input.maximumConcurrentAgents ?? null}, maximum_concurrent_agents),
          codex_pool_id = coalesce(${input.codexPoolId ?? null}, codex_pool_id),
          codex_routing_policy = coalesce(${input.codexRoutingPolicy ?? null}, codex_routing_policy),
          validation_profile = coalesce(${input.validationProfile === undefined ? null : JSON.stringify(input.validationProfile)}::jsonb, validation_profile),
          updated_at = now()
      where id = ${input.workspaceId}
      returning *
    `;
    return workspace ?? null;
  }

  listTasks() {
    return this.database.sql`
      select t.*, w.name as workspace_name
      from tasks t
      join workspaces w on w.id = t.workspace_id
      order by t.priority asc, t.created_at desc
    `;
  }

  getTask(taskId: string) {
    return this.database.sql`select * from tasks where id = ${taskId} limit 1`;
  }

  async createTask(input: {
    workspaceId: string;
    title: string;
    prompt: string;
    priority?: number | undefined;
    idempotencyKey?: string | undefined;
    preferredCodexPoolId?: string | undefined;
    assignedProfileId?: string | undefined;
    ownershipClaims?:
      | { pattern: string; mode?: string | undefined }[]
      | undefined;
    dependencies?:
      | { dependsOnTaskId: string; condition?: string | undefined }[]
      | undefined;
  }) {
    const taskId = id("task");
    return this.database.sql
      .begin(async (tx) => {
        const [task] = await tx`
        insert into tasks (id, workspace_id, title, prompt, priority, idempotency_key, preferred_codex_pool_id, assigned_profile_id)
        values (${taskId}, ${input.workspaceId}, ${input.title}, ${input.prompt}, ${input.priority ?? 100}, ${input.idempotencyKey ?? null}, ${input.preferredCodexPoolId ?? null}, ${input.assignedProfileId ?? null})
        on conflict (workspace_id, idempotency_key) do update
        set updated_at = now()
        returning *
      `;
        if (!task) {
          throw new Error("Task was not created");
        }
        for (const dependency of input.dependencies ?? []) {
          await tx`
          insert into task_dependencies (task_id, depends_on_task_id, condition)
          values (${task.id}, ${dependency.dependsOnTaskId}, ${dependency.condition ?? "merged"})
          on conflict (task_id, depends_on_task_id) do update
          set condition = excluded.condition, updated_at = now()
        `;
        }
        for (const claim of input.ownershipClaims ?? []) {
          const pattern = normalizeOwnershipPattern(claim.pattern);
          if (!pattern) {
            continue;
          }
          await this.assertNoOwnershipOverlap(tx, {
            workspaceId: input.workspaceId,
            pattern,
            exceptTaskIds: [
              task.id,
              ...(input.dependencies ?? []).map(
                (dependency) => dependency.dependsOnTaskId,
              ),
            ],
          });
          await tx`
          insert into task_ownership_claims (id, task_id, workspace_id, pattern, mode)
          values (${id("own")}, ${task.id}, ${input.workspaceId}, ${pattern}, ${claim.mode ?? "write"})
          on conflict (task_id, pattern, mode) do nothing
        `;
        }
        return task;
      })
      .then(async (task) => {
        await appendWorkspaceEvent(this.database, {
          workspaceId: task.workspace_id,
          taskId: task.id,
          type: "task.created",
          payload: { title: input.title, priority: input.priority ?? 100 },
          ...(input.idempotencyKey
            ? {
                idempotencyKey: `task.created:${input.workspaceId}:${input.idempotencyKey}`,
              }
            : {}),
        });
        return task;
      });
  }

  listAgentProfiles(workspaceId?: string | undefined) {
    return this.database.sql`
      select *
      from agent_profiles
      where (${workspaceId ?? null}::text is null or workspace_id = ${workspaceId ?? null})
      order by workspace_id nulls first, role asc, name asc
    `;
  }

  async ensureDefaultAgentProfiles(workspaceId: string) {
    const rows = [];
    for (const profile of defaultAgentProfiles) {
      const profileId = `profile_${workspaceId}_${profile.role}`;
      const [row] = await this.database.sql`
        insert into agent_profiles (
          id, workspace_id, name, role, instructions, sandbox_mode, can_create_subagents
        )
        values (
          ${profileId}, ${workspaceId}, ${profile.name}, ${profile.role},
          ${profile.instructions}, ${profile.sandboxMode}, ${profile.canCreateSubagents}
        )
        on conflict (id) do update
        set name = excluded.name,
            instructions = excluded.instructions,
            sandbox_mode = excluded.sandbox_mode,
            can_create_subagents = excluded.can_create_subagents,
            updated_at = now()
        returning *
      `;
      if (row) {
        rows.push(row);
      }
    }
    await appendWorkspaceEvent(this.database, {
      workspaceId,
      type: "agent_profiles.default_seeded",
      payload: { roles: defaultAgentProfiles.map((profile) => profile.role) },
      idempotencyKey: `agent_profiles.default_seeded:${workspaceId}`,
    });
    return rows;
  }

  async approveManagerPlan(input: {
    workspaceId: string;
    goal: string;
    tasks: {
      title: string;
      prompt: string;
      role: string;
      ownershipClaims?: { pattern: string; mode?: string | undefined }[];
      dependsOnIndexes?: number[] | undefined;
    }[];
    startImmediately?: boolean | undefined;
    actorUserId?: string | undefined;
  }) {
    const profiles = await this.ensureDefaultAgentProfiles(input.workspaceId);
    const profileByRole = new Map(
      profiles.map((profile) => [String(profile.role), String(profile.id)]),
    );
    const createdTasks: unknown[] = [];
    const createdTaskIds: string[] = [];

    for (const [index, plannedTask] of input.tasks.entries()) {
      const dependencies = (plannedTask.dependsOnIndexes ?? [])
        .map((dependencyIndex) => createdTaskIds[dependencyIndex])
        .filter((taskId): taskId is string => Boolean(taskId))
        .map((dependsOnTaskId) => ({
          dependsOnTaskId,
          condition: "merged",
        }));
      const task = await this.createTask({
        workspaceId: input.workspaceId,
        title: plannedTask.title,
        prompt: `${plannedTask.prompt}\n\nPhase 9 plan goal: ${input.goal}`,
        assignedProfileId: profileByRole.get(plannedTask.role),
        ownershipClaims: plannedTask.ownershipClaims,
        dependencies,
        idempotencyKey: `phase9:${input.goal}:${index}:${plannedTask.role}`,
      });
      createdTasks.push(task);
      createdTaskIds.push(task.id);
    }

    if (input.startImmediately) {
      await this.database.sql`
        update tasks
        set status = 'queued', updated_at = now()
        where id in ${this.database.sql(createdTaskIds)}
          and status = 'draft'
      `;
    }

    await appendWorkspaceEvent(this.database, {
      workspaceId: input.workspaceId,
      type: "manager.plan_approved",
      payload: {
        actorUserId: input.actorUserId,
        goal: input.goal,
        taskIds: createdTaskIds,
      },
    });

    return { tasks: createdTasks };
  }

  private async assertNoOwnershipOverlap(
    tx: DatabaseHandle["sql"],
    input: { workspaceId: string; pattern: string; exceptTaskIds?: string[] },
  ) {
    const exceptTaskIds = input.exceptTaskIds ?? [];
    const [overlap] = await tx<{ task_id: string; pattern: string }[]>`
      select c.task_id, c.pattern
      from task_ownership_claims c
      join tasks t on t.id = c.task_id
      where c.workspace_id = ${input.workspaceId}
        and c.mode = 'write'
        and t.status in ${this.database.sql([...activeOwnershipStatuses])}
        and (${exceptTaskIds.length === 0} or c.task_id not in ${this.database.sql(exceptTaskIds.length > 0 ? exceptTaskIds : ["__none__"])})
        and (
          c.pattern = ${input.pattern}
          or c.pattern like (${input.pattern} || '/%')
          or ${input.pattern} like (c.pattern || '/%')
        )
      limit 1
    `;
    if (overlap) {
      throw new Error(
        `Ownership overlap with active task ${overlap.task_id} on ${overlap.pattern}`,
      );
    }
  }

  async getTaskReview(taskId: string) {
    const [task] = await this.database.sql`
      select t.*, w.name as workspace_name, w.validation_profile,
        pr.id as pull_request_id, pr.number as pull_request_number,
        pr.title as pull_request_title, pr.status as pull_request_status,
        pr.url as pull_request_url, pr.head_branch, pr.base_branch,
        pr.merged_at
      from tasks t
      join workspaces w on w.id = t.workspace_id
      left join pull_requests pr on pr.id = t.pull_request_id
      where t.id = ${taskId}
      limit 1
    `;
    if (!task) {
      return null;
    }

    const [commands, gitOperations, checks, ownershipClaims, events] =
      await Promise.all([
        this.database.sql`
          select * from commands
          where task_id = ${taskId}
          order by created_at asc
        `,
        this.database.sql`
          select * from git_operations
          where task_id = ${taskId}
          order by created_at asc
        `,
        this.database.sql`
          select c.*
          from pull_request_checks c
          join pull_requests pr on pr.id = c.pull_request_id
          where pr.task_id = ${taskId}
          order by c.name asc
        `,
        this.database.sql`
          select * from task_ownership_claims
          where task_id = ${taskId}
          order by pattern asc
        `,
        this.database.sql`
          select id, type, sequence::int as sequence, occurred_at, payload
          from events
          where task_id = ${taskId}
          order by occurred_at asc
          limit 200
        `,
      ]);

    const changedFiles = Array.from(
      new Set(
        gitOperations.flatMap((operation) =>
          changedFilesFromPayload(operation),
        ),
      ),
    ).sort();
    const validationResults = gitOperations
      .filter((operation) =>
        ["git.validate", "git.status"].includes(String(operation.operation)),
      )
      .map((operation) => ({
        name: String(operation.operation),
        status: String(operation.status),
        output: outputFromPayload(operation),
      }));
    const commandResults = commands.map((command) => ({
      command: command.command,
      cwd: command.cwd,
      status: command.status,
      exitCode: command.exit_code,
      output: command.output,
      outputTruncated: command.output_truncated,
      startedAt: command.started_at,
      completedAt: command.completed_at,
    }));
    const failedChecks = checks.filter(
      (check) =>
        String(check.conclusion ?? "").length > 0 &&
        !["success", "neutral", "skipped"].includes(String(check.conclusion)),
    );

    return {
      task,
      commands: commandResults,
      gitOperations,
      checks,
      ownershipClaims,
      events,
      report: {
        implementationSummary: summaryForTask(task, changedFiles),
        changedFiles,
        testResults: validationResults,
        skippedChecks: checks.filter(
          (check) => String(check.conclusion) === "skipped",
        ),
        knownRisks: risksForTask(task, failedChecks, changedFiles),
        migrationNotes: changedFiles.some((file) =>
          file.includes("migrations/"),
        )
          ? "Database migration files changed; verify migration and rollback behavior before merge."
          : "No migration files detected.",
        pullRequestUrl: task.pull_request_url ?? null,
      },
    };
  }

  listEvents(input: {
    workspaceId?: string | undefined;
    afterSequence?: number | undefined;
    limit?: number | undefined;
  }) {
    return this.database.sql`
      select id, type, workspace_id, task_id, host_id, run_id, attempt_id,
        codex_connection_id, capacity_source_id, sequence::int as sequence,
        occurred_at, payload, idempotency_key, created_at, updated_at
      from events
      where (${input.workspaceId ?? null}::text is null or workspace_id = ${input.workspaceId ?? null})
        and sequence > ${input.afterSequence ?? -1}
      order by workspace_id nulls first, sequence asc
      limit ${Math.min(input.limit ?? 100, 500)}
    `;
  }

  listApprovals() {
    return this.database.sql`
      select a.*, t.title as task_title
      from approvals a
      left join tasks t on t.id = a.task_id
      order by a.created_at desc
    `;
  }

  async decideApproval(input: {
    approvalId: string;
    decision: string;
    decidedByUserId: string;
  }) {
    const [approval] = await this.database.sql`
      update approvals
      set status = 'resolved', decision = ${input.decision}, decided_by_user_id = ${input.decidedByUserId}, decided_at = now(), updated_at = now()
      where id = ${input.approvalId} and status = 'pending'
      returning *
    `;
    if (!approval) {
      return null;
    }
    await appendWorkspaceEvent(this.database, {
      taskId: approval.task_id,
      type: "approval.decided",
      payload: {
        approvalId: approval.id,
        decision: input.decision,
        decidedByUserId: input.decidedByUserId,
      },
    });
    return approval;
  }
}
