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

## Phase 3: OWASP Top 10 Scan

- **A01: Broken Access Control** — Missing authz checks, IDOR, path traversal
- **A02: Cryptographic Failures** — Weak algorithms, plaintext secrets, missing encryption
- **A03: Injection** — SQL, NoSQL, OS command, LDAP, XSS
- **A04: Insecure Design** — Missing threat model, no defense in depth
- **A05: Misconfiguration** — Default credentials, verbose errors, unnecessary features
- **A06: Vulnerable Components** — Known CVEs in dependencies
- **A07: Auth Failures** — Weak passwords, missing MFA, session fixation
- **A08: Data Integrity** — Unsigned updates, CI/CD compromise, deserialization
- **A09: Logging Failures** — Missing audit trail, no alerting
- **A10: SSRF** — Unvalidated URLs, internal network access

## Phase 4: Secret Scan

```bash
# Patterns to grep for
grep -rn "sk_\|ghp_\|api_key\|secret\|password\|token" --include="*.{ts,js,py,env,yaml,json}"
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
