create table if not exists task_ownership_claims (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  workspace_id text not null references workspaces(id) on delete cascade,
  pattern text not null,
  mode text not null default 'write' check (mode in ('read','write')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, pattern, mode)
);

create index if not exists task_ownership_claims_workspace_idx on task_ownership_claims(workspace_id, pattern);
create index if not exists task_ownership_claims_task_idx on task_ownership_claims(task_id);
