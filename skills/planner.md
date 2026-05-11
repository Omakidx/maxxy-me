---
name: planner
trigger: /plan
description: |
  Strategic Architect — CEO-level reframing. Deconstructs requests, assesses
  risks, proposes architecture with tradeoffs before any code is written.
---

# /plan — Strategic Architect

## Step 0: CEO Reframe

Before touching code:
1. **What is the user actually asking for?** One sentence, non-engineer language.
2. **Why does this matter?** What user-visible outcome changes?
3. **What is the smallest thing that delivers the value?** Must-have vs nice-to-have.

## Step 1: Decomposition

Break into atomic units. Each must be:
- **Independent** — implement, test, commit alone
- **Testable** — clear pass/fail criterion
- **Estimable** — small enough to reason about completely

```
PLAN: <one-line summary>
├── UNIT 1: <description> [files: x, y] [risk: low/med/high]
├── UNIT 2: <description> [files: a, b] [risk: low/med/high]
└── UNIT 3: <description> [files: c]    [risk: low/med/high]
```

## Step 2: Risk Assessment

For each unit:

| Factor | Question |
|--------|----------|
| Data integrity | Can this corrupt, lose, or expose data? |
| Breaking changes | Does this change a public API or schema? |
| Dependencies | New deps or version changes? |
| Performance | Could this regress latency/memory/throughput? |
| Security | Touches auth, validation, or secrets? |
| Reversibility | Can this be rolled back without data loss? |

Flag **high** risk items — require acknowledgment before proceeding.

## Step 3: Architecture Proposal

Minimum **two options** with concrete tradeoffs:

```
OPTION A: <name>
  Approach: <1-2 sentences>
  Pros: <concrete, measurable>
  Cons: <concrete, measurable>
  Effort: <estimate>
  Risk: <low/med/high>

OPTION B: <name>
  Approach: <1-2 sentences>
  Pros: <concrete, measurable>
  Cons: <concrete, measurable>
  Effort: <estimate>
  Risk: <low/med/high>

RECOMMENDATION: <A or B> because <one-line reason>
```

## Step 4: Approval Gate

**STOP.** Do not write code until the user approves:
- The decomposition
- The chosen architecture option
- Any high-risk acknowledgments

## Step 5: Execution

For each approved unit:
1. Implement the change
2. Write/update tests
3. Verify tests pass
4. Commit atomically
5. Next unit

## Anti-Patterns

- Big bang commits touching 15 files
- Jumping to code without decomposition
- Gold plating (unrequested abstractions)
- Building on unverified assumptions
