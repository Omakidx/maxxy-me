import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ControlApprovalDecisionMessage,
  HostCommandName,
} from "@maxxy/contracts";
import {
  ControlPlaneRepository,
  HostEnrollmentRepository,
  SecurityAuditRepository,
  TaskStateMachine,
} from "@maxxy/database";
import { createSecretToken, hashSecret } from "@maxxy/security";
import { z } from "zod";
import {
  handleApiError,
  type Identity,
  readJson,
  requireDb,
  requireOwner,
  sendError,
  sendJson,
} from "./api-security";

const capacitySourceKindSchema = z.enum([
  "chatgpt_account",
  "api_project",
  "enterprise_workspace",
]);
const authModeSchema = z.enum([
  "chatgpt",
  "api_key",
  "enterprise_access_token",
]);
const routingPolicySchema = z.enum(["balanced", "ordered", "manual"]);
const approvalDecisionSchema = z.enum([
  "approve_once",
  "approve_for_session",
  "decline",
  "cancel",
]);

const hostEnrollmentSchema = z.object({
  hostName: z.string().min(1).max(120),
  expiresInSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24)
    .default(60 * 30),
  maxConcurrentAgents: z.number().int().min(1).max(20).default(1),
});
const connectionSetupSchema = z.object({
  label: z.string().min(1).max(120),
  authMode: authModeSchema,
  credentialSlotId: z.string().min(1).max(120),
  capacitySourceId: z.string().min(1).max(160).optional(),
  capacitySourceLabel: z.string().min(1).max(120).optional(),
  capacitySourceKind: capacitySourceKindSchema.default("chatgpt_account"),
  providerScopeHint: z.string().max(200).optional(),
  maxConcurrentRuns: z.number().int().min(1).max(20).default(1),
});
const poolMemberSchema = z.object({
  connectionId: z.string().min(1),
  priority: z.number().int().min(0).max(10_000).default(100),
  maxActiveRuns: z.number().int().min(1).max(20).default(1),
  enabled: z.boolean().optional(),
});
const createPoolSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  routingPolicy: routingPolicySchema.default("balanced"),
  members: z.array(poolMemberSchema).default([]),
});
const patchPoolSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  routingPolicy: routingPolicySchema.optional(),
  members: z.array(poolMemberSchema).optional(),
});
const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  repository: z.object({
    owner: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    remoteUrl: z.string().url(),
    defaultBranch: z.string().min(1).max(120).default("main"),
  }),
  defaultHostId: z.string().min(1).optional(),
  projectPath: z.string().min(1).max(500),
  worktreeRoot: z.string().min(1).max(500),
  baseBranch: z.string().min(1).max(120).default("main"),
  maximumConcurrentAgents: z.number().int().min(1).max(100).default(1),
});
const patchWorkspaceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  defaultHostId: z.string().min(1).nullable().optional(),
  projectPath: z.string().min(1).max(500).optional(),
  worktreeRoot: z.string().min(1).max(500).optional(),
  baseBranch: z.string().min(1).max(120).optional(),
  maximumConcurrentAgents: z.number().int().min(1).max(100).optional(),
  codexPoolId: z.string().min(1).nullable().optional(),
  codexRoutingPolicy: routingPolicySchema.optional(),
});
const ownershipClaimSchema = z.object({
  pattern: z.string().min(1).max(500),
  mode: z.enum(["read", "write"]).default("write"),
});

const validationCommandSchema = z.object({
  command: z.string().min(1).max(200),
  args: z.array(z.string().max(200)).default([]),
  profile: z.string().min(1).max(120).default("default"),
  required: z.boolean().default(true),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(60 * 60 * 1000)
    .optional(),
});
const validationProfileSchema = z.object({
  failFast: z.boolean().default(true),
  commands: z.array(validationCommandSchema).max(20).default([]),
});

const createTaskSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(40_000),
  priority: z.number().int().min(0).max(10_000).default(100),
  idempotencyKey: z.string().min(1).max(200).optional(),
  preferredCodexPoolId: z.string().min(1).optional(),
  assignedProfileId: z.string().min(1).optional(),
  ownershipClaims: z.array(ownershipClaimSchema).default([]),
  dependencies: z
    .array(
      z.object({
        dependsOnTaskId: z.string().min(1),
        condition: z.enum(["merged", "completed"]).default("merged"),
      }),
    )
    .default([]),
  startImmediately: z.boolean().default(false),
});

const managerPlanTaskSchema = z.object({
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(40_000),
  role: z.enum([
    "manager",
    "architect",
    "frontend",
    "backend",
    "testing",
    "reviewer",
    "integrator",
  ]),
  ownershipClaims: z.array(ownershipClaimSchema).default([]),
  dependsOnIndexes: z.array(z.number().int().min(0)).default([]),
});
const managerPlanPreviewSchema = z.object({
  workspaceId: z.string().min(1),
  goal: z.string().min(1).max(40_000),
  frontendOwnership: z.string().min(1).max(500).default("apps/web"),
  backendOwnership: z.string().min(1).max(500).default("apps/web/src"),
});
const managerPlanApprovalSchema = z.object({
  workspaceId: z.string().min(1),
  goal: z.string().min(1).max(40_000),
  tasks: z.array(managerPlanTaskSchema).min(1).max(20),
  startImmediately: z.boolean().default(true),
});

const eventsQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  afterSequence: z.coerce.number().int().min(-1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const approvalDecisionRequestSchema = z.object({
  decision: approvalDecisionSchema,
});

export type ControlPlaneApiHooks = {
  onApprovalDecision?: (message: ControlApprovalDecisionMessage) => void;
  onHostCommand?: (
    hostId: string,
    command: HostCommandName,
    payload: Record<string, unknown>,
  ) => Promise<{
    status: string;
    error?: string | undefined;
  }>;
};

export async function handleControlPlaneApi(
  request: IncomingMessage,
  response: ServerResponse,
  hooks: ControlPlaneApiHooks = {},
) {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  const pathname = url.pathname;
  const method = request.method ?? "GET";

  if (!isControlPlanePath(pathname)) {
    return false;
  }

  try {
    const auth = await requireOwner(request, response, {
      csrf: method !== "GET" && method !== "HEAD",
      scope: scopeFor(method, pathname),
    });
    if (!auth) {
      return true;
    }

    const repository = new ControlPlaneRepository(requireDb());
    const stateMachine = new TaskStateMachine(requireDb());

    if (pathname === "/api/compatibility" && method === "GET") {
      sendJson(response, 200, {
        compatibility: await repository.compatibilityStatus({
          controlPlaneVersion: process.env.RELEASE_VERSION ?? "development",
          protocolVersion: process.env.PROTOCOL_VERSION ?? "1",
        }),
      });
      return true;
    }

    if (pathname === "/api/me" && method === "GET") {
      sendJson(response, 200, {
        user: auth.identity.user,
        authKind: auth.identity.kind,
      });
      return true;
    }

    if (pathname === "/api/hosts" && method === "GET") {
      sendJson(response, 200, { hosts: await repository.listHosts() });
      return true;
    }

    if (pathname === "/api/hosts/enrollment" && method === "POST") {
      await createHostEnrollment(request, response, auth.identity);
      return true;
    }

    const hostRevokeMatch = pathname.match(/^\/api\/hosts\/([^/]+)\/revoke$/);
    if (hostRevokeMatch && method === "POST") {
      const host = await repository.revokeHost(
        decodeURIComponent(hostRevokeMatch[1] ?? ""),
        auth.identity.user.id,
      );
      if (!host) {
        sendError(response, 404, "not_found", "Host was not found");
        return true;
      }
      await recordAudit("host.revoked", auth.identity, "host", host.id);
      sendJson(response, 200, { host });
      return true;
    }

    const hostConnectionsMatch = pathname.match(
      /^\/api\/hosts\/([^/]+)\/codex-connections$/,
    );
    if (hostConnectionsMatch && method === "GET") {
      sendJson(response, 200, {
        connections: await repository.listHostCodexConnections(
          decodeURIComponent(hostConnectionsMatch[1] ?? ""),
        ),
      });
      return true;
    }

    const hostConnectionSetupMatch = pathname.match(
      /^\/api\/hosts\/([^/]+)\/codex-connections\/setup$/,
    );
    if (hostConnectionSetupMatch && method === "POST") {
      const body = connectionSetupSchema.parse(await readJson(request));
      const connection = await repository.setupCodexConnection({
        hostId: decodeURIComponent(hostConnectionSetupMatch[1] ?? ""),
        label: body.label,
        authMode: body.authMode,
        credentialSlotId: body.credentialSlotId,
        ...(body.capacitySourceId
          ? { capacitySourceId: body.capacitySourceId }
          : {}),
        ...(body.capacitySourceLabel
          ? { capacitySourceLabel: body.capacitySourceLabel }
          : {}),
        capacitySourceKind: body.capacitySourceKind,
        ...(body.providerScopeHint
          ? { providerScopeHint: body.providerScopeHint }
          : {}),
        maxConcurrentRuns: body.maxConcurrentRuns,
        actorUserId: auth.identity.user.id,
      });
      await recordAudit(
        "codex.connection_added",
        auth.identity,
        "codex_connection",
        connection.id,
      );
      sendJson(response, 201, { connection });
      return true;
    }

    const reauthMatch = pathname.match(
      /^\/api\/codex-connections\/([^/]+)\/reauthenticate$/,
    );
    if (reauthMatch && method === "POST") {
      const connectionId = decodeURIComponent(reauthMatch[1] ?? "");
      const existing = await repository.getCodexConnection(connectionId);
      if (!existing) {
        sendError(response, 404, "not_found", "Codex connection was not found");
        return true;
      }
      try {
        await runConnectionHostCommand(
          hooks,
          existing,
          "codex.connection.reauthenticate",
        );
      } catch (error) {
        if (isHostUnavailableError(error)) {
          sendError(
            response,
            409,
            "host_offline",
            "This account is assigned to an offline host. Start that host, or remove the account and add it to an online host.",
          );
          return true;
        }
        throw error;
      }
      const connection = await repository.updateCodexConnectionStatus({
        connectionId,
        status: "authenticating",
        action: "codex.connection_reauthentication_requested",
        actorUserId: auth.identity.user.id,
      });
      if (!connection) {
        throw new Error("Codex connection disappeared during reauthentication");
      }
      await recordAudit(
        "codex.connection_reauthentication_requested",
        auth.identity,
        "codex_connection",
        connection.id,
      );
      sendJson(response, 200, { connection });
      return true;
    }

    const disableMatch = pathname.match(
      /^\/api\/codex-connections\/([^/]+)\/disable$/,
    );
    if (disableMatch && method === "POST") {
      const connectionId = decodeURIComponent(disableMatch[1] ?? "");
      const existing = await repository.getCodexConnection(connectionId);
      if (!existing) {
        sendError(response, 404, "not_found", "Codex connection was not found");
        return true;
      }
      if (Number(existing.active_lease_count ?? 0) > 0) {
        sendError(
          response,
          409,
          "active_lease",
          "Disconnect is blocked while this account has an active task lease",
        );
        return true;
      }
      const hostCleanup = await runBestEffortConnectionHostCommand(
        hooks,
        existing,
        "codex.connection.disable",
      );
      const connection = await repository.updateCodexConnectionStatus({
        connectionId,
        status: "disabled",
        action: "codex.connection_disabled",
        actorUserId: auth.identity.user.id,
      });
      if (!connection) {
        throw new Error("Codex connection disappeared while disconnecting");
      }
      await recordAudit(
        "codex.connection_disabled",
        auth.identity,
        "codex_connection",
        connection.id,
      );
      sendJson(response, 200, { connection, hostCleanup });
      return true;
    }

    const deleteConnectionMatch = pathname.match(
      /^\/api\/codex-connections\/([^/]+)$/,
    );
    if (deleteConnectionMatch && method === "DELETE") {
      const connectionId = decodeURIComponent(deleteConnectionMatch[1] ?? "");
      const existing = await repository.getCodexConnection(connectionId);
      if (!existing) {
        sendError(response, 404, "not_found", "Codex connection was not found");
        return true;
      }
      if (Number(existing.active_lease_count ?? 0) > 0) {
        sendError(
          response,
          409,
          "active_lease",
          "Remove is blocked while this account has an active task lease",
        );
        return true;
      }
      const hostCleanup = await runBestEffortConnectionHostCommand(
        hooks,
        existing,
        "codex.connection.remove",
        {
          activeLeaseCount: Number(existing.active_lease_count ?? 0),
        },
      );
      const connection = await repository.deleteCodexConnection(
        connectionId,
        auth.identity.user.id,
      );
      if (!connection) {
        sendError(
          response,
          404,
          "not_found",
          "Codex connection was not found or has an active lease",
        );
        return true;
      }
      await recordAudit(
        "codex.connection_removed",
        auth.identity,
        "codex_connection",
        connection.id,
      );
      sendJson(response, 200, { ok: true, hostCleanup });
      return true;
    }

    if (pathname === "/api/codex-capacity-pools" && method === "GET") {
      sendJson(response, 200, { pools: await repository.listCapacityPools() });
      return true;
    }

    if (pathname === "/api/codex-capacity-pools" && method === "POST") {
      const body = createPoolSchema.parse(await readJson(request));
      const pool = await repository.createCapacityPool(body);
      await recordAudit(
        "codex.capacity_pool_created",
        auth.identity,
        "codex_capacity_pool",
        pool.id,
      );
      sendJson(response, 201, { pool });
      return true;
    }

    const poolMatch = pathname.match(/^\/api\/codex-capacity-pools\/([^/]+)$/);
    if (poolMatch && method === "PATCH") {
      const body = patchPoolSchema.parse(await readJson(request));
      const pool = await repository.patchCapacityPool({
        poolId: decodeURIComponent(poolMatch[1] ?? ""),
        ...body,
      });
      if (!pool) {
        sendError(
          response,
          404,
          "not_found",
          "Codex capacity pool was not found",
        );
        return true;
      }
      await recordAudit(
        "codex.capacity_pool_updated",
        auth.identity,
        "codex_capacity_pool",
        pool.id,
      );
      sendJson(response, 200, { pool });
      return true;
    }

    if (pathname === "/api/codex-capacity/summary" && method === "GET") {
      sendJson(response, 200, { capacity: await repository.capacitySummary() });
      return true;
    }

    if (pathname === "/api/workspaces" && method === "GET") {
      sendJson(response, 200, {
        workspaces: await repository.listWorkspaces(),
      });
      return true;
    }

    if (pathname === "/api/workspaces" && method === "POST") {
      const body = createWorkspaceSchema.parse(await readJson(request));
      const workspace = await repository.createWorkspace(body);
      await recordAudit(
        "workspace.created",
        auth.identity,
        "workspace",
        workspace.id,
      );
      sendJson(response, 201, { workspace });
      return true;
    }

    const workspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
    if (workspaceMatch && method === "GET") {
      const [workspace] = await repository.getWorkspace(
        decodeURIComponent(workspaceMatch[1] ?? ""),
      );
      if (!workspace) {
        sendError(response, 404, "not_found", "Workspace was not found");
        return true;
      }
      sendJson(response, 200, { workspace });
      return true;
    }

    if (workspaceMatch && method === "PATCH") {
      const body = patchWorkspaceSchema.parse(await readJson(request));
      const workspace = await repository.patchWorkspace({
        workspaceId: decodeURIComponent(workspaceMatch[1] ?? ""),
        ...body,
      });
      if (!workspace) {
        sendError(response, 404, "not_found", "Workspace was not found");
        return true;
      }
      await recordAudit(
        "workspace.updated",
        auth.identity,
        "workspace",
        workspace.id,
      );
      sendJson(response, 200, { workspace });
      return true;
    }

    const workspaceValidationMatch = pathname.match(
      /^\/api\/workspaces\/([^/]+)\/validation-profile$/,
    );
    if (workspaceValidationMatch && method === "PATCH") {
      const body = validationProfileSchema.parse(await readJson(request));
      const workspace = await repository.patchWorkspace({
        workspaceId: decodeURIComponent(workspaceValidationMatch[1] ?? ""),
        validationProfile: body,
      });
      if (!workspace) {
        sendError(response, 404, "not_found", "Workspace was not found");
        return true;
      }
      await recordAudit(
        "workspace.validation_profile_updated",
        auth.identity,
        "workspace",
        workspace.id,
      );
      sendJson(response, 200, { workspace });
      return true;
    }

    if (pathname === "/api/agent-profiles" && method === "GET") {
      sendJson(response, 200, {
        profiles: await repository.listAgentProfiles(
          url.searchParams.get("workspaceId") ?? undefined,
        ),
      });
      return true;
    }

    const seedProfilesMatch = pathname.match(
      /^\/api\/workspaces\/([^/]+)\/agent-profiles\/seed$/,
    );
    if (seedProfilesMatch && method === "POST") {
      const profiles = await repository.ensureDefaultAgentProfiles(
        decodeURIComponent(seedProfilesMatch[1] ?? ""),
      );
      await recordAudit(
        "agent_profiles.seeded",
        auth.identity,
        "workspace",
        decodeURIComponent(seedProfilesMatch[1] ?? ""),
      );
      sendJson(response, 200, { profiles });
      return true;
    }

    if (pathname === "/api/manager-plans/preview" && method === "POST") {
      const body = managerPlanPreviewSchema.parse(await readJson(request));
      sendJson(response, 200, { plan: buildManagerPlan(body) });
      return true;
    }

    if (pathname === "/api/manager-plans/approve" && method === "POST") {
      const body = managerPlanApprovalSchema.parse(await readJson(request));
      const result = await repository.approveManagerPlan({
        workspaceId: body.workspaceId,
        goal: body.goal,
        tasks: body.tasks,
        startImmediately: body.startImmediately,
        actorUserId: auth.identity.user.id,
      });
      await recordAudit(
        "manager.plan_approved",
        auth.identity,
        "workspace",
        body.workspaceId,
        { taskCount: body.tasks.length },
      );
      sendJson(response, 201, result);
      return true;
    }

    if (pathname === "/api/tasks" && method === "GET") {
      sendJson(response, 200, { tasks: await repository.listTasks() });
      return true;
    }

    if (pathname === "/api/tasks" && method === "POST") {
      const body = createTaskSchema.parse(await readJson(request));
      const task = await repository.createTask(body);
      await recordAudit("task.created", auth.identity, "task", task.id);
      if (body.startImmediately) {
        await stateMachine.start(task.id, auth.identity.user.id);
        const [startedTask] = await repository.getTask(task.id);
        sendJson(response, 201, { task: startedTask ?? task });
        return true;
      }
      sendJson(response, 201, { task });
      return true;
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && method === "GET") {
      const [task] = await repository.getTask(
        decodeURIComponent(taskMatch[1] ?? ""),
      );
      if (!task) {
        sendError(response, 404, "not_found", "Task was not found");
        return true;
      }
      sendJson(response, 200, { task });
      return true;
    }

    const taskReviewMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/review$/);
    if (taskReviewMatch && method === "GET") {
      const review = await repository.getTaskReview(
        decodeURIComponent(taskReviewMatch[1] ?? ""),
      );
      if (!review) {
        sendError(response, 404, "not_found", "Task was not found");
        return true;
      }
      sendJson(response, 200, { review });
      return true;
    }

    const taskActionMatch = pathname.match(
      /^\/api\/tasks\/([^/]+)\/(start|cancel|retry)$/,
    );
    if (taskActionMatch && method === "POST") {
      const taskId = decodeURIComponent(taskActionMatch[1] ?? "");
      const action = taskActionMatch[2];
      if (action === "start") {
        await stateMachine.start(taskId, auth.identity.user.id);
      } else if (action === "cancel") {
        await stateMachine.cancel(taskId, auth.identity.user.id);
      } else {
        await stateMachine.retry(taskId, auth.identity.user.id);
      }
      await recordAudit(`task.${action}`, auth.identity, "task", taskId);
      const [task] = await repository.getTask(taskId);
      sendJson(response, 200, { task });
      return true;
    }

    if (pathname === "/api/events" && method === "GET") {
      const query = eventsQuerySchema.parse(
        Object.fromEntries(url.searchParams),
      );
      sendJson(response, 200, { events: await repository.listEvents(query) });
      return true;
    }

    if (pathname === "/api/approvals" && method === "GET") {
      sendJson(response, 200, { approvals: await repository.listApprovals() });
      return true;
    }

    const approvalMatch = pathname.match(
      /^\/api\/approvals\/([^/]+)\/decision$/,
    );
    if (approvalMatch && method === "POST") {
      const body = approvalDecisionRequestSchema.parse(await readJson(request));
      const approval = await repository.decideApproval({
        approvalId: decodeURIComponent(approvalMatch[1] ?? ""),
        decision: body.decision,
        decidedByUserId: auth.identity.user.id,
      });
      if (!approval) {
        sendError(response, 404, "not_found", "Pending approval was not found");
        return true;
      }
      await recordAudit(
        "approval.decided",
        auth.identity,
        "approval",
        approval.id,
        { decision: body.decision },
      );
      hooks.onApprovalDecision?.({
        type: "control.approval_decision",
        approvalId: approval.id,
        decision: body.decision,
        ...(approval.task_id ? { taskId: approval.task_id } : {}),
        ...(runIdFromApproval(approval.requested_payload)
          ? { runId: runIdFromApproval(approval.requested_payload) }
          : {}),
        decidedAt: new Date().toISOString(),
      });
      sendJson(response, 200, { approval });
      return true;
    }

    return false;
  } catch (error) {
    try {
      handleApiError(response, error);
    } catch (unhandled) {
      sendError(
        response,
        500,
        "internal_error",
        unhandled instanceof Error ? unhandled.message : "Request failed",
      );
    }
    return true;
  }
}

async function runConnectionHostCommand(
  hooks: ControlPlaneApiHooks,
  connection: Record<string, unknown>,
  command: HostCommandName,
  extraPayload: Record<string, unknown> = {},
): Promise<"completed" | "pending"> {
  if (!hooks.onHostCommand) {
    throw new Error("Host command bridge is unavailable");
  }
  const result = await hooks.onHostCommand(
    String(connection.host_id),
    command,
    {
      codexConnectionId: String(connection.id),
      authMode: String(connection.auth_mode),
      label: String(connection.label),
      capacitySourceId: String(connection.capacity_source_id),
      credentialSlotId: String(connection.credential_slot_id),
      maxConcurrentRuns: Number(connection.max_concurrent_runs ?? 1),
      ...extraPayload,
    },
  );
  if (result.status === "completed") {
    return "completed";
  }
  if (result.error?.includes("not registered")) {
    return "pending";
  }
  throw new Error(result.error ?? `Host command failed: ${command}`);
}
export async function runBestEffortConnectionHostCommand(
  hooks: ControlPlaneApiHooks,
  connection: Record<string, unknown>,
  command: HostCommandName,
  extraPayload: Record<string, unknown> = {},
): Promise<"completed" | "pending"> {
  try {
    return await runConnectionHostCommand(
      hooks,
      connection,
      command,
      extraPayload,
    );
  } catch (error) {
    if (isHostUnavailableError(error)) {
      return "pending";
    }
    throw error;
  }
}

function isHostUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("No active host websocket") ||
    message.includes("Host command bridge is unavailable")
  );
}

function buildManagerPlan(input: {
  workspaceId: string;
  goal: string;
  frontendOwnership: string;
  backendOwnership: string;
}) {
  const goal = input.goal.trim();
  const backendPrompt = `Implement the backend/API/data-model portion of this goal with a narrow scope: ${goal}`;
  const frontendPrompt = `Implement the owner-facing UI portion of this goal with a narrow scope: ${goal}`;
  const testingPrompt = `Add focused validation for the backend and frontend tasks for this goal: ${goal}`;
  const reviewerPrompt = `Review the completed task pull requests for this goal and report findings without merging: ${goal}`;

  return {
    workspaceId: input.workspaceId,
    goal,
    strategy: "wait_for_parent_pr_merge",
    parallelGroups: [[0, 1], [2], [3]],
    tasks: [
      {
        title: `Backend: ${goal.slice(0, 120)}`,
        role: "backend",
        prompt: backendPrompt,
        ownershipClaims: [{ pattern: input.backendOwnership, mode: "write" }],
        dependsOnIndexes: [],
        mayRunInParallel: true,
      },
      {
        title: `Frontend: ${goal.slice(0, 120)}`,
        role: "frontend",
        prompt: frontendPrompt,
        ownershipClaims: [{ pattern: input.frontendOwnership, mode: "write" }],
        dependsOnIndexes: [],
        mayRunInParallel: true,
      },
      {
        title: `Testing: ${goal.slice(0, 120)}`,
        role: "testing",
        prompt: testingPrompt,
        ownershipClaims: [{ pattern: "tests", mode: "write" }],
        dependsOnIndexes: [0, 1],
        mayRunInParallel: false,
      },
      {
        title: `Review: ${goal.slice(0, 120)}`,
        role: "reviewer",
        prompt: reviewerPrompt,
        ownershipClaims: [],
        dependsOnIndexes: [2],
        mayRunInParallel: false,
      },
    ],
  };
}

function isControlPlanePath(pathname: string) {
  if (pathname === "/api/hosts/exchange-enrollment") {
    return false;
  }

  return (
    pathname === "/api/compatibility" ||
    pathname === "/api/me" ||
    pathname === "/api/hosts" ||
    pathname.startsWith("/api/hosts/") ||
    pathname === "/api/codex-capacity-pools" ||
    pathname.startsWith("/api/codex-capacity-pools/") ||
    pathname === "/api/codex-capacity/summary" ||
    pathname.startsWith("/api/codex-connections/") ||
    pathname === "/api/workspaces" ||
    pathname.startsWith("/api/workspaces/") ||
    pathname === "/api/agent-profiles" ||
    pathname === "/api/manager-plans/preview" ||
    pathname === "/api/manager-plans/approve" ||
    pathname === "/api/tasks" ||
    pathname.startsWith("/api/tasks/") ||
    pathname === "/api/events" ||
    pathname === "/api/approvals" ||
    pathname.startsWith("/api/approvals/")
  );
}

function runIdFromApproval(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("runId" in payload)) {
    return undefined;
  }
  const runId = payload.runId;
  return typeof runId === "string" ? runId : undefined;
}

function scopeFor(method: string, pathname: string) {
  if (method === "GET" || method === "HEAD") {
    return "owner";
  }
  if (pathname.includes("codex")) {
    return "codex:write";
  }
  if (pathname.includes("hosts")) {
    return "hosts:write";
  }
  if (
    pathname.includes("manager-plans") ||
    pathname.includes("agent-profiles")
  ) {
    return method === "GET" ? "tasks:read" : "tasks:write";
  }
  if (pathname.includes("tasks")) {
    return "tasks:write";
  }
  if (pathname.includes("approvals")) {
    return "approvals:write";
  }
  return "owner";
}

async function createHostEnrollment(
  request: IncomingMessage,
  response: ServerResponse,
  identity: Identity,
) {
  const body = hostEnrollmentSchema.parse(await readJson(request));
  const enrollmentToken = createSecretToken("mxh_enroll");
  const expiresAt = new Date(Date.now() + body.expiresInSeconds * 1000);
  const enrollment = await new HostEnrollmentRepository(
    requireDb().db,
  ).createEnrollment({
    hostName: body.hostName,
    maxConcurrentAgents: body.maxConcurrentAgents,
    enrollmentTokenHash: hashSecret(enrollmentToken),
    expiresAt,
  });

  await recordAudit(
    "host.enrollment_token_created",
    identity,
    "host",
    enrollment.host.id,
    { expiresAt },
  );
  sendJson(response, 201, {
    host: {
      id: enrollment.host.id,
      name: enrollment.host.name,
      status: enrollment.host.status,
    },
    enrollmentToken,
    expiresAt,
  });
}

async function recordAudit(
  action: string,
  identity: Identity,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
) {
  await new SecurityAuditRepository(requireDb().db).record({
    action,
    actorUserId: identity.user.id,
    ...(targetType ? { targetType } : {}),
    ...(targetId ? { targetId } : {}),
    metadata: { authKind: identity.kind, ...(metadata ?? {}) },
  });
}
