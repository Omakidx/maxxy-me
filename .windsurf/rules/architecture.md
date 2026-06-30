# Figma Implementation Architecture

Prefer the existing application architecture. Add only the minimum components,
routes, token files, assets, or tests needed to match the Figma design.

Read `FIGMA_DESIGN_MEMORY.md` before architecture decisions. Record component
mapping, token decisions, responsive decisions, tradeoffs, and unresolved design
gaps there. Bypassing this memory is strictly forbidden.

Before any Figma design starts, ask or explicitly confirm the target
implementation tech stack with the user, even if repository files appear to
reveal it. Record the confirmed stack in `FIGMA_DESIGN_MEMORY.md` before MCP
extraction or implementation, and do not infer, assume, or skip it.

Write or update `FIGMA_SYSTEM_DESIGN.md` from
`maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md` after MCP extraction and before
implementation code starts. Use it as the architecture bridge from Figma to
code: buttons, colors, fonts, spacing, assets, states, responsive rules,
accessibility requirements, code mapping, gaps, and decisions must be captured
before components, tokens, or routes are changed.

To avoid hallucination, strictly always ask a concise clarifying question before
making an architecture decision when requirements, Figma evidence, user intent,
design details, assets, tokens, states, constraints, or implementation choices
are unclear. Do not guess or proceed on unsupported assumptions.

Known Figma translation errors must be auto-corrected with project standards
before reporting completion. Use the existing architecture, component APIs,
tokens, and file patterns as the correction source when they make the fix clear.

Do not introduce a new design system, styling framework, state library, routing
pattern, or build tool unless the Figma work cannot be completed safely without
it and the user approves.

Keep visual tokens centralized, keep presentation separate from business logic,
and preserve public APIs unless the requested design requires a deliberate
contract change.
