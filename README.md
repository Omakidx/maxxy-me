# maxxy-me

maxxy-me is a personal Codex orchestration workspace. The repository is currently in the Phase 1 foundation slice: a Bun workspace monorepo with a minimal production-shaped Phase 0 spike.

## Current Shape

```text
apps/
  web/            Next.js dashboard and HTTP/WebSocket entry point
  orchestrator/   scheduler and worker process
  host-agent/     native execution-host process
packages/
  contracts/      shared schemas and event types
  database/       database access boundary
  codex-adapter/  Codex runtime boundary
  workspace-runtime/
  git/
  github/
  logger/
  security/
  ui/
  config/
```

## Development

```bash
bun install
bun run lint
bun run typecheck
bun test
bun run build
```

Run the local Phase 0 stack:

```bash
sg docker -c 'docker compose up --build'
```

Open:

```text
http://127.0.0.1:8080
```

Run the local smoke check:

```bash
APP_URL=http://127.0.0.1:8080 bun run phase0:check
```

See [docs/phases/phase-0-development-goal.md](docs/phases/phase-0-development-goal.md) for the active Phase 0 deployment spike gates.
