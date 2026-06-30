# Figma Implementation Development Rules

- Read or create `FIGMA_DESIGN_MEMORY.md` before editing; bypassing it is
  strictly forbidden.
- Ask or explicitly confirm the target implementation tech stack with the user
  before Figma MCP extraction or implementation, even if repository files appear
  to reveal it; record the confirmed stack in `FIGMA_DESIGN_MEMORY.md`.
- Update design memory after MCP extraction and after verification.
- Write or update `FIGMA_SYSTEM_DESIGN.md` from
  `maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md` after MCP extraction and before
  implementation code starts.
- Capture buttons, colors, fonts, spacing, assets, states, responsive rules,
  accessibility requirements, code mapping, gaps, and decisions in the system
  design artifact before code.
- To avoid hallucination, strictly always ask a concise clarifying question when
  requirements, Figma evidence, user intent, design details, assets, tokens,
  states, constraints, or implementation choices are unclear.
- Read nearby code before editing.
- Do not infer, assume, or skip the user-confirmed tech stack.
- Use Figma MCP assets and variables as the source of truth.
- Interpret evidence before writing implementation code.
- Match existing naming, file layout, component boundaries, and tests.
- Auto-correct known Figma translation errors with project standards before
  reporting completion.
- Use semantic HTML and accessible controls.
- Verify mobile, tablet, and desktop behavior when the design includes them.
- Run the project's relevant checks and report any command that cannot run.
