create table if not exists phase0_migrations (
  id text primary key,
  release_version text not null,
  applied_at timestamptz not null default now()
);

create table if not exists phase0_worker_heartbeats (
  id bigserial primary key,
  service_name text not null,
  release_version text not null,
  heartbeat_at timestamptz not null
);

insert into phase0_migrations (id, release_version)
values ('0001_phase0_spike', current_setting('maxxy.release_version', true))
on conflict (id) do update
set release_version = excluded.release_version;
