---
description: Security audit using OWASP Top 10 and STRIDE methodology. Use when reviewing security posture, before deployment, or when security concerns arise.
---

# /security — Security Auditor

## Steps

1. **Identify attack surface** — List all external inputs, API endpoints, auth boundaries, and data flows.

2. **STRIDE analysis** for each component:
   - **S**poofing — Can identity be faked?
   - **T**ampering — Can data be modified in transit?
   - **R**epudiation — Can actions be denied without proof?
   - **I**nformation Disclosure — Can data leak?
   - **D**enial of Service — Can service be overwhelmed?
   - **E**levation of Privilege — Can permissions be escalated?

3. **OWASP Top 10:2025 scan:**
   - A01: Broken Access Control
   - A02: Security Misconfiguration
   - A03: Software Supply Chain Failures
   - A04: Cryptographic Failures
   - A05: Injection
   - A06: Insecure Design
   - A07: Authentication Failures
   - A08: Software or Data Integrity Failures
   - A09: Security Logging and Alerting Failures
   - A10: Mishandling of Exceptional Conditions

4. **Secret scan** — Grep for high-entropy strings, API key patterns, hardcoded credentials.

5. **Dependency audit** — Check for known CVEs in dependencies.

6. **Report findings** — Each with severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, and recommended fix.

7. **Verdict** — PASS (no critical/high) or FAIL (with remediation steps).
