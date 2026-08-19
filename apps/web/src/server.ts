import { createServer } from "node:http";
import type { HostClientMessage, HostConnectionReport } from "@maxxy/contracts";
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
import { readHealth } from "./health";
import { log } from "./logger";

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

  if (await handleControlPlaneApi(request, response)) {
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

  socket.on("message", (message) => {
    void handleWebSocketMessage(socket, upgradeAuth, message);
  });

  socket.on("close", () => {
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
  if (message.type === "host.command_result") {
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
}

async function persistHostHeartbeat(
  message: Extract<HostClientMessage, { type: "host.heartbeat" }>,
) {
  const database = requireDb();
  await database.sql`
    update hosts
    set status = ${message.status},
        protocol_version = ${message.protocolVersion},
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
          updated_at = now()
      where id = ${connection.codexConnectionId}
        and host_id = ${hostId}
        and disabled_at is null
    `;
    if (connection.capacitySourceId) {
      await database.sql`
        insert into codex_capacity_snapshots (
          id, capacity_source_id, reporting_connection_id, availability,
          remaining_percent, reset_at, observation_source, observed_at, payload
        ) values (
          ${`capsnap_${crypto.randomUUID()}`}, ${connection.capacitySourceId},
          ${connection.codexConnectionId}, ${connection.availability},
          ${connection.remainingPercent ?? null},
          ${connection.resetAt ? new Date(connection.resetAt) : null},
          'codex_status', now(), ${JSON.stringify(sanitizeTelemetry(connection.health))}::jsonb
        )
      `;
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
