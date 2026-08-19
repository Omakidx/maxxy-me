# Phase 0 Development Goal

Phase 0 proves that the selected runtime and deployment shape can work before maxxy-me invests in product features.

## Goal

Build and verify a minimal production-shaped spike where:

- Caddy is the only public HTTP entry point.
- The web process runs in a Bun container.
- The web process serves a minimal Next.js page.
- `/health` checks the web process and PostgreSQL.
- `/api/ws` supports a heartbeat WebSocket.
- The worker runs independently from the web process.
- PostgreSQL persists data outside container writable layers.
- A one-shot migration creates a test schema artifact.
- The native host-agent placeholder connects outward over WebSocket.
- Deployment, backup, rollback, and systemd assumptions are documented as executable scaffolding.

## Current Spike Commands

```bash
sg docker -c 'docker compose up --build'
```

Open the local Caddy entry point:

```text
http://127.0.0.1:8080
```

Run the smoke check from inside the web container image or a Bun-enabled host:

```bash
APP_URL=http://127.0.0.1:8080 bun run phase0:check
```

Validate the rendered production Compose configuration:

```bash
MAXXY_SITE_ADDRESS=workspace.example.com \
APP_URL=https://workspace.example.com \
sg docker -c 'docker compose -f compose.yaml -f compose.production.yaml config --quiet'
```

## Exit Gates

Phase 0 is complete only after these are proven on a disposable VPS:

1. The Compose stack deploys twice successfully.
2. The one-shot migration succeeds.
3. Rollback to the previous image or digest is tested.
4. Web and worker boot independently.
5. The WebSocket reconnects after web-container replacement.
6. The native host agent reconnects after restart.
7. The host agent and containers return after a VPS reboot.
8. PostgreSQL data survives container replacement.
9. A database dump restores into an isolated PostgreSQL instance.
10. Repositories and worktrees persist outside application containers.

## Development Rule

Do not build the full dashboard until this spike proves the control plane, database, WebSocket path, native host-agent process, and persistence boundaries.
