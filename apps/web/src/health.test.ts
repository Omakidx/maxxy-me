import { describe, expect, test } from "bun:test";
import { readHealth } from "./health";

describe("readHealth", () => {
  test("reports web health when no database is configured", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const health = await readHealth();

    expect(health.ok).toBe(false);
    expect(health.checks.web).toBe("ok");
    expect(health.checks.database).toBe("not_configured");

    if (previousDatabaseUrl) {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });
});
