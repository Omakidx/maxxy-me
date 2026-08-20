# Reliability and Recovery

## Startup Reconciliation

The worker runs startup reconciliation before normal scheduler ticks. It:

- marks stale online/degraded/connecting hosts offline when heartbeat age exceeds the configured threshold;
- expires active task leases on unavailable hosts;
- expires matching Codex connection leases;
- requeues recoverable active tasks;
- preserves active worktrees as dirty when task state is uncertain;
- records recovery events for dashboard visibility.

## Failure Classes

Use these normalized classes in user-facing diagnostics and future retry policy:

- `retryable`: transient process, network, or provider availability failure.
- `requires_authentication`: selected host, GitHub, or Codex connection needs reauthentication.
- `requires_approval`: execution is paused on an owner approval request.
- `requires_user_action`: manual owner input is required before progress can continue.
- `conflict`: repository, ownership, dependency, or merge conflict prevents safe execution.
- `permanent`: non-retryable implementation or policy failure.
- `cancelled`: owner or system cancellation.

Connection-limit and authentication failures must identify the affected connection ID without leaking credential material.

## Retention Defaults

Initial defaults before pruning automation:

- detailed events: 180 days;
- command output: 90 days;
- audit logs: 1 year;
- pull-request and task summaries: retained indefinitely unless manually exported/pruned;
- backup manifests: retained according to daily/weekly/monthly backup policy.

Pruning must preserve auditability for merged pull requests and security-sensitive events.

## Idempotency Coverage

Current coverage:

- task creation via workspace idempotency keys;
- event ingestion via event idempotency keys;
- GitHub webhook deliveries via delivery ID uniqueness;
- approval decisions update only pending approvals;
- pull-request persistence upserts by repository and PR number;
- scheduler leases use active unique indexes and transactional `FOR UPDATE SKIP LOCKED`.

Remaining future hardening:

- host command dispatch idempotency across web process restart;
- Git push request idempotency at the host protocol boundary;
- PR creation preflight by branch before calling GitHub when a prior response was lost.
