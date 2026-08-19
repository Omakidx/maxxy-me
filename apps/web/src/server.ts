import { createServer } from "node:http";
import next from "next";
import type { RawData } from "ws";
import { WebSocketServer } from "ws";
import { readHealth } from "./health";
import { log } from "./logger";

function rawMessageBytes(message: RawData) {
  if (Array.isArray(message)) {
    return message.reduce((total, chunk) => total + chunk.byteLength, 0);
  }

  return message.byteLength;
}

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.BIND_HOST ?? "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, dir: process.cwd(), hostname, port });
const handle = app.getRequestHandler();

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

  await handle(request, response);
});

const sockets = new WebSocketServer({ noServer: true });

sockets.on("connection", (socket) => {
  const connectedAt = new Date().toISOString();
  socket.send(JSON.stringify({ type: "phase0.connected", connectedAt }));

  const heartbeat = setInterval(
    () => {
      if (socket.readyState === socket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "phase0.heartbeat",
            timestamp: new Date().toISOString(),
          }),
        );
      }
    },
    Number(process.env.WS_HEARTBEAT_INTERVAL_MS ?? 25000),
  );

  socket.on("message", (message) => {
    log("info", "websocket message received", {
      bytes: rawMessageBytes(message),
    });
  });

  socket.on("close", () => {
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

  sockets.handleUpgrade(request, socket, head, (websocket) => {
    sockets.emit("connection", websocket, request);
  });
});

server.listen(port, hostname, () => {
  log("info", "web process listening", { hostname, port, dev });
});
