---
description: Create a new specialist role with deep research. Use when adding a new expert role to maxxy-agent. Handles research, role definition, workflow wrapper, and index registration.
---

# /create-role — New Role Generator

Creates a sophisticated specialist role backed by deep research.

## Step 1: Gather Requirements

Ask the user (or infer from context):
- **Role name** — e.g., "redis-expert", "aws-architect", "graphql-expert"
- **Domain** — what area does this role cover?
- **Key capabilities** — what should the expert be able to do?
- **Research sources** — any specific URLs, repos, or docs to start from?

## Step 2: Research the Domain

Read the research guide: `templates/new-role/RESEARCH_GUIDE.md`

Run `/research super-deep <domain topic>` to gather:
- Official documentation and getting started guides
- GitHub repos (especially agent-skills repos if they exist)
- Best practices and industry standards (OWASP, NIST, RFCs)
- Ecosystem tools, libraries, and CLI tools
- Common anti-patterns and mistakes
- Comparison with alternatives

Target: **10-20 sources** for a comprehensive role.

## Step 3: Create the Role Definition

1. Read the role template: `templates/new-role/ROLE_TEMPLATE.md`
2. Read the examples file: `templates/new-role/EXAMPLES.md`
3. Create `roles/<role-slug>.md` using the template structure
4. Fill every section with research-backed content:
   - **Persona:** Specific seniority, mental models, personality
   - **Expertise:** 5-10+ areas with specific tools and concepts
   - **Decision Lens:** 4-6 domain-specific priorities
   - **Canonical Patterns:** 5-15 copy-paste-ready recipes with real code
   - **Tools & References:** Ecosystem reference table
   - **Anti-Patterns:** 10-25 "Do Not" items grouped by category
   - **Verification Checklist:** 8-15 quality checks
   - **Output Format:** Structured recommendation template
5. Remove all `<!-- comments -->` and `{{PLACEHOLDERS}}` from the final file

## Step 3.5: Add Team Collaboration Section

**REQUIRED** — Every role must be interconnected with the team.

1. Read `roles/_team-protocol.md` to understand the collaboration system
2. Ensure the role file includes a `## Team Collaboration` section (from template)
3. Customize the generic collaboration bullets with role-specific connections:
   - Identify 2-4 roles this expert would naturally collaborate with
   - Specify WHAT they'd consult each role about
   - Define escalation paths (usually `/cto` for technical, `/ceo` for product)
   - Add veto power if applicable (e.g., security, QA)
4. Remove the `<!-- TEAM COLLABORATION GUIDE -->` comment block from final file
5. Add the new role to the Role Registry table in `roles/_team-protocol.md`

## Step 4: Create the Workflow Wrapper

1. Read the workflow template: `templates/new-role/WORKFLOW_TEMPLATE.md`
2. Create `.windsurf/workflows/<role-slug>.md`
3. Fill in: description, title, assessment areas

## Step 5: Register the Role

Add the new role to both index files:
- `AGENTS.md` — add row to Specialist Roles table: `| /slug | roles/slug.md | short description |`
- `CLAUDE.md` — add row to Specialist Roles table: `| /slug | Role Title | short description |`

## Step 6: Quality Check

Run through `templates/new-role/CHECKLIST.md` to verify:
- All sections filled with domain-specific content
- No placeholders or TODOs remaining
- Code examples are real and copy-paste-ready
- Anti-patterns are specific and actionable
- Research sources are credited where applicable
- **Team Collaboration section present** with role-specific connections (not generic)
- **Role added to `roles/_team-protocol.md`** Role Registry table
- **No `<!-- comments -->` remaining** in Team Collaboration section

## Output

Report completion with:
- Role file path and line count
- Workflow file path
- Summary of what the role covers
- Number of canonical patterns, anti-patterns, and checklist items
