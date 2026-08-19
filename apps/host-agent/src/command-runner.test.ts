import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HostCommandRunner } from "./command-runner";
import { loadConfig } from "./config";

describe("HostCommandRunner", () => {
  test("rejects generic commands unless explicitly allowlisted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-"));
    process.env.MAXXY_HOST_DATA_DIR = path.join(root, "state");
    process.env.MAXXY_PROJECT_ROOT = path.join(root, "projects");
    process.env.MAXXY_WORKTREE_ROOT = path.join(root, "worktrees");
    process.env.MAXXY_CODEX_ACCOUNTS_DIR = path.join(root, "codex");
    process.env.MAXXY_ALLOWED_COMMANDS = "";
    const runner = new HostCommandRunner(loadConfig());

    const result = await runner.handle({
      type: "control.command",
      commandId: "cmd_1",
      command: "command.run",
      payload: { command: "node", args: ["--version"] },
    });

    expect(result.status).toBe("rejected");
  });

  test("handles Codex connection protocol commands through the local registry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-registry-"));
    process.env.MAXXY_HOST_DATA_DIR = path.join(root, "state");
    process.env.MAXXY_PROJECT_ROOT = path.join(root, "projects");
    process.env.MAXXY_WORKTREE_ROOT = path.join(root, "worktrees");
    process.env.MAXXY_CODEX_ACCOUNTS_DIR = path.join(root, "codex");
    const runner = new HostCommandRunner(loadConfig());

    const result = await runner.handle({
      type: "control.command",
      commandId: "cmd_2",
      command: "codex.connection.allocate",
      payload: {
        codexConnectionId: "codexconn_test",
        authMode: "chatgpt",
        capacitySourceId: "capsrc_test",
      },
    });

    expect(result.status).toBe("completed");
    expect(result.output).toContain("codexconn_test");
  });
});
