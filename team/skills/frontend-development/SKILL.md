---
name: frontend-development
description: Implement a bounded frontend feature or component in an existing web application with correct state management, server contracts, accessibility, responsiveness, and focused validation.
display_name: Frontend Development
short_description: Implement bounded frontend features
default_prompt: Use {{skill:frontend-development}} to implement this UI change:
---

# Frontend Development

## 1. Understand the surface

- Inspect the assigned routes and components, the shared design system, the data-fetching and state conventions, the tests, and the applicable {{instruction_files}} files.
- Translate the acceptance criteria into visible states, user actions, data dependencies, and failure behavior.
- Confirm server contracts (request and response shapes, error formats, auth requirements) before coding. If a contract is missing or inconsistent, report it; do not invent an incompatible shape.

## 2. Implement

- Choose the smallest component and state boundaries that fit the existing architecture. Reuse primitives and tokens.
- Derive state instead of duplicating it; keep side effects explicit; handle loading, empty, error, retry, cancellation, and stale-response cases for async work where they apply.
- Use semantic elements and native controls. Support keyboard and touch, visible focus, accessible names and live announcements, responsive layout, text zoom, and reduced motion.
- Guard against injection: never render untrusted HTML without the project's sanitizer.
- Avoid unrelated refactors, and keep shared-file edits within your assigned ownership.

## 3. Verify

- Add focused tests at the lowest useful layer (logic, then component, then E2E only for critical flows).
- Run the relevant type check, lint, component tests, and production build.
- Exercise the main path and the important error and boundary states, in a browser when one is available.

## Definition of done

- [ ] All acceptance-criteria states are implemented, including loading, empty, and error
- [ ] Server contracts are confirmed or mismatches reported
- [ ] Keyboard, focus, accessible names, and responsive layout work
- [ ] Tests cover the new behavior; type, lint, test, and build checks pass
- [ ] The report lists contract assumptions, files owned, checks run, and remaining risk
