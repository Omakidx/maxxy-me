---
name: security-auditor
trigger: /security
description: |
  Security Auditor — OWASP Top 10 + STRIDE methodology. Full attack surface
  analysis, secret scanning, dependency audit, and remediation report.
---

# /security — Security Auditor

## Methodology

Two frameworks applied in sequence:
1. **STRIDE** — per-component threat modeling
2. **OWASP Top 10** — vulnerability classification

## Phase 1: Attack Surface Identification

Map all:
- External inputs (user forms, API payloads, file uploads, webhooks)
- Authentication boundaries (login, session, token refresh)
- Authorization points (role checks, resource ownership)
- Data flows (user → API → DB → response)
- Third-party integrations (OAuth, payment, email)

## Phase 2: STRIDE Analysis

For each component:

| Threat | Question | Check |
|--------|----------|-------|
| **Spoofing** | Can identity be faked? | Auth mechanism strength |
| **Tampering** | Can data be modified in transit? | Integrity checks, HTTPS |
| **Repudiation** | Can actions be denied? | Audit logging |
| **Info Disclosure** | Can data leak? | Error messages, logs, responses |
| **DoS** | Can service be overwhelmed? | Rate limiting, input bounds |
| **Elevation** | Can permissions be escalated? | RBAC enforcement |

## Phase 3: OWASP Top 10:2025 Scan

Use the [current OWASP Top 10:2025 taxonomy](https://owasp.org/Top10/2025/):

- **A01: Broken Access Control** — Missing authz checks, IDOR, path traversal
- **A02: Security Misconfiguration** — Defaults, verbose errors, exposed services
- **A03: Software Supply Chain Failures** — Vulnerable or untrusted dependencies and build inputs
- **A04: Cryptographic Failures** — Weak algorithms, plaintext secrets, missing encryption
- **A05: Injection** — SQL, NoSQL, OS command, LDAP, XSS
- **A06: Insecure Design** — Missing threat model, abuse-case controls, or defense in depth
- **A07: Authentication Failures** — Weak credentials, missing MFA, session fixation
- **A08: Software or Data Integrity Failures** — Unsigned updates, CI/CD compromise, unsafe deserialization
- **A09: Security Logging and Alerting Failures** — Missing audit trails, detection, or alerting
- **A10: Mishandling of Exceptional Conditions** — Fail-open logic, improper error handling, resource exhaustion

## Phase 4: Secret Scan

```bash
# Quick heuristic (use a dedicated scanner such as Gitleaks for the real audit)
rg -n -i --hidden -g '*.{ts,tsx,js,jsx,py,env,yaml,yml,json}' \
  -g '!*.lock' -g '!node_modules/**' \
  '(api[_-]?key|client[_-]?secret|private[_-]?key|password|access[_-]?token)'
```

Check for:
- Hardcoded credentials
- API keys in source
- Private keys committed
- `.env` files tracked in git

## Phase 5: Dependency Audit

- Run `npm audit` / `pip audit` / equivalent
- Check for known CVEs
- Flag end-of-life dependencies
- Note pinning strategy (exact vs range)

## Phase 6: Report

```
SECURITY AUDIT REPORT
═══════════════════════════════

CRITICAL:
  [file:line] <finding> — <impact> — <remediation>

HIGH:
  [file:line] <finding> — <impact> — <remediation>

MEDIUM:
  [file:line] <finding> — <impact> — <remediation>

LOW:
  [file:line] <finding> — <impact> — <remediation>

SUMMARY: CRITICAL=<n> HIGH=<n> MEDIUM=<n> LOW=<n>
VERDICT: PASS / FAIL
REMEDIATION PRIORITY: <ordered list of fixes>
```

## Verdict

- **FAIL** — Any CRITICAL or HIGH finding. Must remediate before deploy.
- **PASS** — No CRITICAL/HIGH. MEDIUM/LOW are advisories.
