# Maxxy-Agent

Maxxy-Agent is a portable set of coding-agent instructions, specialist roles,
repeatable workflows, and engineering references. Install it into an existing
project to give supported AI coding tools a shared operating model without
replacing that project's own instructions.

## What is included

- Five engineering gates—planning, debugging, review, security, and shipping—plus
  product requirements, design, ticketing, research, deep planning, role creation,
  and team orchestration
- Eighteen specialist roles covering product, architecture, application
  development, operations, data, security, accessibility, and design
- Practical references and scaffolders for tests, APIs, components, configuration,
  Git, Docker, SQL, performance, dependencies, and code quality
- Integrations for Windsurf, Cursor, Claude Code, Codex, GitHub Copilot, and
  OpenCode
- A shared `team-memory.txt` template for decisions and cross-role context

Windsurf receives native workflow files. Other integrations receive instruction
files that point agents to the canonical content under `.maxxy-me/`.

## Install

Clone this repository, then run the root installer with the destination project
and optional IDE name:

```bash
git clone https://github.com/Omakidx/maxxy-me.git /tmp/maxxy-me
/tmp/maxxy-me/setup.sh /path/to/project cursor
```

Use `auto` (the default) to detect an existing IDE configuration, or choose one
of `windsurf`, `cursor`, `claude`, `codex`, `copilot`, `opencode`, `all`, or
`minimal`:

```bash
/tmp/maxxy-me/setup.sh /path/to/project
/tmp/maxxy-me/setup.sh /path/to/project minimal --no-cli
```

The installer copies the package to `.maxxy-me/`, creates `team-memory.txt` when
it is absent, and adds only the selected integration. It does not overwrite
pre-existing or locally modified project files. By default it also installs the
generic `maxxy-me` helper in `~/.local/bin`; pass `--no-cli` to skip that step.

## Use and manage an installation

Run the helper from anywhere inside an installed project:

```bash
maxxy-me activate codex
maxxy-me activate windsurf
maxxy-me --version
maxxy-me uninstall
```

Activation is additive: it adds or refreshes the selected integration while
leaving other IDE integrations in place. During uninstall, files created by the
installer are removed only when unchanged. Locally modified and pre-existing
files are preserved. Use `maxxy-me uninstall --remove-cli` to also remove the
managed global helper.

Without the helper, use the installed script directly:

```bash
.maxxy-me/setup.sh . cursor --no-cli
.maxxy-me/setup.sh --uninstall .
```

## Repository layout

```text
.maxxy-me/
├── ide-configs/  # Templates copied to each supported IDE
├── roles/        # Specialist role definitions
├── skills/       # Core engineering workflows
├── templates/    # Team memory and new-role templates
├── tools/        # References, scaffolders, and audit procedures
└── setup.sh      # Installer implementation
setup.sh          # Source-checkout entry point
tests/            # Installer regression tests
```

## Develop and verify

The project has no runtime dependencies. It requires Bash 4+, standard Unix
utilities, and SHA-256 tooling (`sha256sum`). Run the checks with:

```bash
bash tests/setup_test.sh
bash tests/content_test.sh
```

When adding a role, update its canonical definition, its Windsurf workflow
wrapper, the role registry, and the IDE index files. The detailed checklist lives
in `.maxxy-me/templates/new-role/`.

## Security model

The installer tracks the checksum of every root-level file it creates. A later
activation updates only an unmodified tracked file; uninstall removes only an
unmodified tracked file. Package files use the same ownership model, so custom
roles and locally edited skills survive uninstall. When upgrading a legacy
installation without ownership metadata, differing package files are backed up
under `.maxxy-me/.legacy-backup/` before replacement. Existing commands in
`~/.local/bin/maxxy-me` are never overwritten unless they carry the Maxxy-Agent
management marker.
