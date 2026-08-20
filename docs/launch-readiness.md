# Launch Readiness

**Decision:** NOT READY TO LAUNCH
**Last reviewed:** 2026-08-20
**Release candidate:** branch `agent-orch-panel`

This is the authoritative Phase 14 beta and launch checklist. A repository test proves code behavior; a container drill proves local infrastructure behavior; neither substitutes for a real Codex/GitHub workflow or a real VPS drill.

## Status

- **Pass:** required evidence is recorded.
- **Partial:** supporting automation or a container drill passes, but required live evidence remains.
- **Blocked:** required behavior is not implemented or cannot yet be exercised.
- **Pending:** implemented path exists but the required drill has not run.

## Documentation and Onboarding

| Requirement | Status | Evidence |
|---|---|---|
| Maintained Phase 14 document set | Pass | `bun run docs:check` |
| Deployment-mode selection | Pass | Guided onboarding, browser-local non-secret choice |
| Owner setup | Pass | Owner bootstrap API and setup state |
| GitHub setup | Partial | Guide, webhook verification, and host `gh` flow exist; App installation-token auth is not implemented |
| Host enrollment | Pass | One-time token action and generated host command |
| Codex health check | Pass | Per-host connection loading and ready-state gate |
| Repository import | Pass | Guided link to live workspace creation API |
| First task wizard | Pass | Guided link to live task creation and immediate-start option |

## Required Beta Scenarios

| Scenario | Status | Current evidence / required completion |
|---|---|---|
| Successful task implemented in maxxy-me itself | Pending | Must run end-to-end through a real enrolled host, Codex, push, draft PR, checks, and owner review |
| Requested changes | Partial | Review webhook/state support exists; run a live changes-requested loop on the beta PR |
| Cancelled task | Partial | Scheduler state test passes; cancel a live running beta task |
| Failed validation | Partial | Required-command failure path is tested; capture live failed validation and recovery |
| Host disconnect | Partial | Startup reconciliation and lease recovery tests pass; disconnect/reconnect a live host during work |
| Codex reauthentication | Partial | Registry and reauthentication commands exist; expire and restore one live lane |
| GitHub authentication failure | Pending | Revoke host GitHub access during a beta task, observe failure, restore, and update the same PR |
| Merge conflict | Pending | Create and resolve a real base-branch conflict in the task worktree |
| Web and worker container replacement | Pass | [Phase 11 container drill](phases/phase-11-containerized-drill.md) |
| PostgreSQL container restart | Pass | Phase 11 stop/start drill retained migrations and health |
| Full VPS reboot | Pending | Requires production systemd, public TLS, containers, host reconnect, and task reconciliation |
| Fresh-VPS rebuild | Pending | Requires a new VPS built only from maintained guides and off-server artifacts |
| Database restore drill | Partial | Local logical restore passed; production encrypted off-server artifact restore remains |
| Second Codex connection onboarding | Partial | Isolated registry and setup paths pass tests; onboard and authenticate a second live lane |
| Two tasks routed to different lanes | Partial | Parallel scheduler test passes; record per-attempt live lane attribution |
| Limited lane routes new task elsewhere | Partial | Scheduler integration test passes; reproduce with live observed capacity |
| Expired lane does not affect others | Pending | Run live expiration while another lane continues |
| Included usage to API billing asks for confirmation | Blocked | `billing_mode_changed` storage exists, but scheduler approval enforcement is not implemented |

## Launch Criteria

| Criterion | Status | Pass condition |
|---|---|---|
| Critical workflow succeeds repeatedly | Pending | At least three dated task-to-PR runs, including one maxxy-me self-change |
| No manual database edits | Partial | APIs and recovery services cover normal paths; complete beta without SQL intervention |
| No routine interactive root shell | Partial | Dashboard and scripts cover routine use; confirm during a sustained beta |
| Host recovery works | Partial | Automated reconciliation passes; complete live disconnect and reboot drills |
| PR creation is idempotent | Partial | Unit/integration and webhook dedupe evidence exists; retry live PR creation without duplication |
| Security checklist complete | Pending | Repository check passes; external scans and live non-root/socket evidence remain |
| Backup strategy tested | Partial | Container restore passes; encrypted off-server production restore remains |

Launch is allowed only when every row in this section is **Pass** and no required beta scenario is Blocked, Pending, or Partial.

## Repository Verification

Run on the release commit:

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run docs:check
bun test
bun run build
bun run security:check
```

Also render production Compose with required placeholder values and an immutable digest, then build or pull the exact release image.

## Live Evidence Record

For each drill append or link a dated record containing:

- release commit and image digest;
- environment and operator;
- starting state;
- exact scenario and expected result;
- redacted commands or UI actions;
- task, host, connection, attempt, and PR IDs where relevant;
- result, recovery time, and data-loss window;
- logs or screenshots with secrets removed;
- follow-up issue.

## Known Launch Blocker

Billing-mode confirmation must be implemented before the final beta scenario. The scheduler must detect a transition from included ChatGPT usage to an API-billed capacity source, create a pending owner approval, avoid assigning the API lane before approval, record the decision, and set attempt `billing_mode_changed` only after approval. This needs integration tests and a live beta exercise.

## Sign-Off

Do not change the decision to READY until the owner has reviewed all evidence, resolved high-severity findings, verified off-server restore, and signed the release commit and immutable image digest.
