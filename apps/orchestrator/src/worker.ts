import postgres from "postgres";
import { z } from "zod";

const env = z.object({
  DATABASE_URL: z.string().url(),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  RELEASE_VERSION: z.string().default("development"),
});

const config = env.parse(process.env);
const sql = postgres(config.DATABASE_URL, { max: 1 });

function log(message: string, fields: Record<string, string | number> = {}) {
  console.log(
    JSON.stringify({
      level: "info",
      service: "maxxy-worker",
      message,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}

async function heartbeat() {
  await sql`
    insert into phase0_worker_heartbeats (service_name, release_version, heartbeat_at)
    values ('maxxy-worker', ${config.RELEASE_VERSION}, now())
  `;
  log("worker heartbeat persisted", {
    intervalMs: config.WORKER_HEARTBEAT_INTERVAL_MS,
  });
}

await heartbeat();
setInterval(() => {
  heartbeat().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        service: "maxxy-worker",
        message: "worker heartbeat failed",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "unknown error",
      }),
    );
  });
}, config.WORKER_HEARTBEAT_INTERVAL_MS);

process.on("SIGTERM", async () => {
  log("worker shutting down");
  await sql.end({ timeout: 5 });
  process.exit(0);
});
