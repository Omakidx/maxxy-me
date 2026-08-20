import { describe, expect, test } from "bun:test";
import {
  agentTranscript,
  connectionLoginCommand,
  isPendingConnection,
  isTaskWorking,
} from "./dashboard-app";

describe("agentTranscript", () => {
  test("combines message deltas and replaces them with completed content", () => {
    expect(
      agentTranscript([
        {
          type: "agent.message_delta",
          payload: { messageId: "message-1", delta: "Hello " },
        },
        {
          type: "agent.message_delta",
          payload: { messageId: "message-1", delta: "world" },
        },
        {
          type: "agent.message_completed",
          payload: { messageId: "message-1", content: "Hello world." },
        },
      ]),
    ).toBe("Hello world.");
  });

  test("streams command output with its command and final exit code", () => {
    expect(
      agentTranscript([
        {
          type: "command.started",
          payload: { commandId: "command-1", command: "bun test" },
        },
        {
          type: "command.output",
          payload: { commandId: "command-1", output: "2 pass\n" },
        },
        {
          type: "command.completed",
          payload: { commandId: "command-1", exitCode: 0 },
        },
      ]),
    ).toBe("$ bun test\n2 pass\n\n[exit 0]");
  });
});

describe("isTaskWorking", () => {
  test("spins only for task states with active agent work", () => {
    for (const status of [
      "claimed",
      "starting",
      "running",
      "validating",
      "pushing",
      "opening_pull_request",
    ]) {
      expect(isTaskWorking({ status })).toBeTrue();
    }

    for (const status of [
      "queued",
      "assigned",
      "awaiting_approval",
      "awaiting_review",
      "completed",
      "failed",
    ]) {
      expect(isTaskWorking({ status })).toBeFalse();
    }
  });
});

describe("Codex account setup", () => {
  const pending = {
    id: "codexconn_283559b2-22d5-467c-8d9a-8321612c18cf",
    auth_mode: "api_key",
    capacity_source_id: "capsrc_177131a1-c0de-45fe-a4d9-fe75a8244250",
    login_expires_at: "2026-08-20T15:50:00.000Z",
    status: "signed_out",
  };

  test("keeps pending attempts out of connected account state", () => {
    expect(isPendingConnection(pending)).toBeTrue();
    expect(isPendingConnection({ status: "authenticating" })).toBeTrue();
    expect(isPendingConnection({ status: "ready_chatgpt" })).toBeFalse();
  });

  test("generates an expiring isolated API-key command", () => {
    const command = connectionLoginCommand(pending, "local");
    expect(command).toContain("--expires-at");
    expect(command).toContain("2026-08-20T15:50:00.000Z");
    expect(command).toContain("OpenAI API key");
    expect(command).not.toContain("--credential-slot");
    expect(command).not.toContain("primary");
  });
});
