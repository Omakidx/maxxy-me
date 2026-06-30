# Figma Design Memory

This file must be named `FIGMA_DESIGN_MEMORY.md`. It is mandatory shared memory
for every IDE agent working in this project. It is strictly forbidden to bypass,
ignore, delete, or treat this file as optional.

Every Figma implementation agent must:
- Read this file before inspecting implementation code for a design task.
- Create it from `maxxy-me/templates/FIGMA_DESIGN_MEMORY.md` if missing.
- Ask or explicitly confirm the target implementation tech stack with the user
  before Figma MCP extraction or implementation starts.
- Ask a concise clarifying question whenever requirements, Figma evidence, user
  intent, design details, assets, tokens, states, constraints, or implementation
  choices are unclear; never proceed on unsupported assumptions.
- Update it after Figma MCP extraction and before implementation starts.
- Create or update `FIGMA_SYSTEM_DESIGN.md` from
  `maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md` after MCP extraction and before
  implementation code starts.
- Update it again after verification.
- Record system-design artifact status, extracted tokens/components, gaps, and
  verification result.
- Record the user-confirmed target tech stack.
- Record detected Figma-to-code translation errors, the project standards used
  to auto-correct them, and the verification result.
- Stop with BLOCKED if the file cannot be read, created, or updated.

## Current Implementation

- Status: completed mandatory tech-stack confirmation gate across IDE agents
- Figma file: none for this repo maintenance task
- Page: none
- Frame/node: none
- Figma URL: none
- MCP mode: not used
- Last MCP extraction: none; no Figma source was involved in this repository maintenance task
- Last screenshot reference: none
- Target tech stack: not applicable for this repository maintenance task
- Target route/component: Maxxy-Me Figma expert role, IDE rules, README,
  contributing guide, system-design template, memory template, and content/setup
  tests
- Active IDE/agent: Codex
- System-design status: DONE; package instructions now require
  `FIGMA_SYSTEM_DESIGN.md` to be written from MCP evidence before Figma
  implementation code starts
- Clarification status: DONE; every IDE adapter and the canonical role now
  require a concise clarifying question whenever requirements, Figma evidence,
  user intent, design details, assets, tokens, states, constraints, or
  implementation choices are unclear
- Tech stack confirmation status: DONE; every IDE adapter, the canonical role,
  memory template, system-design template, README, contributing guide, and
  regression tests now require asking or confirming the target tech stack before
  Figma MCP extraction or implementation
- Auto-correction status: package instructions require known translation errors
  to be auto-corrected using project standards before completion

## Previously Implemented Designs

| Date | Figma Source | Target Files | Verification | Status |
|------|--------------|--------------|--------------|--------|
| none | none | none | none | none |

## Design Tokens

- Colors: none
- Typography: none
- Spacing: none
- Radius: none
- Shadows/effects: none
- Motion: none

## System Design Artifact

- Path: `FIGMA_SYSTEM_DESIGN.md`
- Status: template and mandatory pre-implementation gate added for future Figma
  MCP implementation tasks
- Source evidence: no Figma source for this repository maintenance task
- Covered components: buttons, forms, navigation, cards, panels, dialogs,
  overlays, assets, icons, content, responsive rules, interactions, states, and
  accessibility requirements will be required in future Figma tasks
- Missing required details: none for this maintenance task

## Asset Memory

- Downloaded images: none
- Downloaded icons: none
- Reused existing components: none
- Asset gaps: none

## Implementation Decisions

- Architecture decisions: Maxxy-Me is a single-role Figma MCP package with only `roles`, `templates`, and `ide-configs` in the packaged source tree; `maxxy-me/tools` was removed.
- Component mapping: no UI components in this repository.
- Responsive decisions: no UI implementation in this repository.
- Accessibility decisions: role now requires accessibility verification for Figma-to-code work.
- Clarifications requested: user clarified the rule applies to the entire agent
  on any IDE.
- Tech stack confirmation decision: user required every IDE or agent
  environment to explicitly ask for the implementation stack, such as React,
  Next.js + Bun, Vue, or TanStack, before any Figma design starts.
- Known tradeoffs: root active IDE files mirror canonical files under `maxxy-me/ide-configs/`; tracked obsolete tool files are pruned on upgrade only when unmodified, while locally modified obsolete package files are preserved.

## Translation Error Corrections

Known Figma-to-code translation errors must be auto-corrected using project
standards before completion unless the correction is BLOCKED by missing
evidence, permissions, or user-required product or design decisions.

| Date | Error | Project Standard Used | Correction | Verification | Status |
|------|-------|-----------------------|------------|--------------|--------|
| 2026-06-30 | Agent instructions did not explicitly require automatic correction of known Figma translation errors. | Maxxy-Me single-role Figma MCP operating rules and project-standard implementation discipline. | Added an explicit project-standard auto-correction requirement to the role, memory template, IDE rule surface, README, contributing guide, and regression tests. | `bash tests/content_test.sh` passed; `bash tests/setup_test.sh` passed | DONE |
| 2026-06-30 | Agent instructions did not require a dedicated Figma system-design markdown before implementation. | Maxxy-Me evidence-first Figma MCP operating rules and mandatory shared design memory. | Added a `FIGMA_SYSTEM_DESIGN.md` gate and template so colors, typography, components, assets, states, responsive rules, and accessibility evidence are recorded before code. | `bash tests/content_test.sh` passed; `bash tests/setup_test.sh` passed | DONE |
| 2026-06-30 | Agent instructions did not strictly require clarification whenever something was unclear. | Maxxy-Me evidence-first operating rules and user instruction that the entire agent, on any IDE, must always ask if unclear. | Added a mandatory clarification gate to the role, IDE adapters, templates, README, contributing guide, and regression tests. | `bash tests/content_test.sh` passed; `bash tests/setup_test.sh` passed | DONE |
| 2026-06-30 | Agent instructions did not explicitly require asking the user which tech stack to target before a Figma design starts. | Maxxy-Me evidence-first Figma MCP workflow and user instruction that every IDE or agent environment must ask with no bypass. | Added a mandatory tech-stack confirmation gate to the role, AGENTS/Claude/Codex/Cursor/Copilot/OpenCode/Windsurf adapters, memory and system-design templates, README, contributing guide, and regression tests. | `bash tests/content_test.sh` passed; `bash tests/setup_test.sh` passed | DONE |

## Verification History

- Screenshot parity: not applicable
- Tests/builds: `bash tests/content_test.sh` passed; `bash tests/setup_test.sh`
  passed after adding the mandatory tech-stack confirmation gate
- Accessibility checks: enforced by role and IDE instructions
- Responsive checks: enforced by role and IDE instructions
- Remaining mismatches: none known

## Open Items

- None.
