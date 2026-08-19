import { z } from "zod";
import {
  approvalDecisionSchema,
  approvalTypeSchema,
  capacityAvailabilitySchema,
  codexAuthModeSchema,
  codexConnectionStatusSchema,
  hostStatusSchema,
} from "./statuses";

export const hostProtocolVersion = 1;

export const hostCommandNames = [
  "host.health_check",
  "repository.clone",
  "repository.fetch",
  "worktree.create",
  "worktree.remove",
  "codex.connection.allocate",
  "codex.connection.login",
  "codex.connection.status",
  "codex.connection.reauthenticate",
  "codex.connection.disable",
  "codex.connection.remove",
  "codex.runtime.start",
  "codex.turn.start",
  "codex.turn.steer",
  "codex.turn.interrupt",
  "command.run",
  "git.status",
  "git.diff",
  "git.commit",
  "git.push",
  "github.pull_request.create",
  "github.pull_request.update",
] as const;

export const normalizedRuntimeEventNames = [
  "agent.status_changed",
  "agent.message_delta",
  "agent.message_completed",
  "command.started",
  "command.output",
  "command.completed",
  "file_change.started",
  "file_change.completed",
  "approval.requested",
  "approval.resolved",
  "turn.completed",
  "turn.failed",
  "runtime.disconnected",
] as const;

export const codexCapacitySignalNames = [
  "codex.connection.ready",
  "codex.connection.authentication_required",
  "codex.connection.policy_blocked",
  "codex.capacity.observed",
  "codex.capacity.limited",
  "codex.capacity.cooldown_started",
  "codex.capacity.cooldown_ended",
  "codex.connection.lease_released",
] as const;

export const hostCommandNameSchema = z.enum(hostCommandNames);
export const normalizedRuntimeEventNameSchema = z.enum(
  normalizedRuntimeEventNames,
);
export const codexCapacitySignalNameSchema = z.enum(codexCapacitySignalNames);

export const hostToolStatusSchema = z.object({
  available: z.boolean(),
  version: z.string().optional(),
  path: z.string().optional(),
  error: z.string().optional(),
});

export const hostToolInventorySchema = z.object({
  os: z.string().min(1),
  arch: z.string().min(1),
  hostname: z.string().min(1),
  bun: hostToolStatusSchema,
  codex: hostToolStatusSchema,
  git: hostToolStatusSchema,
  gh: hostToolStatusSchema,
  projectRoot: z.string().min(1),
  worktreeRoot: z.string().min(1),
  codexAccountsDir: z.string().min(1),
  sandbox: z.object({
    pathRestrictions: z.boolean(),
    perConnectionCodexHome: z.boolean(),
    commandTimeoutMs: z.number().int().positive(),
    outputMaxBytes: z.number().int().positive(),
  }),
});

export const hostConnectionReportSchema = z.object({
  codexConnectionId: z.string().min(1),
  authMode: codexAuthModeSchema,
  status: codexConnectionStatusSchema,
  capacitySourceId: z.string().min(1).optional(),
  activeLeaseCount: z.number().int().min(0).default(0),
  maxConcurrentRuns: z.number().int().positive().default(1),
  availability: capacityAvailabilitySchema.default("unknown"),
  remainingPercent: z.number().int().min(0).max(100).optional(),
  resetAt: z.string().datetime({ offset: true }).optional(),
  label: z.string().optional(),
  health: z.record(z.string(), z.unknown()).default({}),
});

export const hostCapacityReportSchema = z.object({
  maxConcurrentAgents: z.number().int().positive(),
  activeTaskCount: z.number().int().min(0),
  activeRunIds: z.array(z.string().min(1)).default([]),
  disk: z
    .object({
      projectRootAvailableBytes: z.number().int().nonnegative().optional(),
      worktreeRootAvailableBytes: z.number().int().nonnegative().optional(),
    })
    .default({}),
});

export const hostHelloMessageSchema = z.object({
  type: z.literal("host.hello"),
  protocolVersion: z.number().int().positive(),
  hostId: z.string().min(1),
  hostName: z.string().min(1),
  inventory: hostToolInventorySchema,
  capacity: hostCapacityReportSchema,
  connections: z.array(hostConnectionReportSchema).default([]),
  activeRuns: z.array(z.string().min(1)).default([]),
  timestamp: z.string().datetime({ offset: true }),
});

export const hostHeartbeatMessageSchema = z.object({
  type: z.literal("host.heartbeat"),
  protocolVersion: z.number().int().positive(),
  hostId: z.string().min(1),
  status: hostStatusSchema.default("online"),
  capacity: hostCapacityReportSchema,
  connections: z.array(hostConnectionReportSchema).default([]),
  toolHealth: z.record(z.string(), hostToolStatusSchema).default({}),
  activeRunIds: z.array(z.string().min(1)).default([]),
  timestamp: z.string().datetime({ offset: true }),
});

export const hostCommandEnvelopeSchema = z.object({
  type: z.literal("control.command"),
  commandId: z.string().min(1),
  command: hostCommandNameSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  issuedAt: z.string().datetime({ offset: true }).optional(),
});

export const hostCommandResultMessageSchema = z.object({
  type: z.literal("host.command_result"),
  commandId: z.string().min(1),
  command: hostCommandNameSchema,
  status: z.enum(["completed", "failed", "rejected", "unsupported"]),
  exitCode: z.number().int().nullable().optional(),
  output: z.string().optional(),
  outputTruncated: z.boolean().default(false),
  error: z.string().optional(),
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
});

export const hostReconnectReportMessageSchema = z.object({
  type: z.literal("host.reconnect_report"),
  hostId: z.string().min(1),
  activeRuns: z.array(z.string().min(1)).default([]),
  localEventCount: z.number().int().min(0).default(0),
  policy: z
    .enum(["preserve_orphans", "stop_orphans"])
    .default("preserve_orphans"),
  timestamp: z.string().datetime({ offset: true }),
});

export const normalizedRuntimeEventSchema = z.object({
  type: normalizedRuntimeEventNameSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const hostRuntimeEventMessageSchema = z.object({
  type: z.literal("host.runtime_event"),
  hostId: z.string().min(1),
  runId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  attemptId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  turnId: z.string().min(1).optional(),
  codexConnectionId: z.string().min(1).optional(),
  capacitySourceId: z.string().min(1).optional(),
  event: normalizedRuntimeEventSchema,
  timestamp: z.string().datetime({ offset: true }),
});

export const controlApprovalDecisionMessageSchema = z.object({
  type: z.literal("control.approval_decision"),
  approvalId: z.string().min(1),
  decision: approvalDecisionSchema,
  taskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  decidedAt: z.string().datetime({ offset: true }),
});

export const clientHelloMessageSchema = z.object({
  type: z.literal("client.hello"),
  client: z.string().max(120).optional(),
});

export const clientPongMessageSchema = z.object({
  type: z.literal("client.pong"),
  timestamp: z.string().datetime({ offset: true }).optional(),
});

export const hostClientMessageSchema = z.discriminatedUnion("type", [
  clientHelloMessageSchema,
  clientPongMessageSchema,
  hostHelloMessageSchema,
  hostHeartbeatMessageSchema,
  hostCommandResultMessageSchema,
  hostReconnectReportMessageSchema,
  hostRuntimeEventMessageSchema,
]);

export const hostControlMessageSchema = z.discriminatedUnion("type", [
  hostCommandEnvelopeSchema,
  controlApprovalDecisionMessageSchema,
]);

export const approvalRequestedPayloadSchema = z.object({
  approvalId: z.string().min(1).optional(),
  approvalType: approvalTypeSchema.default("command"),
  title: z.string().max(200).optional(),
  request: z.record(z.string(), z.unknown()).default({}),
});

export type HostCommandName = z.infer<typeof hostCommandNameSchema>;
export type NormalizedRuntimeEventName = z.infer<
  typeof normalizedRuntimeEventNameSchema
>;
export type CodexCapacitySignalName = z.infer<
  typeof codexCapacitySignalNameSchema
>;
export type HostToolStatus = z.infer<typeof hostToolStatusSchema>;
export type HostToolInventory = z.infer<typeof hostToolInventorySchema>;
export type HostConnectionReport = z.infer<typeof hostConnectionReportSchema>;
export type HostCapacityReport = z.infer<typeof hostCapacityReportSchema>;
export type HostHelloMessage = z.infer<typeof hostHelloMessageSchema>;
export type HostHeartbeatMessage = z.infer<typeof hostHeartbeatMessageSchema>;
export type HostCommandEnvelope = z.infer<typeof hostCommandEnvelopeSchema>;
export type HostCommandResultMessage = z.infer<
  typeof hostCommandResultMessageSchema
>;
export type HostReconnectReportMessage = z.infer<
  typeof hostReconnectReportMessageSchema
>;
export type NormalizedRuntimeEvent = z.infer<
  typeof normalizedRuntimeEventSchema
>;
export type HostRuntimeEventMessage = z.infer<
  typeof hostRuntimeEventMessageSchema
>;
export type ControlApprovalDecisionMessage = z.infer<
  typeof controlApprovalDecisionMessageSchema
>;
export type HostClientMessage = z.infer<typeof hostClientMessageSchema>;
export type HostControlMessage = z.infer<typeof hostControlMessageSchema>;
