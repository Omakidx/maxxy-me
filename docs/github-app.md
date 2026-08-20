# GitHub Setup

maxxy-me currently uses two GitHub paths:

- the control plane verifies and consumes GitHub webhooks;
- the execution host uses Git and an authenticated `gh` CLI to push task branches and create draft pull requests.

The database includes GitHub installation metadata, but App-issued installation-token authentication for branch push and PR creation is not implemented. Do not remove host GitHub credentials until that integration exists.

## Repository Preparation

Protect the default branch and require pull requests. Enable the checks that must pass before merge. Agents must not have permission to bypass protection or merge their own pull requests.

Grant access only to repositories maxxy-me should operate on.

## Webhook

Create a strong random webhook secret and set the same value as `GITHUB_WEBHOOK_SECRET` in the control-plane production environment.

Set the payload URL to:

```text
https://workspace.example.com/api/github/webhooks
```

Use JSON content type and TLS verification. Subscribe to:

- pull request;
- pull request review;
- check run;
- check suite.

The endpoint verifies `X-Hub-Signature-256`, records the delivery ID for deduplication, rejects invalid signatures, and synchronizes pull-request/review/check state for known repositories.

## Host Authentication

Authenticate as the dedicated host service account:

```bash
sudo -u maxxy-host /usr/local/bin/maxxy-host github-login
sudo -u maxxy-host gh auth status
sudo -u maxxy-host git ls-remote https://github.com/OWNER/REPOSITORY.git HEAD
```

After the login completes, select **Verify connection** for the host in **Settings**. The dashboard reads the authenticated account from the host agent; it does not store a GitHub token. Disconnect with `sudo -u maxxy-host /usr/local/bin/maxxy-host github-logout`.

Use least privilege. The host needs repository read/write access for task branches and permission to create draft pull requests. It must not receive organization administration or branch-protection administration.

For non-interactive production use, configure the supported Git credential helper under the host account and verify it survives service restart without exposing a token in the environment or command line.

## Import a Repository

In Guided onboarding, enter:

- GitHub owner and repository name;
- HTTPS remote URL;
- protected base branch;
- persistent clone path beneath `MAXXY_PROJECT_ROOT`;
- worktree path beneath `MAXXY_WORKTREE_ROOT`.

Confirm the host account can read the clone path and create worktrees before starting a task.

## Verification

1. Create a test task that changes a harmless file.
2. Confirm a task branch is pushed.
3. Confirm exactly one draft pull request is created.
4. Redeliver the webhook and confirm no duplicate delivery or PR record.
5. Request changes and confirm the task returns to the change flow.
6. Remove host GitHub authorization and confirm failure is contained and visible.
7. Restore authorization and update the same pull request.

## Rotation and Revocation

Rotate the webhook secret in GitHub and the control plane together. Revoke host GitHub credentials immediately when a host is lost or decommissioned. Remove repository access before deleting local credential files.

Never put GitHub tokens or private keys in the browser, task prompts, repository files, Compose files, screenshots, or general backups.
