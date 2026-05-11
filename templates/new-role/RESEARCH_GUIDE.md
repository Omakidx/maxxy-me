# Research Guide for New Roles

Before writing a role definition, use `/research super-deep` to gather domain knowledge.
This ensures the role is grounded in real, current, authoritative information.

## Step 1: Identify Key Research Targets

For any new role, you need to research:

| Category | What to Find | Example Sources |
|----------|-------------|-----------------|
| **Official docs** | Core concepts, API references, getting started | Official documentation site |
| **GitHub repos** | Agent skills, examples, source code, known issues | `github.com/<org>/<tool>` |
| **Best practices** | Industry standards, security guidelines | OWASP, NIST, RFC documents |
| **Ecosystem tools** | Libraries, plugins, CLI tools, integrations | npm, PyPI, package registries |
| **Comparisons** | Alternatives, trade-offs, when to use what | Blog posts, comparison articles |
| **Anti-patterns** | Common mistakes, footguns, performance pitfalls | GitHub issues, Stack Overflow |

## Step 2: Run the Research

```
/research super-deep <domain topic>
```

### Search Queries to Run

For a tool/framework expert role:
1. `"<tool> best practices <current year>"`
2. `"<tool> vs <alternative1> vs <alternative2> comparison"`
3. `"<tool> common mistakes anti-patterns"`
4. `"<tool> production setup guide"`
5. `"<tool> security best practices"`
6. `"<tool> performance optimization"`
7. `"<tool> agent skills" OR "<tool> AI skills" site:github.com`

For a discipline expert role (e.g., auth, security, testing):
1. `"OWASP <discipline> cheat sheet"`
2. `"<discipline> best practices <current year>"`
3. `"<discipline> common vulnerabilities mistakes"`
4. `"<discipline> tools comparison"`
5. `"<discipline> patterns architecture"`

### Key URLs to Always Check

- **GitHub:** `github.com/<org>/<tool>` — README, SKILL.md, issues, discussions
- **Official docs:** Usually linked from GitHub README
- **OWASP:** `cheatsheetseries.owasp.org` — for security-related roles
- **Agent skills repos:** `github.com/<org>/agent-skills` — if the tool has AI agent integrations

## Step 3: Extract and Organize

While researching, collect:

### Must-Have Information
- [ ] Core concepts and terminology
- [ ] Setup / installation steps
- [ ] Key API / CLI commands
- [ ] Best practices (with sources)
- [ ] Anti-patterns (with reasons)
- [ ] Decision frameworks (when to use X vs Y)

### Nice-to-Have Information
- [ ] Performance benchmarks
- [ ] Security considerations
- [ ] Migration paths from alternatives
- [ ] Pricing / cost considerations
- [ ] Community size and maturity signals
- [ ] Code examples from official repos

## Step 4: Map Research to Role Sections

| Research Finding | Maps to Role Section |
|-----------------|---------------------|
| Core concepts, terminology | **Expertise** |
| Mental models, priorities | **Decision Lens** |
| Setup guides, code examples | **Canonical Patterns** |
| CLI tools, libraries, APIs | **Tools & References** |
| Common mistakes, footguns | **Anti-Patterns** |
| Task categories | **Complexity Tiers** |
| Quality criteria | **Verification Checklist** |
| Output structure | **Output Format** |

## Example Research Session

Here's how the `neondb-expert` role was researched:

```
RESEARCH PLAN
═══════════════════════════════════════════
Topic:       Neon Serverless Postgres — comprehensive expert knowledge
Depth:       super-deep
Objective:   Build a role that can handle any Neon task

Sources fetched:
  1. github.com/neondatabase/agent-skills — official AI agent skills (4 SKILL.md files)
  2. neon.com/docs/ai/neon-mcp-server — MCP server capabilities
  3. Drizzle ORM + Neon docs — ORM integration patterns
  4. Neon pricing/features articles — cost optimization knowledge

Search queries:
  1. "Neon database serverless postgres features branching autoscaling 2025"
  2. "Neon database AI agent skills SQL migrations schema management"
  3. "Neon database MCP server natural language SQL management"
  4. "Neon database Drizzle ORM Prisma setup connection serverless driver"

Result: 500+ line role covering 4 agent skills, MCP server, CLI, API, ORM setup,
        branching workflows, egress optimization, and anti-patterns.
```

## Tips

- **Prioritize official sources** — they're the most accurate and up-to-date
- **Check for agent-skills repos** — many tools now have AI-specific documentation
- **Read GitHub issues** — real-world problems reveal important anti-patterns
- **Compare 2-3 alternatives** — understanding trade-offs makes the role's advice better
- **Don't skip anti-patterns** — these are what separate a good role from a great one
