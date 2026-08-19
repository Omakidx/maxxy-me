import { z } from "zod";
import {
  agentRoleSchema,
  agentStatusSchema,
  approvalDecisionSchema,
  approvalTypeSchema,
  capacityAvailabilitySchema,
  capacityObservationSourceSchema,
  capacitySourceKindSchema,
  codexAuthModeSchema,
  codexConnectionStatusSchema,
  hostStatusSchema,
  leaseStatusSchema,
  pullRequestStatusSchema,
  routingPolicySchema,
  taskStatusSchema,
} from "./statuses";

export const idSchema = z.string().min(1).max(128);
export const timestampSchema = z.string().datetime({ offset: true });
export const jsonObjectSchema = z.record(z.string(), z.unknown());

export const userSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  email: z.string().email(),
  role: z.literal("owner"),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const hostSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  status: hostStatusSchema,
  maxConcurrentAgents: z.number().int().positive(),
  protocolVersion: z.number().int().positive().optional(),
  lastHeartbeatAt: timestampSchema.optional(),
});

export const workspaceSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  repositoryId: idSchema,
  defaultHostId: idSchema.optional(),
  baseBranch: z.string().min(1),
  projectPath: z.string().min(1),
  worktreeRoot: z.string().min(1),
  maximumConcurrentAgents: z.number().int().positive(),
  codexPoolId: idSchema.optional(),
  codexRoutingPolicy: routingPolicySchema,
});

export const repositorySchema = z.object({
  id: idSchema,
  owner: z.string().min(1),
  name: z.string().min(1),
  provider: z.literal("github"),
  defaultBranch: z.string().min(1),
  remoteUrl: z.string().url(),
});

export const agentProfileSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  role: agentRoleSchema,
  instructions: z.string(),
  sandboxMode: z.enum(["read-only", "workspace-write"]),
  canCreateSubagents: z.boolean(),
});

export const taskSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  title: z.string().min(1),
  prompt: z.string().min(1),
  status: taskStatusSchema,
  priority: z.number().int(),
  assignedHostId: idSchema.optional(),
  assignedCodexConnectionId: idSchema.optional(),
  assignedProfileId: idSchema.optional(),
  branchName: z.string().optional(),
  baseSha: z.string().optional(),
  pullRequestId: idSchema.optional(),
});

export const agentSessionSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  taskId: idSchema,
  profileId: idSchema,
  hostId: idSchema,
  codexConnectionId: idSchema,
  attemptNumber: z.number().int().positive(),
  status: agentStatusSchema,
  threadId: idSchema.optional(),
  turnId: idSchema.optional(),
  worktreeId: idSchema.optional(),
});

export const codexConnectionSchema = z.object({
  id: idSchema,
  hostId: idSchema,
  capacitySourceId: idSchema,
  label: z.string().min(1),
  authMode: codexAuthModeSchema,
  status: codexConnectionStatusSchema,
  credentialSlotId: idSchema,
  maxConcurrentRuns: z.number().int().positive(),
  lastHealthAt: timestampSchema.optional(),
});

export const codexCapacitySourceSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  kind: capacitySourceKindSchema,
  providerScopeHint: z.string().optional(),
});

export const codexCapacitySnapshotSchema = z.object({
  id: idSchema,
  capacitySourceId: idSchema,
  reportingConnectionId: idSchema,
  availability: capacityAvailabilitySchema,
  remainingPercent: z.number().min(0).max(100).optional(),
  resetAt: timestampSchema.optional(),
  observationSource: capacityObservationSourceSchema,
  observedAt: timestampSchema,
});

export const taskLeaseSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  hostId: idSchema,
  status: leaseStatusSchema,
  expiresAt: timestampSchema,
});

export const eventEnvelopeSchema = z.object({
  id: idSchema,
  type: z.string().min(1),
  workspaceId: idSchema.optional(),
  taskId: idSchema.optional(),
  hostId: idSchema.optional(),
  runId: idSchema.optional(),
  attemptId: idSchema.optional(),
  codexConnectionId: idSchema.optional(),
  capacitySourceId: idSchema.optional(),
  sequence: z.number().int().nonnegative(),
  timestamp: timestampSchema,
  payload: z.unknown(),
});

export const approvalSchema = z.object({
  id: idSchema,
  taskId: idSchema.optional(),
  type: approvalTypeSchema,
  requestedByAgentSessionId: idSchema.optional(),
  decision: approvalDecisionSchema.optional(),
  payload: jsonObjectSchema,
});

export const pullRequestSchema = z.object({
  id: idSchema,
  repositoryId: idSchema,
  taskId: idSchema.optional(),
  githubNodeId: z.string().optional(),
  number: z.number().int().positive(),
  title: z.string().min(1),
  status: pullRequestStatusSchema,
  url: z.string().url(),
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type User = z.infer<typeof userSchema>;
export type Host = z.infer<typeof hostSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type Task = z.infer<typeof taskSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
export type CodexConnection = z.infer<typeof codexConnectionSchema>;
export type CodexCapacitySource = z.infer<typeof codexCapacitySourceSchema>;
export type CodexCapacitySnapshot = z.infer<typeof codexCapacitySnapshotSchema>;
export type TaskLease = z.infer<typeof taskLeaseSchema>;
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
