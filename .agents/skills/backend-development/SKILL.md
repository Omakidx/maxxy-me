---
name: backend-development
description: Implement or change APIs and server-side domain behavior with explicit contracts, validation, authorization, reliability, observability, and compatibility checks.
---

# Backend Development

## Define the contract

Inspect service boundaries, handlers, domain modules, auth middleware, error conventions, integrations, tests, and applicable `AGENTS.md` instructions. Specify inputs, outputs, validation, identity and authorization requirements, idempotency, failure semantics, and compatibility constraints before editing.

## Implement safely

Keep transport, domain logic, and persistence responsibilities separated according to repository conventions. Validate untrusted input at the boundary and enforce authorization server-side. Make side effects explicit; use transactions, idempotency keys, retries, timeouts, or compensation only when the workflow requires them.

Preserve stable contracts unless a breaking change and migration path are authorized. Do not embed schema changes in server work without coordinating the database workflow. Add structured errors and observability that aid diagnosis without exposing secrets or sensitive data.

## Verify

Test domain rules and boundary validation, then relevant integration paths. Include unauthorized, invalid, duplicate, timeout, and partial-failure cases when applicable. Run repository type, lint, test, and build checks. Report contract changes, operational considerations, and remaining external dependencies.
