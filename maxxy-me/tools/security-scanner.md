# Security Scanner — Analysis Tool

Structured procedure for auditing web application security.
Based on the [OWASP Top 10:2025](https://owasp.org/Top10/2025/) and common
vulnerability patterns.

---

## Audit Procedure

### Phase 1: Dependency Vulnerabilities

```bash
# npm
npm audit
npm audit --production        # Production deps only

# pnpm
pnpm audit

# yarn
yarn audit

# Python
pip-audit
safety check

# Snyk (multi-language)
npx snyk test
npx snyk monitor              # Continuous monitoring
```

**Severity response:**
| Severity | Action | Timeline |
|----------|--------|----------|
| Critical | Patch immediately | Same day |
| High | Patch ASAP | Within 48h |
| Medium | Patch in next release | Within 1 week |
| Low | Track, patch when convenient | Next sprint |

### Phase 2: Secret Scanning

```bash
# Gitleaks — scan for secrets in git history
gitleaks detect --source . --verbose

# TruffleHog — credential scanner
trufflehog git file://. --only-verified

# Heuristic patterns (expect false positives; confirm every finding)
rg -n -i --hidden -g '!*.md' -g '!*.lock' -g '!node_modules/**' \
  '(api[_-]?key|client[_-]?secret|private[_-]?key|password|access[_-]?token)'
rg -n -- '-----BEGIN.*PRIVATE KEY-----' .
rg "sk_live_|pk_live_|sk_test_" .
rg "AKIA[0-9A-Z]{16}" .            # AWS access keys
rg "ghp_[a-zA-Z0-9]{36}" .         # GitHub tokens
```

**Immediate actions if secrets found:**
1. Rotate the compromised credential immediately
2. Check git history — secret may be in old commits even if removed
3. Use `git filter-repo` or BFG Repo Cleaner to purge it from history
4. Add pattern to `.gitignore` and pre-commit hooks

### Phase 3: HTTP Security Headers

```bash
# Check headers
curl -sI https://example.com | grep -iE "(strict-transport|content-security|x-frame|x-content|referrer|permissions)"
```

| Header | Required Value | Why |
|--------|---------------|-----|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `Content-Security-Policy` | See below | Prevent XSS, injection |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` | Prevent clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leaks |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Restrict browser APIs |
| `X-XSS-Protection` | `0` (prefer CSP instead) | Legacy XSS filter |

### Content Security Policy (CSP)

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

### Phase 4: OWASP Top 10:2025 Checklist

| # | Vulnerability | Check | Fix |
|---|--------------|-------|-----|
| A01 | **Broken Access Control** | Change object IDs, roles, methods, and paths | Enforce server-side authorization on every request; deny by default |
| A02 | **Security Misconfiguration** | Check defaults, verbose errors, headers, open ports | Harden each environment, minimize features and permissions |
| A03 | **Software Supply Chain Failures** | Audit direct/transitive dependencies and CI build inputs | Pin and verify dependencies, protect CI, generate an SBOM |
| A04 | **Cryptographic Failures** | Check plaintext data, weak hashing, key handling, TLS | Use modern vetted primitives, managed keys, and encryption in transit/at rest |
| A05 | **Injection** | Test SQL, NoSQL, OS, template, and browser injection | Parameterize, contextually encode, validate, and avoid string-built commands |
| A06 | **Insecure Design** | Review business logic, trust boundaries, and abuse cases | Threat model, rate limit, and add controls at design time |
| A07 | **Authentication Failures** | Test brute force, recovery, MFA, and session lifecycle | Rate limit, use MFA, rotate sessions, and apply secure recovery |
| A08 | **Software or Data Integrity Failures** | Check updates, artifacts, deserialization, and CI provenance | Verify signatures/provenance and reject untrusted serialized data |
| A09 | **Security Logging and Alerting Failures** | Confirm security events are logged, monitored, and actionable | Use structured tamper-resistant logs and tested alerts; exclude secrets |
| A10 | **Mishandling of Exceptional Conditions** | Trigger timeouts, partial failures, malformed data, and resource exhaustion | Fail closed, bound resources, handle errors centrally, test degraded paths |

### Phase 5: Authentication & Session Security

```bash
# Check cookie flags
curl -v https://example.com/login 2>&1 | grep -i set-cookie
# Should include: Secure; HttpOnly; SameSite=Lax (or Strict)
```

**Checklist:**
- [ ] Passwords hashed with Argon2id or bcrypt (cost ≥ 10)
- [ ] Sessions invalidated on logout
- [ ] Session tokens rotated after login
- [ ] CSRF protection on state-changing requests
- [ ] Rate limiting on login/registration endpoints
- [ ] Account lockout after N failed attempts
- [ ] MFA available for sensitive accounts
- [ ] JWT tokens have short expiry (15-60 minutes)
- [ ] Refresh tokens stored securely (HttpOnly cookies)

### Phase 6: Input Validation

**Test every input with:**
```
' OR 1=1 --                          # SQL injection
<script>alert('xss')</script>        # XSS
{{7*7}}                               # SSTI
../../../etc/passwd                    # Path traversal
; ls -la                              # Command injection
${7*7}                                # Expression injection
%00                                   # Null byte injection
```

**Defense pattern:**
```typescript
// Zod schema validation at every boundary
const userInput = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z\s]+$/),
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
});

// DOMPurify for user-generated HTML
import DOMPurify from 'dompurify';
const cleanHtml = DOMPurify.sanitize(userInput);
```

---

## Automated Security Tools

| Tool | What It Scans | How to Run |
|------|--------------|------------|
| **npm audit** | JS dependency vulns | `npm audit --production` |
| **Snyk** | Multi-language deps, containers, IaC | `npx snyk test` |
| **OWASP ZAP** | Web app DAST (dynamic) | `docker run owasp/zap2docker-stable` |
| **Gitleaks** | Secrets in git history | `gitleaks detect` |
| **TruffleHog** | Verified credentials | `trufflehog git file://.` |
| **Semgrep** | SAST (static code analysis) | `npx semgrep --config=auto` |
| **Trivy** | Container image vulnerabilities | `trivy image myapp:latest` |
| **securityheaders.com** | HTTP header analysis | Visit URL in browser |

---

## Output Format

```
SECURITY AUDIT
════════════════════════════════════════

Target:         <app name / URL>
Date:           <date>
Scope:          <deps / headers / OWASP / full>

CRITICAL (P0 — fix immediately):
  • [A01] <description> — <file:line> — <fix>

HIGH (P1 — fix before deploy):
  • [A05] <description> — <file:line> — <fix>

MEDIUM (P2 — fix this sprint):
  • [A03] <description> — <fix>

LOW (P3 — track):
  • <description>

Dependencies:
  Critical: <count>  High: <count>  Medium: <count>

Headers:
  ✅ HSTS    ✅ CSP    ✅ X-Frame    ❌ Permissions-Policy

Secrets:
  <clean / N issues found>

Recommendations:
  1. <highest priority>
  2. <next>
  3. <next>
```
