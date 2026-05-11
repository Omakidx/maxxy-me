# Dependency Audit — Analysis Tool

Structured procedure for auditing project dependencies:
vulnerabilities, outdated packages, license compliance, and bundle bloat.

---

## Audit Procedure

### Phase 1: Vulnerability Scan

```bash
# npm
npm audit
npm audit --omit=dev              # Production only
npm audit fix                      # Auto-fix compatible updates
npm audit fix --force              # Auto-fix (may include breaking changes)

# pnpm
pnpm audit
pnpm audit --fix

# yarn
yarn audit
yarn npm audit

# Python
pip-audit
safety check -r requirements.txt

# Go
govulncheck ./...

# Multi-language (Snyk)
npx snyk test
npx snyk test --severity-threshold=high
```

**Triage matrix:**
| Severity | Production Dep | Dev Dep | Action |
|----------|---------------|---------|--------|
| Critical | 🔴 Immediate | 🟡 Urgent | Patch same day |
| High | 🟡 Urgent | 🟢 Soon | Patch within 48h |
| Medium | 🟢 Soon | 🔵 Track | Next release |
| Low | 🔵 Track | ⚪ Skip | Next sprint or ignore |

### Phase 2: Outdated Dependencies

```bash
# npm
npm outdated

# pnpm
pnpm outdated

# yarn
yarn outdated

# Interactive update (npm)
npx npm-check-updates -i

# Check specific package
npx npm-check-updates --filter "react*"
```

**Update strategy:**
| Update Type | Risk | Process |
|-------------|------|---------|
| **Patch** (1.2.3 → 1.2.4) | Low | Auto-merge if tests pass |
| **Minor** (1.2.3 → 1.3.0) | Low-Medium | Review changelog, run tests |
| **Major** (1.2.3 → 2.0.0) | High | Read migration guide, test thoroughly, branch |

### Phase 3: Unused Dependencies

```bash
# JavaScript/TypeScript
npx depcheck

# Find unused exports
npx ts-unused-exports tsconfig.json

# Knip — comprehensive unused code/deps finder
npx knip
```

**Common findings:**
- Packages in `dependencies` that should be in `devDependencies`
- Packages installed but never imported
- Packages only used in commented-out code
- Packages replaced by native alternatives (e.g., `lodash.get` → optional chaining)

### Phase 4: Bundle Impact

```bash
# Check package size before installing
npx bundlephobia <package-name>

# Or use the website
# https://bundlephobia.com/package/<name>

# Analyze current bundle
npx source-map-explorer dist/**/*.js
npx vite-bundle-visualizer        # Vite projects
ANALYZE=true npx next build        # Next.js
```

**Size benchmarks:**
| Category | Max Gzipped Size | Examples |
|----------|-----------------|---------|
| Utility library | < 5KB | date-fns (tree-shakeable), clsx |
| UI component lib | < 30KB (per component) | Radix, Headless UI |
| State management | < 5KB | Zustand, Jotai, Valtio |
| Form library | < 10KB | React Hook Form |
| Full framework | < 50KB | React, Vue, Svelte |

**Heavy package alternatives:**
| Heavy Package | Size | Alternative | Size |
|--------------|------|-------------|------|
| `moment` | 72KB | `date-fns` | 2KB (per fn) |
| `lodash` | 72KB | `lodash-es` (tree-shake) | 2-5KB |
| `axios` | 13KB | `fetch` (native) | 0KB |
| `uuid` | 4KB | `crypto.randomUUID()` | 0KB |
| `classnames` | 1KB | `clsx` | 0.5KB |
| `chalk` | 7KB | `picocolors` | 0.3KB |

### Phase 5: License Compliance

```bash
# Check all dependency licenses
npx license-checker --summary
npx license-checker --failOn "GPL-2.0;GPL-3.0;AGPL-3.0"

# Detailed report
npx license-checker --json --out licenses.json
```

**License compatibility:**
| License | Commercial Use | Can Distribute | Copyleft | Risk |
|---------|---------------|----------------|----------|------|
| MIT | ✅ | ✅ | No | 🟢 Safe |
| Apache-2.0 | ✅ | ✅ | No | 🟢 Safe |
| BSD-2/3 | ✅ | ✅ | No | 🟢 Safe |
| ISC | ✅ | ✅ | No | 🟢 Safe |
| MPL-2.0 | ✅ | ✅ | File-level | 🟡 Review |
| LGPL-2.1/3.0 | ✅ | ✅ | Library | 🟡 Review |
| GPL-2.0/3.0 | ⚠️ | ⚠️ | Strong | 🔴 Legal review |
| AGPL-3.0 | ⚠️ | ⚠️ | Network | 🔴 Legal review |
| Unlicensed | ❌ | ❌ | Unknown | 🔴 Do not use |

### Phase 6: Supply Chain Security

```bash
# Verify package integrity
npm audit signatures

# Check for typosquatting (manual)
# Review package name carefully before installing
# Check download counts on npm — low counts may be suspicious

# Socket.dev — detect supply chain attacks
npx socket npm info <package-name>
```

**Red flags:**
- Package published in last 24 hours by unknown author
- Package name similar to popular package (typosquatting)
- Package has install scripts (`preinstall`, `postinstall`)
- Package requests network access during install
- Package has few downloads but many dependents

---

## Dependency Hygiene Rules

1. **Pin exact versions** in production (`"react": "18.2.0"`, not `"^18.2.0"`)
2. **Use lockfiles** — commit `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`
3. **Review before install** — check npm page, GitHub repo, download count
4. **Minimize dependencies** — prefer native APIs over libraries when possible
5. **Separate prod and dev** — use `--save-dev` for build/test tools
6. **Automate updates** — Dependabot / Renovate for automated PRs
7. **Audit in CI** — fail builds on critical/high vulnerabilities

---

## Renovate / Dependabot Config

### Renovate (renovate.json)
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "labels": ["dependencies"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "automerge": true,
      "automergeType": "pr"
    },
    {
      "matchUpdateTypes": ["minor"],
      "automerge": true,
      "automergeType": "pr",
      "schedule": ["before 5am on Monday"]
    },
    {
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["dependencies", "major"]
    }
  ]
}
```

### Dependabot (.github/dependabot.yml)
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
    groups:
      dev-dependencies:
        dependency-type: "development"
        update-types: ["minor", "patch"]
      production-dependencies:
        dependency-type: "production"
        update-types: ["patch"]
```

---

## Output Format

```
DEPENDENCY AUDIT
════════════════════════════════════════

Project:          <name>
Date:             <date>
Total deps:       <prod count> production / <dev count> development

Vulnerabilities:
  Critical: <count>  High: <count>  Medium: <count>  Low: <count>
  Action items:
    • <package@version> — <vulnerability> — upgrade to <version>

Outdated:
  Major behind:    <count> packages
  Minor behind:    <count> packages
  Top priorities:
    • <package> <current> → <latest> (<reason to update>)

Unused:
  • <package> — not imported anywhere
  • <package> — only in devDependencies but listed in dependencies

Bundle Impact:
  Top 5 heaviest:
    1. <package> — <gzipped size>
    2. <package> — <gzipped size>
  Lighter alternatives:
    • <heavy> → <alternative> (saves <KB>)

Licenses:
  ✅ All compatible / ⚠️ <count> need review
  Flagged: <package> — <license>

Recommendations:
  1. <highest priority action>
  2. <next>
  3. <next>
```
