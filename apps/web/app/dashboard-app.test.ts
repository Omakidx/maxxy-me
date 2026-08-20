import { describe, expect, test } from "bun:test";
import { agentTranscript, isTaskWorking } from "./dashboard-app";

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
