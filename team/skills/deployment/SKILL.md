---
name: deployment
description: Prepare and validate CI/CD, containers, hosting, environment configuration, and release workflows with reproducible artifacts, least privilege, health checks, and rollback safety.
display_name: Deployment
short_description: Prepare reproducible, rollback-safe releases
default_prompt: Use {{skill:deployment}} to prepare this release or pipeline change:
---

# Deployment

## 1. Establish the target

- Inspect the build scripts, lockfiles, CI configuration, containers, infrastructure or hosting metadata, environment contracts, observability, and the applicable {{instruction_files}} files.
- Define the target environment, the artifact, the access level, the required variables and secrets, the rollout strategy, the health signal, and the rollback condition.

## 2. Prepare safely

- Preserve the repository's package manager and release conventions. Keep builds deterministic: lockfile installs, pinned base images and CI actions (by digest or SHA where policy requires), and no network fetches of unpinned scripts.
- Keep build-time configuration separate from runtime values. Reference secrets through the platform's secret mechanism; never commit, echo, or bake secrets into images or artifacts.
- Use least-privilege credentials and CI permissions, explicit environment targeting, immutable artifacts, and bounded migrations.
- Containers: use minimal base images, run as a non-root user, set an explicit entrypoint and health check, and use a `.dockerignore` that excludes secrets and local state.
- Never deploy, change access, rotate secrets, modify shared infrastructure, or delete resources without explicit authorization. Prefer dry runs, plan output, validation commands, and preview environments before any mutation.

## 3. Validate and release

- Validate configuration syntax (and workflow linting where available), dependency installation, the production build, artifact contents, the runtime entrypoint, health checks, logs and metrics, and the rollback path.
- Sequence schema changes and application rollout so each step stays compatible with the previous one.
- When deployment is authorized, publish exactly the validated source or artifact, watch until it reaches a terminal status, verify health, and stop or roll back when the defined failure criteria occur.

## Definition of done

- [ ] Target, artifact, secrets, health signal, and rollback condition are defined
- [ ] The build is reproducible, with pinned inputs and no committed secrets
- [ ] Configuration and workflow syntax are validated; the artifact builds locally
- [ ] The rollback path is documented and, where possible, tested
- [ ] Any deployment was explicitly authorized and verified healthy, or none was performed and the report says so
