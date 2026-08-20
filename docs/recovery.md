# Recovery

Recover the smallest failed boundary first and preserve evidence before destructive action.

## Container Failure

Web and worker containers are replaceable. PostgreSQL and Caddy data live on persistent host paths.

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --force-recreate web worker caddy
APP_URL=https://workspace.example.com ./scripts/smoke-production.sh
```

Confirm owner login, task/event history, host reconnect, and lease reconciliation.

## PostgreSQL Restart

Restart PostgreSQL, wait for health, then check web and worker. Do not manually edit task or lease rows. Recovery services reconcile expired leases from durable state.

If data is damaged, follow [vps-backup-and-restore.md](vps-backup-and-restore.md) and restore into an isolated database first.

## Host Disconnect

1. Preserve the project, worktree, host state, and credential directories.
2. Check network, clock, certificate, and `maxxy-host.service` logs.
3. Restart the host service.
4. Confirm the same host ID reconnects.
5. Let lease recovery reconcile tasks; do not create duplicate worktrees manually.

Revoke the host from the control plane if the machine or token is lost.

## Codex Reauthentication

Reauthenticate only the expired connection's credential slot as the host service account. Other lanes should remain ready and continue receiving work. Existing attempt and thread attribution must not be rewritten.

API-billing failover requires owner confirmation when configured.

## GitHub Failure

Preserve the local branch and worktree. Check `gh auth status`, remote access, branch protection, and webhook delivery. Repair authorization, then retry push or update the existing draft pull request. Idempotency must prevent a second PR for the same task.

## Merge Conflict

Resolve the conflict inside the task's isolated worktree. Never resolve it by writing directly into the protected base checkout. Rerun the full validation profile, commit, push, and update the existing pull request.

## Owner Recovery

Generate a short-lived recovery token from a trusted administrator shell:

```bash
bun run owner:recovery-token
```

Use it only through the documented owner recovery endpoint, rotate owner credentials, invalidate active sessions, and preserve the security audit entry. Never send the token through chat or issue trackers.

## Full VPS Loss

1. Provision and harden a fresh VPS from [vps-deployment.md](vps-deployment.md).
2. Deploy the same reviewed commit and immutable image digest.
3. Restore PostgreSQL from an encrypted off-server artifact into an isolated target and verify it.
4. Switch the control plane to the verified restored database.
5. Reinstall the host agent.
6. Reauthenticate Codex and GitHub manually; do not restore their credential stores from the general backup.
7. Re-enroll or revoke old hosts as appropriate.
8. Run smoke, external port, security, task-to-PR, and backup checks.

## Evidence

Every drill records date, release digest, operator, starting condition, commands, recovery time, data-loss window, validation result, and follow-up issue. Track launch-critical drills in [launch-readiness.md](launch-readiness.md).
