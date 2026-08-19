create table if not exists schema_migrations (
  id text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null default 'owner' check (role in ('owner')),
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);

create table if not exists verification_tokens (
  id text primary key,
  identifier text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hosts (
  id text primary key,
  name text not null,
  status text not null default 'unknown' check (status in ('unknown','connecting','online','degraded','offline','authentication_required','revoked')),
  max_concurrent_agents integer not null default 1 check (max_concurrent_agents > 0),
  protocol_version integer,
  host_version text,
  tool_inventory jsonb not null default '{}'::jsonb,
  last_heartbeat_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists host_tokens (
  id text primary key,
  host_id text references hosts(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('enrollment','host_auth')),
  expires_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists host_heartbeats (
  id bigserial primary key,
  host_id text not null references hosts(id) on delete cascade,
  status text not null check (status in ('unknown','connecting','online','degraded','offline','authentication_required','revoked')),
  active_runs integer not null default 0 check (active_runs >= 0),
  capacity jsonb not null default '{}'::jsonb,
  tools jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz not null default now()
);

create table if not exists repositories (
  id text primary key,
  provider text not null default 'github' check (provider in ('github')),
  owner text not null,
  name text not null,
  remote_url text not null,
  default_branch text not null default 'main',
  github_installation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, owner, name)
);

create table if not exists workspaces (
  id text primary key,
  name text not null,
  repository_id text not null references repositories(id) on delete restrict,
  default_host_id text references hosts(id) on delete set null,
  base_branch text not null default 'main',
  project_path text not null,
  worktree_root text not null,
  maximum_concurrent_agents integer not null default 1 check (maximum_concurrent_agents > 0),
  codex_pool_id text,
  codex_routing_policy text not null default 'balanced' check (codex_routing_policy in ('balanced','ordered','manual')),
  approval_policy jsonb not null default '{}'::jsonb,
  validation_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_profiles (
  id text primary key,
  workspace_id text references workspaces(id) on delete cascade,
  name text not null,
  role text not null check (role in ('manager','architect','frontend','backend','testing','reviewer','integrator','custom')),
  instructions text not null default '',
  sandbox_mode text not null default 'read-only' check (sandbox_mode in ('read-only','workspace-write')),
  can_create_subagents boolean not null default false,
  model_policy jsonb not null default '{}'::jsonb,
  skill_bindings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists codex_capacity_sources (
  id text primary key,
  label text not null,
  kind text not null check (kind in ('chatgpt_account','api_project','enterprise_workspace')),
  provider_scope_hint text,
  max_concurrent_runs integer not null default 1 check (max_concurrent_runs > 0),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists codex_capacity_pools (
  id text primary key,
  workspace_id text references workspaces(id) on delete cascade,
  name text not null,
  routing_policy text not null default 'balanced' check (routing_policy in ('balanced','ordered','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists codex_connections (
  id text primary key,
  host_id text not null references hosts(id) on delete cascade,
  capacity_source_id text not null references codex_capacity_sources(id) on delete restrict,
  label text not null,
  auth_mode text not null check (auth_mode in ('chatgpt','api_key','enterprise_access_token')),
  status text not null default 'signed_out' check (status in ('not_installed','signed_out','authenticating','ready_chatgpt','ready_api_key','ready_enterprise_access_token','limited','cooldown','expired','disabled','policy_blocked','revoked','error')),
  credential_slot_id text not null,
  max_concurrent_runs integer not null default 1 check (max_concurrent_runs > 0),
  last_health_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (host_id, credential_slot_id)
);

create table if not exists codex_capacity_pool_members (
  pool_id text not null references codex_capacity_pools(id) on delete cascade,
  connection_id text not null references codex_connections(id) on delete cascade,
  priority integer not null default 100,
  max_active_runs integer not null default 1 check (max_active_runs > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pool_id, connection_id)
);

create table if not exists codex_capacity_snapshots (
  id text primary key,
  capacity_source_id text not null references codex_capacity_sources(id) on delete cascade,
  reporting_connection_id text not null references codex_connections(id) on delete cascade,
  availability text not null check (availability in ('available','limited','cooldown','unknown')),
  remaining_percent integer check (remaining_percent is null or (remaining_percent >= 0 and remaining_percent <= 100)),
  reset_at timestamptz,
  observation_source text not null check (observation_source in ('codex_status','runtime_event','rate_limit_error','manual')),
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists tasks (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  title text not null,
  prompt text not null,
  status text not null default 'draft' check (status in ('draft','planning','awaiting_plan_approval','delegating','waiting_for_children','queued','ready','assigned','claimed','starting','running','awaiting_approval','blocked','validating','integrating','finalizing','pushing','opening_pull_request','awaiting_review','changes_requested','merged','failed','cancelled')),
  assigned_host_id text references hosts(id) on delete set null,
  assigned_codex_connection_id text references codex_connections(id) on delete set null,
  preferred_codex_pool_id text references codex_capacity_pools(id) on delete set null,
  assigned_profile_id text references agent_profiles(id) on delete set null,
  branch_name text,
  base_sha text,
  pull_request_id text,
  priority integer not null default 100,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create table if not exists task_dependencies (
  task_id text not null references tasks(id) on delete cascade,
  depends_on_task_id text not null references tasks(id) on delete cascade,
  condition text not null default 'merged' check (condition in ('completed','awaiting_review','merged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists task_leases (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  host_id text not null references hosts(id) on delete cascade,
  status text not null default 'active' check (status in ('pending','active','released','expired','cancelled')),
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists task_leases_one_active_per_task_idx on task_leases(task_id) where status = 'active';

create table if not exists codex_connection_leases (
  id text primary key,
  codex_connection_id text not null references codex_connections(id) on delete cascade,
  capacity_source_id text not null references codex_capacity_sources(id) on delete cascade,
  task_id text not null references tasks(id) on delete cascade,
  status text not null default 'active' check (status in ('pending','active','released','expired','cancelled')),
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists codex_connection_leases_one_active_per_task_idx on codex_connection_leases(task_id) where status = 'active';

create table if not exists task_runtime_attempts (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  host_id text not null references hosts(id) on delete restrict,
  codex_connection_id text not null references codex_connections(id) on delete restrict,
  capacity_source_id text not null references codex_capacity_sources(id) on delete restrict,
  thread_id text,
  handoff_from_attempt_id text references task_runtime_attempts(id) on delete set null,
  handoff_reason text,
  billing_mode_changed boolean not null default false,
  runtime_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, attempt_number)
);

create table if not exists worktrees (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  host_id text not null references hosts(id) on delete cascade,
  path text not null unique,
  branch_name text not null unique,
  base_sha text not null,
  status text not null default 'active' check (status in ('active','preserved','removed','failed')),
  dirty boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists threads (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  attempt_id text references task_runtime_attempts(id) on delete set null,
  codex_connection_id text references codex_connections(id) on delete restrict,
  provider_thread_id text,
  status text not null default 'created' check (status in ('created','running','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists turns (
  id text primary key,
  thread_id text not null references threads(id) on delete cascade,
  provider_turn_id text,
  status text not null default 'created' check (status in ('created','running','awaiting_approval','completed','failed','cancelled','interrupted')),
  started_at timestamptz,
  completed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_sessions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  task_id text not null references tasks(id) on delete cascade,
  profile_id text not null references agent_profiles(id) on delete restrict,
  host_id text not null references hosts(id) on delete restrict,
  codex_connection_id text not null references codex_connections(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  thread_id text references threads(id) on delete set null,
  turn_id text references turns(id) on delete set null,
  worktree_id text references worktrees(id) on delete set null,
  status text not null default 'created' check (status in ('created','assigned','starting','running','awaiting_approval','completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id text primary key,
  type text not null,
  workspace_id text references workspaces(id) on delete cascade,
  task_id text references tasks(id) on delete cascade,
  host_id text references hosts(id) on delete set null,
  run_id text,
  attempt_id text references task_runtime_attempts(id) on delete set null,
  codex_connection_id text references codex_connections(id) on delete set null,
  capacity_source_id text references codex_capacity_sources(id) on delete set null,
  sequence bigint not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, sequence),
  unique (workspace_id, idempotency_key)
);

create table if not exists approvals (
  id text primary key,
  task_id text references tasks(id) on delete cascade,
  agent_session_id text references agent_sessions(id) on delete set null,
  type text not null check (type in ('command','file_change','network_access','dependency_install','database_migration','git_force_push','git_reset','worktree_delete','host_operation')),
  status text not null default 'pending' check (status in ('pending','resolved','cancelled')),
  requested_payload jsonb not null default '{}'::jsonb,
  decision text check (decision is null or decision in ('approve_once','approve_for_session','decline','cancel')),
  decided_by_user_id text references users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commands (
  id text primary key,
  task_id text references tasks(id) on delete cascade,
  agent_session_id text references agent_sessions(id) on delete set null,
  command text not null,
  cwd text,
  status text not null default 'pending' check (status in ('pending','running','completed','failed','cancelled')),
  exit_code integer,
  output_truncated boolean not null default false,
  output text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists git_operations (
  id text primary key,
  task_id text references tasks(id) on delete cascade,
  repository_id text references repositories(id) on delete cascade,
  operation text not null,
  status text not null,
  branch_name text,
  commit_sha text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pull_requests (
  id text primary key,
  repository_id text not null references repositories(id) on delete cascade,
  task_id text references tasks(id) on delete set null,
  github_node_id text,
  number integer not null check (number > 0),
  title text not null,
  status text not null default 'not_created' check (status in ('not_created','draft','open','changes_requested','approved','checks_failed','merge_conflict','merged','closed')),
  head_branch text not null,
  base_branch text not null,
  url text not null,
  merged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository_id, number)
);

create table if not exists pull_request_checks (
  id text primary key,
  pull_request_id text not null references pull_requests(id) on delete cascade,
  name text not null,
  status text not null,
  conclusion text,
  details_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pull_request_id, name)
);

create table if not exists github_webhook_deliveries (
  id text primary key,
  delivery_id text not null unique,
  event_name text not null,
  action text,
  signature_verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists personal_api_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  scopes jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  actor_user_id text references users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists settings (
  id text primary key,
  scope text not null check (scope in ('system','workspace','role','agent_profile','task')),
  scope_id text,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, scope_id, key)
);

create table if not exists idempotency_keys (
  id text primary key,
  scope text not null,
  key text not null,
  request_hash text not null,
  response jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, key)
);

create index if not exists host_heartbeats_host_time_idx on host_heartbeats(host_id, heartbeat_at desc);
create index if not exists tasks_workspace_status_idx on tasks(workspace_id, status, priority);
create index if not exists events_workspace_created_idx on events(workspace_id, sequence);
create index if not exists task_leases_expires_idx on task_leases(status, expires_at);
create index if not exists codex_connection_leases_expires_idx on codex_connection_leases(status, expires_at);
create index if not exists capacity_snapshots_source_time_idx on codex_capacity_snapshots(capacity_source_id, observed_at desc);
