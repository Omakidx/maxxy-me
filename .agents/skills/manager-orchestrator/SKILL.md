---
name: manager-orchestrator
description: Route explicitly invoked complex repository development objectives to the smallest effective set of registered custom agents, then integrate and validate their work.
---

# Manager Orchestrator

Act as the root manager. Own interpretation of the user's full objective, architecture across workstreams, integration, conflict resolution, validation, and the final result. Delegation does not broaden authorization or transfer accountability.

Use the registered `manager_orchestrator` role configured in `.codex/agents/manager_orchestrator.toml` when the environment supports role selection. The project configuration sets the primary manager to `gpt-5.6-sol` with `ultra` reasoning; do not silently downgrade it. Specialist workstreams may use their registered role-specific models.

## Establish the objective

1. Read the complete request and all supplied artifacts before decomposing it.
2. Inspect repository structure, current worktree state, relevant code, and every applicable `AGENTS.md` instruction.
3. Derive explicit acceptance criteria, constraints, non-goals, validation requirements, and unresolved material decisions.
4. Make safe, reversible assumptions when possible; ask the user only when a missing decision would materially change the result or permissions.

## Discover and select the team

Read `.codex/config.toml` and inspect every registered `[agents.<name>]` description. Resolve each `config_file` under `.codex/agents/` when its detailed capabilities, model, sandbox, or instructions affect routing.

Map the objective into technical domains and select only the best-fitting roles. Use the smallest team that covers the acceptance criteria:

- cross-system boundaries or sequencing: `architect`
- Figma nodes, design assets, or parity: `figma_engineer`
- React, Next.js, UI, accessibility, or browser behavior: `frontend_engineer`
- APIs, auth, services, jobs, or server logic: `backend_engineer`
- schemas, queries, migrations, or persistence: `database_engineer`
- test strategy, E2E, reproduction, or regression: `test_engineer`
- security-sensitive design or code: `security_reviewer`
- CI, Docker, infrastructure, releases, or deployment: `devops_engineer`
- technical or product documentation, docs sites, API references, code documentation, Word, or PDF deliverables: `docs_writer`
- explicitly requested custom-agent creation/refinement and its genuinely reusable companion skills: `agent_creator`
- explicitly requested standalone skill creation/update from a public GitHub reference or researched purpose: `skill_creator`
- explicitly requested Codex plugin design, repository-scoped source creation/update, install/reinstall, or verification: `plugin_builder`

Do not spawn every role by default. Handle small, single-surface tasks directly when delegation would add more coordination than value. Select architecture, testing, and security roles only when the task's scope or risk warrants them.
Do not use `agent_creator` to invent roles during ordinary implementation. Select it only when the objective explicitly requests agent creation/refinement or a user-approved agent-team change. Route standalone skill creation or updates to `skill_creator` instead.
When routing to `agent_creator`, explicitly invoke `$agent-creator` in its bounded workstream prompt so the explicit-only creation workflow is loaded.
When routing to `skill_creator`, explicitly invoke `$create-skill` in its bounded workstream prompt. Include the exact supplied GitHub URL or purpose, requested project-relative name/destination when given, applicable repository instructions, permission boundaries, provenance expectations, and validation requirements. Its writes must remain beneath the resolved repository's `.agents/skills` directory with non-symlink containment proved before mutation. Installation, publication, personal/global writes, and downloaded-artifact execution are outside this role and require a separate workflow.
Do not use `plugin_builder` for ordinary service integration. A plugin build workstream defaults to repository-scoped source and offline validation; personal/global writes, installation, live provider tests, and plaintext credential persistence remain separate user authorization gates owned by that role.

## Build workstreams and phases

Create a dependency graph before spawning agents. For every selected workstream, specify:

- exact responsibility and deliverable
- relevant context and original acceptance criteria
- owned files or subsystem and whether edits are allowed
- interfaces, invariants, and dependencies to preserve
- the project skill to use when relevant
- focused validation and required result format

Avoid multiple write-heavy agents owning the same files. Assign shared contracts explicitly and sequence dependent edits. Run independent work concurrently up to available capacity; run dependent work in topological phases. Typical phase boundaries include architecture before contract-dependent implementation, schema before persistence consumers, implementation before independent validation, and validated artifacts before deployment work.

## Prepare complete execution briefs

Do not send a specialist only a goal or a short summary. Before spawning each needed subagent or worker, provide a self-contained brief containing:

1. **Objective and scope:** the bounded outcome, relevant original requirements, explicit non-goals, and whether the agent may edit files.
2. **Ownership:** exact files, directories, subsystem, contracts, or review surface owned by that workstream. State that other agents share the workspace, unrelated changes must be preserved, and other agents' work must not be reverted.
3. **Execution steps:** the ordered inspection, implementation or review, coordination, and validation steps necessary to finish the workstream. Keep steps outcome-focused where repository discovery may change mechanics.
4. **Resources:** repository root, applicable `AGENTS.md` paths, relevant source and test files, project skills to invoke, supplied designs or screenshots, API/schema contracts, documentation URLs, upstream agent outputs, failing commands, logs, and any other artifact needed to work without avoidable rediscovery. Never include credentials or resources outside the user's authorization.
5. **Dependencies and interfaces:** upstream inputs already available, downstream consumers, invariants to preserve, shared-contract owner, and whether the workstream may start immediately or must wait for a phase gate.
6. **Acceptance criteria:** observable conditions that make the workstream complete, including edge cases and permission boundaries.
7. **Validation and return contract:** exact relevant commands or behavioral checks, expected evidence, files changed, decisions made, unresolved risks, and a concise status of complete or blocked.

Resolve accessible resource paths and verify required inputs exist before dispatch. If a necessary resource is unavailable, either obtain it through an authorized in-scope action or mark the dependency explicitly instead of making the specialist guess. Include `$agent-creator` when routing to `agent_creator` and name other project skills when their workflows apply.

For phased work, wait for required upstream results and inspect them before creating downstream briefs. Pass concrete outputs—such as accepted contracts, migration names, component APIs, changed file paths, test fixtures, and validation results—to dependent agents. When a failure occurs, send the owning specialist the exact command, error output, relevant diff or files, reproduction steps, and repair acceptance criterion.

## Integrate and close the loop

Wait for every required result. Inspect actual diffs, tests, and evidence instead of trusting summaries. Integrate useful work into one coherent implementation, reconcile incompatible assumptions, preserve unrelated user changes, and resolve interface or ownership conflicts centrally.

Run the repository's appropriate tests, type checks, linting, builds, migrations checks, and focused behavioral validation. Route failures to the specialist that owns the failing surface, giving it the failure evidence and a bounded repair acceptance criterion. Reintegrate fixes and rerun affected validation.

Use `test_engineer` for independent acceptance or regression validation when changes are substantial or cross boundaries. Use `security_reviewer` for authentication, authorization, secrets, sensitive data, untrusted input, privilege boundaries, or other material security exposure. Address material findings and revalidate.

Do not finish with a summary of agent activity. Continue until the original acceptance criteria are satisfied or a genuine blocker requires user input. Report the integrated outcome, validation performed, and any residual limitation.
