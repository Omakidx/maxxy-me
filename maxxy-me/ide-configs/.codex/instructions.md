# Maxxy-Me - Codex Pro+ Figma MCP Instructions

Use one role only: `/figma-expert` from `maxxy-me/roles/figma-expert.md`.

`FIGMA_DESIGN_MEMORY.md` is mandatory and cannot be bypassed. Before any Figma
implementation task, read it from the project root. If missing, create it from
`maxxy-me/templates/FIGMA_DESIGN_MEMORY.md`. Update it after MCP extraction and
after verification. Stop with BLOCKED if it cannot be read, created, or updated.

`FIGMA_SYSTEM_DESIGN.md` is mandatory after Figma MCP extraction and before
implementation code starts. Create it from
`maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md` when missing, fill it from MCP
evidence with buttons, colors, fonts, spacing, assets, states, responsive rules,
accessibility requirements, code mapping, gaps, and decisions, and record its
path and status in `FIGMA_DESIGN_MEMORY.md`.

Mandatory clarification gate: to avoid hallucination, strictly always ask a
concise clarifying question whenever any requirement, Figma evidence, user
intent, design detail, asset, token, state, constraint, or implementation
choice is unclear. Do not guess or proceed on unsupported assumptions; continue
only after user clarification or verified source evidence resolves the
ambiguity.

Mandatory tech stack confirmation: before any Figma design starts, explicitly
ask the user which implementation tech stack to target, such as React,
Next.js + Bun, Vue, TanStack Router/Start, SvelteKit, Nuxt, Astro, or another
stack.
Ask even when repository files appear to reveal the stack. If the user already
stated a stack, explicitly confirm it before MCP extraction or implementation,
and record it in `FIGMA_DESIGN_MEMORY.md`. Stop with NEEDS_CONTEXT if the stack
is not confirmed.

For every Figma implementation request:

1. Read the role file.
2. Read or create `FIGMA_DESIGN_MEMORY.md`.
3. Ask or confirm the target tech stack with the user.
4. Verify Figma MCP tools are available.
5. Request a Figma node URL if no MCP-readable selection is provided.
6. Fetch design context, metadata, screenshot, variables, and assets through MCP.
7. Write or update `FIGMA_SYSTEM_DESIGN.md` before implementation code starts.
8. Interpret the design in an evidence pass before writing code.
9. Implement in the existing project style.
10. Auto-correct known Figma translation errors with project standards.
11. Verify tests/builds, accessibility, responsive behavior, and screenshot parity.
12. Update design memory with final evidence.

Never invent missing Figma details or use placeholders when real assets are
available. Do not start implementation code before `FIGMA_SYSTEM_DESIGN.md` is
written. Do not infer, assume, or skip the user-confirmed tech stack. Do not
leave known Figma translation errors uncorrected when project standards make the
fix clear. Preserve unrelated user changes.
