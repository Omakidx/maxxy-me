# Contributing

Keep Maxxy-Me focused on one job: interpreting and implementing Figma designs
through MCP with mandatory design memory.

## Before Opening A Change

1. Put reusable role behavior in `maxxy-me/roles/figma-expert.md`.
2. Keep `FIGMA_DESIGN_MEMORY.md` mandatory in the role, IDE files, and tests.
3. Keep the mandatory tech-stack confirmation gate in the role, IDE files,
   templates, and tests.
4. Keep IDE files thin and pointing at the canonical role.
5. Keep the mandatory clarification gate in the role, IDE files, templates, and
   tests: if anything is unclear, the agent must ask before continuing.
6. Keep known Figma translation errors auto-corrected with project standards
   before completion.
7. Do not reintroduce extra roles, slash workflows, or role-creation scaffolds.
8. Avoid unpinned remote execution, credentials, destructive examples, and
   claims that cannot be traced to primary docs.
9. Run both validation suites:

   ```bash
   bash tests/content_test.sh
   bash tests/setup_test.sh
   ```

## Pull Requests

Describe the Figma interpretation behavior changed, tech-stack confirmation
impact, memory impact, user-visible behavior, and verification. Keep unrelated
edits separate.
