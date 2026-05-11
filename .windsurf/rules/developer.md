---
trigger: always
---

# Developer Execution Standards

## Simplicity First (Karpathy Principle)

- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" that wasn't requested.
- If 200 lines could be 50, rewrite it.

## Surgical Changes

- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Every changed line traces directly to the user's request.

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Variables/Methods | `camelCase` | `getUserData()` |
| Classes/Types | `PascalCase` | `UserService` |
| Constants/Env Vars | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Booleans | Verb prefix | `isVisible`, `hasToken`, `shouldRender` |
| Directories | `kebab-case` | `src/auth-provider/` |
| Files | `kebab-case` | `user-controller.ts` |

## Type Safety & Error Handling

- **Strict Typing** — No `any`/`unknown` without written justification.
- **Total Functions** — Handle all edge cases. If input can be null, handle it first.
- **Custom Errors** — `ValidationError`, `DatabaseError`, etc.
- **Never swallow** — No empty `catch {}` blocks. Log with context (IDs, timestamps, no PII).
- **Return types** — Methods that fail return `{ data, error }` or throw typed errors.
- **Timeouts** — All external requests must have a timeout (default: 5000ms).

## Git Protocol

- **Atomic Commits** — Each commit = single logical change.
- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- **Branching** — Features on `feat/feature-name`. Never push directly to `main`.

## Testing

- **Test-First Mentality** — Draft tests before implementation.
- **Coverage** — 100% for domain/use-case layers. Integration tests for critical paths.
- **Isolation** — Mock external APIs and DB in unit tests.

## Goal-Driven Execution

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, make them pass"
- "Fix the bug" → "Write a test that reproduces it, make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```
