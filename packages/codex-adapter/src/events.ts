import {
  approvalDecisionSchema,
  approvalTypeSchema,
  type NormalizedRuntimeEvent,
} from "@maxxy/contracts";
import { z } from "zod";
import { rawCodexEventSchema } from "./internal-raw";

const capacityAvailabilitySchema = z.enum([
  "available",
  "limited",
  "cooldown",
  "unknown",
]);

export type NormalizedCodexRuntimeEvent = NormalizedRuntimeEvent;

export type RawEventParseResult =
  | { ok: true; event: NormalizedCodexRuntimeEvent }
  | { ok: false; event: NormalizedCodexRuntimeEvent };

export function parseAndNormalizeRawCodexEventLine(
  line: string,
): RawEventParseResult {
  try {
    const raw = rawCodexEventSchema.parse(JSON.parse(line));
    return { ok: true, event: normalizeRawCodexEvent(raw) };
  } catch (error) {
    return {
      ok: false,
      event: {
        type: "turn.failed",
        payload: {
          reason: "malformed_event",
          lineLength: line.length,
          error: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
}

export function normalizeRawCodexEvent(
  raw: z.infer<typeof rawCodexEventSchema>,
): NormalizedCodexRuntimeEvent {
  switch (raw.type) {
    case "runtime.ready":
      return {
        type: "agent.status_changed",
        payload: { status: "starting", ...raw.payload },
      };
    case "thread.created":
      return {
        type: "agent.status_changed",
        payload: { status: "thread_created", providerThreadId: raw.thread_id },
      };
    case "thread.resumed":
      return {
        type: "agent.status_changed",
        payload: { status: "thread_resumed", providerThreadId: raw.thread_id },
      };
    case "turn.started":
      return {
        type: "agent.status_changed",
        payload: { status: "running", providerTurnId: raw.turn_id },
      };
    case "agent.status":
      return {
        type: "agent.status_changed",
        payload: { status: raw.status ?? "unknown" },
      };
    case "message.delta":
      return {
        type: "agent.message_delta",
        payload: { messageId: raw.message_id, delta: raw.delta ?? "" },
      };
    case "message.completed":
      return {
        type: "agent.message_completed",
        payload: { messageId: raw.message_id, content: raw.content ?? "" },
      };
    case "command.started":
      return {
        type: "command.started",
        payload: {
          commandId: raw.command_id,
          command: raw.command,
          cwd: raw.cwd,
        },
      };
    case "command.output":
      return {
        type: "command.output",
        payload: { commandId: raw.command_id, output: raw.output ?? "" },
      };
    case "command.completed":
      return {
        type: "command.completed",
        payload: { commandId: raw.command_id, exitCode: raw.exit_code ?? null },
      };
    case "file_change.started":
      return {
        type: "file_change.started",
        payload: { fileId: raw.file_id, path: raw.path },
      };
    case "file_change.completed":
      return {
        type: "file_change.completed",
        payload: { fileId: raw.file_id, path: raw.path },
      };
    case "approval.requested": {
      const approvalType = approvalTypeSchema
        .catch("command")
        .parse(raw.approval_type);
      return {
        type: "approval.requested",
        payload: {
          approvalId: raw.approval_id,
          approvalType,
          request: raw.payload,
        },
      };
    }
    case "approval.resolved":
      return {
        type: "approval.resolved",
        payload: {
          approvalId: raw.approval_id,
          decision: approvalDecisionSchema.catch("cancel").parse(raw.decision),
        },
      };
    case "turn.completed":
      return {
        type: "turn.completed",
        payload: { providerTurnId: raw.turn_id, ...raw.payload },
      };
    case "turn.failed":
      return {
        type: "turn.failed",
        payload: {
          providerTurnId: raw.turn_id,
          error: raw.error ?? "Turn failed",
          ...raw.payload,
        },
      };
    case "runtime.disconnected":
      return {
        type: "runtime.disconnected",
        payload: { error: raw.error, ...raw.payload },
      };
    case "capacity.observed":
      return {
        type: "agent.status_changed",
        payload: {
          status: "capacity_observed",
          availability: capacityAvailabilitySchema
            .catch("unknown")
            .parse(raw.status),
          remainingPercent: raw.remaining_percent,
          resetAt: raw.reset_at,
        },
      };
    default:
      return {
        type: "agent.status_changed",
        payload: { status: "unknown_event", rawType: raw.type },
      };
  }
}

export function isTerminalRuntimeEvent(event: NormalizedCodexRuntimeEvent) {
  return (
    event.type === "turn.completed" ||
    event.type === "turn.failed" ||
    event.type === "runtime.disconnected"
  );
}
