alter table codex_connections
  add column if not exists login_requested_at timestamptz;

update codex_connections
set login_requested_at = coalesce(login_requested_at, created_at)
where status in ('signed_out', 'authenticating', 'error');
