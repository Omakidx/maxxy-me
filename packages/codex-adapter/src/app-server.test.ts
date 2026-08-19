import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodexAppServerAdapter, fixtureAppServerLaunch } from "./app-server";
import { testedCodexVersion } from "./schema-version";

async function waitUntil(condition: () => boolean, timeoutMs = 1000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for fixture condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function runFixture(scenario: string) {
  const root = await mkdtemp(path.join(tmpdir(), "maxxy-codex-fixture-"));
  const events: string[] = [];
  const adapter = new CodexAppServerAdapter({
    launch: fixtureAppServerLaunch(scenario),
    codexHome: path.join(root, "codex-home"),
    cwd: root,
    onEvent: (event) => {
      events.push(event.type);
    },
  });
  await adapter.start();
  await adapter.startTurn({ prompt: "test" });
  return { adapter, events, root };
}

describe("CodexAppServerAdapter", () => {
  test("pins the tested Codex version", () => {
    expect(testedCodexVersion).toBe("26.814.41957");
  });

  test("normal completion emits normalized events", async () => {
    const { adapter, events, root } = await runFixture("normal");
    const terminal = await adapter.waitForTerminal(1000);
    await adapter.stop();

    expect(terminal.type).toBe("turn.completed");
    expect(events).toContain("agent.message_delta");
    expect(events).toContain("file_change.completed");
    await expect(readFile(path.join(root, "README.md"), "utf8")).resolves.toBe(
      "hello from codex fixture\n",
    );
  });

  test("approval request pauses until a decision is sent", async () => {
    const { adapter, events } = await runFixture("approval");
    await waitUntil(() => events.includes("approval.requested"));
    expect(events).toContain("approval.requested");
    await adapter.resolveApproval({
      approvalId: "approval-fixture",
      decision: "approve_once",
    });
    const terminal = await adapter.waitForTerminal(1000);
    await adapter.stop();

    expect(terminal.type).toBe("turn.completed");
    expect(events).toContain("approval.resolved");
  });

  test("command failure becomes a failed turn", async () => {
    const { adapter, events } = await runFixture("command_failure");
    const terminal = await adapter.waitForTerminal(1000);
    await adapter.stop();

    expect(events).toContain("command.completed");
    expect(terminal.type).toBe("turn.failed");
  });

  test("malformed events fail the turn without raw protocol leakage", async () => {
    const { adapter } = await runFixture("malformed");
    const terminal = await adapter.waitForTerminal(1000);
    await adapter.stop();

    expect(terminal.type).toBe("turn.failed");
    expect(terminal.payload.reason).toBe("malformed_event");
  });

  test("process crash emits runtime disconnection", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-codex-crash-"));
    const adapter = new CodexAppServerAdapter({
      launch: fixtureAppServerLaunch("crash"),
      codexHome: path.join(root, "codex-home"),
      cwd: root,
    });
    await adapter.start();
    const terminal = await adapter.waitForTerminal(1000);

    expect(terminal.type).toBe("runtime.disconnected");
  });

  test("interrupted turn reports a failed interrupted result", async () => {
    const { adapter } = await runFixture("interrupted");
    await adapter.interruptTurn({ reason: "user requested" });
    const terminal = await adapter.waitForTerminal(1000);
    await adapter.stop();

    expect(terminal.type).toBe("turn.failed");
    expect(terminal.payload.interrupted).toBe(true);
  });

  test("resumed thread keeps the provider thread in normalized status", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "maxxy-codex-resume-"));
    await writeFile(path.join(root, "README.md"), "fixture\n");
    const seen: unknown[] = [];
    const adapter = new CodexAppServerAdapter({
      launch: fixtureAppServerLaunch("resumed"),
      codexHome: path.join(root, "codex-home"),
      cwd: root,
      onEvent: (event) => {
        seen.push(event.payload);
      },
    });
    await adapter.start();
    await adapter.startTurn({
      prompt: "resume",
      providerThreadId: "provider-thread-1",
    });
    const terminal = await adapter.waitForTerminal(1000);
    await adapter.stop();

    expect(terminal.type).toBe("turn.completed");
    expect(JSON.stringify(seen)).toContain("thread_resumed");
  });
});
