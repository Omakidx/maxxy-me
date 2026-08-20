# Contributing

maxxy-me is a private, single-owner orchestration system. Changes should preserve its task isolation, explicit approval, provider boundaries, and recoverability.

## Local Setup

```bash
bun install
bun run db:migrate
bun run db:check
```

Use PostgreSQL from Docker Compose or set `DATABASE_URL` and `TEST_DATABASE_URL` to an isolated development database. Never point tests at production.

Start the production-shaped local stack:

```bash
docker compose up --build
```

Open `http://127.0.0.1:8080`. For focused service development use `bun run dev:web`, `bun run dev:orchestrator`, or `bun run dev:host`.

## Required Checks

```bash
bun run lint
bun run typecheck
bun run docs:check
bun test
bun run build
bun run security:check
```

When deployment files change, also validate Compose and build the image:

```bash
docker compose config --quiet
docker compose build
```

## Development Standards

- TypeScript stays strict.
- Route handlers and apps should depend on package exports, not private package files.
- Keep privileged host execution out of the web and worker containers.
- Persist durable state before broadcasting events.
- Preserve one branch and worktree per write task.
- Make externally retried operations idempotent.
- Keep Codex, GitHub, and host protocols behind their adapters.
- Add tests for state transitions, lease behavior, auth boundaries, and recovery changes.
- Never log secrets, authorization headers, cookies, tokens, private keys, or raw credential paths.
- Keep UI controls sharp-edged and usable in both the white default theme and dark theme.

## Database Changes

- Add a new ordered migration; do not edit a migration already used outside your branch.
- Keep schema definitions and migrations aligned.
- Test migration from an empty database and, where relevant, from the previous release.
- Do not require manual production database edits.

## Security-Sensitive Changes

Changes to authentication, host commands, filesystem paths, WebSockets, GitHub webhooks, encryption, deployment, or backups require focused negative tests and a review of [SECURITY.md](SECURITY.md).

Do not commit:

- real `.env` files;
- Codex or GitHub credential stores;
- host enrollment or auth tokens;
- SSH keys, App private keys, API keys, or backup identities;
- production logs, dumps, or screenshots containing private data.

## Commits

Use concise conventional commits:

```text
feat: add host enrollment token schema
fix: prevent duplicate task lease claims
docs: clarify host recovery drill
chore: update ci workflow
```

Keep unrelated user changes intact. A phase is committed and pushed only after its applicable exit criteria pass; partial production evidence must be labeled honestly.

## Pull Requests

Describe:

- user-visible and architectural behavior;
- migration or deployment impact;
- tests and manual checks performed;
- known risks and rollback path;
- launch-readiness evidence affected.

Agents may create or update draft pull requests but must never merge them or bypass required checks.

## Dependency Policy

- Use Bun and keep `bun.lock` committed.
- Pin runtime-critical versions in `package.json`, Docker images, and deployment files.
- Prefer small dependency additions with a clear package owner and purpose.
- Review licenses, install scripts, transitive risk, and browser bundle impact.
- Do not introduce a second implementation of an existing repository capability.

## Documentation

Update the root README or focused operator guide when behavior, commands, environment variables, recovery, or security expectations change. Keep the large documents under `docs/starter-MDs/` as planning history; current guidance belongs in the root documents and `docs/` guides.
