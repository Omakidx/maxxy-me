import postgres from "postgres";
import { z } from "zod";

const env = z.object({
  DATABASE_URL: z.string().url(),
  RELEASE_VERSION: z.string().default("development"),
});

const config = env.parse(process.env);
const sql = postgres(config.DATABASE_URL, { max: 1 });

await sql.begin(async (tx) => {
  await tx`
    create table if not exists phase0_migrations (
      id text primary key,
      release_version text not null,
      applied_at timestamptz not null default now()
    )
  `;

  await tx`
    create table if not exists phase0_worker_heartbeats (
      id bigserial primary key,
      service_name text not null,
      release_version text not null,
      heartbeat_at timestamptz not null
    )
  `;

  await tx`
    insert into phase0_migrations (id, release_version)
    values ('0001_phase0_spike', ${config.RELEASE_VERSION})
    on conflict (id) do update
    set release_version = excluded.release_version
  `;
});

console.log(
  JSON.stringify({
    level: "info",
    service: "maxxy-migrate",
    message: "phase0 migration complete",
    releaseVersion: config.RELEASE_VERSION,
    timestamp: new Date().toISOString(),
  }),
);

await sql.end({ timeout: 5 });
