# Phase 14 Progress Summary

Date: 2026-08-20
Branch: `agent-orch-panel`
Status: In progress; documentation and guided onboarding implemented, launch criteria not yet passed

## Implemented

- Replaced the stale Phase 1 root README with a GitHub-facing product, setup, safety, repository, and status guide.
- Added concise current architecture, user-flow, execution-status, contribution, and security documents.
- Added focused host installation, VPS deployment, backup/restore, GitHub, recovery, and troubleshooting guides.
- Added `bun run docs:check` and CI enforcement for the maintained documentation set and local links.
- Added a seven-step dashboard onboarding panel for deployment mode, owner state, GitHub acknowledgement, host enrollment, Codex connection/health, repository import, and the first task.
- Added live loading of each host's Codex connections and ready-state onboarding completion.
- Added one-time host enrollment command generation and Codex connection registration to the dashboard.
- Added an installable `deploy/maxxy-host` launcher matching the systemd unit.
- Added the authoritative beta scenario and launch decision matrix.

## Verification Scope

Repository quality, security, build, documentation, full database-backed tests, production Compose rendering, container startup, and responsive browser checks passed for this progress commit.

The full suite ran against a disposable PostgreSQL database: 51 passed, 0 failed, 0 skipped. It exposed and fixed an ordering race so task and Codex leases are released before the task publishes its `awaiting_review` state.

Browser QA covered desktop and 390px mobile first-run layouts with no page overflow or console warnings and one-row mobile navigation.

Existing automated and container evidence supports cancellation, validation failure, disconnect recovery, connection isolation, limited-lane routing, container replacement, PostgreSQL restart, and logical restore behavior.

## Remaining Exit Work

Phase 14 cannot be marked complete or launch-ready yet:

- The beta self-change has not run through a real maxxy-me host, Codex authentication, GitHub push, and draft pull request.
- Requested changes, live cancellation, validation failure, host disconnect, Codex reauthentication, GitHub auth failure, conflict, multi-lane routing, and lane expiration still need live beta evidence.
- Full VPS reboot, external scans, fresh-VPS rebuild, and encrypted off-server restore still need production evidence.
- Paid API failover confirmation is not implemented in scheduler assignment, despite a placeholder environment variable and database field.

## Decision

This phase progress is suitable to push for review because it improves the product and makes all remaining launch work explicit. It is not a completed phase and must not be tagged or announced as a production release.

The source of truth is [Launch readiness](../launch-readiness.md).
