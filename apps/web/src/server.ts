import { createServer } from "node:http";
import next from "next";
import type { RawData } from "ws";
import { WebSocketServer } from "ws";
import {
  authenticateWebSocketUpgrade,
  getWebSocketOptions,
  handleSecurityApi,
  parseWebSocketMessage,
} from "./api-security";
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
const authenticatedUpgrades = new WeakMap<
  object,
  ReturnType<typeof authenticateWebSocketUpgrade>
>();

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
  const upgradeAuth =
    authenticatedUpgrades.get(request) ?? authenticateWebSocketUpgrade(request);
  authenticatedUpgrades.delete(request);

  if (!upgradeAuth.ok) {
    socket.close(upgradeAuth.code, upgradeAuth.reason);
    return;
  }

  socket.send(
    JSON.stringify({
      type: "security.connected",
      connectedAt,
      expiresAt: upgradeAuth.ticket.expiresAt.toISOString(),
      purpose: upgradeAuth.ticket.purpose,
    }),
  );

  const expiry = setTimeout(() => {
    socket.close(4001, "websocket session expired");
  }, wsOptions.connectionTtlMs);

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

      log("info", "websocket message received", {
        type: parsed.data.type,
        bytes: rawMessageBytes(message),
      });
    } catch {
      socket.send(
        JSON.stringify({ type: "security.error", code: "invalid_json" }),
      );
    }
  });

  socket.on("close", () => {
    clearTimeout(expiry);
    clearInterval(heartbeat);
  });
});

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );

  if (requestUrl.pathname !== "/api/ws") {
    socket.destroy();
    return;
  }

  const upgradeAuth = authenticateWebSocketUpgrade(request);
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
});

server.listen(port, hostname, () => {
  log("info", "web process listening", { hostname, port, dev });
});
