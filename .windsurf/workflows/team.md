---
description: Simulate a full engineering team by chaining specialist roles in sequence or parallel. Use for end-to-end feature delivery, from product scoping through deployment.
---

# /team — Team Pipeline

## Overview

Chain multiple specialist roles to simulate a full engineering team working on a
feature. Each role contributes its expertise in sequence, with handoff documents
between stages.

## Invocation

```
/team <feature description>
```

Or specify roles explicitly:

```
/team ceo,cto,frontend-dev,qa-engineer — Build a user dashboard
```

## Default Pipeline

If no roles specified, the full pipeline runs:

```
┌─────────────────────────────────────────────────────────┐
│  Stage 1: SCOPE                                         │
│  Role: /ceo                                             │
│  Output: CEO Brief (objective, must-haves, cuts, metric)│
│  Gate: User approves scope                              │
├─────────────────────────────────────────────────────────┤
│  Stage 2: ARCHITECT                                     │
│  Role: /cto                                             │
│  Output: Architecture Brief (design, trade-offs, ADRs)  │
│  Gate: User approves architecture                       │
├─────────────────────────────────────────────────────────┤
│  Stage 3: PLAN                                          │
│  Role: /tech-lead                                       │
│  Output: Implementation plan (milestones, assignments)  │
│  Gate: User approves plan                               │
├──────────────────────┬──────────────────────────────────┤
│  Stage 4a: BUILD UI  │  Stage 4b: BUILD API             │
│  Role: /frontend-dev │  Role: /backend-dev              │
│  (parallel-safe)     │  (parallel-safe)                 │
│  Output: Components  │  Output: Endpoints + models      │
├──────────────────────┴──────────────────────────────────┤
│  Stage 5: TEST                                          │
│  Role: /qa-engineer                                     │
│  Output: Test plan + tests written                      │
├─────────────────────────────────────────────────────────┤
│  Stage 6: SECURITY                                      │
│  Role: /security-engineer                               │
│  Output: Security assessment                            │
│  Gate: No CRITICAL/HIGH findings                        │
├─────────────────────────────────────────────────────────┤
│  Stage 7: SHIP                                          │
│  Role: /devops                                          │
│  Output: Deployed, verified                             │
└─────────────────────────────────────────────────────────┘
```

## Handoff Protocol

Each stage produces a **handoff document** that the next stage consumes:

```
HANDOFF: Stage N → Stage N+1
═══════════════════════════════

From:       <role name>
To:         <next role name>
Status:     COMPLETE / COMPLETE_WITH_CONCERNS

Deliverables:
  • <what was produced>
  • <files created/modified>

Decisions Made:
  • <key decision> — <rationale>

Concerns for Next Stage:
  • <issue the next role should address>

Context:
  <anything the next role needs to know>
```

## Parallel Stages

Stages marked `parallel-safe` can run simultaneously in IDEs that support it:

**Windsurf Flows:**
- Agent 1: `/frontend-dev` builds UI components
- Agent 2: `/backend-dev` builds API endpoints
- Both share the architecture brief from Stage 2

**Cursor Background Agents:**
- Background Agent A: frontend implementation
- Background Agent B: backend implementation
- Both follow the same rules and guardrails

## Custom Pipelines

Specify only the roles you need:

```
/team ceo,frontend-dev — Quick UI feature (skip architecture)
/team cto,backend-dev,dba — Database-heavy backend work
/team qa-engineer,security-engineer — Audit-only pipeline
/team figma-expert,frontend-dev — Design-to-code pipeline
```

## Stage Gates

Between stages, the pipeline checks:
1. **Previous stage completed** — deliverables produced
2. **No blockers** — concerns from previous stage addressed or acknowledged
3. **User approval** — for Stages 1, 2, 3 (scope, architecture, plan)

If a stage reports BLOCKED:
- Pipeline pauses
- User is notified with the blocker
- Pipeline resumes after resolution

## Progress Tracking

```
TEAM PIPELINE: <feature>
═══════════════════════════════════

[✅] Stage 1: SCOPE (/ceo) — approved
[✅] Stage 2: ARCHITECT (/cto) — approved
[🔄] Stage 3: PLAN (/tech-lead) — in progress
[ ] Stage 4a: BUILD UI (/frontend-dev)
[ ] Stage 4b: BUILD API (/backend-dev)
[ ] Stage 5: TEST (/qa-engineer)
[ ] Stage 6: SECURITY (/security-engineer)
[ ] Stage 7: SHIP (/devops)

Current: Tech Lead planning implementation milestones
```

## Guardrails

- Every stage follows the Maxxy-Agent core laws (investigate first, atomic commits, etc.)
- No stage can override security constraints
- Parallel stages must not modify the same files
- Each stage produces a handoff document
- Pipeline can be paused, resumed, or cancelled at any gate
