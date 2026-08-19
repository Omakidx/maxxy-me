const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const healthUrl = new URL("/health", appUrl);
const wsUrl = new URL("/api/ws", appUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

const response = await fetch(healthUrl);
const health = await response.json();
console.log(
  JSON.stringify(
    { check: "health", status: response.status, body: health },
    null,
    2,
  ),
);

await new Promise<void>((resolve, reject) => {
  const socket = new WebSocket(wsUrl);
  const timeout = setTimeout(() => {
    socket.close();
    reject(new Error("websocket heartbeat timed out"));
  }, 10000);

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data.toString());
    console.log(JSON.stringify({ check: "websocket", body: payload }, null, 2));
    clearTimeout(timeout);
    socket.close();
    resolve();
  });

  socket.addEventListener("error", () => {
    clearTimeout(timeout);
    reject(new Error("websocket connection failed"));
  });
});

export {};
