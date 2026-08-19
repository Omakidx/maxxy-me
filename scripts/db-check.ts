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
  await sql`select 1`;
  console.log(
    JSON.stringify({
      level: "info",
      service: "maxxy-db-check",
      message: "database connection ok",
      timestamp: new Date().toISOString(),
    }),
  );
} finally {
  await sql.end({ timeout: 1 });
}
