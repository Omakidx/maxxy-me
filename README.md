# Maxxy-Agent

A portable AI agent system that turns any IDE's AI into a **team of interconnected specialists**. Drop it into any project — your agent gains expert roles, structured workflows, team collaboration, and auto-research capabilities.

**Works with:** Windsurf, Cursor, Claude Code, OpenAI Codex, GitHub Copilot, OpenCode — and any tool that reads project-level instruction files.

---

## Setup

### Quick Install (One Command)

`cd` into your project, then run:

```bash
git clone https://github.com/Omakidx/maxxy-me.git /tmp/maxxy-agent && /tmp/maxxy-agent/setup.sh . windsurf && rm -rf /tmp/maxxy-agent
```

Replace `windsurf` with your IDE: `windsurf`, `cursor`, `claude`, `codex`, `copilot`, `opencode`, or `all`.

Everything installs into a single `.maxxy-agent/` folder. Only your IDE's config files go to the project root.

### Option 2: Reusable Global Install

Install once, use in any project:

```bash
git clone https://github.com/Omakidx/maxxy-me.git ~/.maxxy-agent
```

Then for each project:

```bash
~/.maxxy-agent/setup.sh /path/to/your/project windsurf
```

### Activate a Different IDE Later

```bash
.maxxy-agent/setup.sh . cursor
```

No dependencies. No API keys. No build step. Just files.

---

## IDE Compatibility

| IDE | Config File(s) | Auto-Loads |
|-----|---------------|------------|
| **Windsurf** | `.windsurfrules` + `.windsurf/workflows/*.md` | Yes — rules + slash commands |
| **Cursor** | `.cursorrules` + `.cursor/rules/*.mdc` | Yes — all interactions |
| **Claude Code** | `CLAUDE.md` | Yes — session-wide |
| **OpenAI Codex** | `AGENTS.md` + `.codex/instructions.md` | Yes — per task |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Yes — chat + inline |
| **OpenCode** | `.opencode/rules.md` | Yes — all interactions |

All IDEs get the same capabilities. Slash commands work everywhere.

---

## The Team — All Specialist Roles

Every role is an expert persona your agent can become. Roles are **interconnected** — they consult each other, delegate work, share context through `team-memory.txt`, and research before implementing unfamiliar features.

### Leadership Roles

| Command | Role | Capabilities | Use Cases |
|---------|------|-------------|-----------|
| `/ceo` | Product Visionary | Product strategy, prioritization, scope management, MVP definition, user impact analysis, OKR alignment | Scoping a new feature, cutting scope, prioritizing backlog, go/no-go decisions, reframing technical requests into business outcomes |
| `/cto` | Chief Architect | Architecture design, technology selection, scaling strategy, trade-off analysis, build-vs-buy decisions, ADRs | Choosing between microservices vs monolith, evaluating new frameworks, planning data architecture, assessing technical debt |
| `/tech-lead` | Technical Lead | Code quality standards, PR mentoring, process design, tech debt triage, pattern enforcement, team velocity | Setting coding standards, reviewing architecture proposals, planning sprints, mediating technical disagreements, onboarding patterns |

### Development Roles

| Command | Role | Capabilities | Use Cases |
|---------|------|-------------|-----------|
| `/frontend-dev` | Senior Frontend Engineer | React/Vue/Svelte, Tailwind CSS, TypeScript, state management, component architecture, Core Web Vitals, a11y | Building UI components, optimizing bundle size, implementing design systems, fixing layout bugs, adding loading states |
| `/backend-dev` | Senior Backend Engineer | Node.js/Python/Go, REST/GraphQL/tRPC, ORMs, queues, auth middleware, input validation, error handling | Building APIs, designing data models, implementing auth flows, setting up background jobs, optimizing queries |
| `/mobile-dev` | Senior Mobile Engineer | React Native, Expo, Flutter, Swift/Kotlin, offline-first, native animations, push notifications | Building cross-platform apps, optimizing startup time, implementing deep links, handling offline state |
| `/devops` | Platform Engineer | Docker, Kubernetes, CI/CD, Nginx, SSL, monitoring, logging, VPS setup, cloud architecture | Containerizing apps, setting up GitHub Actions, configuring reverse proxies, deploying to production, setting up monitoring |

### Specialist Roles

| Command | Role | Capabilities | Use Cases |
|---------|------|-------------|-----------|
| `/dba` | Database Architect | Schema design, query optimization, migrations, indexing, normalization, connection pooling, replication | Designing tables, writing complex queries, planning zero-downtime migrations, fixing N+1 queries, adding indexes |
| `/security-engineer` | Security Engineer | OWASP Top 10, STRIDE threat modeling, AppSec review, incident triage, secret management, auth architecture | Auditing code for vulnerabilities, designing auth systems, setting up CSP headers, reviewing for injection attacks |
| `/auth-expert` | Auth Engineer | OAuth2/OIDC, JWT, sessions, MFA/OTP, RBAC/ABAC, password hashing, provider integration (Clerk, Auth0, Supabase) | Implementing login flows, adding MFA, choosing auth providers, designing permission systems, securing token storage |
| `/qa-engineer` | QA Engineer | Test strategy, edge case discovery, Playwright/Vitest/Jest, mutation testing, coverage analysis, bug reproduction | Writing test plans, finding edge cases, setting up E2E tests, reviewing test coverage, creating regression tests |
| `/accessibility-expert` | Web Accessibility Engineer | WCAG 2.2 AA/AAA, ARIA patterns, keyboard navigation, screen reader testing, axe-core, focus management | Auditing for a11y compliance, fixing keyboard traps, adding ARIA labels, implementing focus management, color contrast fixes |
| `/gsap-expert` | GSAP Animation Engineer | GSAP timelines, ScrollTrigger, SplitText, MorphSVG, Flip, Draggable, React integration, 60fps optimization | Building scroll animations, page transitions, text reveals, SVG morphing, parallax effects, interactive UI animations |
| `/figma-expert` | Design Engineer | Figma-to-code, design tokens, CSS variables, Tailwind config generation, component specifications, visual QA | Extracting design tokens from Figma, building pixel-perfect components, generating Tailwind configs, visual regression testing |
| `/neondb-expert` | Neon Postgres Engineer | Neon branching, serverless driver, connection pooling, Drizzle/Prisma integration, egress optimization, CLI | Setting up Neon projects, implementing branching workflows, optimizing cold starts, configuring connection pooling |
| `/realtime-systems` | Real-Time Systems Engineer | WebSocket, gRPC streaming, NATS, SSE, MQTT, Redis Pub/Sub, backpressure, horizontal scaling | Building chat systems, live dashboards, notification systems, collaborative editing, event-driven architectures |
| `/web-cloner` | Web Cloner Engineer | Site analysis, design token extraction, style scraping, component identification, pixel-perfect rebuilds | Cloning website designs, extracting color palettes and fonts, rebuilding layouts, creating design specifications |
| `/code-rabbit-expert` | CodeRabbit Engineer | CodeRabbit CLI, `.coderabbit.yaml` configuration, PR review workflows, path instructions, noise reduction | Setting up automated PR reviews, configuring review profiles, reducing review noise, integrating with CI |

---

## Skills (Workflow Commands)

Skills are step-by-step protocols the agent executes precisely.

| Command | Role | What It Does |
|---------|------|-------------|
| `/plan` | Strategic Architect | Reframe request → decompose → risk assess → propose architecture → approval gate |
| `/debug` | Root Cause Investigator | Reproduce → hypothesize → probe → confirm root cause → fix → regression test |
| `/review` | Staff Engineer | 6-dimension review (security, errors, perf, naming, maintainability, tests) → verdict |
| `/security` | Security Auditor | OWASP Top 10 + STRIDE → secret scan → dependency audit → remediation report |
| `/ship` | Release Engineer | Tests green → self-review → stage intentionally → commit → push → verify CI |
| `/autoplan` | Deep Planner | Autonomous planning for complex multi-file/multi-service work |
| `/research` | Auto-Researcher | Lightpanda-powered web research (minimal / deep / super-deep) |
| `/team` | Team Simulator | Chain roles end-to-end: scope → architect → build → test → ship |
| `/create-role` | Role Generator | Research-backed creation of new specialist roles |

---

## How Roles Work Together

Roles don't operate in isolation — they form an **interconnected team** that collaborates like a real engineering organization.

### Team Collaboration Protocol

Every role automatically:
1. **Reads** `team-memory.txt` before starting work (shared context)
2. **Consults** other roles when work crosses domain boundaries
3. **Delegates** subtasks to the appropriate specialist
4. **Writes** decisions, feedback, and findings to `team-memory.txt`
5. **Researches** unfamiliar topics before implementing (via `/research`)
6. **Escalates** when blocked or when decisions exceed their scope

### Decision Hierarchy

```
Product Decisions:   CEO > CTO > Tech Lead > Individual Roles
Technical Decisions: CTO > Tech Lead > Domain Expert > Individual Roles
Quality Decisions:   QA + Security (veto power on safety issues)
Process Decisions:   Tech Lead > DevOps > Individual Roles
```

### Collaboration Modes

**Consult** — Quick expert opinion, retain ownership:
```
/frontend-dev is building a form → consults /auth-expert on token storage
```

**Delegate** — Hand off a subtask to the right specialist:
```
/backend-dev delegates schema design to /dba
```

**Escalate** — Decision exceeds your scope:
```
/frontend-dev escalates framework choice to /cto
```

### Team Memory (`team-memory.txt`)

A shared file in your project root where roles record decisions, feedback, and context:

```
────────────────────────────────────────
[ROLE: backend-dev] [DATE: 2025-01-15] [TYPE: DECISION]

API will use tRPC instead of REST for type-safe client-server communication.
Affects: /frontend-dev (client generation), /qa-engineer (test patterns)
────────────────────────────────────────
[ROLE: security-engineer] [DATE: 2025-01-15] [TYPE: CONCERN]

Auth tokens stored in localStorage — recommend httpOnly cookies instead.
For: /auth-expert, /frontend-dev
────────────────────────────────────────
```

Entry types: `DECISION` | `FEEDBACK` | `BLOCKER` | `CONTEXT` | `HANDOFF` | `CONCERN` | `COMPLETED` | `RESEARCH`

---

## Pre-Implementation Research

Every role automatically assesses whether research is needed before adding features. If confidence is medium or low, the role invokes `/research`.

### When Research Triggers

- Using an unfamiliar library, API, or pattern
- Choosing between multiple valid approaches
- Security, performance, or accessibility implications
- Ecosystem may have changed since last knowledge
- Anything a senior engineer would look up before coding

### Research Depths

| Depth | Sources | When to Use |
|-------|---------|-------------|
| **Minimal** | 2-3 pages | Quick syntax lookup, single question |
| **Deep** | 5-10 pages | Tool evaluation, API learning, pattern comparison |
| **Super-Deep** | 10-20+ pages | Architecture decisions, full landscape survey |

### Research Flow

```
Feature Request → Pre-Implementation Check → Confidence LOW/MEDIUM?
  → /research deep <topic>
  → Save to .research/<topic>.md
  → Write summary to team-memory.txt
  → Implement with confidence
```

---

## Team Pipeline (`/team`)

Chain roles for end-to-end feature delivery:

```
/team ceo,cto,frontend-dev,qa-engineer — Build a user dashboard
```

### Default Pipeline

```
Stage 1: SCOPE        → /ceo           → CEO Brief (must-haves, cuts, metric)
Stage 2: ARCHITECT    → /cto           → Architecture Brief (design, trade-offs)
Stage 3: PLAN         → /tech-lead     → Implementation plan (milestones)
Stage 4a: BUILD UI    → /frontend-dev  → Components (parallel)
Stage 4b: BUILD API   → /backend-dev   → Endpoints + models (parallel)
Stage 5: TEST         → /qa-engineer   → Test plan + tests written
Stage 6: SECURITY     → /security-eng  → Security assessment
Stage 7: SHIP         → /devops        → Deployed, verified
```

### Custom Pipelines

```
/team ceo,frontend-dev                    → Quick UI feature
/team cto,backend-dev,dba                 → Database-heavy backend
/team qa-engineer,security-engineer       → Audit-only
/team figma-expert,frontend-dev           → Design-to-code
/team cto,backend-dev,realtime-systems    → Real-time feature
```

---

## Tools (Developer Utilities)

Reference guides, scaffolders, and audit procedures in `.maxxy-agent/tools/`.

| Category | Tools | Purpose |
|----------|-------|---------|
| **Dev References** | `git.md`, `regex.md`, `docker.md`, `sql.md`, `api-testing.md`, `cli-productivity.md` | Quick-reference for common patterns |
| **Code Generation** | `component-scaffolder.md`, `api-scaffolder.md`, `test-scaffolder.md`, `config-generator.md` | Scaffold components, APIs, tests, configs |
| **Analysis & Audit** | `performance-audit.md`, `security-scanner.md`, `code-quality.md`, `dependency-audit.md` | Profile, audit, and measure code health |

---

## File Structure

```
your-project/
├── .windsurfrules               # ← Only if you ran: setup.sh . windsurf
├── .windsurf/                   #    (IDE-specific, placed at root on activation)
│
└── .maxxy-agent/                # ← Everything lives here (one hidden folder)
    ├── setup.sh                 # Re-run to activate another IDE
    │
    ├── skills/                  # Step-by-step skill protocols
    │   ├── planner.md           # /plan — strategic decomposition
    │   ├── debugger.md          # /debug — root cause investigation
    │   ├── reviewer.md          # /review — 6-dimension code review
    │   ├── security-auditor.md  # /security — OWASP + STRIDE audit
    │   └── shipper.md           # /ship — release pipeline
    │
    ├── roles/                   # Specialist personas (18 roles)
    │   ├── _team-protocol.md    # Team collaboration rules
    │   ├── ceo.md, cto.md, tech-lead.md
    │   ├── frontend-dev.md, backend-dev.md, mobile-dev.md
    │   ├── devops.md, dba.md, qa-engineer.md
    │   ├── security-engineer.md, auth-expert.md
    │   ├── accessibility-expert.md, gsap-expert.md
    │   ├── figma-expert.md, neondb-expert.md
    │   ├── realtime-systems.md, web-cloner.md
    │   └── code-rabbit-expert.md
    │
    ├── tools/                   # Developer utilities & audit procedures
    │   ├── git.md, regex.md, docker.md, sql.md, api-testing.md
    │   ├── component-scaffolder.md, api-scaffolder.md, test-scaffolder.md
    │   └── performance-audit.md, security-scanner.md, code-quality.md
    │
    ├── templates/               # Templates for new roles and team memory
    │   ├── new-role/            # Role creation templates
    │   └── team-memory.txt      # Team memory template
    │
    ├── .windsurf/               # IDE configs (source of truth, stored here)
    ├── .cursor/                 # Activated to root via: setup.sh . <ide>
    ├── .codex/, .opencode/, .github/
    ├── CLAUDE.md, AGENTS.md
    ├── .windsurfrules, .cursorrules
    └── ...
```

---

## Usage Examples

### Single Role — Build a Component

```
/frontend-dev Build an accessible modal dialog with keyboard trap and focus restoration
```

The agent becomes a Senior Frontend Engineer, checks team-memory for context, researches ARIA dialog patterns if needed, builds the component with proper a11y, and writes the decision to team-memory.

### Consult Another Role

```
I'm building a user settings page. Ask /dba — what's the best schema for user preferences?
```

The agent consults the DBA persona for a quick expert answer, then returns.

### Full Team Pipeline

```
/team — Build a real-time notification system
```

CEO scopes it → CTO architects (WebSocket vs SSE) → Backend builds the API → Frontend builds the UI → QA writes tests → Security audits → DevOps deploys.

### Debug with Evidence

```
/debug Users see a blank screen after login on Safari
```

Agent follows the Iron Law: reproduce → hypothesize → probe → confirm root cause → minimal fix → regression test.

### Research Before Building

```
/frontend-dev Add infinite scroll with virtual list to the feed page
```

Agent detects "virtual list" as a pattern needing research → runs `/research deep "virtual scroll React libraries 2025"` → evaluates options → picks the best fit → implements.

---

## Creating New Roles

Use the `/create-role` command or manually create a file in `.maxxy-agent/roles/`:

```bash
# Automated (with deep research)
/create-role redis-expert

# Manual
touch .maxxy-agent/roles/your-role.md
```

Every new role automatically inherits:
- Team Collaboration Protocol (consult/delegate/escalate)
- Pre-Implementation Research (auto-research before unfamiliar work)
- Team Memory integration (read/write shared context)
- Tool access (all tools in `.maxxy-agent/tools/`)

Use `.maxxy-agent/templates/new-role/ROLE_TEMPLATE.md` as the starting structure.

---

## Guardrails (Always Active)

These rules govern every interaction regardless of active role:

| Rule | Enforcement |
|------|------------|
| **Investigate First** | No code changes without proven root cause |
| **Plan Before Code** | Decompose non-trivial requests before implementing |
| **Atomic Commits** | One logical unit per commit |
| **Test-Verified** | Every change proven by test |
| **Self-Cleaning** | Remove debug artifacts before completing |
| **Minimal Diffs** | Smallest change that solves the problem |
| **Research First** | Auto-research unfamiliar patterns before implementing |
| **Team Context** | Read team-memory before work, write after |

---

## Philosophy

1. **Karpathy's Laws** — Think before coding. Simplicity first. Surgical changes.
2. **Iron Law of Debugging** — No fix without evidence. Reproduce → hypothesize → probe → confirm → fix.
3. **Boil the Lake** — AI makes completeness cheap. Tests, edge cases, error paths — skip nothing.
4. **Team > Individual** — Specialists collaborate. No silos. Shared context. Delegate to experts.

---

## License

MIT
