import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HostCommandRunner } from "./command-runner";
import { loadConfig } from "./config";
import { CodexConnectionRegistry } from "./registry";

function configureTempHost(root: string) {
  process.env.MAXXY_HOST_DATA_DIR = path.join(root, "state");
  process.env.MAXXY_PROJECT_ROOT = path.join(root, "projects");
  process.env.MAXXY_WORKTREE_ROOT = path.join(root, "worktrees");
  process.env.MAXXY_CODEX_ACCOUNTS_DIR = path.join(root, "codex");
  process.env.MAXXY_CODEX_TURN_TIMEOUT_MS = "1000";
  return loadConfig();
}

describe("HostCommandRunner", () => {
  test("rejects generic commands unless explicitly allowlisted", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-"));
    process.env.MAXXY_ALLOWED_COMMANDS = "";
    const config = configureTempHost(root);
    const runner = new HostCommandRunner(config);

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
    const runner = new HostCommandRunner(configureTempHost(root));

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

  test("runs a fixture Codex turn through runtime commands", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-runtime-"));
    const config = configureTempHost(root);
    await mkdir(config.projectRoot, { recursive: true });
    const registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    );
    await registry.register({
      codexConnectionId: "codexconn_runtime",
      authMode: "chatgpt",
      capacitySourceId: "capsrc_runtime",
      status: "ready_chatgpt",
    });
    const events: string[] = [];
    const runner = new HostCommandRunner(config, (message) => {
      events.push(message.event.type);
    });

    const start = await runner.handle({
      type: "control.command",
      commandId: "cmd_runtime_start",
      command: "codex.runtime.start",
      payload: {
        runId: "run_fixture",
        taskId: "task_fixture",
        attemptId: "attempt_fixture",
        codexConnectionId: "codexconn_runtime",
        cwd: config.projectRoot,
        fixtureScenario: "normal",
      },
    });
    expect(start.status).toBe("completed");
    expect(runner.activeRunIds()).toContain("run_fixture");

    const turn = await runner.handle({
      type: "control.command",
      commandId: "cmd_turn_start",
      command: "codex.turn.start",
      payload: {
        runId: "run_fixture",
        prompt: "edit README",
        threadId: "thread_fixture",
        turnId: "turn_fixture",
        waitForCompletion: true,
      },
    });

    expect(turn.status).toBe("completed");
    expect(turn.output).toContain("turn.completed");
    expect(events).toContain("agent.message_completed");
    expect(events).toContain("turn.completed");
    await expect(
      readFile(path.join(config.projectRoot, "README.md"), "utf8"),
    ).resolves.toBe("hello from codex fixture\n");
  });

  test("rejects runtime payloads containing raw secrets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-command-secret-"));
    const config = configureTempHost(root);
    const registry = CodexConnectionRegistry.at(
      config.dataDir,
      config.codexAccountsDir,
    );
    await registry.register({
      codexConnectionId: "codexconn_secret",
      authMode: "chatgpt",
      status: "ready_chatgpt",
    });
    const runner = new HostCommandRunner(config);

    const result = await runner.handle({
      type: "control.command",
      commandId: "cmd_runtime_secret",
      command: "codex.runtime.start",
      payload: {
        runId: "run_secret",
        codexConnectionId: "codexconn_secret",
        cwd: config.projectRoot,
        apiKey: "should-not-be-here",
      },
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("raw secret field");
  });
});
