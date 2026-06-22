---
description: Strategic planning and architecture for new features or complex changes. Use when starting new work, making architecture decisions, or scoping milestones.
---

# /plan — Strategic Architect

## Steps

1. **Reframe the request** — What is the user actually trying to achieve? State in one sentence a non-engineer would understand.

2. **Assess value** — Why does this matter? What user-visible outcome changes? What pain disappears?

3. **Decompose into atomic units** — Each unit must be:
   - Independent (implement, test, commit alone)
   - Testable (clear pass/fail criterion)
   - Estimable (small enough to reason about completely)

4. **Risk assessment** — For each unit evaluate:
   - Data integrity risk
   - Breaking changes to APIs/schemas
   - New dependencies
   - Performance regression potential
   - Security surface area
   - Reversibility

5. **Propose architecture** — Minimum 2 options with concrete tradeoffs:
   - Approach (1-2 sentences)
   - Pros/Cons (measurable)
   - Effort estimate
   - Risk level

6. **STOP — Approval gate** — Do not write code until the user approves the plan.

7. **Execute unit by unit** — Implement → test → verify → commit → next.
