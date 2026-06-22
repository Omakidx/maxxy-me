---
name: debugger
trigger: /debug
description: |
  Root Cause Investigator — enforces the Iron Law: no fix without evidence-backed
  root cause analysis. Reproduce → hypothesize → probe → confirm → fix → verify.
---

# /debug — Root Cause Investigator

## The Iron Law

> **No fix shall be applied without evidence confirming the root cause.**

Evidence means:
- A stack trace pointing to the exact failure location
- A failing test isolating the broken behavior
- A minimal reproduction triggering the bug on demand
- A code path trace showing incorrect data flow

## Phase 1: Gather Facts

1. **Read the error** — full message, stack trace, surrounding logs.
2. **Reproduce** — exact steps/input that trigger the bug.
3. **Boundary check** — when did this last work? What changed? (`git log`)

```
BUG REPORT
  Symptom:     <what the user sees>
  Error:       <exact message>
  Reproduced:  yes/no
  Last worked: <commit/date if known>
  Changed:     <recent changes in area>
```

## Phase 2: Hypothesize

Ranked by likelihood (max 5). Every hypothesis cites evidence.

```
HYPOTHESES
  H1: [80%] <description> — evidence: <what points here>
  H2: [15%] <description> — evidence: <what points here>
  H3: [5%]  <description> — evidence: <what points here>
```

## Phase 3: Test Hypotheses

For each, starting with H1:
1. Design a targeted probe (read specific file:line, grep, diagnostic log)
2. Execute and record result
3. Update: CONFIRMED / ELIMINATED / REFINED

**CRITICAL:** Do not fix anything during investigation. Observation only.

## Phase 4: Confirm Root Cause

```
ROOT CAUSE CONFIRMED
  What:     <the specific code/config that is wrong>
  Where:    <file:line>
  Why:      <why this produces wrong behavior>
  Evidence: <the probe result confirming this>
```

If you cannot fill all four fields → go back to Phase 2.

## Phase 5: Minimal Fix

- **Minimal** — change only what's necessary
- **Targeted** — fix root cause, not downstream symptom
- **Reversible** — can be reverted cleanly

## Phase 6: Regression Test

Write a test that:
1. **Fails** before the fix (proves test validity)
2. **Passes** after the fix (proves fix works)

## Phase 7: Apply and Verify

1. Apply fix
2. Run regression test — must pass
3. Run full suite — no new failures
4. Remove diagnostic logs
5. Commit atomically

```
RESOLUTION
  Root cause: <one line>
  Fix:        <one line>
  Test:       <test name> — PASS
  Suite:      <pass/fail>
  Status:     DONE
```

## Escalation Rules

- 3 failed hypotheses → STOP. Reassess architecture.
- Fix touches >5 files → ask about blast radius.
- Cannot reproduce → add instrumentation, wait for next occurrence.

## Anti-Patterns

- **Shotgun debugging** — changing multiple things to see what sticks
- **Symptom fixing** — null check downstream instead of fixing null source
- **Fix-first** — "let me try this and see"
- **Untested fixes** — "works on my machine"
