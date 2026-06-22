---
trigger: always
---

# Security & Compliance Protocol

Security is non-negotiable. Never optimize for speed at the expense of these constraints.

## Zero-Trust Policy

- **External Inputs** — All data from APIs, DBs, users, or filesystems is malicious until validated.
- **Least Privilege** — Minimum permissions required. No `sudo`/`root`/`admin` unless documented.
- **Internal Isolation** — Components access only their own data. Small blast radius.

## Secret Management (Hard Rules)

- **Zero Leakage** — Never hardcode API keys, passwords, tokens, or private IDs.
- **`.env` Protection** — Ensure `.env` in `.gitignore`. Secret in tracked file = immediate action.
- **Pre-commit Scanning** — Scan diffs for high-entropy strings (`sk_`, `ghp_`, long hex/base64).

## Input & Output Sanitization

- **SQL Injection** — Parameterized queries or ORM only. String concatenation = BLOCKER.
- **XSS** — All user content escaped before rendering.
- **Command Injection** — Never pass raw user input to shell commands.
- **Dependency Security** — Check for CVEs (`npm audit`, `snyk`). Pin specific versions.

## Authentication & Authorization

- **Auth-First** — Every protected endpoint checks auth at the top of the function.
- **RBAC** — Check specific permissions, not just "logged in" status.
- **Session Safety** — Secure, HTTP-only, SameSite cookies. Short TTL JWTs.

## Agent-Specific Guardrails

1. **Forbidden** — `rm -rf /`, `chmod 777`, disabling firewalls/security logging.
2. **PII Masking** — Redact emails, names, phones, cards when logging.
3. **Audit Trail** — Security changes use `SEC:` commit prefix.

## Incident Response

If a pre-existing vulnerability is detected:
1. Do not fix quietly.
2. Flag immediately with severity assessment.
3. Document the vulnerability and suggest a patch.
