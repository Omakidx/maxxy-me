# Tools

Practical developer tools, code generators, and audit procedures.
These are actionable references the agent uses during coding tasks.

## Categories

### Developer Utility References
Cheat sheets and command references for everyday development.

| Tool | File | What It Covers |
|------|------|----------------|
| **Git** | `git.md` | Workflows, branching, commits, stashing, rebasing, bisect |
| **Regex** | `regex.md` | Common patterns, lookahead/behind, flags, language-specific |
| **Docker** | `docker.md` | Commands, Compose, multi-stage builds, debugging, optimization |
| **SQL** | `sql.md` | Query patterns, joins, CTEs, window functions, optimization |
| **API Testing** | `api-testing.md` | cURL, httpie, Postman, REST/GraphQL testing patterns |
| **CLI Productivity** | `cli-productivity.md` | Terminal tools, aliases, scripting, productivity boosters |

### Code Generation Tools
Scaffolding templates for rapid, consistent code creation.

| Tool | File | What It Generates |
|------|------|-------------------|
| **Component Scaffolder** | `component-scaffolder.md` | React, Vue, Svelte, Angular components with a11y + tests |
| **API Scaffolder** | `api-scaffolder.md` | REST/GraphQL endpoints, middleware, validation, error handling |
| **Test Scaffolder** | `test-scaffolder.md` | Unit, integration, E2E tests for any framework |
| **Config Generator** | `config-generator.md` | ESLint, Prettier, TypeScript, Tailwind, CI/CD configs |

### Analysis & Audit Tools
Structured procedures for code quality, security, and performance.

| Tool | File | What It Audits |
|------|------|----------------|
| **Performance Audit** | `performance-audit.md` | Core Web Vitals, profiling, bundle analysis, runtime optimization |
| **Security Scanner** | `security-scanner.md` | OWASP Top 10, dependency vulns, secrets, headers, CSP |
| **Code Quality** | `code-quality.md` | Complexity, duplication, coverage, maintainability metrics |
| **Dependency Audit** | `dependency-audit.md` | Outdated packages, vulnerabilities, license compliance, bloat |

## Role Connections

Each role's `## Connected Tools` section is the canonical package mapping. Keeping that
mapping beside the role explains when to use a tool and avoids a second reverse
index drifting as roles are added. To inspect connections across the package:

```bash
rg -n '\maxxy-me/tools/' maxxy-me/roles
```

## Usage

Tools are activated automatically when a role is invoked — each role's `## Connected Tools` section lists the relevant tools. You can also reference tools directly:
```
Read maxxy-me/tools/git.md and apply the conventional commits pattern.
```

Roles reference tools in their canonical patterns. Skills invoke tools during their procedures.
