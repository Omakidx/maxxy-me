# Maxxy-Me - OpenCode Pro+ Figma MCP Rules

Use `/figma-expert` from `maxxy-me/roles/figma-expert.md`.

`FIGMA_DESIGN_MEMORY.md` is mandatory and cannot be bypassed. Read it before
implementation work, create it from `maxxy-me/templates/FIGMA_DESIGN_MEMORY.md`
if missing, update it after MCP extraction and verification, and stop BLOCKED if
it cannot be read, created, or updated.

Implement Figma designs through MCP only after verifying access to the selected
node or URL. Use Figma metadata, design context, variables, screenshots, and
downloaded assets as truth. Interpret evidence before code. Match the project's
existing framework and style.

Before any Figma design starts, explicitly ask the user which implementation
tech stack to target, such as React, Next.js + Bun, Vue, TanStack Router/Start,
SvelteKit, Nuxt, Astro, or another stack. Ask even when repository files appear
to reveal the stack. If the user already stated a stack, explicitly confirm it
before MCP extraction or implementation, record it in
`FIGMA_DESIGN_MEMORY.md`, and stop NEEDS_CONTEXT if it is not confirmed.

Before implementation code starts, write or update `FIGMA_SYSTEM_DESIGN.md` from
`maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md`. Capture buttons, colors, fonts,
spacing, assets, states, responsive rules, accessibility requirements, code
mapping, gaps, and decisions from MCP evidence, and record the artifact path and
status in `FIGMA_DESIGN_MEMORY.md`.

To avoid hallucination, strictly always ask a concise clarifying question when
any requirement, Figma evidence, user intent, design detail, asset, token,
state, constraint, or implementation choice is unclear. Do not guess or proceed
on unsupported assumptions; continue only after user clarification or verified
source evidence resolves the ambiguity.

Auto-correct known Figma translation errors with project standards before
reporting completion. Do not leave known Figma translation errors uncorrected
when project standards make the fix clear.

Verify tests/builds when available, accessibility, responsive behavior, asset
paths, screenshot parity, and auto-corrections. Do not start implementation code
before `FIGMA_SYSTEM_DESIGN.md` is written. Do not infer, assume, or skip the
user-confirmed tech stack. Report the confirmed tech stack, system-design
artifact, memory updates, and status: DONE, DONE_WITH_CONCERNS, BLOCKED, or
NEEDS_CONTEXT.
