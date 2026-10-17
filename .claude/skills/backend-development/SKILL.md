---
name: backend-development
description: "Implement or change APIs and server-side domain behavior with explicit contracts, input validation, server-side authorization, idempotency, reliability, observability, and compatibility checks."
---

# Backend Development

## 1. Define the contract

- Inspect service boundaries, handlers, domain modules, auth middleware, error conventions, integrations, tests, and the applicable `CLAUDE.md`/`AGENTS.md` files.
- Before editing, specify the inputs, outputs, validation rules, identity and authorization requirements, idempotency, failure semantics, status codes, and compatibility constraints.

## 2. Implement safely

- Keep transport, domain logic, and persistence separate according to repository conventions.
- Validate untrusted input at the boundary (type, size, format, ranges) and enforce authorization on the server, including object-level checks such as "this user owns this record".
- Make side effects explicit. Use transactions, idempotency keys, retries with backoff, timeouts, or compensation only where the workflow needs them, and bound every external call with a timeout.
- Preserve stable contracts unless a breaking change and its migration path are authorized. Never fold schema changes into server work unless they are assigned to you (then follow the `database-design` skill); otherwise specify the needed change in your report.
- Return structured errors and add logging, metrics, or traces that help diagnosis without exposing secrets or personal data.
- Avoid N+1 queries and unbounded result sets; paginate list endpoints.

## 3. Verify

- Test the domain rules and boundary validation, then the relevant integration paths.
- Include unauthorized, forbidden, invalid, duplicate, timeout, and partial-failure cases where they apply.
- Run the repository's type, lint, test, and build checks.

## Definition of done

- [ ] The contract is written down and implemented, with backward compatibility preserved or the break authorized
- [ ] Input validation and server-side authorization (including object-level) are enforced
- [ ] Failure, retry, and timeout behavior is explicit
- [ ] Tests cover success, invalid, unauthorized, and failure paths; all checks pass
- [ ] The report lists contract changes, operational considerations, and external dependencies
