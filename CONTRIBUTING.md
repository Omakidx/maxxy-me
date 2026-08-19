# Contributing

maxxy-me is in the foundation phase. Keep changes small, vertical, and aligned with the phase plan in `docs/starter-MDs/execution-phase.md`.

## Local Setup

```bash
bun install
bun run lint
bun run typecheck
bun test
bun run build
```

Run the Phase 0 stack locally with Docker:

```bash
sg docker -c 'docker compose up --build'
```

Use plain `docker compose ...` when your shell already has active `docker` group membership.

## Development Standards

- TypeScript stays strict.
- Route handlers and apps should depend on package exports, not private package files.
- Keep privileged host execution out of the web and worker containers.
- Persist durable state before live broadcasting once the scheduler and event system exist.
- Do not add dashboard polish before the reliable task-to-PR path is proven.

## Commits

Use concise conventional commits where practical:

```text
feat: add host enrollment token schema
fix: prevent duplicate task lease claims
docs: record phase 1 completion
chore: update ci workflow
```

## Dependency Policy

- Use Bun and keep `bun.lock` committed.
- Pin runtime-critical versions in `package.json`, Docker images, and deployment files.
- Prefer small dependency additions with a clear package owner and purpose.
- Run lint, typecheck, tests, build, and container build before completing a phase.
