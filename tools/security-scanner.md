# Security Scanner — Analysis Tool

Structured procedure for auditing web application security.
Based on OWASP Top 10 (2021) and common vulnerability patterns.

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

# grep patterns (quick check)
rg -i "(api_key|apikey|secret|password|token|private_key)" --type-not md --glob '!*.lock'
rg "-----BEGIN.*PRIVATE KEY-----" .
rg "sk_live_|pk_live_|sk_test_" .
rg "AKIA[0-9A-Z]{16}" .            # AWS access keys
rg "ghp_[a-zA-Z0-9]{36}" .         # GitHub tokens
```

**Immediate actions if secrets found:**
1. Rotate the compromised credential immediately
2. Check git history — secret may be in old commits even if removed
3. Use `git filter-branch` or BFG Repo Cleaner to purge from history
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

### Phase 4: OWASP Top 10 Checklist

| # | Vulnerability | Check | Fix |
|---|--------------|-------|-----|
| A01 | **Broken Access Control** | Test accessing other users' data by changing IDs | Server-side auth check on every request, deny by default |
| A02 | **Cryptographic Failures** | Check for plaintext passwords, weak hashing, exposed secrets | Argon2id/bcrypt for passwords, TLS everywhere, no secrets in code |
| A03 | **Injection** | Test SQL, NoSQL, OS, LDAP injection in all inputs | Parameterized queries, ORM, input validation, no string concat |
| A04 | **Insecure Design** | Review business logic for abuse cases | Threat modeling, rate limiting, input validation |
| A05 | **Security Misconfiguration** | Check default creds, verbose errors, open ports | Harden configs, disable debug in prod, minimal permissions |
| A06 | **Vulnerable Components** | Run `npm audit`, check CVE databases | Keep deps updated, use lockfiles, remove unused deps |
| A07 | **Auth Failures** | Test brute force, credential stuffing, weak passwords | Rate limiting, MFA, strong password policy, account lockout |
| A08 | **Data Integrity Failures** | Check for unsigned updates, untrusted deserialization | Verify signatures, use SRI for CDN scripts, validate data |
| A09 | **Logging Failures** | Check if auth events, access denials are logged | Log security events with context, don't log secrets |
| A10 | **SSRF** | Test if server can be tricked into making internal requests | Allowlist URLs, validate/sanitize URLs, block internal IPs |

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
  • [A03] <description> — <file:line> — <fix>

MEDIUM (P2 — fix this sprint):
  • [A06] <description> — <fix>

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
