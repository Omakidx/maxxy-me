# Figma Design Memory

This file must be named `FIGMA_DESIGN_MEMORY.md`. It is mandatory shared memory
for every IDE agent working in this project. It is strictly forbidden to bypass,
ignore, delete, or treat this file as optional.

Every Figma implementation agent must:
- Read this file before inspecting implementation code for a design task.
- Create it from this template if missing.
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

- Status: none
- Figma file:
- Page:
- Frame/node:
- Figma URL:
- MCP mode: remote or desktop
- Last MCP extraction:
- Last screenshot reference:
- Target tech stack:
- Target route/component:
- Active IDE/agent:
- System-design status:
- Clarification status:
- Auto-correction status:

## Previously Implemented Designs

| Date | Figma Source | Target Files | Verification | Status |
|------|--------------|--------------|--------------|--------|
| none | none | none | none | none |

## Design Tokens

- Colors:
- Typography:
- Spacing:
- Radius:
- Shadows/effects:
- Motion:

## System Design Artifact

- Path: `FIGMA_SYSTEM_DESIGN.md`
- Status:
- Source evidence:
- Covered components:
- Missing required details:

## Asset Memory

- Downloaded images:
- Downloaded icons:
- Reused existing components:
- Asset gaps:

## Implementation Decisions

- Architecture decisions:
- Component mapping:
- Responsive decisions:
- Accessibility decisions:
- Clarifications requested:
- Known tradeoffs:

## Translation Error Corrections

Known Figma-to-code translation errors must be auto-corrected using project
standards before completion unless the correction is BLOCKED by missing
evidence, permissions, or user-required product or design decisions.

| Date | Error | Project Standard Used | Correction | Verification | Status |
|------|-------|-----------------------|------------|--------------|--------|
| none | none | none | none | none | none |

## Verification History

- Screenshot parity:
- Tests/builds:
- Accessibility checks:
- Responsive checks:
- Remaining mismatches:

## Open Items

- None yet.
