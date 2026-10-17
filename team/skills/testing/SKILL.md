---
name: testing
description: Turn acceptance criteria or a reported defect into deterministic unit, integration, and E2E coverage with isolated fixtures, a verification matrix, and evidence-backed results.
display_name: Testing
short_description: Build deterministic tests and verification evidence
default_prompt: Use {{skill:testing}} to verify this change with focused, deterministic tests:
---

# Testing

## 1. Build the verification matrix

- Inspect the acceptance criteria, the changed surfaces, the existing test structure and commands, fixtures, and CI constraints.
- List each behavior and risk to prove, then choose the lowest layer that can observe it: unit tests for logic, integration tests for boundaries (database, HTTP, queues), and E2E only for critical user flows that lower layers cannot establish.
- For a defect, first reproduce it deterministically with a failing test. Keep environment or fixture failures separate from product failures.

## 2. Write reliable tests

- Follow the repository's conventions for location, naming, and helpers.
- Keep fixtures minimal, isolated, deterministic, and safe to run in parallel. Control time, randomness, network calls, and external services with the project's fakes or mocks.
- Assert observable outcomes and contracts, not implementation details. Cover meaningful negative and boundary cases (empty, maximum, invalid, unauthorized, concurrent) without multiplying low-value variations.
- Name each test after the behavior it proves, so a failure explains itself.

## 3. Run and report

- Run the narrow suite first, then broader regression checks proportional to the change.
- Rerun failures to distinguish flaky behavior from real defects; report flakiness with the conditions that trigger it.
- Never weaken assertions, add skips, or change production behavior just to get a pass. Report product failures with a reproducible command and its output so their owner (or the manager) can fix them.

## Definition of done

- [ ] Every acceptance criterion maps to at least one test or an explicit, justified manual check
- [ ] Defects have a deterministic reproduction that failed before the fix and passes after
- [ ] Tests are isolated and deterministic and follow repository conventions
- [ ] The exact commands and results are reported, with untested risk stated
