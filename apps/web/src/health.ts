import postgres from "postgres";

export type HealthStatus = {
  ok: boolean;
  service: string;
  releaseVersion: string;
  checks: {
    web: "ok";
    database: "ok" | "error" | "not_configured";
  };
  timestamp: string;
};

export async function readHealth(): Promise<HealthStatus> {
  const databaseUrl = process.env.DATABASE_URL;
  let database: HealthStatus["checks"]["database"] = "not_configured";

  if (databaseUrl) {
    const sql = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 1,
      connect_timeout: 2,
    });

    try {
      await sql`select 1`;
      database = "ok";
    } catch {
      database = "error";
    } finally {
      await sql.end({ timeout: 1 });
    }
  }

  return {
    ok: database !== "error",
    service: process.env.APP_NAME ?? "maxxy-me",
    releaseVersion: process.env.RELEASE_VERSION ?? "development",
    checks: {
      web: "ok",
      database,
    },
    timestamp: new Date().toISOString(),
  };
}
