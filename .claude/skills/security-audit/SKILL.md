---
name: security-audit
description: "Perform an authorized, read-only security assessment of a design, diff, or subsystem using a threat model, concrete code-path evidence, prioritized findings, and verifiable remediation."
---

# Security Audit

## 1. Scope and threat model

- Confirm the authorized repository surface and the review target (a design, a diff, a branch, or a subsystem).
- Identify the assets, actors, trust boundaries, entry points, privileges, sensitive data, and plausible abuse cases. Read the applicable `CLAUDE.md`/`AGENTS.md` files and any existing security conventions.

## 2. Trace the controls

Follow data and privilege flow through concrete code paths, and review what is relevant:

- **Identity:** authentication, session lifetime and fixation, token validation, password and reset flows, MFA.
- **Access:** authorization at every entry point, object-level checks (IDOR), tenant isolation, admin paths.
- **Input:** SQL, NoSQL, command, template, and prompt injection; unsafe deserialization; XSS; SSRF; open redirects; path traversal and uploads.
- **Secrets and data:** hard-coded secrets, secrets in logs or errors, sensitive-data exposure, cryptographic misuse.
- **Supply chain and operations:** vulnerable or unpinned dependencies, CI workflow privileges, container and deployment configuration.

Distinguish confirmed vulnerabilities from defense-in-depth suggestions and from hypotheses that need runtime evidence.

## 3. Boundaries

Stay read-only. Never expose secrets, run destructive proofs, exploit live systems, access external systems outside the scope, or modify the reviewed implementation.

## 4. Report and verify

For each finding, give the affected location, preconditions, the exploit path, impact, confidence, severity, the minimal remediation, and a focused regression check. Order findings by real exploitability and impact. If nothing material is found, state the surfaces reviewed and the residual risk. Re-review repaired paths and their tests before closing a finding.

## Definition of done

- [ ] The threat model covers assets, actors, boundaries, and entry points
- [ ] Every finding traces to concrete code or configuration, with its severity and confidence
- [ ] Each finding has a minimal remediation and a regression check
- [ ] Reviewed surfaces and residual risk are stated, including when there are no findings
