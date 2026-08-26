---
name: deployment
description: Prepare and validate CI/CD, containers, hosting, environments, and release workflows with reproducible artifacts, least privilege, health checks, and rollback safety.
---

# Deployment

## Establish the target

Inspect build scripts, lockfiles, CI configuration, containers, infrastructure or hosting metadata, environment contracts, observability, and applicable `AGENTS.md` instructions. Define the target environment, artifact, access level, required variables and secrets, rollout strategy, health signal, and rollback condition.

## Prepare safely

Preserve the repository's package manager and release conventions. Keep builds deterministic and separate build-time configuration from runtime values. Reference secrets through the platform's secret mechanism; never commit values. Use least-privilege credentials, explicit environment targeting, immutable artifacts, and bounded migrations.

Do not deploy, change access, rotate secrets, modify shared infrastructure, or delete resources without explicit authorization. Prefer dry runs, validation commands, and preview environments before mutations.

## Validate and release

Validate configuration syntax, dependency installation, production build, artifact contents, runtime entrypoint, health checks, logs/metrics, and rollback path. Sequence schema changes and application rollout safely. When deployment is authorized, publish the exact validated source/artifact, observe the terminal status, verify health, and stop or roll back when defined failure criteria occur. Report the deployed target, validation evidence, and any residual operational requirement.
