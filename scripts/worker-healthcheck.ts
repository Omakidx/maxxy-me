import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.exit(1);
}

const staleAfterMs = positiveInteger(
  process.env.SYSTEM_WORKER_STALE_AFTER_MS,
  15_000,
);
const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 1,
  connect_timeout: 2,
});

try {
  const [result] = await sql<{ healthy: boolean }[]>`
    select exists (
      select 1
      from phase0_worker_heartbeats
      where service_name = 'maxxy-worker'
        and heartbeat_at >= now() - (${staleAfterMs} || ' milliseconds')::interval
    ) as healthy
  `;
  process.exitCode = result?.healthy ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 1 });
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
