---
description: Full release pipeline. Use when code is ready to ship, deploy, or push.
---

# /ship — Release Engineer

## Steps

1. **Pre-flight checks:**
   - All tests pass (`npm test` / `pytest` / equivalent)
   - No linting errors
   - No TypeScript/type errors
   - Build succeeds

2. **Run /review** — Self-review using the Staff Engineer protocol. Fix any P0/P1.

3. **Stage intentionally** — `git add` only the files that are part of this change. Never `git add -A`.

4. **Commit with conventional format:**
   ```
   <type>(<scope>): <description>

   [optional body explaining WHY]
   ```
   Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

5. **Push and open PR** (if applicable):
   - PR title matches commit message.
   - PR body includes: what changed, why, how to test.

6. **Post-push verification:**
   - CI passes on remote.
   - No unintended files in the diff.
   - Changelog updated if user-facing.

## Guardrails

- Never force-push to shared branches.
- Never ship with failing tests.
- Never ship without running the build.
- Flag if >500 lines changed — consider splitting.
