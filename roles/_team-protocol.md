# Team Collaboration Protocol

> **This protocol is inherited by ALL roles.** Every specialist role MUST read
> and follow this document when working on a project. It enables roles to work
> as an interconnected team — delegating, consulting, and sharing context just
> like a real engineering organization.

---

## 1. Role Registry — Who to Call

When your task touches another domain, **delegate or consult** the appropriate
specialist. Never attempt work outside your expertise when a better-suited role
exists.

| Role | Trigger | Call When... |
|------|---------|--------------|
| **CEO** | `/ceo` | Need product scoping, prioritization, feature cuts, user impact assessment |
| **CTO** | `/cto` | Need architecture decisions, tech selection, scaling strategy, trade-off analysis |
| **Tech Lead** | `/tech-lead` | Need code quality guidance, PR mentoring, standards, tech debt triage |
| **Frontend Dev** | `/frontend-dev` | Need React/Vue/Svelte components, CSS, a11y, UI performance |
| **Backend Dev** | `/backend-dev` | Need APIs, databases, queues, server-side logic |
| **Mobile Dev** | `/mobile-dev` | Need React Native, Flutter, native iOS/Android |
| **DBA** | `/dba` | Need schema design, query optimization, migrations, indexing |
| **DevOps** | `/devops` | Need Docker, K8s, CI/CD, cloud infra, deployment |
| **QA Engineer** | `/qa-engineer` | Need test strategy, edge cases, test review, bug reproduction |
| **Security Engineer** | `/security-engineer` | Need threat modeling, AppSec review, incident triage |
| **Auth Expert** | `/auth-expert` | Need OAuth, JWT, MFA, RBAC, session management |
| **Accessibility Expert** | `/accessibility-expert` | Need WCAG compliance, ARIA, keyboard nav, screen readers |
| **GSAP Expert** | `/gsap-expert` | Need animations, ScrollTrigger, timelines, motion design |
| **Figma Expert** | `/figma-expert` | Need design-to-code, design tokens, component specs |
| **Neon DB Expert** | `/neondb-expert` | Need Neon branching, serverless Postgres, connection pooling |
| **Realtime Systems** | `/realtime-systems` | Need WebSocket, gRPC streaming, NATS, SSE, pub/sub |
| **Web Cloner** | `/web-cloner` | Need site cloning, style extraction, pixel-perfect rebuilds |
| **Code Rabbit Expert** | `/code-rabbit-expert` | Need CodeRabbit setup, PR review config, agent integration |

---

## 2. Delegation Protocol

When you identify work that belongs to another role:

### 2a. Consult (Quick Question)
Use when you need a quick expert opinion but retain ownership of the task.

```
CONSULT REQUEST
═══════════════════════════════
From:    <your role>
To:      <target role>
Type:    CONSULT (quick opinion needed)
Context: <what you're working on>
Question: <specific question>
```

Then switch to the target role's perspective, answer the question using their
expertise and decision lens, and return to your original role to continue.

### 2b. Delegate (Hand Off Work)
Use when a subtask fully belongs to another role's domain.

```
DELEGATION
═══════════════════════════════
From:       <your role>
To:         <target role>
Type:       DELEGATE (ownership transfer for subtask)
Task:       <what needs to be done>
Context:    <relevant background>
Constraints: <any requirements or deadlines>
Return To:  <your role, when subtask is complete>
```

Execute the subtask fully as the target role, then hand back with a completion
summary.

### 2c. Escalate (Need Higher Authority)
Use when a decision exceeds your scope or conflicts arise between roles.

```
ESCALATION
═══════════════════════════════
From:     <your role>
To:       /cto (technical) or /ceo (product) or /tech-lead (process)
Type:     ESCALATE
Issue:    <what can't be resolved at current level>
Options:  <proposed alternatives>
Impact:   <consequences of each option>
```

---

## 3. Shared Team Memory

All roles read from and write to `team-memory.txt` in the project root. This
file acts as the team's shared brain — capturing decisions, feedback, blockers,
and context so every role stays on the same page.

### Reading Memory
**Before starting any task**, check if `team-memory.txt` exists in the project
root. If it does, read it to understand:
- Active decisions and their rationale
- Feedback from other roles
- Current blockers or concerns
- Project context and constraints

### Writing Memory
**After completing significant work**, append an entry to `team-memory.txt`:

```
────────────────────────────────────────
[ROLE: <your-role>] [DATE: <ISO date>] [TYPE: <type>]

<content>
────────────────────────────────────────
```

**Entry types:**
| Type | When to Write |
|------|---------------|
| `DECISION` | You made an architectural or design choice others should know |
| `FEEDBACK` | You have input for another role's work |
| `BLOCKER` | Something is preventing progress |
| `CONTEXT` | Background info other roles will need |
| `HANDOFF` | You're passing work to another role |
| `CONCERN` | A potential issue others should be aware of |
| `COMPLETED` | You finished a significant deliverable |
| `RESEARCH` | You researched a topic before implementing — share key findings |

### Memory Rules
1. **Be concise** — max 5-10 lines per entry
2. **Be specific** — name files, functions, line numbers
3. **Tag the target** — if feedback is for a specific role, name it
4. **Don't duplicate** — don't restate what's already in the file
5. **Chronological** — always append, never edit previous entries

---

## 4. Team Decision-Making Hierarchy

When roles disagree or need alignment:

```
Product Decisions:  CEO > CTO > Tech Lead > Individual Roles
Technical Decisions: CTO > Tech Lead > Domain Expert > Individual Roles
Quality Decisions:  QA Engineer + Security Engineer (veto power on safety)
Process Decisions:  Tech Lead > DevOps > Individual Roles
```

**Veto Power:**
- **Security Engineer** can veto any change with CRITICAL/HIGH security findings
- **QA Engineer** can block ship if critical test coverage is missing
- **CEO** can cut scope at any time
- **CTO** can override technical decisions with documented rationale

---

## 5. Collaboration Patterns

### Pattern A: Build Together
Multiple roles working on the same feature simultaneously.
- Frontend + Backend work in parallel, share API contracts via team-memory
- QA writes test plan while devs build, catches issues early
- Security reviews architecture before implementation begins

### Pattern B: Review Chain
Work passes through roles for quality gates.
```
Dev → Tech Lead (review) → QA (test) → Security (audit) → DevOps (ship)
```

### Pattern C: Consult Loop
One role leads, others provide input on demand.
- Frontend leads a UI feature, consults DBA on data shape, Security on auth flow
- Backend leads an API, consults Frontend on response format, DevOps on deployment

### Pattern D: War Room
All relevant roles focus on one critical issue.
- Incident: Security + Backend + DevOps collaborate simultaneously
- Launch: CEO + CTO + QA + DevOps align on go/no-go

---

## 6. Auto-Apply Rules

This protocol **automatically applies** to:
- All existing roles in `roles/`
- All future roles created via `/create-role`
- Any custom role added to the `roles/` directory

**Every role MUST:**
1. Include `## Team Collaboration` section referencing this protocol
2. Check `team-memory.txt` before starting work
3. Write to `team-memory.txt` after completing significant work
4. Delegate to other roles when task crosses domain boundaries
5. Respect the decision-making hierarchy
6. Use the delegation protocol format for handoffs
7. Run the Pre-Implementation Research check (Section 8) before adding features
8. Invoke `/research` when confidence is MEDIUM or LOW on implementation approach

**New roles** created via the `/create-role` workflow will have the Team
Collaboration section added automatically by the workflow. If a role is created
manually, add this section at the end:

```markdown
## Team Collaboration

This role follows the **Team Collaboration Protocol** defined in
`roles/_team-protocol.md`. Key behaviors:

- **Consult** other roles when work crosses domain boundaries
- **Delegate** subtasks to the appropriate specialist
- **Read** `team-memory.txt` before starting any task
- **Write** decisions, feedback, and blockers to `team-memory.txt`
- **Escalate** to /cto (technical) or /ceo (product) when blocked

See `roles/_team-protocol.md` for the full protocol, role registry, and
delegation format.
```

---

## 7. Communication Standards

- **No silos** — every role's output is visible to the team via team-memory
- **Name names** — when providing feedback, specify which role it's for
- **Be actionable** — feedback should be specific enough to act on
- **Assume good intent** — other roles made decisions with their context
- **Trust expertise** — defer to the domain expert unless you have evidence

---

## 8. Pre-Implementation Research

**Before adding any non-trivial feature**, every role MUST assess whether research
is needed and invoke `/research` when it is. This ensures decisions are backed by
current best practices, not stale assumptions.

### When to Research

| Situation | Research Depth | Example |
|-----------|---------------|---------|
| Using a library/API you haven't used before | **Deep** | "How does Stripe's new Payment Element work?" |
| Choosing between multiple approaches | **Deep** | "Server Actions vs API routes for form mutations" |
| Implementing a pattern with security implications | **Deep** | "Best practices for WebSocket auth in 2025" |
| Major architecture decision or new technology adoption | **Super-Deep** | "Should we migrate from REST to tRPC?" |
| Quick syntax/usage lookup | **Minimal** | "Next.js 15 metadata API signature" |
| Feature touches an unfamiliar domain | **Deep** | "How do ARIA live regions work for toast notifications?" |
| Performance-critical implementation | **Deep** | "Virtual scroll libraries comparison for 10K+ items" |

### When Research is NOT Needed

- Routine CRUD operations with well-known patterns
- Small refactors within existing codebase patterns
- Bug fixes where the root cause is already identified
- Tasks fully covered by your role's existing expertise and canonical patterns

### Research Protocol for Feature Work

Before implementing, ask yourself:

```
PRE-IMPLEMENTATION CHECK
═══════════════════════════════════════
Feature:     <what's being built>
Confidence:  HIGH / MEDIUM / LOW

Do I need research?
  [ ] Am I using an unfamiliar library, API, or pattern?
  [ ] Are there multiple valid approaches and I'm unsure which fits?
  [ ] Does this have security, performance, or accessibility implications I'm not 100% on?
  [ ] Has the ecosystem changed since my last knowledge of this topic?
  [ ] Would a real senior engineer Google this before implementing?

If ANY box is checked → Run /research before implementing.
```

### How to Research

Invoke the research workflow with the appropriate depth:

```
/research minimal <specific question>     → Quick lookup (2-3 sources)
/research deep <topic>                    → Full evaluation (5-10 sources)
/research super-deep <topic>              → Architecture decision (10-20+ sources)
```

### After Research

1. **Save findings** — research reports are cached in `.research/` for the team
2. **Write to team-memory** — summarize key findings that affect other roles
3. **Cite in implementation** — reference the research when making decisions
4. **Update if stale** — if `.research/` has an old report on the same topic, re-research

### Role-Specific Research Triggers

| Role | Auto-Research When... |
|------|----------------------|
| **Frontend Dev** | New UI library, unfamiliar component pattern, a11y pattern, framework upgrade |
| **Backend Dev** | New ORM feature, unfamiliar auth flow, queue pattern, API design choice |
| **DevOps** | New cloud service, deployment strategy, container pattern, CI tool |
| **Security Engineer** | New vulnerability class, auth protocol, encryption library |
| **DBA** | New database feature, migration strategy, indexing pattern at scale |
| **Auth Expert** | New OAuth flow, provider SDK update, session strategy |
| **GSAP Expert** | New GSAP plugin, browser animation API, performance technique |
| **Mobile Dev** | New native API, cross-platform library, app store requirement change |
| **Accessibility Expert** | New WCAG guideline, ARIA pattern, assistive tech behavior |
| **Realtime Systems** | New protocol version, scaling pattern, message broker feature |
| **CTO** | Technology evaluation, architecture pattern, build-vs-buy decision |
| **All Roles** | Anything where you'd say "I think this is right but I'm not sure" |

### Integration with Team Memory

After research, write a summary to `team-memory.txt`:

```
────────────────────────────────────────
[ROLE: <role>] [DATE: <date>] [TYPE: RESEARCH]

Feature: <what's being built>
Topic researched: <what was looked up>
Key finding: <1-2 line summary of conclusion>
Report: .research/<filename>.md
Affects: <roles that should read this>
────────────────────────────────────────
```
