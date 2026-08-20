import { describe, expect, test } from "bun:test";
import {
  type ControlPlaneApiHooks,
  parseHostHealthInventory,
  runBestEffortConnectionHostCommand,
} from "./control-plane-api";

const connection = {
  id: "codexconn_test",
  host_id: "host_test",
  auth_mode: "chatgpt",
  label: "Test account",
  capacity_source_id: "capsrc_test",
  credential_slot_id: "primary",
  max_concurrent_runs: 1,
};

function hooksWithResult(result: {
  status: string;
  error?: string;
}): ControlPlaneApiHooks {
  return {
    onHostCommand: async () => result,
  };
}

describe("Codex connection host cleanup", () => {
  test("completes cleanup when the assigned host handles the command", async () => {
    await expect(
      runBestEffortConnectionHostCommand(
        hooksWithResult({ status: "completed" }),
        connection,
        "codex.connection.remove",
      ),
    ).resolves.toBe("completed");
  });

  test("allows control-plane cleanup when the assigned host is offline", async () => {
    const hooks: ControlPlaneApiHooks = {
      onHostCommand: async () => {
        throw new Error("No active host websocket for host_test");
      },
    };

    await expect(
      runBestEffortConnectionHostCommand(
        hooks,
        connection,
        "codex.connection.disable",
      ),
    ).resolves.toBe("pending");
  });

  test("treats a missing host registry entry as pending cleanup", async () => {
    await expect(
      runBestEffortConnectionHostCommand(
        hooksWithResult({
          status: "failed",
          error: "Codex connection is not registered on this host",
        }),
        connection,
        "codex.connection.remove",
      ),
    ).resolves.toBe("pending");
  });

  test("does not hide other host command failures", async () => {
    await expect(
      runBestEffortConnectionHostCommand(
        hooksWithResult({
          status: "failed",
          error: "Connection has an active runtime lease",
        }),
        connection,
        "codex.connection.remove",
      ),
    ).rejects.toThrow("active runtime lease");
  });
});

describe("host tool verification", () => {
  test("accepts authenticated GitHub identity from sanitized inventory", () => {
    const inventory = parseHostHealthInventory(
      JSON.stringify({
        inventory: {
          os: "linux",
          arch: "x64",
          hostname: "executor",
          bun: { available: true, version: "1.3.14" },
          codex: { available: true, version: "codex-cli 1.0.0" },
          git: { available: true, version: "git version 2.48.0" },
          gh: {
            available: true,
            version: "gh version 2.70.0",
            authenticated: true,
            account: "octocat",
          },
          projectRoot: "/srv/projects",
          worktreeRoot: "/srv/worktrees",
          codexAccountsDir: "/srv/codex",
          sandbox: {
            pathRestrictions: true,
            perConnectionCodexHome: true,
            commandTimeoutMs: 60000,
            outputMaxBytes: 100000,
          },
        },
      }),
    );

    expect(inventory?.gh.authenticated).toBe(true);
    expect(inventory?.gh.account).toBe("octocat");
  });

  test("rejects malformed host command output", () => {
    expect(parseHostHealthInventory("not-json")).toBeNull();
    expect(
      parseHostHealthInventory(JSON.stringify({ inventory: {} })),
    ).toBeNull();
  });
});
