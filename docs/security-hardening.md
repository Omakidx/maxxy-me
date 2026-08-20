# Security Hardening

This document is the Phase 13 threat model and security checklist for maxxy-me. It focuses on risks created by remote code execution, repository access, account credentials, and a single-VPS deployment.

## Threat Model

| Threat | Primary controls | Evidence |
|---|---|---|
| Stolen browser session | Secure app secret, same-origin web surface, CSP, clickjacking headers, short-lived WebSocket tickets | Caddy headers, API auth tests |
| Stolen host token | Token hashes in the control plane, host revocation, scheduler skips revoked hosts | Security repositories, worker scheduling behavior |
| Malicious repository or prompt injection in files | Worktree isolation, explicit command policy, approvals by risk, protected branch and force-push rejection | Host command-runner tests |
| Unsafe shell command | Profile allowlist, executable allowlist, executable deny list, no shell, timeout, output cap | `bun run security:check`, host-agent tests |
| Path traversal | Project/worktree root guards for repository and command paths | `PathGuard` coverage and command-runner behavior |
| Webhook forgery | GitHub webhook secret verification and audit events | API security implementation |
| Dependency compromise | Frozen lockfile install, pinned runtime image tag, dependency audit/scanning runbook, CodeQL-compatible repo checks | Dockerfile, `bun.lock`, security checklist |
| Leaked logs | Caddy redacts authorization and cookie headers, command output is bounded, env values are not inherited by generic commands | Caddyfile, command runner |
| Malicious pull-request content | Draft PRs by default, protected branch rejection, review phase before merge | Phase 10/host command policy |
| Unauthorized host enrollment | Enrollment token flow, host token hashing, immediate revocation path | Security API and audit repository |
| Cross-account credential-slot confusion | Opaque connection IDs, host-local credential registry, no control-plane `auth.json` storage | Host registry and docs |
| Accidental `auth.json` reuse | Separate host-local namespace per Codex connection | Host registry layout |
| Silent switch to API billing | Auth mode is explicit per connection and capacity source; routing does not rotate around provider enforcement | Connection registry and capacity docs |
| Misleading pooled-capacity estimates | Capacity is modeled per source/connection and should be treated as advisory until provider confirms use | Phase 9 planning docs |
| Routing around provider suspension or policy enforcement | Suspended or enforcement-blocked lanes must be disabled instead of bypassed | Command and scheduling policy |
| Public PostgreSQL, Docker API, Codex, or dev port exposure | Caddy is the only public app entry point, Postgres has no production ports, Docker socket is not mounted | Compose files, VPS port scan |
| Stolen VPS deployment SSH key | SSH keys only, disabled direct root login, restricted deployment account, pinned host key in operator workflow | Production runbook |
| Malicious or compromised container image | Immutable production image digest, pinned base tag, vulnerability scanning before deploy | Compose production, Dockerfile |
| Container escape into host data | Read-only app containers, no Docker socket, no repository or credential mounts into web/worker | Compose files |
| Host-agent privilege escalation | Dedicated non-root user, systemd `NoNewPrivileges`, restricted writable paths, protected home/system paths | systemd unit |
| Unencrypted or public backup | age-encrypted backup artifact before transfer, restricted backup target, restore check script | backup script and timer |
| Disk exhaustion affecting PostgreSQL and worktrees | Backup staging cleanup, monitoring and alerting in runbook, explicit data directories | Recovery docs/runbook |
| Unpatched host OS | Security updates before deploy and owner-reviewed reboot policy | Production runbook |
| Complete loss of the single VPS | GitHub as durable branch/PR store, encrypted off-server database backups, fresh-VPS restore procedure; complete loss of the single VPS still requires external recovery evidence | Phase 11/12 docs |

## Secret Handling Rules

- Store raw API tokens in PostgreSQL only if encrypted and unavoidable; use token hashes whenever verification is enough.
- Keep Codex credentials, ChatGPT `auth.json`, refresh tokens, enterprise access tokens, and Git push credentials on execution hosts.
- Isolate each Codex connection in a separate protected host-local namespace.
- Resolve opaque connection IDs inside the authenticated host agent; never broadcast secret material through WebSocket events.
- Redact authorization headers, cookies, environment values, account hints, and capacity diagnostics where they could expose identity or credentials.
- Keep deployment, registry, PostgreSQL, backup, GitHub, and Codex credentials separate.
- Encrypt off-server backups and exclude Codex/GitHub credential stores from broad filesystem backups.

## Command Policy

Generic `command.run` is disabled unless both `HOST_ALLOWED_COMMAND_PROFILES` and `MAXXY_ALLOWED_COMMANDS` allow it. `MAXXY_DENIED_COMMANDS` takes precedence over the allowlist. Commands run without a shell, under a workspace-root guard, with an explicit environment, maximum runtime, output cap, and cancellation through the child process.

Dangerous operations must be routed through approval-aware product flows instead of raw `command.run`. The default deny list includes privilege escalation, filesystem-destructive, service-control, Docker, and cluster-control commands.

## Web And Container Security

Caddy sets CSP, HSTS, clickjacking, MIME-sniffing, referrer, permissions-policy, request-size, and log-redaction controls. Production Compose requires immutable image digests, keeps PostgreSQL private, sets read-only application containers, and uses no-new-privileges. The host-agent systemd service runs as `maxxy-host` with strict filesystem protections.

## Live VPS Evidence Required

The repository can prove configuration and automated checklist items, but external scans require a live deployment. Before marking the VPS-dependent exit criteria complete, collect evidence that:

- external security and vulnerability scans have no unresolved high severity findings;
- an outside `nmap` scan exposes only approved ports;
- web, worker, PostgreSQL, and host-agent processes do not run as root;
- the Docker socket is unavailable to app and execution processes;
- encrypted backup contents exclude Codex and GitHub credential stores and restore successfully.
