import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("owner"),
  passwordHash: text("password_hash"),
  ...timestamps,
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  ...timestamps,
});

export const verificationTokens = pgTable("verification_tokens", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const hosts = pgTable("hosts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("unknown"),
  maxConcurrentAgents: integer("max_concurrent_agents").notNull().default(1),
  protocolVersion: integer("protocol_version"),
  hostVersion: text("host_version"),
  toolInventory: jsonb("tool_inventory").notNull().default({}),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps,
});

export const hostTokens = pgTable("host_tokens", {
  id: text("id").primaryKey(),
  hostId: text("host_id").references(() => hosts.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps,
});

export const hostHeartbeats = pgTable("host_heartbeats", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  activeRuns: integer("active_runs").notNull().default(0),
  capacity: jsonb("capacity").notNull().default({}),
  tools: jsonb("tools").notNull().default({}),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const repositories = pgTable("repositories", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().default("github"),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  remoteUrl: text("remote_url").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  githubInstallationId: text("github_installation_id"),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "restrict" }),
  defaultHostId: text("default_host_id").references(() => hosts.id, {
    onDelete: "set null",
  }),
  baseBranch: text("base_branch").notNull().default("main"),
  projectPath: text("project_path").notNull(),
  worktreeRoot: text("worktree_root").notNull(),
  maximumConcurrentAgents: integer("maximum_concurrent_agents")
    .notNull()
    .default(1),
  codexPoolId: text("codex_pool_id"),
  codexRoutingPolicy: text("codex_routing_policy")
    .notNull()
    .default("balanced"),
  approvalPolicy: jsonb("approval_policy").notNull().default({}),
  validationProfile: jsonb("validation_profile").notNull().default({}),
  ...timestamps,
});

export const agentProfiles = pgTable("agent_profiles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  instructions: text("instructions").notNull().default(""),
  sandboxMode: text("sandbox_mode").notNull().default("read-only"),
  canCreateSubagents: boolean("can_create_subagents").notNull().default(false),
  modelPolicy: jsonb("model_policy").notNull().default({}),
  skillBindings: jsonb("skill_bindings").notNull().default([]),
  ...timestamps,
});

export const codexCapacitySources = pgTable("codex_capacity_sources", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  kind: text("kind").notNull(),
  providerScopeHint: text("provider_scope_hint"),
  maxConcurrentRuns: integer("max_concurrent_runs").notNull().default(1),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps,
});

export const codexCapacityPools = pgTable("codex_capacity_pools", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  routingPolicy: text("routing_policy").notNull().default("balanced"),
  ...timestamps,
});

export const codexConnections = pgTable("codex_connections", {
  id: text("id").primaryKey(),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  capacitySourceId: text("capacity_source_id")
    .notNull()
    .references(() => codexCapacitySources.id, { onDelete: "restrict" }),
  label: text("label").notNull(),
  authMode: text("auth_mode").notNull(),
  status: text("status").notNull().default("signed_out"),
  credentialSlotId: text("credential_slot_id").notNull(),
  maxConcurrentRuns: integer("max_concurrent_runs").notNull().default(1),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ...timestamps,
});

export const codexCapacityPoolMembers = pgTable(
  "codex_capacity_pool_members",
  {
    poolId: text("pool_id")
      .notNull()
      .references(() => codexCapacityPools.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => codexConnections.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(100),
    maxActiveRuns: integer("max_active_runs").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.poolId, table.connectionId] })],
);

export const codexCapacitySnapshots = pgTable("codex_capacity_snapshots", {
  id: text("id").primaryKey(),
  capacitySourceId: text("capacity_source_id")
    .notNull()
    .references(() => codexCapacitySources.id, { onDelete: "cascade" }),
  reportingConnectionId: text("reporting_connection_id")
    .notNull()
    .references(() => codexConnections.id, { onDelete: "cascade" }),
  availability: text("availability").notNull(),
  remainingPercent: integer("remaining_percent"),
  resetAt: timestamp("reset_at", { withTimezone: true }),
  observationSource: text("observation_source").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  payload: jsonb("payload").notNull().default({}),
});

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status").notNull().default("draft"),
  assignedHostId: text("assigned_host_id").references(() => hosts.id, {
    onDelete: "set null",
  }),
  assignedCodexConnectionId: text("assigned_codex_connection_id").references(
    () => codexConnections.id,
    {
      onDelete: "set null",
    },
  ),
  preferredCodexPoolId: text("preferred_codex_pool_id").references(
    () => codexCapacityPools.id,
    {
      onDelete: "set null",
    },
  ),
  assignedProfileId: text("assigned_profile_id").references(
    () => agentProfiles.id,
    { onDelete: "set null" },
  ),
  branchName: text("branch_name"),
  baseSha: text("base_sha"),
  pullRequestId: text("pull_request_id"),
  priority: integer("priority").notNull().default(100),
  idempotencyKey: text("idempotency_key"),
  ...timestamps,
});

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: text("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    condition: text("condition").notNull().default("merged"),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.taskId, table.dependsOnTaskId] })],
);

export const taskOwnershipClaims = pgTable("task_ownership_claims", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  pattern: text("pattern").notNull(),
  mode: text("mode").notNull().default("write"),
  ...timestamps,
});

export const taskLeases = pgTable("task_leases", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  acquiredAt: timestamp("acquired_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  ...timestamps,
});

export const codexConnectionLeases = pgTable("codex_connection_leases", {
  id: text("id").primaryKey(),
  codexConnectionId: text("codex_connection_id")
    .notNull()
    .references(() => codexConnections.id, { onDelete: "cascade" }),
  capacitySourceId: text("capacity_source_id")
    .notNull()
    .references(() => codexCapacitySources.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  acquiredAt: timestamp("acquired_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  ...timestamps,
});

export const taskRuntimeAttempts = pgTable("task_runtime_attempts", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "restrict" }),
  codexConnectionId: text("codex_connection_id")
    .notNull()
    .references(() => codexConnections.id, { onDelete: "restrict" }),
  capacitySourceId: text("capacity_source_id")
    .notNull()
    .references(() => codexCapacitySources.id, { onDelete: "restrict" }),
  threadId: text("thread_id"),
  handoffFromAttemptId: text("handoff_from_attempt_id"),
  handoffReason: text("handoff_reason"),
  billingModeChanged: boolean("billing_mode_changed").notNull().default(false),
  runtimeSnapshot: jsonb("runtime_snapshot").notNull().default({}),
  ...timestamps,
});

export const worktrees = pgTable("worktrees", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  branchName: text("branch_name").notNull(),
  baseSha: text("base_sha").notNull(),
  status: text("status").notNull().default("active"),
  dirty: boolean("dirty").notNull().default(false),
  ...timestamps,
});

export const threads = pgTable("threads", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").references(() => taskRuntimeAttempts.id, {
    onDelete: "set null",
  }),
  codexConnectionId: text("codex_connection_id").references(
    () => codexConnections.id,
    { onDelete: "restrict" },
  ),
  providerThreadId: text("provider_thread_id"),
  status: text("status").notNull().default("created"),
  ...timestamps,
});

export const turns = pgTable("turns", {
  id: text("id").primaryKey(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  providerTurnId: text("provider_turn_id"),
  status: text("status").notNull().default("created"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  payload: jsonb("payload").notNull().default({}),
  ...timestamps,
});

export const agentSessions = pgTable("agent_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  profileId: text("profile_id")
    .notNull()
    .references(() => agentProfiles.id, { onDelete: "restrict" }),
  hostId: text("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "restrict" }),
  codexConnectionId: text("codex_connection_id")
    .notNull()
    .references(() => codexConnections.id, { onDelete: "restrict" }),
  attemptNumber: integer("attempt_number").notNull(),
  threadId: text("thread_id").references(() => threads.id, {
    onDelete: "set null",
  }),
  turnId: text("turn_id").references(() => turns.id, { onDelete: "set null" }),
  worktreeId: text("worktree_id").references(() => worktrees.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("created"),
  ...timestamps,
});

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  hostId: text("host_id").references(() => hosts.id, { onDelete: "set null" }),
  runId: text("run_id"),
  attemptId: text("attempt_id").references(() => taskRuntimeAttempts.id, {
    onDelete: "set null",
  }),
  codexConnectionId: text("codex_connection_id").references(
    () => codexConnections.id,
    { onDelete: "set null" },
  ),
  capacitySourceId: text("capacity_source_id").references(
    () => codexCapacitySources.id,
    { onDelete: "set null" },
  ),
  sequence: bigint("sequence", { mode: "number" }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  payload: jsonb("payload").notNull().default({}),
  idempotencyKey: text("idempotency_key"),
  ...timestamps,
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  agentSessionId: text("agent_session_id").references(() => agentSessions.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  requestedPayload: jsonb("requested_payload").notNull().default({}),
  decision: text("decision"),
  decidedByUserId: text("decided_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps,
});

export const commands = pgTable("commands", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  agentSessionId: text("agent_session_id").references(() => agentSessions.id, {
    onDelete: "set null",
  }),
  command: text("command").notNull(),
  cwd: text("cwd"),
  status: text("status").notNull().default("pending"),
  exitCode: integer("exit_code"),
  outputTruncated: boolean("output_truncated").notNull().default(false),
  output: text("output"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

export const gitOperations = pgTable("git_operations", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  repositoryId: text("repository_id").references(() => repositories.id, {
    onDelete: "cascade",
  }),
  operation: text("operation").notNull(),
  status: text("status").notNull(),
  branchName: text("branch_name"),
  commitSha: text("commit_sha"),
  payload: jsonb("payload").notNull().default({}),
  ...timestamps,
});

export const pullRequests = pgTable("pull_requests", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  githubNodeId: text("github_node_id"),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("not_created"),
  headBranch: text("head_branch").notNull(),
  baseBranch: text("base_branch").notNull(),
  url: text("url").notNull(),
  mergedAt: timestamp("merged_at", { withTimezone: true }),
  ...timestamps,
});

export const pullRequestChecks = pgTable("pull_request_checks", {
  id: text("id").primaryKey(),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull(),
  conclusion: text("conclusion"),
  detailsUrl: text("details_url"),
  ...timestamps,
});

export const githubWebhookDeliveries = pgTable("github_webhook_deliveries", {
  id: text("id").primaryKey(),
  deliveryId: text("delivery_id").notNull().unique(),
  eventName: text("event_name").notNull(),
  action: text("action"),
  signatureVerified: boolean("signature_verified").notNull().default(false),
  payload: jsonb("payload").notNull().default({}),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  ...timestamps,
});

export const personalApiTokens = pgTable("personal_api_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: jsonb("scopes").notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  ...timestamps,
});

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  scopeId: text("scope_id"),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  ...timestamps,
});

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  key: text("key").notNull(),
  requestHash: text("request_hash").notNull(),
  response: jsonb("response"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
});
