---
name: ticket
trigger: /ticket
description: Decompose an approved technical design into ordered, independently verifiable work items with dependencies and acceptance criteria.
---

# /ticket — Work Decomposer

## Steps

1. Read the approved design and identify its dependency graph.
2. Split work at independently testable and reviewable boundaries.
3. Put contracts, migrations, and enabling work before their consumers.
4. Mark tasks that can run in parallel and tasks touching shared files.
5. Include integration, documentation, observability, rollout, and cleanup work;
   do not hide those concerns inside a generic final ticket.
6. Verify that completing all tickets satisfies every design acceptance criterion.

## Ticket Format

```text
TICKET <ID>: <outcome-oriented title>

Objective:       <observable outcome>
Scope:           <included work>
Out of scope:    <explicit exclusions>
Dependencies:    <ticket IDs or none>
Likely files:    <paths/modules, when known>
Implementation:  <specific guidance without prescribing guesses>
Acceptance:      <testable Given/When/Then or measurable criteria>
Verification:    <commands/checks>
Risk/Rollback:   <failure risk and reversal path>
```

Keep tickets small enough to review coherently, but do not split a single
invariant across tickets merely to meet an arbitrary file or line count.
