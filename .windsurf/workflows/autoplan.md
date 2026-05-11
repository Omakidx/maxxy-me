---
description: Deep autonomous planning for complex features, migrations, or multi-milestone work. Use when a request spans multiple files, services, or requires architectural decisions. Produces a full execution blueprint without user intervention at each micro-step.
---

# /autoplan — Deep Autonomous Planner

## When to Use

- Feature spans 5+ files or 3+ modules
- Architectural decision required (new service, schema change, API redesign)
- Multi-milestone work (>1 day of implementation)
- Migration or refactor with blast radius concerns
- User says "plan this fully" or "figure out the approach"

## Phase 1: Intelligence Gathering (Silent — No Questions Yet)

Autonomously collect all context before forming opinions:

1. **Read the codebase topology:**
   - Project structure (directories, entry points, config files)
   - Package manifest (dependencies, versions, scripts)
   - Existing tests (coverage, patterns, frameworks)
   - CI/CD config (pipelines, deploy targets)

2. **Map the domain:**
   - Identify all modules/services touched by the request
   - Trace data flow from input → processing → output → storage
   - Identify shared interfaces, contracts, and type definitions
   - Note coupling points between modules

3. **Check constraints:**
   - Read all `.windsurf/rules/*.md` for active governance
   - Check for migration files, schema versions, API contracts
   - Identify feature flags, environment-specific behavior
   - Note existing tech debt in the affected area

4. **Scan history:**
   - `git log --oneline -30 -- <affected-paths>` — recent changes
   - Check for related TODOs, FIXMEs, or known issues
   - Look for prior failed attempts at similar work

## Phase 2: Deep Decomposition

Break the request into a **Directed Acyclic Graph (DAG)** of work units:

```
AUTOPLAN: <one-line objective>
══════════════════════════════════════════════════════════════

DEPENDENCY GRAPH:
  [M1] ─→ [M2] ─→ [M4]
            ↘
  [M3] ─────→ [M5]

MILESTONES:
┌─────────────────────────────────────────────────────────┐
│ M1: <name>                                              │
│   Objective: <what this achieves>                       │
│   Files: <list of files created/modified>               │
│   Dependencies: none (root)                             │
│   Risk: low/med/high                                    │
│   Verification: <how to prove this works>               │
│   Estimated scope: <S/M/L>                              │
├─────────────────────────────────────────────────────────┤
│ M2: <name>                                              │
│   Objective: <what this achieves>                       │
│   Files: <list>                                         │
│   Dependencies: M1                                      │
│   Risk: low/med/high                                    │
│   Verification: <test or check>                         │
│   Estimated scope: <S/M/L>                              │
├─────────────────────────────────────────────────────────┤
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

Rules for decomposition:
- Each milestone is independently testable
- Each milestone is independently committable
- No milestone modifies >5 files (split if bigger)
- Critical path identified (longest dependency chain)
- Parallelizable milestones noted

## Phase 3: Risk Matrix

For each milestone, evaluate:

```
RISK MATRIX:
┌────────┬───────────┬────────────┬──────────┬────────────┬──────────────┐
│ ID     │ Data Risk │ Breaking   │ Security │ Perf Risk  │ Reversible?  │
├────────┼───────────┼────────────┼──────────┼────────────┼──────────────┤
│ M1     │ none      │ no         │ no       │ none       │ yes          │
│ M2     │ schema    │ API change │ no       │ N+1 risk   │ with rollback│
│ M3     │ none      │ no         │ auth     │ none       │ yes          │
└────────┴───────────┴────────────┴──────────┴────────────┴──────────────┘

HIGH RISK ITEMS (require explicit approval):
  • M2: Schema migration — needs rollback script
  • M3: Auth boundary — triggers /security audit
```

## Phase 4: Architecture Decision Records (ADRs)

For every non-trivial technical choice, produce an ADR:

```
ADR-1: <Decision Title>
  Context: <Why this decision is needed>
  Options:
    A) <approach> — Pros: <x> | Cons: <y>
    B) <approach> — Pros: <x> | Cons: <y>
  Decision: <chosen option>
  Rationale: <why this over alternatives>
  Consequences: <what this locks in or trades away>
```

## Phase 5: Execution Blueprint

Produce the final executable plan:

```
EXECUTION BLUEPRINT
══════════════════════════════════════════════════════════════

OBJECTIVE: <one sentence>
TOTAL MILESTONES: <N>
CRITICAL PATH: M1 → M2 → M4 (longest chain)
ESTIMATED TOTAL SCOPE: <S/M/L/XL>

EXECUTION ORDER:
  ┌─ Phase 1 (foundation) ──────────────────────────────┐
  │  [1] M1: <name>                                     │
  │      DO: <specific implementation steps>            │
  │      TEST: <verification command or criteria>       │
  │      COMMIT: <conventional commit message>          │
  └─────────────────────────────────────────────────────┘
  ┌─ Phase 2 (parallel-safe) ───────────────────────────┐
  │  [2a] M2: <name>        │  [2b] M3: <name>         │
  │      DO: <steps>        │      DO: <steps>          │
  │      TEST: <verify>     │      TEST: <verify>       │
  │      COMMIT: <msg>      │      COMMIT: <msg>        │
  └─────────────────────────┴───────────────────────────┘
  ┌─ Phase 3 (integration) ─────────────────────────────┐
  │  [3] M4: <name>                                     │
  │      DO: <steps>                                    │
  │      TEST: <full integration test>                  │
  │      COMMIT: <msg>                                  │
  └─────────────────────────────────────────────────────┘

PRE-FLIGHT CHECKLIST:
  [ ] All ADRs documented
  [ ] High-risk items flagged
  [ ] Rollback plan for schema changes
  [ ] No circular dependencies introduced
  [ ] Security audit triggered for auth changes

POST-COMPLETION:
  [ ] Full test suite passes
  [ ] No lint errors
  [ ] Build succeeds
  [ ] Self-review (/review) passes
  [ ] Ready for /ship
```

## Phase 6: Approval Gate

**STOP.** Present the full blueprint to the user. Do NOT begin implementation until approval.

Present as:
```
AUTOPLAN READY — Awaiting approval

Summary: <1 sentence>
Milestones: <N> across <P> phases
Critical risk: <highest risk item, if any>
Estimated scope: <S/M/L/XL>

Approve? (yes / modify / reject)
```

## Phase 7: Autonomous Execution

Once approved, execute the blueprint:

1. For each milestone in dependency order:
   - Implement the specified changes
   - Run the specified verification
   - If verification fails → stop, diagnose, report
   - If passes → commit with the pre-defined message
   - Mark milestone complete

2. Between phases:
   - Run full test suite
   - Report progress: `[Phase N complete: M of N milestones done]`

3. On completion:
   - Run `/review` self-check
   - Report final status with evidence

## Guardrails

- Never skip the approval gate (Phase 6)
- If a milestone takes >3 attempts → STOP and report
- If implementation deviates from blueprint → flag and ask
- High-risk milestones require individual confirmation
- Schema/migration milestones produce rollback scripts
- Auth/security milestones trigger `/security` audit automatically

## Adaptation Rules

- If the request is small (<3 files, no architecture) → downgrade to `/plan`
- If blocking uncertainty surfaces mid-execution → pause, present options, wait
- If scope grows beyond blueprint → stop, re-plan the delta, get approval
- Blueprint survives context loss — if session breaks, re-read the plan and continue
