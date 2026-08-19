import { z } from "zod";

export const hostStatusValues = [
  "unknown",
  "connecting",
  "online",
  "degraded",
  "offline",
  "authentication_required",
  "revoked",
] as const;

export const agentRoleValues = [
  "manager",
  "architect",
  "frontend",
  "backend",
  "testing",
  "reviewer",
  "integrator",
  "custom",
] as const;

export const taskStatusValues = [
  "draft",
  "planning",
  "awaiting_plan_approval",
  "delegating",
  "waiting_for_children",
  "queued",
  "ready",
  "assigned",
  "claimed",
  "starting",
  "running",
  "awaiting_approval",
  "blocked",
  "validating",
  "integrating",
  "finalizing",
  "pushing",
  "opening_pull_request",
  "awaiting_review",
  "changes_requested",
  "merged",
  "failed",
  "cancelled",
] as const;

export const agentStatusValues = [
  "created",
  "assigned",
  "starting",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;

export const codexAuthModeValues = [
  "chatgpt",
  "api_key",
  "enterprise_access_token",
] as const;

export const codexConnectionStatusValues = [
  "not_installed",
  "signed_out",
  "authenticating",
  "ready_chatgpt",
  "ready_api_key",
  "ready_enterprise_access_token",
  "limited",
  "cooldown",
  "expired",
  "disabled",
  "policy_blocked",
  "revoked",
  "error",
] as const;

export const capacitySourceKindValues = [
  "chatgpt_account",
  "api_project",
  "enterprise_workspace",
] as const;

export const capacityAvailabilityValues = [
  "available",
  "limited",
  "cooldown",
  "unknown",
] as const;
export const capacityObservationSourceValues = [
  "codex_status",
  "runtime_event",
  "rate_limit_error",
  "manual",
] as const;
export const routingPolicyValues = ["balanced", "ordered", "manual"] as const;
export const leaseStatusValues = [
  "pending",
  "active",
  "released",
  "expired",
  "cancelled",
] as const;
export const pullRequestStatusValues = [
  "not_created",
  "draft",
  "open",
  "changes_requested",
  "approved",
  "checks_failed",
  "merge_conflict",
  "merged",
  "closed",
] as const;
export const approvalTypeValues = [
  "command",
  "file_change",
  "network_access",
  "dependency_install",
  "database_migration",
  "git_force_push",
  "git_reset",
  "worktree_delete",
  "host_operation",
] as const;
export const approvalDecisionValues = [
  "approve_once",
  "approve_for_session",
  "decline",
  "cancel",
] as const;

export const hostStatusSchema = z.enum(hostStatusValues);
export const agentRoleSchema = z.enum(agentRoleValues);
export const taskStatusSchema = z.enum(taskStatusValues);
export const agentStatusSchema = z.enum(agentStatusValues);
export const codexAuthModeSchema = z.enum(codexAuthModeValues);
export const codexConnectionStatusSchema = z.enum(codexConnectionStatusValues);
export const capacitySourceKindSchema = z.enum(capacitySourceKindValues);
export const capacityAvailabilitySchema = z.enum(capacityAvailabilityValues);
export const capacityObservationSourceSchema = z.enum(
  capacityObservationSourceValues,
);
export const routingPolicySchema = z.enum(routingPolicyValues);
export const leaseStatusSchema = z.enum(leaseStatusValues);
export const pullRequestStatusSchema = z.enum(pullRequestStatusValues);
export const approvalTypeSchema = z.enum(approvalTypeValues);
export const approvalDecisionSchema = z.enum(approvalDecisionValues);

export type HostStatus = z.infer<typeof hostStatusSchema>;
export type AgentRole = z.infer<typeof agentRoleSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type CodexAuthMode = z.infer<typeof codexAuthModeSchema>;
export type CodexConnectionStatus = z.infer<typeof codexConnectionStatusSchema>;
export type CapacitySourceKind = z.infer<typeof capacitySourceKindSchema>;
export type CapacityAvailability = z.infer<typeof capacityAvailabilitySchema>;
export type CapacityObservationSource = z.infer<
  typeof capacityObservationSourceSchema
>;
export type RoutingPolicy = z.infer<typeof routingPolicySchema>;
export type LeaseStatus = z.infer<typeof leaseStatusSchema>;
export type PullRequestStatus = z.infer<typeof pullRequestStatusSchema>;
export type ApprovalType = z.infer<typeof approvalTypeSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const terminalTaskStatuses = [
  "merged",
  "failed",
  "cancelled",
] as const satisfies readonly TaskStatus[];

export const taskTransitionMap = {
  draft: ["planning", "queued", "cancelled"],
  planning: ["awaiting_plan_approval", "failed", "cancelled"],
  awaiting_plan_approval: ["delegating", "queued", "cancelled"],
  delegating: ["waiting_for_children", "queued", "failed", "cancelled"],
  waiting_for_children: ["integrating", "finalizing", "failed", "cancelled"],
  queued: ["ready", "assigned", "cancelled"],
  ready: ["assigned", "blocked", "cancelled"],
  assigned: ["claimed", "failed", "cancelled"],
  claimed: ["starting", "failed", "cancelled"],
  starting: ["running", "awaiting_approval", "failed", "cancelled"],
  running: [
    "awaiting_approval",
    "validating",
    "blocked",
    "failed",
    "cancelled",
  ],
  awaiting_approval: ["running", "blocked", "failed", "cancelled"],
  blocked: ["queued", "running", "failed", "cancelled"],
  validating: ["pushing", "opening_pull_request", "awaiting_review", "failed"],
  integrating: ["finalizing", "failed", "cancelled"],
  finalizing: ["awaiting_review", "failed", "cancelled"],
  pushing: ["opening_pull_request", "awaiting_review", "failed"],
  opening_pull_request: ["awaiting_review", "failed"],
  awaiting_review: ["changes_requested", "merged", "failed", "cancelled"],
  changes_requested: ["queued", "running", "cancelled"],
  merged: [],
  failed: ["queued"],
  cancelled: [],
} as const satisfies Record<TaskStatus, readonly TaskStatus[]>;

export function canTransitionTask(from: TaskStatus, to: TaskStatus) {
  return (taskTransitionMap[from] as readonly TaskStatus[]).includes(to);
}
