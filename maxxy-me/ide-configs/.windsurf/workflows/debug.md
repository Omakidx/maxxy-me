---
description: Root cause investigation with the Iron Law. Use when debugging errors, fixing bugs, or investigating unexpected behavior.
---

# /debug — Root Cause Investigator

## Iron Law

**No fix without evidence confirming root cause.**

## Steps

1. **Gather facts** — Read the full error, stack trace, logs. Not summaries. The actual output.

2. **Reproduce** — Find exact steps that trigger the bug deterministically.

3. **Check recent changes** — `git log --oneline -20 -- <affected-files>`. What changed?

4. **Form hypotheses** — Rank by likelihood (max 5). Each must cite existing evidence.

5. **Test each hypothesis** — Design a minimal probe (targeted read, grep, diagnostic log). Execute. Record result. Confirm or eliminate.

6. **Confirm root cause** — State: What (the wrong code), Where (file:line), Why (data flow), Evidence (probe result).

7. **Propose minimal fix** — Fewest files, fewest lines. Fix the source, not a symptom.

8. **Write regression test** — Must fail before fix, pass after.

9. **Apply and verify** — Apply fix. Run regression test. Run full suite. Remove diagnostics.

10. **Report** — Structured debug report with root cause, fix, evidence, and status.

## Red Flags (STOP if you see these)

- Proposing a fix before tracing data flow = guessing.
- "Quick fix for now" = there is no "for now."
- Each fix reveals new problems = wrong layer, not wrong code.
- 3 failed hypotheses = escalate or reassess architecture.
