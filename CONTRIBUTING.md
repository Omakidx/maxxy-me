# Contributing

Keep changes portable, evidence-backed, and safe across every supported IDE.

## Before opening a change

1. Put reusable behavior in `.maxxy-me/skills/`, `.maxxy-me/roles/`, or
   `.maxxy-me/tools/`; keep IDE workflow files thin where possible.
2. Update every canonical registry affected by the change.
3. Avoid unpinned remote execution, working credentials, destructive examples
   without explicit warnings, and claims that cannot be traced to primary docs.
4. Run both validation suites:

   ```bash
   bash tests/setup_test.sh
   bash tests/content_test.sh
   ```

## Adding a specialist role

Follow `.maxxy-me/templates/new-role/README.md` and its checklist. A role is not
complete until its frontmatter, Windsurf wrapper, team registry, AGENTS index,
CLAUDE index, connected tools, and collaboration section all agree.

## Pull requests

Describe the problem, the chosen fix, user-visible behavior, and verification.
Keep unrelated edits separate and call out any advice tied to a specific product
version or external standard.
