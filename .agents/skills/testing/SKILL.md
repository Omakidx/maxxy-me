---
name: testing
description: Convert acceptance criteria or a reported defect into deterministic unit, integration, and E2E coverage with isolated fixtures and evidence-backed results.
---

# Testing

## Build the verification matrix

Inspect acceptance criteria, changed surfaces, existing test structure, commands, fixtures, and CI constraints. List the behaviors and risks to prove, then choose the lowest test layer that observes each one. Reserve E2E tests for critical cross-boundary flows that lower layers cannot establish.

For a defect, reproduce it deterministically before asserting the fix when possible. Separate environment or fixture failures from product failures.

## Implement reliable tests

Follow repository conventions. Keep fixtures minimal, isolated, deterministic, and safe in parallel. Control time, randomness, network calls, and external services. Assert observable outcomes and contracts rather than internal implementation details. Cover meaningful negative and boundary cases without multiplying low-value variations.

## Run and report

Run the narrow suite first, then broader regression checks proportionate to the change. Record exact failures, flaky behavior, environment dependencies, and untested risk. Do not weaken assertions or modify production behavior solely to obtain a pass. Route product failures to the owning implementation specialist with reproducible evidence.
