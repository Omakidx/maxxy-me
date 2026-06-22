---
name: design
trigger: /design
description: Turn an approved product requirement into an implementation-ready technical design with explicit trade-offs, risks, migration, and verification.
---

# /design — Technical Design

Use this workflow after the scope and requirements are understood. Read the
repository before selecting an architecture; prefer established project patterns
unless evidence justifies a new one.

## Steps

1. **Confirm the input** — Link or summarize the approved PRD, constraints,
   non-goals, scale assumptions, and unresolved questions.
2. **Map the current system** — Identify affected modules, data flow, public
   contracts, dependencies, deployment boundaries, and existing tests.
3. **Compare options** — For each material decision, document at least two
   viable options, their trade-offs, and why one is selected.
4. **Specify the design** — Cover components, interfaces, data model, state
   transitions, validation, authorization, failure behavior, concurrency,
   observability, and performance budgets where applicable.
5. **Plan change safely** — Define compatibility, migration/backfill, feature
   flags, rollout stages, rollback, and cleanup.
6. **Define proof** — List unit, integration, end-to-end, security, performance,
   and operational checks with measurable acceptance criteria.

## Output

```text
TECHNICAL DESIGN: <title>

Context and goals:
Non-goals:
Current-system impact:
Proposed architecture:
Interfaces and data model:
Security and privacy:
Failure handling and observability:
Migration, rollout, and rollback:
Alternatives considered:
Verification plan:
Open questions:
```

Present the design for approval before implementation or ticket decomposition.
