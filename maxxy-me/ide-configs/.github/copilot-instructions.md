# Maxxy-Me - GitHub Copilot Pro+ Figma MCP Instructions

Use the single supported role: `/figma-expert`.

`FIGMA_DESIGN_MEMORY.md` is mandatory shared design memory. Bypassing it is
strictly forbidden. Read it before implementation work, create it from
`maxxy-me/templates/FIGMA_DESIGN_MEMORY.md` if missing, update it after MCP
extraction and verification, and stop BLOCKED if it cannot be read, created, or
updated.

Read `maxxy-me/roles/figma-expert.md`, verify Figma MCP access, fetch the design
context and assets through MCP, interpret evidence before writing code, then
implement the design in the current project style. Verify accessibility,
responsive behavior, tests/builds, asset paths, and screenshot parity before
reporting completion.
Before any Figma design starts, explicitly ask the user which implementation
tech stack to target, such as React, Next.js + Bun, Vue, TanStack Router/Start,
SvelteKit, Nuxt, Astro, or another stack. Ask even when repository files appear
to reveal the stack. If the user already stated a stack, explicitly confirm it
before MCP extraction or implementation, record it in
`FIGMA_DESIGN_MEMORY.md`, and stop NEEDS_CONTEXT if it is not confirmed.
Before implementation code starts, write or update `FIGMA_SYSTEM_DESIGN.md` from
`maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md` using MCP evidence. It must capture
buttons, colors, fonts, spacing, assets, states, responsive rules,
accessibility requirements, code mapping, gaps, and decisions, and its path and
status must be recorded in `FIGMA_DESIGN_MEMORY.md`.

To avoid hallucination, strictly always ask a concise clarifying question when
any requirement, Figma evidence, user intent, design detail, asset, token,
state, constraint, or implementation choice is unclear. Do not guess or proceed
on unsupported assumptions; continue only after user clarification or verified
source evidence resolves the ambiguity.

Auto-correct known Figma translation errors with project standards before
reporting completion.

Do not invent design details or use placeholders when Figma assets are available.
Do not start implementation code before `FIGMA_SYSTEM_DESIGN.md` is written. Do
not infer, assume, or skip the user-confirmed tech stack. Do not leave known
Figma translation errors uncorrected when project standards make the fix clear.
