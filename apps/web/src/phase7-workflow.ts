import type {
  HostCommandName,
  HostCommandResultMessage,
  TaskStatus,
} from "@maxxy/contracts";
import type { DatabaseHandle } from "@maxxy/database";
import { appendWorkspaceEvent } from "@maxxy/database";
import {
  makeMaxxyBranchName,
  makeMaxxyWorktreePath,
  parseGitStatusChangedFiles,
} from "@maxxy/git";
import { buildDraftPullRequestBody } from "@maxxy/github";

export type HostCommandSender = (
  hostId: string,
  command: HostCommandName,
  payload: Record<string, unknown>,
) => Promise<HostCommandResultMessage>;

type AssignedTaskRow = {
  id: string;
  workspace_id: string;
  title: string;
  prompt: string;
  assigned_host_id: string;
  assigned_codex_connection_id: string;
  assigned_profile_id: string | null;
  workspace_name: string;
  project_path: string;
  worktree_root: string;
  base_branch: string;
  validation_profile: unknown;
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  repository_remote_url: string;
  repository_default_branch: string;
  host_name: string;
  codex_connection_id: string;
  capacity_source_id: string;
  attempt_id: string;
  agent_role: string | null;
};

type ValidationCommand = {
  command: string;
  args?: string[] | undefined;
  profile?: string | undefined;
  required?: boolean | undefined;
  timeoutMs?: number | undefined;
};

type WorkflowContext = {
  task: AssignedTaskRow;
  branchName: string;
  worktreePath: string;
  agentRole: string;
  runId: string;
  threadId: string;
  turnId: string;
  changedFiles: string[];
  validationResults: { command: string; status: string; output?: string }[];
};

export class Phase7WorkflowService {
  private readonly runningTaskIds = new Set<string>();

  constructor(
    private readonly database: DatabaseHandle,
    private readonly sendCommand: HostCommandSender,
  ) {}

  async dispatchAssignedTasksForHost(hostId: string) {
    const taskIds = await this.database.sql<{ id: string }[]>`
      select id
      from tasks
      where status = 'assigned' and assigned_host_id = ${hostId}
      order by priority asc, created_at asc
      limit 2
    `;

    for (const task of taskIds) {
      if (this.runningTaskIds.has(task.id)) {
        continue;
      }
      this.runningTaskIds.add(task.id);
      void this.runTask(hostId, task.id).finally(() => {
        this.runningTaskIds.delete(task.id);
      });
    }
  }

  private async runTask(hostId: string, taskId: string) {
    let context: WorkflowContext | undefined;
    try {
      const task = await this.claimTask(hostId, taskId);
      if (!task) {
        return;
      }
      context = this.contextFor(task);
      await this.transitionTask(task, "starting", "phase7_prepare_worktree", {
        branchName: context.branchName,
        worktreePath: context.worktreePath,
      });

      const prepare = await this.requireJson(hostId, "repository.prepare", {
        repositoryUrl: task.repository_remote_url,
        directory: task.project_path,
        defaultBranch: task.base_branch || task.repository_default_branch,
      });
      await this.recordGitOperation(task, "repository.prepare", "completed", {
        repositoryPath: prepare.repositoryPath,
        remoteUrl: prepare.remoteUrl,
        defaultBranch: prepare.defaultBranch,
        clean: prepare.clean,
      });

      const fetch = await this.requireCommand(hostId, "repository.fetch", {
        repositoryPath: task.project_path,
      });
      await this.recordGitOperation(task, "repository.fetch", fetch.status, {
        output: fetch.output,
      });

      const worktree = await this.requireJson(hostId, "worktree.create", {
        repositoryPath: task.project_path,
        worktreePath: context.worktreePath,
        branchName: context.branchName,
        baseRef: `origin/${task.base_branch || task.repository_default_branch}`,
        taskId: task.id,
      });
      await this.recordWorktree(task, context, stringValue(worktree.baseSha));
      await this.recordGitOperation(task, "worktree.create", "completed", {
        worktreePath: context.worktreePath,
        baseSha: worktree.baseSha,
      });

      await this.transitionTask(task, "running", "phase7_codex_started");
      await this.requireJson(hostId, "codex.runtime.start", {
        runId: context.runId,
        workspaceId: task.workspace_id,
        taskId: task.id,
        attemptId: task.attempt_id,
        codexConnectionId: task.codex_connection_id,
        capacitySourceId: task.capacity_source_id,
        cwd: context.worktreePath,
        ...fixtureScenarioPayload(task.validation_profile),
      });
      const turn = await this.requireJson(hostId, "codex.turn.start", {
        runId: context.runId,
        prompt: task.prompt,
        threadId: context.threadId,
        turnId: context.turnId,
        waitForCompletion: true,
      });
      if (terminalType(turn) !== "turn.completed") {
        throw new Error("Codex turn did not complete successfully");
      }

      await this.transitionTask(
        task,
        "validating",
        "phase7_validation_started",
      );
      await this.runValidation(hostId, context);

      const status = await this.requireCommand(hostId, "git.status", {
        cwd: context.worktreePath,
      });
      context.changedFiles = parseGitStatusChangedFiles(
        status.output ?? "",
      ).map((file) => file.path);
      await this.recordGitOperation(task, "git.status", status.status, {
        changedFiles: context.changedFiles,
        output: status.output,
      });

      await this.transitionTask(task, "pushing", "phase7_commit_push_started");
      const commit = await this.requireJson(hostId, "git.commit", {
        worktreePath: context.worktreePath,
        message: `maxxy: ${task.title}\n\nTask: ${task.id}`,
      });
      await this.recordGitOperation(
        task,
        "git.commit",
        "completed",
        { changedFiles: context.changedFiles },
        stringValue(commit.commitSha),
        context.branchName,
      );

      await this.requireJson(hostId, "git.push", {
        worktreePath: context.worktreePath,
        branchName: context.branchName,
      });
      await this.recordGitOperation(
        task,
        "git.push",
        "completed",
        { branchName: context.branchName },
        stringValue(commit.commitSha),
        context.branchName,
      );

      await this.transitionTask(
        task,
        "opening_pull_request",
        "phase7_pr_started",
      );
      const dependencyPrs = await this.dependencyPullRequestUrls(task.id);
      const prBody = buildDraftPullRequestBody({
        taskId: task.id,
        taskSummary: task.prompt,
        agentRole: context.agentRole,
        changedFiles: context.changedFiles,
        validationResults: context.validationResults,
        dependencyPrs,
        executionHostName: task.host_name,
      });
      const pr = await this.requireJson(hostId, "github.pull_request.create", {
        repositoryOwner: task.repository_owner,
        repositoryName: task.repository_name,
        headBranch: context.branchName,
        baseBranch: task.base_branch || task.repository_default_branch,
        title: task.title,
        body: prBody,
        draft: true,
      });
      await this.recordPullRequest(task, context, pr);
      await this.transitionTask(task, "awaiting_review", "phase7_pr_created", {
        pullRequestUrl: pr.url,
      });
      await this.releaseLeases(task, "workflow_completed");
    } catch (error) {
      await this.failTask(hostId, taskId, context, error);
    }
  }

  private async claimTask(hostId: string, taskId: string) {
    const task = await this.database.sql.begin(async (tx) => {
      const [claimed] = await tx<AssignedTaskRow[]>`
        select t.id, t.workspace_id, t.title, t.prompt,
          t.assigned_host_id, t.assigned_codex_connection_id, t.assigned_profile_id,
          w.name as workspace_name, w.project_path, w.worktree_root, w.base_branch,
          w.validation_profile, w.repository_id,
          r.owner as repository_owner, r.name as repository_name,
          r.remote_url as repository_remote_url, r.default_branch as repository_default_branch,
          h.name as host_name,
          c.id as codex_connection_id, c.capacity_source_id,
          a.id as attempt_id,
          p.role as agent_role
        from tasks t
        join workspaces w on w.id = t.workspace_id
        join repositories r on r.id = w.repository_id
        join hosts h on h.id = t.assigned_host_id
        join codex_connections c on c.id = t.assigned_codex_connection_id
        join lateral (
          select id
          from task_runtime_attempts
          where task_id = t.id
          order by attempt_number desc
          limit 1
        ) a on true
        left join agent_profiles p on p.id = t.assigned_profile_id
        where t.id = ${taskId}
          and t.assigned_host_id = ${hostId}
          and t.status = 'assigned'
        for update of t skip locked
        limit 1
      `;
      if (!claimed) {
        return null;
      }
      await tx`
        update tasks
        set status = 'claimed', updated_at = now()
        where id = ${claimed.id}
      `;
      return claimed;
    });
    if (!task) {
      return null;
    }
    await appendWorkspaceEvent(this.database, {
      workspaceId: task.workspace_id,
      taskId: task.id,
      hostId,
      attemptId: task.attempt_id,
      codexConnectionId: task.codex_connection_id,
      capacitySourceId: task.capacity_source_id,
      type: "task.transitioned",
      payload: { from: "assigned", to: "claimed", reason: "phase7_claim" },
    });
    return task;
  }

  private contextFor(task: AssignedTaskRow): WorkflowContext {
    const agentRole = task.agent_role || "backend";
    return {
      task,
      agentRole,
      branchName: makeMaxxyBranchName({ taskId: task.id, agentRole }),
      worktreePath: makeMaxxyWorktreePath({
        worktreeRoot: task.worktree_root,
        workspaceId: task.workspace_id,
        taskId: task.id,
        agentRole,
      }),
      runId: `run_${crypto.randomUUID()}`,
      threadId: `thread_${crypto.randomUUID()}`,
      turnId: `turn_${crypto.randomUUID()}`,
      changedFiles: [],
      validationResults: [],
    };
  }

  private async runValidation(hostId: string, context: WorkflowContext) {
    const diffCheck = await this.requireCommand(hostId, "git.validate", {
      worktreePath: context.worktreePath,
    });
    context.validationResults.push({
      command: "git diff --check",
      status: diffCheck.status,
      ...(diffCheck.output ? { output: diffCheck.output } : {}),
    });
    await this.recordGitOperation(
      context.task,
      "git.validate",
      diffCheck.status,
      {
        output: diffCheck.output,
      },
    );

    const validationFailures: string[] = [];
    for (const command of validationCommands(context.task.validation_profile)) {
      const result = await this.sendValidationCommand(hostId, command, context);
      context.validationResults.push({
        command: [command.command, ...(command.args ?? [])].join(" "),
        status: result.status,
        ...(result.output ? { output: result.output } : {}),
      });
      if (result.status !== "completed" && command.required !== false) {
        validationFailures.push(
          [command.command, ...(command.args ?? [])].join(" "),
        );
      }
      if (
        result.status !== "completed" &&
        command.required !== false &&
        validationFailFast(context.task.validation_profile)
      ) {
        break;
      }
    }
    if (validationFailures.length > 0) {
      throw new Error(
        `Required validation failed: ${validationFailures.join(", ")}`,
      );
    }
  }

  private async sendValidationCommand(
    hostId: string,
    command: ValidationCommand,
    context: WorkflowContext,
  ) {
    await appendWorkspaceEvent(this.database, {
      type: "control.command_sent",
      hostId,
      taskId: context.task.id,
      payload: { command: "command.run", payload: command },
    });
    return this.sendCommand(hostId, "command.run", {
      command: command.command,
      args: command.args ?? [],
      cwd: context.worktreePath,
      profile: command.profile ?? "default",
      ...(command.timeoutMs ? { timeoutMs: command.timeoutMs } : {}),
    });
  }

  private async requireJson(
    hostId: string,
    command: HostCommandName,
    payload: Record<string, unknown>,
  ) {
    const result = await this.requireCommand(hostId, command, payload);
    return parseJsonObject(result.output ?? "{}");
  }

  private async requireCommand(
    hostId: string,
    command: HostCommandName,
    payload: Record<string, unknown>,
  ) {
    await appendWorkspaceEvent(this.database, {
      type: "control.command_sent",
      hostId,
      payload: { command, payload },
    });
    const result = await this.sendCommand(hostId, command, payload);
    if (result.status !== "completed") {
      throw new Error(
        result.error ?? result.output ?? `Host command failed: ${command}`,
      );
    }
    return result;
  }

  private async transitionTask(
    task: AssignedTaskRow,
    to: TaskStatus,
    reason: string,
    metadata: Record<string, unknown> = {},
  ) {
    const [current] = await this.database.sql<{ status: TaskStatus }[]>`
      select status from tasks where id = ${task.id}
    `;
    if (!current || current.status === to) {
      return;
    }
    await this.database.sql`
      update tasks
      set status = ${to}, updated_at = now()
      where id = ${task.id}
    `;
    await appendWorkspaceEvent(this.database, {
      workspaceId: task.workspace_id,
      taskId: task.id,
      hostId: task.assigned_host_id,
      attemptId: task.attempt_id,
      codexConnectionId: task.codex_connection_id,
      capacitySourceId: task.capacity_source_id,
      type: "task.transitioned",
      payload: { from: current.status, to, reason, ...metadata },
    });
  }

  private async recordWorktree(
    task: AssignedTaskRow,
    context: WorkflowContext,
    baseSha: string | undefined,
  ) {
    const resolvedBaseSha = baseSha || "unknown";
    const [worktree] = await this.database.sql<{ id: string }[]>`
      insert into worktrees (id, task_id, host_id, path, branch_name, base_sha, status, dirty)
      values (${`worktree_${crypto.randomUUID()}`}, ${task.id}, ${task.assigned_host_id}, ${context.worktreePath}, ${context.branchName}, ${resolvedBaseSha}, 'active', false)
      on conflict (path) do nothing
      returning id
    `;
    if (!worktree) {
      throw new Error("Worktree path is already claimed by another task");
    }
    await this.database.sql`
      update tasks
      set branch_name = ${context.branchName}, base_sha = ${resolvedBaseSha}, updated_at = now()
      where id = ${task.id}
    `;
  }

  private async recordGitOperation(
    task: AssignedTaskRow,
    operation: string,
    status: string,
    payload: Record<string, unknown>,
    commitSha?: string | undefined,
    branchName?: string | undefined,
  ) {
    await this.database.sql`
      insert into git_operations (id, task_id, repository_id, operation, status, branch_name, commit_sha, payload)
      values (${`gitop_${crypto.randomUUID()}`}, ${task.id}, ${task.repository_id}, ${operation}, ${status}, ${branchName ?? null}, ${commitSha ?? null}, ${JSON.stringify(payload)}::jsonb)
    `;
  }

  private async recordPullRequest(
    task: AssignedTaskRow,
    context: WorkflowContext,
    pr: Record<string, unknown>,
  ) {
    const number = numberValue(pr.number);
    if (!number || number < 1) {
      throw new Error(
        "GitHub PR creation did not return a pull request number",
      );
    }
    const prId = `pr_${crypto.randomUUID()}`;
    const [row] = await this.database.sql<{ id: string }[]>`
      insert into pull_requests (
        id, repository_id, task_id, github_node_id, number, title, status,
        head_branch, base_branch, url
      ) values (
        ${prId}, ${task.repository_id}, ${task.id}, ${stringValue(pr.nodeId) ?? null},
        ${number}, ${stringValue(pr.title) ?? task.title}, ${stringValue(pr.status) ?? "draft"},
        ${context.branchName}, ${task.base_branch || task.repository_default_branch},
        ${stringValue(pr.url) ?? ""}
      )
      on conflict (repository_id, number) do update
      set task_id = excluded.task_id,
          github_node_id = coalesce(excluded.github_node_id, pull_requests.github_node_id),
          title = excluded.title,
          status = excluded.status,
          head_branch = excluded.head_branch,
          base_branch = excluded.base_branch,
          url = excluded.url,
          updated_at = now()
      returning id
    `;
    if (!row) {
      throw new Error("Pull request was not persisted");
    }
    await this.database.sql`
      update tasks
      set pull_request_id = ${row.id}, updated_at = now()
      where id = ${task.id}
    `;
    await appendWorkspaceEvent(this.database, {
      workspaceId: task.workspace_id,
      taskId: task.id,
      hostId: task.assigned_host_id,
      attemptId: task.attempt_id,
      codexConnectionId: task.codex_connection_id,
      capacitySourceId: task.capacity_source_id,
      type: "pull_request.created",
      payload: { pullRequestId: row.id, number, url: stringValue(pr.url) },
    });
  }

  private async dependencyPullRequestUrls(taskId: string) {
    const rows = await this.database.sql<{ url: string }[]>`
      select pr.url
      from task_dependencies d
      join tasks dep on dep.id = d.depends_on_task_id
      join pull_requests pr on pr.id = dep.pull_request_id
      where d.task_id = ${taskId}
      order by pr.number asc
    `;
    return rows.map((row) => row.url);
  }

  private async releaseLeases(task: AssignedTaskRow, reason: string) {
    await this.database.sql`
      update task_leases
      set status = 'released', released_at = now(), updated_at = now()
      where task_id = ${task.id} and status = 'active'
    `;
    const leases = await this.database.sql<{ id: string }[]>`
      update codex_connection_leases
      set status = 'released', released_at = now(), updated_at = now()
      where task_id = ${task.id} and status = 'active'
      returning id
    `;
    for (const lease of leases) {
      await appendWorkspaceEvent(this.database, {
        workspaceId: task.workspace_id,
        taskId: task.id,
        hostId: task.assigned_host_id,
        attemptId: task.attempt_id,
        codexConnectionId: task.codex_connection_id,
        capacitySourceId: task.capacity_source_id,
        type: "codex.connection.lease_released",
        payload: { leaseId: lease.id, reason },
      });
    }
  }

  private async failTask(
    hostId: string,
    taskId: string,
    context: WorkflowContext | undefined,
    error: unknown,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    const [task] = await this.database.sql<
      { id: string; workspace_id: string; assigned_host_id: string | null }[]
    >`
      update tasks
      set status = 'failed', updated_at = now()
      where id = ${taskId} and status <> 'cancelled'
      returning id, workspace_id, assigned_host_id
    `;
    if (context) {
      await this.database.sql`
        update worktrees
        set status = 'preserved', dirty = true, updated_at = now()
        where task_id = ${taskId} and status = 'active'
      `;
      await this.releaseLeases(context.task, "workflow_failed").catch(
        () => undefined,
      );
    }
    await appendWorkspaceEvent(this.database, {
      ...(task?.workspace_id ? { workspaceId: task.workspace_id } : {}),
      taskId,
      hostId,
      type: "phase7.workflow_failed",
      payload: { error: message },
    });
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function validationCommands(value: unknown): ValidationCommand[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const profile = value as { commands?: unknown; steps?: unknown };
  const rawCommands = Array.isArray(profile.commands)
    ? profile.commands
    : Array.isArray(profile.steps)
      ? profile.steps
      : [];

  return rawCommands
    .filter((command): command is Record<string, unknown> =>
      Boolean(
        command && typeof command === "object" && !Array.isArray(command),
      ),
    )
    .filter((command) => typeof command.command === "string")
    .map((command) => ({
      command: command.command as string,
      args: Array.isArray(command.args)
        ? command.args.filter(
            (argument): argument is string => typeof argument === "string",
          )
        : [],
      profile:
        typeof command.profile === "string" ? command.profile : undefined,
      required: typeof command.required === "boolean" ? command.required : true,
      timeoutMs:
        typeof command.timeoutMs === "number" ? command.timeoutMs : undefined,
    }));
}

function validationFailFast(value: unknown) {
  if (!value || typeof value !== "object" || !("failFast" in value)) {
    return true;
  }
  return (value as { failFast?: unknown }).failFast !== false;
}

function fixtureScenarioPayload(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("codexFixtureScenario" in value)
  ) {
    return {};
  }
  const scenario = (value as { codexFixtureScenario?: unknown })
    .codexFixtureScenario;
  return typeof scenario === "string" ? { fixtureScenario: scenario } : {};
}

function terminalType(value: Record<string, unknown>) {
  const terminal = value.terminal;
  if (!terminal || typeof terminal !== "object" || !("type" in terminal)) {
    return undefined;
  }
  return typeof terminal.type === "string" ? terminal.type : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
