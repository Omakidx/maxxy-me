import { createDatabase, SchedulerService } from "@maxxy/database";
import postgres from "postgres";
import { z } from "zod";

const env = z.object({
  DATABASE_URL: z.string().url(),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  SCHEDULER_ASSIGNMENT_LIMIT: z.coerce.number().int().positive().default(5),
  RELEASE_VERSION: z.string().default("development"),
});

const config = env.parse(process.env);
const sql = postgres(config.DATABASE_URL, { max: 1 });
const database = createDatabase(config.DATABASE_URL);
const scheduler = new SchedulerService(database, {
  maxAssignmentsPerTick: config.SCHEDULER_ASSIGNMENT_LIMIT,
});
let schedulerRunning = false;

function log(message: string, fields: Record<string, unknown> = {}) {
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

async function schedulerTick() {
  if (schedulerRunning) {
    log("scheduler tick skipped", { reason: "previous_tick_running" });
    return;
  }

  schedulerRunning = true;
  try {
    const result = await scheduler.tick();
    log("scheduler tick complete", result);
  } finally {
    schedulerRunning = false;
  }
}

await heartbeat();
await schedulerTick();

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

setInterval(() => {
  schedulerTick().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        service: "maxxy-worker",
        message: "scheduler tick failed",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "unknown error",
      }),
    );
  });
}, config.SCHEDULER_POLL_INTERVAL_MS);

process.on("SIGTERM", async () => {
  log("worker shutting down");
  await database.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
});
