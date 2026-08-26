---
name: security-review
description: Perform an authorized, read-only security review of a design or code change using threat modeling, concrete code-path evidence, prioritized findings, and verifiable remediation.
---

# Security Review

## Scope and threat model

Confirm the authorized repository surface and review target. Identify assets, actors, trust boundaries, entry points, privileges, sensitive data, and plausible abuse cases. Inspect applicable `AGENTS.md` instructions and security conventions.

## Trace controls

Review relevant authentication, authorization, sessions, secrets, input validation, injection surfaces, serialization, SSRF, redirects, uploads and file paths, cryptography, logging, data exposure, dependency boundaries, and deployment configuration. Follow data and privilege flow through concrete code paths. Distinguish confirmed vulnerabilities from defense-in-depth suggestions and hypotheses needing runtime evidence.

Do not expose secrets, run destructive proofs, access external systems outside scope, or mutate the reviewed implementation.

## Report and verify

For each finding, provide affected location, preconditions, exploit path, impact, confidence, severity, minimal remediation, and a focused regression check. Prioritize by real exploitability and impact. If no material issue is found, state the reviewed surfaces and residual risk. Re-review repaired paths and their tests before closure.
