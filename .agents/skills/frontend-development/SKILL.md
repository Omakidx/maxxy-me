---
name: frontend-development
description: Implement a bounded frontend feature or component in an existing web application with correct state, contracts, accessibility, responsiveness, and focused validation.
---

# Frontend Development

## Understand the surface

Inspect the assigned route/components, shared design system, data-fetching and state conventions, tests, and applicable `AGENTS.md` instructions. Translate acceptance criteria into visible states, user actions, data dependencies, and failure behavior. Confirm server contracts before coding; do not invent incompatible response shapes.

## Implement

Choose the smallest component and state boundaries that fit existing architecture. Reuse primitives and tokens. Keep state derived where possible, side effects explicit, and async work resilient to loading, empty, retry, cancellation, and stale-response cases as relevant.

Use semantic elements and native controls. Support keyboard and touch, visible focus, accessible names and announcements, responsive layout, text zoom, and reduced motion. Avoid unrelated refactors and keep shared-file edits within assigned ownership.

## Verify

Add focused tests at the lowest useful layer. Run relevant type checks, linting, component tests, and production build. Verify the main path plus important error and boundary states. Report contract assumptions, files owned, checks run, and remaining risk.
