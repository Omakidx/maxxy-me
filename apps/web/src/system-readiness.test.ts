import { describe, expect, test } from "bun:test";
import { evaluateSystemReadiness } from "./system-readiness";

const now = new Date("2026-08-20T13:00:00.000Z");

describe("evaluateSystemReadiness", () => {
  test("is ready when worker, required hosts, and Codex are healthy", () => {
    const readiness = evaluateSystemReadiness(
      {
        workerLastHeartbeatAt: new Date(now.valueOf() - 5_000),
        enrolledHostCount: 2,
        onlineHostCount: 2,
        requiredHostCount: 1,
        requiredOnlineHostCount: 1,
        readyConnectionCount: 1,
      },
      { now, workerStaleAfterMs: 15_000 },
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.reasons).toEqual([]);
    expect(readiness.checks).toEqual({
      web: "ok",
      database: "ok",
      worker: "ok",
      hosts: "ok",
      codex: "ok",
    });
  });

  test("blocks when a required host is offline", () => {
    const readiness = evaluateSystemReadiness(
      {
        workerLastHeartbeatAt: now,
        enrolledHostCount: 2,
        onlineHostCount: 1,
        requiredHostCount: 2,
        requiredOnlineHostCount: 1,
        readyConnectionCount: 1,
      },
      { now },
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.hosts).toBe("error");
    expect(readiness.reasons).toContain(
      "One or more required execution hosts are offline or stale.",
    );
  });

  test("blocks stale workers and missing Codex capacity", () => {
    const readiness = evaluateSystemReadiness(
      {
        workerLastHeartbeatAt: new Date(now.valueOf() - 30_000),
        enrolledHostCount: 1,
        onlineHostCount: 1,
        requiredHostCount: 0,
        requiredOnlineHostCount: 0,
        readyConnectionCount: 0,
      },
      { now, workerStaleAfterMs: 15_000 },
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.checks.worker).toBe("error");
    expect(readiness.checks.codex).toBe("error");
    expect(readiness.reasons).toHaveLength(2);
  });

  test("requires at least one host when no workspace pins a host", () => {
    const readiness = evaluateSystemReadiness(
      {
        workerLastHeartbeatAt: now,
        enrolledHostCount: 0,
        onlineHostCount: 0,
        requiredHostCount: 0,
        requiredOnlineHostCount: 0,
        readyConnectionCount: 0,
      },
      { now },
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.reasons).toContain("No fresh execution host is online.");
  });
});
