# New Role Template

Use this template to create a new specialist role for maxxy-agent.

## Quick Start

1. **Copy the templates:**
   ```bash
   # Replace <role-name> with your role slug (e.g., "redis-expert", "aws-architect")
   cp .maxxy-agent/templates/new-role/ROLE_TEMPLATE.md .maxxy-agent/roles/<role-name>.md
   cp .maxxy-agent/templates/new-role/WORKFLOW_TEMPLATE.md .windsurf/workflows/<role-name>.md
   ```

2. **Fill in the role definition** (`.maxxy-agent/roles/<role-name>.md`):
   - Replace all `{{PLACEHOLDERS}}` with your role-specific content
   - Follow the section guide in the template comments
   - Delete the `<!-- ... -->` comments when done

3. **Fill in the workflow wrapper** (`.windsurf/workflows/<role-name>.md`):
   - Replace `{{PLACEHOLDERS}}` to match your role

4. **Register the role** in index files:
   - `AGENTS.md` — add row to Specialist Roles table
   - `CLAUDE.md` — add row to Specialist Roles table

5. **(Optional) Research first** — Use `/research super-deep <topic>` to gather
   domain knowledge before writing the role. See `RESEARCH_GUIDE.md` for the
   recommended research workflow.

## Files in This Template

| File | Purpose |
|------|---------|
| `ROLE_TEMPLATE.md` | Full role definition template (goes in `.maxxy-agent/roles/`) |
| `WORKFLOW_TEMPLATE.md` | Workflow wrapper template (goes in `.windsurf/workflows/`) |
| `RESEARCH_GUIDE.md` | How to research a domain before writing the role |
| `CHECKLIST.md` | Quality checklist before finalizing a new role |
| `EXAMPLES.md` | Snippets from existing roles to reference |

## Naming Convention

- **Role slug:** `kebab-case` (e.g., `redis-expert`, `aws-architect`, `react-native-dev`)
- **Trigger:** `/<role-slug>` (e.g., `/redis-expert`)
- **Role title:** Title Case (e.g., `Senior Redis Engineer`)
- **File locations:**
  - `.maxxy-agent/roles/<role-slug>.md`
  - `.windsurf/workflows/<role-slug>.md`
