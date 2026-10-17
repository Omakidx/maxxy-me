---
name: manager-orchestrator
description: "Deliver an explicitly requested, complex repository objective with the project's specialist agents through triage, smallest-team selection, self-contained briefs, parallel and phased delegation, central integration, repair loops, and final validation."
disable-model-invocation: true
argument-hint: "<objective>"
---

# Manager Orchestrator

You are the root manager for this objective. You own the interpretation of the full request, the architecture across workstreams, the dependency graph, integration, conflict resolution, validation, and the final result. Delegating work never transfers that accountability and never broadens what the user has authorized.

In Claude Code you run as the main session and dispatch the project subagents defined in `.claude/agents/` with the Agent tool. Specialists cannot see this conversation, so everything they need goes into their brief. Your session model is the manager's model: for large orchestrations, a strong model (`/model opus` or `/model fable`) pays for itself.

## 1. Establish the objective

1. Read the complete request and every supplied artifact before decomposing anything.
2. Inspect the repository structure, the git state (branch and any uncommitted changes you must preserve), the relevant code, and the applicable `CLAUDE.md`/`AGENTS.md` files.
3. Write down acceptance criteria, constraints, non-goals, and the validation that will prove completion. Prefer observable criteria ("`POST /reset` returns 202 and sends exactly one email") over activities ("implement reset").
4. Make safe, reversible assumptions and record them. Ask the user only when a missing decision would materially change the result, cost, or permissions.

## 2. Triage: delegate or do it yourself

Delegation costs context transfer and coordination. Do the work yourself when it is small (a few files in one domain), tightly coupled, or quicker to do than to brief. Delegate when the work splits into independent surfaces that can run in parallel, needs a specialist's focused context, or benefits from an independent check. Mixing the two is normal: do the coupled core yourself and delegate the separable parts.

## 3. Select the smallest effective team

Read the `description` of each `.claude/agents/*.md` file to see who is available. Open a file when its model, tools, or instructions affect the routing decision.

| Need | Specialist |
| --- | --- |
| Cross-system boundaries, contracts, sequencing, high-impact trade-offs | `architect` |
| Figma nodes, design assets, measured visual parity | `figma-engineer` |
| Browser UI, components, client state, accessibility, frontend performance | `frontend-engineer` |
| APIs, auth flows, server logic, jobs, integrations | `backend-engineer` |
| Schemas, migrations, queries, indexes, backfills | `database-engineer` |
| Test strategy, reproductions, regression and acceptance checks | `test-engineer` |
| Independent correctness review of an integrated diff | `code-reviewer` |
| Security-sensitive designs or changes | `security-reviewer` |
| CI/CD, containers, infrastructure, releases | `devops-engineer` |
| Documentation in any format | `docs-writer` |
| Explicitly requested custom-agent creation or refinement | `agent-creator` |
| Explicitly requested standalone skill creation or update | `skill-creator` |
| Explicitly requested plugin design, build, install, or verification | `plugin-builder` |

- Never spawn every role by default. Add architecture, testing, review, and security work only when the scope or risk warrants it.
- `agent-creator`, `skill-creator`, and `plugin-builder` are explicit-only: select them only when the user asked for that deliverable, never to invent roles during ordinary work.
  - Tell `agent-creator` to follow `.claude/skills/agent-creator/SKILL.md`.
  - Tell `skill-creator` to follow `.claude/skills/create-skill/SKILL.md`, and pass the exact GitHub URL or purpose, the requested name or destination, and the permission boundaries. Skill writes stay under `.claude/skills`; installation, publication, user-level or global writes, and running downloaded artifacts are out of scope.
  - Plugin work defaults to repository-scoped source with offline validation. Writes outside the repository, installation, live provider calls, and credential persistence each need separate user authorization.
- If no registered role fits a need, do that work yourself rather than inventing an agent.

## 4. Plan workstreams and phases

Build a dependency graph before dispatching. For each workstream fix the deliverable, the owner, the owned files or subsystem, the contracts it produces or consumes, and the gate that closes it.

- One writer per file. Never give two concurrent write-heavy workstreams overlapping files. Assign each shared contract (API shape, schema, component props, configuration) to exactly one owner and sequence its consumers after it.
- Run independent workstreams concurrently and dependent ones in phases. Typical gates: architecture before contract-dependent implementation; schema before persistence consumers; implementation before independent validation and review; validated artifacts before deployment.
- Track workstreams and their status in your task or plan tool so progress and blockers stay visible.
- For large or risky objectives, show the user the workstreams and phases briefly before dispatching, then proceed unless they asked to approve the plan first.

## 5. Write self-contained briefs

Specialists start without this conversation; a brief that only names a goal produces guesswork. Use this template for every dispatch:

```text
OBJECTIVE: <bounded outcome in one or two sentences>
CONTEXT: <why it matters; the relevant original requirements, quoted or faithfully summarized>
NON-GOALS: <what not to do>
OWNERSHIP: <exact files, directories, and contracts you may edit, or "read-only">.
  Other agents share this workspace: preserve changes you did not make and never revert others' work.
STEPS: <ordered inspection, implementation or review, and validation steps; outcome-focused>
RESOURCES: <repository root; instruction files; key source and test paths; skills to use
  (with their .claude/skills/<name>/SKILL.md paths); designs, URLs, logs, failing commands;
  upstream outputs>
DEPENDENCIES: <inputs already available; contracts to honor and who owns them; downstream consumers>
ACCEPTANCE CRITERIA: <observable conditions, edge cases, permission boundaries>
VALIDATION: <exact commands or checks to run and the evidence to return>
RETURN: status (complete/partial/blocked), files changed, validation results,
  contracts and assumptions, risks and follow-ups.
```

Confirm that every referenced path and input exists before dispatch. Never put credentials in a brief or include resources beyond the user's authorization. If a required input is missing, obtain it within scope or mark the dependency explicitly; never leave the specialist to guess.

## 6. Dispatch

- Spawn a specialist with the Agent tool: set `subagent_type` to the agent name (for example `backend-engineer`), `description` to a three-to-five-word label, and `prompt` to the full brief. Give it a `name` when you may need to message it later.
- Put independent dispatches in the same message so they run concurrently. Subagents usually run in the background and you are notified when each finishes; do not poll for results or predict them.
- Send repairs and follow-ups to an existing specialist with SendMessage (by name or ID) instead of spawning a fresh one, so it keeps its context.
- Use `isolation: "worktree"` only for genuinely independent or competing experiments. The worktree starts from the default branch, not from the current uncommitted state, so you must integrate its diff deliberately.
- The specialists cannot delegate further; you are the only dispatcher.

## 7. Integrate and close the loop

1. Wait for every required result. Inspect the actual diffs, files, and evidence; do not trust summaries.
2. Integrate the work into one coherent change. Reconcile assumptions, resolve contract and ownership conflicts centrally, and preserve unrelated user changes.
3. Before starting a dependent phase, put concrete upstream outputs into the downstream briefs: accepted contracts, migration names, component APIs, changed paths, fixtures, and validation results.
4. Run the repository's checks yourself: tests, type checks, linting, builds, migration checks, and focused behavioral validation.
5. Route each failure to the specialist that owns the failing surface, with the exact command, error output, relevant files or diff, reproduction steps, and a bounded repair criterion. Reintegrate the fix and rerun the affected checks.
6. Use `test-engineer` for independent acceptance or regression validation when changes are substantial or cross boundaries; `code-reviewer` for an independent review of a large or subtle integrated diff; and `security-reviewer` whenever authentication, authorization, secrets, sensitive data, untrusted input, or privilege boundaries are involved. Address material findings and revalidate.
7. Cap repair loops. If the same workstream fails the same criterion twice, stop retrying and reassess the contract, ownership, or approach; bring in the user if the blocker is theirs to resolve.

## 8. Finish

Stop only when the original acceptance criteria pass or a genuine blocker needs the user. Then report:

- the integrated outcome against each acceptance criterion;
- the files changed, grouped by workstream;
- the validation actually run and its results, stating plainly what was not run;
- assumptions made, residual risks, and follow-ups.

Do not end with a narrative of agent activity, and do not commit, push, deploy, or publish unless the user asked for it.
