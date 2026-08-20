import { createServer } from "node:http";
import {
  approvalRequestedPayloadSchema,
  type ControlApprovalDecisionMessage,
  type HostClientMessage,
  type HostCommandName,
  type HostCommandResultMessage,
  type HostConnectionReport,
} from "@maxxy/contracts";
import { appendWorkspaceEvent } from "@maxxy/database";
import next from "next";
import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import {
  authenticateWebSocketUpgrade,
  getWebSocketOptions,
  handleSecurityApi,
  parseWebSocketMessage,
  requireDb,
  type WebSocketAuth,
} from "./api-security";
import { handleControlPlaneApi } from "./control-plane-api";
import { handleGitHubWebhook } from "./github-webhooks";
import { readHealth } from "./health";
import { log } from "./logger";
import { Phase7WorkflowService } from "./phase7-workflow";

function isGitHubWebhookRequest(
  request: Parameters<typeof handleGitHubWebhook>[0],
) {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  return url.pathname === "/api/github/webhooks";
}

async function handleGitHubWebhookRequest(
  request: Parameters<typeof handleGitHubWebhook>[0],
  response: Parameters<typeof handleGitHubWebhook>[1],
) {
  if (!isGitHubWebhookRequest(request)) {
    return false;
  }
  return handleGitHubWebhook(request, response, requireDb());
}

function workflowService() {
  phase7WorkflowService ??= new Phase7WorkflowService(
    requireDb(),
    sendHostCommand,
  );
  return phase7WorkflowService;
}

function dispatchAssignedTasksForHost(hostId: string) {
  if (!openHostSocket(hostId)) {
    return;
  }
  void workflowService().dispatchAssignedTasksForHost(hostId);
}

function sendHostCommand(
  hostId: string,
  command: HostCommandName,
  payload: Record<string, unknown>,
) {
  const socket = openHostSocket(hostId);
  if (!socket) {
    return Promise.reject(new Error(`No active host websocket for ${hostId}`));
  }
  const commandId = `cmd_${crypto.randomUUID()}`;
  const issuedAt = new Date().toISOString();
  return new Promise<HostCommandResultMessage>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        pendingHostCommands.delete(commandId);
        reject(new Error(`Timed out waiting for host command: ${command}`));
      },
      Number(process.env.HOST_COMMAND_RESULT_TIMEOUT_MS ?? 10 * 60 * 1000),
    );
    pendingHostCommands.set(commandId, { hostId, resolve, reject, timer });
    socket.send(
      JSON.stringify({
        type: "control.command",
        commandId,
        command,
        payload,
        issuedAt,
      }),
    );
  });
}

function resolvePendingHostCommand(
  hostId: string,
  message: HostCommandResultMessage,
) {
  const pending = pendingHostCommands.get(message.commandId);
  if (!pending || pending.hostId !== hostId) {
    return;
  }
  clearTimeout(pending.timer);
  pendingHostCommands.delete(message.commandId);
  pending.resolve(message);
}

function rejectPendingHostCommandsForHost(hostId: string, reason: string) {
  for (const [commandId, pending] of pendingHostCommands.entries()) {
    if (pending.hostId !== hostId) {
      continue;
    }
    clearTimeout(pending.timer);
    pendingHostCommands.delete(commandId);
    pending.reject(new Error(reason));
  }
}

function openHostSocket(hostId: string) {
  const sockets = hostSockets.get(hostId);
  if (!sockets) {
    return undefined;
  }
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      return socket;
    }
  }
  return undefined;
}

function rawMessageBytes(message: RawData) {
  if (Array.isArray(message)) {
    return message.reduce((total, chunk) => total + chunk.byteLength, 0);
  }

  return message.byteLength;
}

function parseRawJson(message: RawData) {
  const body = Array.isArray(message)
    ? Buffer.concat(message).toString("utf8")
    : message.toString();
  return JSON.parse(body);
}

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.BIND_HOST ?? "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, dir: process.cwd(), hostname, port });
const handle = app.getRequestHandler();
const wsOptions = getWebSocketOptions();
const authenticatedUpgrades = new WeakMap<object, WebSocketAuth>();
const hostSockets = new Map<string, Set<WebSocket>>();
const ownerSockets = new Set<WebSocket>();
const pendingHostCommands = new Map<
  string,
  {
    hostId: string;
    resolve: (message: HostCommandResultMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
let phase7WorkflowService: Phase7WorkflowService | undefined;
const sensitiveTelemetryKey =
  /(^|_)(api[-_]?key|access[-_]?token|refresh[-_]?token|authorization|password|secret|auth[-_]?json)($|_)/i;

function sanitizeTelemetry(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeTelemetry(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveTelemetryKey.test(key) ? "[redacted]" : sanitizeTelemetry(entry),
    ]),
  );
}

await app.prepare();

const server = createServer(async (request, response) => {
  if (request.url === "/health" || request.url === "/api/health") {
    const health = await readHealth();
    response.writeHead(health.ok ? 200 : 503, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(health));
    return;
  }

  if (await handleGitHubWebhookRequest(request, response)) {
    return;
  }

  if (
    await handleControlPlaneApi(request, response, {
      onApprovalDecision: broadcastApprovalDecision,
      onHostCommand: sendHostCommand,
    })
  ) {
    return;
  }

  if (await handleSecurityApi(request, response)) {
    return;
  }

  await handle(request, response);
});

const sockets = new WebSocketServer({
  noServer: true,
  maxPayload: wsOptions.maxPayloadBytes,
});

sockets.on("connection", (socket, request) => {
  const connectedAt = new Date().toISOString();
  const upgradeAuth = authenticatedUpgrades.get(request);
  authenticatedUpgrades.delete(request);

  if (!upgradeAuth?.ok) {
    socket.close(1008, "websocket upgrade was not authenticated");
    return;
  }

  socket.send(
    JSON.stringify({
      type: "security.connected",
      connectedAt,
      kind: upgradeAuth.kind,
      ...(upgradeAuth.kind === "owner"
        ? {
            expiresAt: upgradeAuth.ticket.expiresAt.toISOString(),
            purpose: upgradeAuth.ticket.purpose,
          }
        : {
            hostId: upgradeAuth.host.host.id,
            purpose: "host",
          }),
    }),
  );

  if (upgradeAuth.kind === "host") {
    const hostId = upgradeAuth.host.host.id;
    const current = hostSockets.get(hostId) ?? new Set<WebSocket>();
    current.add(socket);
    hostSockets.set(hostId, current);
  } else {
    ownerSockets.add(socket);
  }

  const expiry =
    upgradeAuth.kind === "owner"
      ? setTimeout(() => {
          socket.close(4001, "websocket session expired");
        }, wsOptions.connectionTtlMs)
      : undefined;

  const heartbeat = setInterval(
    () => {
      if (socket.readyState === socket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "security.heartbeat",
            timestamp: new Date().toISOString(),
          }),
        );
      }
    },
    Number(process.env.WS_HEARTBEAT_INTERVAL_MS ?? 25000),
  );

  let messageQueue = Promise.resolve();
  socket.on("message", (message) => {
    messageQueue = messageQueue
      .then(() => handleWebSocketMessage(socket, upgradeAuth, message))
      .catch((error: unknown) => {
        socket.send(
          JSON.stringify({ type: "security.error", code: "message_failed" }),
        );
        log("warn", "websocket message handler failed", {
          kind: upgradeAuth.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  socket.on("close", () => {
    if (upgradeAuth.kind === "host") {
      const hostId = upgradeAuth.host.host.id;
      const current = hostSockets.get(hostId);
      current?.delete(socket);
      if (current?.size === 0) {
        hostSockets.delete(hostId);
        void markHostOffline(hostId, new Date()).catch((error: unknown) => {
          log("warn", "failed to mark disconnected host offline", {
            hostId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
      rejectPendingHostCommandsForHost(hostId, "host websocket closed");
    } else {
      ownerSockets.delete(socket);
    }
    if (expiry) {
      clearTimeout(expiry);
    }
    clearInterval(heartbeat);
  });
});

async function handleWebSocketMessage(
  socket: WebSocket,
  auth: WebSocketAuth & { ok: true },
  message: RawData,
) {
  try {
    const parsed = parseWebSocketMessage(parseRawJson(message));
    if (!parsed.success) {
      socket.send(
        JSON.stringify({
          type: "security.error",
          code: "validation_error",
          issues: parsed.error.issues,
        }),
      );
      return;
    }

    if (auth.kind === "host") {
      await handleHostProtocolMessage(auth.host.host.id, parsed.data);
    }

    log("info", "websocket message received", {
      type: parsed.data.type,
      kind: auth.kind,
      bytes: rawMessageBytes(message),
    });
  } catch (error) {
    socket.send(
      JSON.stringify({ type: "security.error", code: "invalid_json" }),
    );
    log("warn", "websocket message rejected", {
      kind: auth.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleHostProtocolMessage(
  authenticatedHostId: string,
  message: HostClientMessage,
) {
  if (message.type === "client.hello" || message.type === "client.pong") {
    return;
  }
  if ("hostId" in message && message.hostId !== authenticatedHostId) {
    throw new Error("host message did not match authenticated host");
  }

  if (message.type === "host.hello") {
    await persistHostHello(message);
    return;
  }
  if (message.type === "host.heartbeat") {
    await persistHostHeartbeat(message);
    return;
  }
  if (message.type === "host.reconnect_report") {
    await appendWorkspaceEvent(requireDb(), {
      hostId: authenticatedHostId,
      type: "host.reconnect_reported",
      payload: {
        activeRuns: message.activeRuns,
        localEventCount: message.localEventCount,
        policy: message.policy,
      },
    });
    return;
  }
  if (message.type === "host.runtime_event") {
    await persistHostRuntimeEvent(authenticatedHostId, message);
    return;
  }
  if (message.type === "host.command_result") {
    resolvePendingHostCommand(authenticatedHostId, message);
    await appendWorkspaceEvent(requireDb(), {
      hostId: authenticatedHostId,
      type: "host.command_result_received",
      payload: {
        commandId: message.commandId,
        command: message.command,
        status: message.status,
        exitCode: message.exitCode,
        outputTruncated: message.outputTruncated,
        error: message.error,
      },
    });
  }
}

async function persistHostRuntimeEvent(
  authenticatedHostId: string,
  message: Extract<HostClientMessage, { type: "host.runtime_event" }>,
) {
  const database = requireDb();
  if (message.hostId !== authenticatedHostId) {
    throw new Error("runtime event did not match authenticated host");
  }

  await upsertRuntimeThreadAndTurn(message);
  await persistCommandRuntimeEvent(message);

  if (message.event.type === "approval.requested") {
    await persistApprovalRequest(message);
  }
  if (message.event.type === "turn.completed") {
    await markRuntimeCompleted(message);
  }
  if (
    message.event.type === "turn.failed" ||
    message.event.type === "runtime.disconnected"
  ) {
    await markRuntimeFailed(message);
  }

  const payload = sanitizeTelemetry({
    ...message.event.payload,
    ...(message.threadId ? { threadId: message.threadId } : {}),
    ...(message.turnId ? { turnId: message.turnId } : {}),
  }) as Record<string, unknown>;
  const event = await appendWorkspaceEvent(database, {
    ...(message.workspaceId ? { workspaceId: message.workspaceId } : {}),
    ...(message.taskId ? { taskId: message.taskId } : {}),
    hostId: authenticatedHostId,
    runId: message.runId,
    ...(message.attemptId ? { attemptId: message.attemptId } : {}),
    ...(message.codexConnectionId
      ? { codexConnectionId: message.codexConnectionId }
      : {}),
    ...(message.capacitySourceId
      ? { capacitySourceId: message.capacitySourceId }
      : {}),
    type: message.event.type,
    payload,
  });
  broadcastOwnerEvent({
    id: event.id,
    type: message.event.type,
    workspace_id: message.workspaceId,
    task_id: message.taskId,
    host_id: authenticatedHostId,
    run_id: message.runId,
    attempt_id: message.attemptId,
    codex_connection_id: message.codexConnectionId,
    capacity_source_id: message.capacitySourceId,
    sequence: event.sequence,
    occurred_at: new Date().toISOString(),
    payload,
  });
}

async function upsertRuntimeThreadAndTurn(
  message: Extract<HostClientMessage, { type: "host.runtime_event" }>,
) {
  const payload = message.event.payload;
  if (message.taskId && message.threadId) {
    await requireDb().sql`
      insert into threads (id, task_id, attempt_id, codex_connection_id, provider_thread_id, status)
      values (
        ${message.threadId}, ${message.taskId}, ${message.attemptId ?? null},
        ${message.codexConnectionId ?? null}, ${stringPayload(payload.providerThreadId) ?? null},
        ${
          message.event.type === "turn.completed"
            ? "completed"
            : message.event.type === "turn.failed" ||
                message.event.type === "runtime.disconnected"
              ? "failed"
              : "running"
        }
      )
      on conflict (id) do update
      set provider_thread_id = coalesce(excluded.provider_thread_id, threads.provider_thread_id),
          status = case
            when excluded.status = 'running' and threads.status in ('completed','failed') then threads.status
            else excluded.status
          end,
          updated_at = now()
    `;
    if (message.attemptId) {
      await requireDb().sql`
        update task_runtime_attempts
        set thread_id = ${message.threadId}, updated_at = now()
        where id = ${message.attemptId}
      `;
    }
  }

  if (message.threadId && message.turnId) {
    await requireDb().sql`
      insert into turns (id, thread_id, provider_turn_id, status, started_at, completed_at, payload)
      values (
        ${message.turnId}, ${message.threadId}, ${stringPayload(payload.providerTurnId) ?? null},
        ${turnStatusFor(message.event.type)},
        case when ${message.event.type} = 'agent.status_changed' then now() else null end,
        case when ${message.event.type} in ('turn.completed', 'turn.failed', 'runtime.disconnected') then now() else null end,
        ${JSON.stringify(sanitizeTelemetry(payload))}::jsonb
      )
      on conflict (id) do update
      set provider_turn_id = coalesce(excluded.provider_turn_id, turns.provider_turn_id),
          status = excluded.status,
          completed_at = coalesce(excluded.completed_at, turns.completed_at),
          payload = turns.payload || excluded.payload,
          updated_at = now()
    `;
  }
}

async function persistCommandRuntimeEvent(
  message: Extract<HostClientMessage, { type: "host.runtime_event" }>,
) {
  const commandId = stringPayload(message.event.payload.commandId);
  if (!commandId || !message.taskId) {
    return;
  }

  if (message.event.type === "command.started") {
    await requireDb().sql`
      insert into commands (id, task_id, command, cwd, status, started_at)
      values (${commandId}, ${message.taskId}, ${stringPayload(message.event.payload.command) ?? "unknown"}, ${stringPayload(message.event.payload.cwd) ?? null}, 'running', now())
      on conflict (id) do update
      set status = 'running', started_at = coalesce(commands.started_at, now()), updated_at = now()
    `;
  }
  if (message.event.type === "command.output") {
    await requireDb().sql`
      update commands
      set output = coalesce(output, '') || ${stringPayload(message.event.payload.output) ?? ""},
          updated_at = now()
      where id = ${commandId}
    `;
  }
  if (message.event.type === "command.completed") {
    const exitCode = numberPayload(message.event.payload.exitCode);
    await requireDb().sql`
      update commands
      set status = case when ${exitCode ?? 0} = 0 then 'completed' else 'failed' end,
          exit_code = ${exitCode ?? null},
          completed_at = now(),
          updated_at = now()
      where id = ${commandId}
    `;
  }
}

async function persistApprovalRequest(
  message: Extract<HostClientMessage, { type: "host.runtime_event" }>,
) {
  const parsed = approvalRequestedPayloadSchema.parse(message.event.payload);
  const approvalId = parsed.approvalId ?? `approval_${crypto.randomUUID()}`;
  await requireDb().sql`
    insert into approvals (id, task_id, type, requested_payload)
    values (
      ${approvalId}, ${message.taskId ?? null}, ${parsed.approvalType},
      ${JSON.stringify(sanitizeTelemetry({ ...parsed.request, runId: message.runId }))}::jsonb
    )
    on conflict (id) do nothing
  `;
  if (message.taskId) {
    await requireDb().sql`
      update tasks
      set status = 'awaiting_approval', updated_at = now()
      where id = ${message.taskId}
        and status in ('starting', 'running', 'blocked', 'claimed', 'assigned')
    `;
  }
}

async function markRuntimeCompleted(
  message: Extract<HostClientMessage, { type: "host.runtime_event" }>,
) {
  if (!message.taskId) {
    return;
  }
  await requireDb().sql`
    update tasks
    set status = 'validating', updated_at = now()
    where id = ${message.taskId}
      and status in ('starting', 'running', 'awaiting_approval', 'blocked', 'claimed', 'assigned')
  `;
}

async function markRuntimeFailed(
  message: Extract<HostClientMessage, { type: "host.runtime_event" }>,
) {
  if (!message.taskId) {
    return;
  }
  await requireDb().sql`
    update tasks
    set status = 'failed', updated_at = now()
    where id = ${message.taskId} and status not in ('merged', 'cancelled')
  `;
}

function turnStatusFor(eventType: string) {
  if (eventType === "turn.completed") {
    return "completed";
  }
  if (eventType === "turn.failed" || eventType === "runtime.disconnected") {
    return "failed";
  }
  if (eventType === "approval.requested") {
    return "awaiting_approval";
  }
  return "running";
}

function stringPayload(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberPayload(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function broadcastApprovalDecision(message: ControlApprovalDecisionMessage) {
  for (const sockets of hostSockets.values()) {
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    }
  }
}

function broadcastOwnerEvent(event: Record<string, unknown>) {
  const message = JSON.stringify({ type: "workspace.event", event });
  for (const socket of ownerSockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}

async function markHostOffline(hostId: string, disconnectedAt: Date) {
  const database = requireDb();
  const [host] = await database.sql<{ id: string }[]>`
    update hosts
    set status = 'offline', updated_at = now()
    where id = ${hostId} and revoked_at is null and status <> 'offline'
      and coalesce(last_heartbeat_at, '-infinity'::timestamptz)
        <= ${disconnectedAt}
    returning id
  `;
  if (!host) {
    return;
  }
  const event = await appendWorkspaceEvent(database, {
    hostId,
    type: "host.disconnected",
    payload: { reason: "websocket_closed" },
  });
  broadcastOwnerEvent({
    id: event.id,
    type: "host.disconnected",
    host_id: hostId,
    sequence: event.sequence,
    occurred_at: new Date().toISOString(),
    payload: { reason: "websocket_closed" },
  });
}

async function persistHostHello(
  message: Extract<HostClientMessage, { type: "host.hello" }>,
) {
  const database = requireDb();
  await database.sql`
    update hosts
    set status = 'online',
        protocol_version = ${message.protocolVersion},
        host_version = ${process.env.RELEASE_VERSION ?? "development"},
        tool_inventory = ${JSON.stringify(sanitizeTelemetry(message.inventory))}::jsonb,
        max_concurrent_agents = ${message.capacity.maxConcurrentAgents},
        last_heartbeat_at = now(),
        updated_at = now()
    where id = ${message.hostId} and revoked_at is null
  `;
  await insertHeartbeat(
    message.hostId,
    "online",
    message.capacity.activeTaskCount,
    {
      ...message.capacity,
      connections: message.connections,
    },
    message.inventory,
  );
  await persistConnectionReports(message.hostId, message.connections);
  await appendWorkspaceEvent(database, {
    hostId: message.hostId,
    type: "host.connected",
    payload: {
      hostName: message.hostName,
      protocolVersion: message.protocolVersion,
      activeRuns: message.activeRuns,
    },
  });
  dispatchAssignedTasksForHost(message.hostId);
}

async function persistHostHeartbeat(
  message: Extract<HostClientMessage, { type: "host.heartbeat" }>,
) {
  const database = requireDb();
  await database.sql`
    update hosts
    set status = ${message.status},
        protocol_version = ${message.protocolVersion},
        tool_inventory = tool_inventory ||
          ${JSON.stringify(sanitizeTelemetry(message.toolHealth))}::jsonb,
        max_concurrent_agents = ${message.capacity.maxConcurrentAgents},
        last_heartbeat_at = now(),
        updated_at = now()
    where id = ${message.hostId} and revoked_at is null
  `;
  await insertHeartbeat(
    message.hostId,
    message.status,
    message.capacity.activeTaskCount,
    {
      ...message.capacity,
      connections: message.connections,
      activeRunIds: message.activeRunIds,
    },
    message.toolHealth,
  );
  await persistConnectionReports(message.hostId, message.connections);
  dispatchAssignedTasksForHost(message.hostId);
}

async function insertHeartbeat(
  hostId: string,
  status: string,
  activeRuns: number,
  capacity: Record<string, unknown>,
  tools: Record<string, unknown>,
) {
  await requireDb().sql`
    insert into host_heartbeats (host_id, status, active_runs, capacity, tools, heartbeat_at)
    values (${hostId}, ${status}, ${activeRuns}, ${JSON.stringify(sanitizeTelemetry(capacity))}::jsonb, ${JSON.stringify(sanitizeTelemetry(tools))}::jsonb, now())
  `;
}

async function persistConnectionReports(
  hostId: string,
  connections: HostConnectionReport[],
) {
  const database = requireDb();
  for (const connection of connections) {
    await database.sql`
      update codex_connections
      set status = ${connection.status},
          max_concurrent_runs = ${connection.maxConcurrentRuns},
          last_health_at = now(),
          login_requested_at = case
            when ${connection.status} in ('ready_chatgpt','ready_api_key','ready_enterprise_access_token')
              then null
            else login_requested_at
          end,
          updated_at = now()
      where id = ${connection.codexConnectionId}
        and host_id = ${hostId}
        and disabled_at is null
    `;
    if (connection.capacitySourceId) {
      const availability = connection.availability ?? "unknown";
      await database.sql`
        insert into codex_capacity_snapshots (
          id, capacity_source_id, reporting_connection_id, availability,
          remaining_percent, reset_at, observation_source, observed_at, payload
        ) values (
          ${`capsnap_${crypto.randomUUID()}`}, ${connection.capacitySourceId},
          ${connection.codexConnectionId}, ${availability},
          ${connection.remainingPercent ?? null},
          ${connection.resetAt ? new Date(connection.resetAt) : null},
          'codex_status', now(), ${JSON.stringify(sanitizeTelemetry(connection.health))}::jsonb
        )
      `;
      await appendWorkspaceEvent(database, {
        hostId,
        codexConnectionId: connection.codexConnectionId,
        capacitySourceId: connection.capacitySourceId,
        type: "codex.capacity.observed",
        payload: sanitizeTelemetry({
          availability,
          remainingPercent: connection.remainingPercent,
          resetAt: connection.resetAt,
          status: connection.status,
        }) as Record<string, unknown>,
      });
      if (
        connection.status === "ready_chatgpt" ||
        connection.status === "ready_api_key" ||
        connection.status === "ready_enterprise_access_token"
      ) {
        await appendWorkspaceEvent(database, {
          hostId,
          codexConnectionId: connection.codexConnectionId,
          capacitySourceId: connection.capacitySourceId,
          type: "codex.connection.ready",
          payload: { authMode: connection.authMode },
        });
      } else if (
        connection.status === "signed_out" ||
        connection.status === "authenticating" ||
        connection.status === "expired"
      ) {
        await appendWorkspaceEvent(database, {
          hostId,
          codexConnectionId: connection.codexConnectionId,
          capacitySourceId: connection.capacitySourceId,
          type: "codex.connection.authentication_required",
          payload: { authMode: connection.authMode, status: connection.status },
        });
      } else if (connection.status === "policy_blocked") {
        await appendWorkspaceEvent(database, {
          hostId,
          codexConnectionId: connection.codexConnectionId,
          capacitySourceId: connection.capacitySourceId,
          type: "codex.connection.policy_blocked",
          payload: { authMode: connection.authMode },
        });
      }
      if (availability === "limited") {
        await appendWorkspaceEvent(database, {
          hostId,
          codexConnectionId: connection.codexConnectionId,
          capacitySourceId: connection.capacitySourceId,
          type: "codex.capacity.limited",
          payload: { remainingPercent: connection.remainingPercent },
        });
      } else if (availability === "cooldown") {
        await appendWorkspaceEvent(database, {
          hostId,
          codexConnectionId: connection.codexConnectionId,
          capacitySourceId: connection.capacitySourceId,
          type: "codex.capacity.cooldown_started",
          payload: { resetAt: connection.resetAt },
        });
      } else if (availability === "available") {
        await appendWorkspaceEvent(database, {
          hostId,
          codexConnectionId: connection.codexConnectionId,
          capacitySourceId: connection.capacitySourceId,
          type: "codex.capacity.cooldown_ended",
          payload: { remainingPercent: connection.remainingPercent },
        });
      }
    }
  }
}

server.on("upgrade", (request, socket, head) => {
  void (async () => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    );

    if (requestUrl.pathname !== "/api/ws") {
      socket.destroy();
      return;
    }

    const upgradeAuth = await authenticateWebSocketUpgrade(request);
    if (!upgradeAuth.ok) {
      socket.write(
        `HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n${upgradeAuth.reason}`,
      );
      socket.destroy();
      return;
    }
    authenticatedUpgrades.set(request, upgradeAuth);

    sockets.handleUpgrade(request, socket, head, (websocket) => {
      sockets.emit("connection", websocket, request);
    });
  })().catch((error: unknown) => {
    log("error", "websocket upgrade failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    socket.destroy();
  });
});

server.listen(port, hostname, () => {
  log("info", "web process listening", { hostname, port, dev });
});
