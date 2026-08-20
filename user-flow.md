# User Flow

maxxy-me is designed for one owner operating a private coding workspace.

## First Run

1. Open the local or production URL.
2. Create the owner account. This bootstrap action is available only while no owner exists.
3. Choose local development or production VPS in Guided onboarding.
4. Install the GitHub App and configure its webhook secret.
5. Create a one-time host enrollment command and run it on the execution host.
6. Register a Codex connection lane and authenticate it on that host.
7. Import a GitHub repository with its clone and worktree paths.
8. Create the first focused task.

The setup panel derives owner, host, Codex, repository, and task completion from control-plane data. Deployment choice and the GitHub installation acknowledgement are browser-local operator preferences; they contain no credentials.

## Authentication Layers

Four credentials remain separate:

1. maxxy-me owner session in a secure browser cookie;
2. host ID and host token stored by the host agent;
3. Codex authentication in an isolated host credential slot;
4. GitHub App/webhook credentials on the control plane and Git push credentials on the host.

Compromise or expiration of one Codex lane must not expose or sign out the others.

## Daily Task Flow

```text
Create task
  -> scheduler checks dependencies, ownership, host and Codex capacity
  -> host creates branch and worktree
  -> Codex works and streams events
  -> owner handles approvals
  -> validation commands run
  -> branch is committed and pushed
  -> draft pull request is created or updated
  -> owner reviews evidence and merges in GitHub
```

A task prompt should state the outcome, constraints, and acceptance checks. Use a manager plan when work can be split into non-overlapping frontend, backend, test, or review ownership.

## Review and Requested Changes

The task review surface shows completion notes, changed files, command results, and pull-request checks. The owner either:

- merges in GitHub after required checks pass;
- requests changes, which resumes the task workflow;
- cancels the task;
- leaves it awaiting review.

maxxy-me does not merge pull requests automatically.

## Approvals

Sensitive actions appear in the approval queue. The owner can approve once, approve for the current session where supported, decline, or cancel. A declined or expired approval does not grant future permission.

## Multiple Codex Connections

Each connection appears as a separate health and capacity lane. The scheduler routes new attempts to an eligible lane according to the configured pool policy. Limited, expired, disabled, or policy-blocked lanes are skipped.

If included ChatGPT capacity is unavailable and API billing is the only failover, maxxy-me requires owner confirmation when billing-mode confirmation is enabled.

## Failure Flow

- **Host disconnect:** the task lease expires or reconciles; worktree data remains on the host.
- **Codex authentication expires:** only that connection becomes ineligible; reauthenticate it from the owner workflow.
- **GitHub authentication fails:** task state and local branch remain; repair host or App authorization and retry.
- **Validation fails:** evidence is preserved and the task returns for changes.
- **Merge conflict:** resolve in the isolated task worktree, rerun validation, and update the same pull request.
- **Container replacement or VPS reboot:** PostgreSQL restores control state and hosts reconnect outbound.

See [docs/troubleshooting.md](docs/troubleshooting.md) for diagnosis and [docs/recovery.md](docs/recovery.md) for recovery procedures.

## Routine Operator Loop

1. Check host and Codex capacity status.
2. Review active tasks, pending approvals, and failed validation.
3. Inspect pull-request evidence.
4. Merge only in GitHub after checks pass.
5. Confirm daily backup success and periodically run an isolated restore.
6. Apply updates by immutable image digest and run the production smoke check.

No routine task should require an interactive root shell. Root access is reserved for provisioning, service installation, firewall changes, secret rotation, and incident recovery.
