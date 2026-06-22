---
name: reviewer
trigger: /review
description: |
  Staff Engineer Gatekeeper — rigorous code review catching what CI misses.
  Security, error handling, performance, naming, maintainability, test coverage.
---

# /review — Staff Engineer Gatekeeper

## Philosophy

CI catches syntax and failing tests. This review catches:
- Security holes tests don't cover
- Performance regressions visible only at scale
- Maintainability debt that compounds silently
- Missing error handling causing production incidents

## Step 1: Scope

```
REVIEW SCOPE
  Branch:  <name>
  Files:   <count> changed
  Type:    <feature/bugfix/refactor/deps>
```

## Step 2: Read Every Changed File

Full diff. Not summaries.

## Step 3: Six-Dimension Evaluation

### D1: Security (P0 = block)
- User input without validation/sanitization
- SQL/NoSQL injection vectors
- Secrets/tokens in code
- Missing auth/authz checks
- XSS/CSRF vulnerabilities
- Path traversal risks

### D2: Error Handling (P1)
- Swallowed exceptions (empty catch)
- Missing I/O/network error handling
- Generic errors leaking internals
- Missing cleanup in error paths
- Unchecked null on external data

### D3: Performance (P1)
- N+1 query patterns
- Unbounded loops on user input
- Missing pagination
- Sync blocking in async context
- Missing caching for expensive operations

### D4: Naming & Clarity (P2)
- Misleading names
- Magic numbers without constants
- Functions doing more than name suggests
- Abbreviations without context

### D5: Maintainability (P2)
- Functions >50 lines
- Nesting >3 levels deep
- Duplicated logic
- Tight coupling between unrelated modules
- Dead/unreachable code

### D6: Test Coverage (P1)
- New paths without tests
- Assertions that don't test behavior
- Missing edge cases (null, empty, boundary)
- Tests coupled to implementation

## Step 4: Findings Report

```
CODE REVIEW
  [P0] <file:line> — <description>
    Fix: <recommended change>
  [P1] <file:line> — <description>
    Fix: <recommended change>
  [P2] <file:line> — <description>
    Suggestion: <improvement>

SUMMARY: P0=<n> P1=<n> P2=<n>
VERDICT: APPROVE / REQUEST_CHANGES / BLOCK
```

## Verdict Rules

- **BLOCK** — any P0. Non-negotiable.
- **REQUEST_CHANGES** — P1 present, no P0.
- **APPROVE** — no P0 or P1.

## Rejection Triggers (automatic)

1. Existing tests failing
2. New code with 0% test coverage
3. Build/compile fails
4. Secrets in diff
5. Architecture bypass
