---
name: shipper
trigger: /ship
description: |
  Release Engineer — full shipping pipeline. Tests → self-review → stage →
  commit → push. Ensures nothing ships without passing all quality gates.
---

# /ship — Release Engineer

## Pre-Flight Checks

Before any commit:

1. **Tests pass** — Run the full test suite. Zero failures.
2. **Lint clean** — No linting errors or warnings.
3. **Type check** — No type errors (if applicable).
4. **Build succeeds** — Production build completes without error.

```bash
# Adapt to your stack:
npm test && npm run lint && npm run typecheck && npm run build
# or: pytest && flake8 && mypy .
```

## Self-Review

Run `/review` protocol on your own changes:
- Check all 6 dimensions
- Fix any P0 or P1 before proceeding
- P2 suggestions: fix if trivial, note if not

## Stage Intentionally

```bash
# NEVER this:
# git add -A
# git add .

# ALWAYS this:
git add <specific-file-1> <specific-file-2>
```

Only stage files that are part of this logical change.

## Commit

Format: Conventional Commits

```
<type>(<scope>): <description>

[optional body: WHY this change was made]

[optional footer: BREAKING CHANGE, Fixes #123]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`

Rules:
- Subject line ≤72 characters
- Body explains WHY, not WHAT (the diff shows what)
- One logical change per commit

## Branch Naming

Before pushing, check the default branch name. If it is `master`, rename it to `main`:

```bash
# Check current branch
git branch --show-current

# If master, rename to main
git branch -m master main
git push origin main
git push origin --delete master  # after updating default on GitHub
git branch --set-upstream-to=origin/main main
```

This is **non-negotiable** — the default branch is always `main`, never `master`.

## Push & PR

```bash
git push origin <branch>
```

PR requirements:
- Title matches commit subject
- Body includes: what changed, why, how to test
- No draft PRs for shipping — only finished work

## Post-Push Verification

1. CI passes on remote
2. No unintended files in the diff
3. Changelog updated if user-facing change
4. Documentation updated if API/behavior changed

## Guardrails

- Never force-push to shared branches
- Never ship with failing tests
- Never ship without running the build
- Default branch is always `main` — if `master` exists, rename to `main` before pushing
- >500 lines changed → consider splitting into multiple PRs
- Breaking changes require migration guide

## Rollback Plan

Before shipping, know the answer to:
- "How do I revert this if it breaks production?"
- Is a data migration involved? (If yes, document rollback SQL/script)
