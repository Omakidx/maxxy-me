import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    JSON.stringify({
      level: "warn",
      service: "maxxy-db-check",
      message: "DATABASE_URL is not configured; skipping database check",
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(0);
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 1,
  connect_timeout: 2,
});

try {
  const [ping] = await sql<{ ok: number }[]>`select 1 as ok`;
  const migrations = await sql<{ id: string; applied_at: Date }[]>`
    select id, applied_at from schema_migrations order by id
  `;

  console.log(
    JSON.stringify({
      level: "info",
      service: "maxxy-db-check",
      message: "database connection ok",
      ok: ping?.ok === 1,
      migrations: migrations.map((migration) => migration.id),
      timestamp: new Date().toISOString(),
    }),
  );
} finally {
  await sql.end({ timeout: 1 });
}
