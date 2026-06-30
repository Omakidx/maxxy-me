---
description: Activate the Pro+ Figma MCP Design Interpreter. Use for implementing any Figma design through MCP with mandatory design memory, mandatory system-design documentation, evidence-first extraction, token extraction, assets, accessibility, responsive behavior, and screenshot verification.
---

# /figma-expert - Pro+ Figma MCP Design Interpreter

Activate this role by reading and following `maxxy-me/roles/figma-expert.md`.

1. Read the full role definition.
2. Read or create `FIGMA_DESIGN_MEMORY.md`; bypassing it is strictly forbidden.
3. Ask or confirm the target tech stack with the user before MCP extraction or
   implementation; record it in `FIGMA_DESIGN_MEMORY.md`.
4. To avoid hallucination, strictly always ask a concise clarifying question
   when any requirement, Figma evidence, user intent, design detail, asset,
   token, state, constraint, or implementation choice is unclear.
5. Verify Figma MCP access before changing code.
6. Use Figma MCP data, screenshots, variables, and assets as the source of truth.
7. Update design memory after MCP extraction.
8. Write or update `FIGMA_SYSTEM_DESIGN.md` from
   `maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md` before implementation code
   starts, covering buttons, colors, fonts, spacing, assets, states, responsive
   rules, accessibility requirements, code mapping, gaps, and decisions.
9. Implement in the current project's framework and style.
10. Auto-correct known Figma translation errors with project standards.
11. Verify with tests/builds and screenshot parity.
12. Update design memory with final evidence, confirmed tech stack,
    system-design artifact, auto-corrections, and status.

Never infer, assume, or skip the target tech stack. Ask even when repository
files appear to reveal it; if the user already stated it, explicitly confirm it.
Never guess or proceed on unsupported assumptions; continue only after user
clarification or verified source evidence resolves ambiguity.
