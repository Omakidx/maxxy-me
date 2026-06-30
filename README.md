# Maxxy-Me

Maxxy-Me is a portable Pro+ Figma MCP design interpreter and implementation
agent. Install it into an existing project to give supported AI coding tools one
shared role: `/figma-expert`.

The agent reads Figma through MCP, interprets the design in an evidence-first
pass, asks or confirms the user-selected target tech stack, extracts design
context and variables, writes a Figma system-design markdown before code,
downloads assets, implements the design in the current codebase, and verifies
accessibility, responsive behavior, tests/builds, and screenshot parity. Known
Figma-to-code translation errors are auto-corrected with the target project's
standards before completion whenever the fix is clear.
To avoid hallucination, it must ask a concise clarifying question whenever any
requirement, Figma evidence, user intent, design detail, asset, token, state,
constraint, or implementation choice is unclear.

## What Is Included

- One role: `maxxy-me/roles/figma-expert.md`
- Mandatory design memory: `FIGMA_DESIGN_MEMORY.md`
- Mandatory Figma system-design artifact: `FIGMA_SYSTEM_DESIGN.md`
- Thin IDE adapters for Windsurf, Cursor, Claude Code, Codex, GitHub Copilot,
  OpenCode, and generic rule-file workflows

## Mandatory Design Memory

Every installed agent must read and update `FIGMA_DESIGN_MEMORY.md`. Bypassing
this file is strictly forbidden for every IDE agent.

The memory tracks previous and current Figma implementation work: Figma sources,
node/frame IDs, tokens, assets, component mapping, responsive decisions,
accessibility decisions, translation error corrections, verification history,
open mismatches, and status.

If the file is missing, the agent must create it from
`maxxy-me/templates/FIGMA_DESIGN_MEMORY.md`. If it cannot be read, created, or
updated, the agent must stop with BLOCKED.

## Mandatory System Design

Before implementation code starts for a Figma design, the agent must write or
update `FIGMA_SYSTEM_DESIGN.md` from
`maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md` using MCP evidence. The artifact
must capture the design system details that are easy to lose during conversion:
buttons, colors, fonts, spacing, radii, shadows, assets, icons, content, states,
responsive rules, accessibility requirements, code mapping, gaps, and decisions.

## Mandatory Clarification

Every IDE adapter follows a strict always-ask rule: if anything is unclear, the
agent asks the user or verifies source evidence before continuing. It must not
guess, invent missing details, silently choose between plausible
interpretations, or proceed on unsupported assumptions.

## Mandatory Tech Stack Confirmation

Before any Figma design starts, every IDE agent must explicitly ask the user
which implementation tech stack to target, such as React, Next.js + Bun, Vue,
TanStack Router/Start, SvelteKit, Nuxt, Astro, or another stack. The agent must
ask even when repository files appear to reveal the stack. If the user already
stated one, the agent must explicitly confirm it before MCP extraction or
implementation and record it in `FIGMA_DESIGN_MEMORY.md`.

## Install

`cd` into your project, then clone and run the installer:

```bash
rm -rf /tmp/maxxy-me && git clone https://github.com/Omakidx/maxxy-me.git /tmp/maxxy-me && /tmp/maxxy-me/setup.sh . && rm -rf /tmp/maxxy-me
```

To explicitly specify an IDE:

```bash
rm -rf /tmp/maxxy-me && git clone https://github.com/Omakidx/maxxy-me.git /tmp/maxxy-me && /tmp/maxxy-me/setup.sh . <ide> && rm -rf /tmp/maxxy-me
```

Replace `<ide>` with `windsurf`, `cursor`, `claude`, `codex`, `copilot`,
`opencode`, `all`, or `minimal`.

The installer copies the package to `maxxy-me/`, creates
`FIGMA_DESIGN_MEMORY.md` when absent, and adds only the selected IDE integration.
It does not overwrite pre-existing or locally modified project files. By default
it also installs the generic `maxxy-me` helper in `~/.local/bin`; pass
`--no-cli` to skip that step.

## Use

Run the helper from anywhere inside an installed project:

```bash
maxxy-me activate codex
maxxy-me activate windsurf
maxxy-me --version
maxxy-me uninstall
```

Use `/figma-expert` for Figma-to-code requests. If Figma MCP is not configured
in the current IDE, the role explains the remote MCP default and desktop Dev
Mode fallback before implementation starts.

## Repository Layout

```text
maxxy-me/
├── ide-configs/  # Templates copied to supported IDEs
├── roles/        # Single role: figma-expert.md
├── templates/    # FIGMA_DESIGN_MEMORY.md template
└── setup.sh      # Installer implementation
setup.sh          # Source-checkout entry point
tests/            # Installer and content regression tests
```

## Develop And Verify

The project has no runtime dependencies. It requires Bash 4+, standard Unix
utilities, and SHA-256 tooling (`sha256sum`). Run:

```bash
bash tests/content_test.sh
bash tests/setup_test.sh
```

When changing the role, update the canonical role file, the memory and
system-design templates, the Windsurf workflow, the IDE instruction files, and
tests together. Preserve the tech-stack confirmation gate and the
auto-correction rule that known translation errors are fixed with project
standards before completion.

## Security Model

The installer tracks the checksum of every root-level file it creates. Later
activation updates only unmodified tracked files; uninstall removes only
unmodified tracked files. Package files use the same ownership model, so local
customizations survive uninstall. Existing commands in `~/.local/bin/maxxy-me`
are never overwritten unless they carry the Maxxy-Me management marker.

Figma MCP authentication belongs to the user's IDE or agent environment. Do not
commit Figma tokens, cookies, OAuth material, or private file exports.
