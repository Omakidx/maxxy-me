import { runMigrations } from "@maxxy/database";
import { z } from "zod";

const env = z.object({
  DATABASE_URL: z.string().url(),
  RELEASE_VERSION: z.string().default("development"),
});

const config = env.parse(process.env);
const results = await runMigrations({
  databaseUrl: config.DATABASE_URL,
  releaseVersion: config.RELEASE_VERSION,
});

console.log(
  JSON.stringify({
    level: "info",
    service: "maxxy-migrate",
    message: "database migrations complete",
    applied: results
      .filter((migration) => migration.applied)
      .map((migration) => migration.id),
    skipped: results
      .filter((migration) => !migration.applied)
      .map((migration) => migration.id),
    releaseVersion: config.RELEASE_VERSION,
    timestamp: new Date().toISOString(),
  }),
);
