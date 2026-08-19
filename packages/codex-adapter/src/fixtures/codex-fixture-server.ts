import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { rawCodexRequestSchema } from "../internal-raw";

const scenario = process.argv[2] ?? "normal";
const input = createInterface({ input: process.stdin });
let approvalPending = false;
let interruptPending = false;

function send(payload: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function completeNormal(resumed = false) {
  send({
    type: resumed ? "thread.resumed" : "thread.created",
    thread_id: "provider-thread-1",
  });
  send({ type: "turn.started", turn_id: "provider-turn-1" });
  send({ type: "agent.status", status: "running" });
  send({ type: "message.delta", message_id: "msg-1", delta: "hello" });
  send({
    type: "message.completed",
    message_id: "msg-1",
    content: "hello world",
  });
  send({ type: "file_change.started", file_id: "file-1", path: "README.md" });
  writeFileSync("README.md", "hello from codex fixture\n");
  send({ type: "file_change.completed", file_id: "file-1", path: "README.md" });
  send({
    type: "turn.completed",
    turn_id: "provider-turn-1",
    payload: { summary: "done" },
  });
}

input.on("line", (line) => {
  const request = rawCodexRequestSchema.safeParse(JSON.parse(line));
  if (!request.success) {
    send({ type: "turn.failed", error: "invalid request" });
    return;
  }

  if (request.data.type === "runtime.start") {
    if (scenario === "crash") {
      process.exit(42);
    }
    send({ type: "runtime.ready" });
    return;
  }

  if (request.data.type === "runtime.shutdown") {
    process.exit(0);
  }

  if (request.data.type === "turn.interrupt") {
    interruptPending = true;
    send({
      type: "turn.failed",
      turn_id: "provider-turn-1",
      error: "interrupted",
      payload: { interrupted: true },
    });
    return;
  }

  if (request.data.type === "approval.resolve") {
    if (!approvalPending) {
      send({ type: "turn.failed", error: "approval was not pending" });
      return;
    }
    send({
      type: "approval.resolved",
      approval_id: "approval-fixture",
      decision: request.data.payload.decision,
    });
    send({
      type: "turn.completed",
      turn_id: "provider-turn-1",
      payload: { summary: "approved" },
    });
    return;
  }

  if (request.data.type === "thread.resume") {
    return;
  }

  if (request.data.type !== "turn.start") {
    return;
  }

  if (scenario === "malformed") {
    process.stdout.write("not-json\n");
    return;
  }

  if (scenario === "command_failure") {
    send({ type: "thread.created", thread_id: "provider-thread-1" });
    send({ type: "turn.started", turn_id: "provider-turn-1" });
    send({
      type: "command.started",
      command_id: "cmd-1",
      command: "bun test",
      cwd: "/workspace",
    });
    send({ type: "command.output", command_id: "cmd-1", output: "failed" });
    send({ type: "command.completed", command_id: "cmd-1", exit_code: 1 });
    send({
      type: "turn.failed",
      turn_id: "provider-turn-1",
      error: "command failed",
    });
    return;
  }

  if (scenario === "approval") {
    send({ type: "thread.created", thread_id: "provider-thread-1" });
    send({ type: "turn.started", turn_id: "provider-turn-1" });
    approvalPending = true;
    send({
      type: "approval.requested",
      approval_id: "approval-fixture",
      approval_type: "command",
      payload: { command: "bun install" },
    });
    return;
  }

  if (scenario === "interrupted") {
    send({ type: "thread.created", thread_id: "provider-thread-1" });
    send({ type: "turn.started", turn_id: "provider-turn-1" });
    setTimeout(() => {
      if (!interruptPending) {
        send({ type: "turn.completed", turn_id: "provider-turn-1" });
      }
    }, 2000);
    return;
  }

  completeNormal(scenario === "resumed");
});
