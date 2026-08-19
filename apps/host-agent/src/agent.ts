import { z } from "zod";

const env = z.object({
  MAXXY_CONTROL_PLANE_URL: z.string().url(),
  MAXXY_HOST_ID: z.string().min(1).default("phase0-local-host"),
  MAXXY_HOST_NAME: z.string().min(1).default("Phase 0 Local Host"),
  MAXXY_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15000),
  MAXXY_RECONNECT_MIN_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1000),
  MAXXY_RECONNECT_MAX_DELAY_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30000),
});

const config = env.parse(process.env);

function log(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, string | number> = {},
) {
  console[level](
    JSON.stringify({
      level,
      service: "maxxy-host-agent",
      message,
      hostId: config.MAXXY_HOST_ID,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}

function websocketUrl() {
  const url = new URL(config.MAXXY_CONTROL_PLANE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/ws";
  return url.toString();
}

let reconnectDelay = config.MAXXY_RECONNECT_MIN_DELAY_MS;

function connect() {
  const socket = new WebSocket(websocketUrl());
  let heartbeat: Timer | undefined;

  socket.addEventListener("open", () => {
    reconnectDelay = config.MAXXY_RECONNECT_MIN_DELAY_MS;
    log("info", "host-agent websocket connected");
    heartbeat = setInterval(() => {
      socket.send(
        JSON.stringify({
          type: "host.heartbeat",
          hostId: config.MAXXY_HOST_ID,
          hostName: config.MAXXY_HOST_NAME,
          protocolVersion: process.env.MAXXY_PROTOCOL_VERSION ?? "1",
          timestamp: new Date().toISOString(),
        }),
      );
    }, config.MAXXY_HEARTBEAT_INTERVAL_MS);
  });

  socket.addEventListener("close", () => {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    log("warn", "host-agent websocket closed", { reconnectDelay });
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(
      reconnectDelay * 2,
      config.MAXXY_RECONNECT_MAX_DELAY_MS,
    );
  });

  socket.addEventListener("error", () => {
    log("error", "host-agent websocket error");
    socket.close();
  });
}

connect();
