# Codex Multi-Agent Starter

A reusable, project-scoped Codex team for complex software work. The starter combines a root Manager Orchestrator, narrowly routed specialist agents, and reusable workflow skills. It is designed to add only two hidden directories to a target project:

```text
.codex/   # Project configuration and custom-agent roles
.agents/  # Reusable workflow skills
```

The payload includes `.agents/LICENSE`, so the MIT notice travels with installed files without replacing the target project's root license.

The manager selects the smallest effective team, runs independent work in parallel, integrates the result, and routes validation failures back to the appropriate specialist. Small tasks can remain single-agent work.

Created by **Omakidx** and released under the [MIT License](LICENSE).

## What is included

### Custom agents

| Agent | Best fit |
| --- | --- |
| `manager_orchestrator` | Explicitly invoked, complex tasks that need routing, delegation, integration, and final validation |
| `architect` | Cross-system boundaries, contracts, sequencing, and high-impact technical decisions |
| `figma_engineer` | Figma-sourced UI, design assets, screenshots, and measured visual parity |
| `frontend_engineer` | React/Next.js, browser UI, accessibility, responsive behavior, and frontend performance |
| `backend_engineer` | APIs, authentication and authorization, server logic, jobs, integrations, and reliability |
| `database_engineer` | Schemas, migrations, queries, indexes, backfills, and persistence integrity |
| `test_engineer` | Test strategy, deterministic reproduction, regression coverage, and independent acceptance checks |
| `security_reviewer` | Threat modeling and read-only review of security-sensitive changes |
| `devops_engineer` | CI/CD, containers, environments, deployment workflows, and production readiness |
| `docs_writer` | Technical and product documentation in text, web, API, Word, PDF, and related formats |
| `agent_creator` | Explicitly requested creation or refinement of project-scoped agents and companion skills |
| `skill_creator` | Explicitly requested creation or update of one project-scoped skill from a pinned public GitHub reference or a researched purpose; distinct from custom-agent creation |
| `plugin_builder` | Explicit plugin design and repository-scoped source work; external writes, installation, live tests, and credential persistence require separate authorization |

The descriptions in [`.codex/config.toml`](.codex/config.toml) are the routing source of truth. Each role's model, reasoning effort, sandbox, and focused instructions live under [`.codex/agents/`](.codex/agents/).

### Workflow skills

| Skill | Workflow |
| --- | --- |
| `$manager-orchestrator` | Dependency-aware team selection, delegation, integration, repair, and final validation |
| `$agent-creator` | Design, registration, evaluation, and measured refinement of custom agents |
| `$create-skill` | Create or update one project-scoped skill from an exact GitHub reference or researched natural-language purpose |
| `$figma-to-code` | Figma-to-implementation workflow with parity and accessibility checks |
| `$website-development` | Complete landing pages and website experiences |
| `$frontend-development` | Bounded browser-facing feature implementation |
| `$backend-development` | APIs and server-side domain behavior |
| `$database-design` | Schemas, migrations, integrity, queries, and backfills |
| `$testing` | Unit, integration, E2E, and regression validation |
| `$security-review` | Evidence-based, read-only security assessment |
| `$deployment` | CI/CD, containers, hosting, environments, and release safety |
| `$documentation-authoring` | Repository-grounded documentation across supported formats |

See [Architecture and routing](#architecture-and-routing) for how these pieces cooperate.

## Prerequisites

- A Codex environment that supports project-scoped custom agents, skills, and multi-agent sessions.
- Python 3.11 or newer for the installer and validation helpers.
- A POSIX environment with no-follow, directory-relative file operations for the hardened installer.
- An existing target project directory that you can write to.

External services are optional. Figma, Brave/direct web search, and Chrome capabilities are used only when they are available, authenticated where required, and relevant to the task. They are not bundled with this starter.

## Install safely

Download or clone this starter, then preview installation into an existing project:

```bash
python3 .starter/install.py /absolute/path/to/project --dry-run
```

If the preview is correct, install it:

```bash
python3 .starter/install.py /absolute/path/to/project
```

The installer copies only `.codex` and `.agents`, including `.agents/LICENSE`. It skips byte-identical destination files, checks all destination paths before writing, and aborts without changes if any existing file differs. It never deletes target files and never replaces the target project's root license.

After installation, open the target project in a new Codex task so project-scoped agents and skills can be discovered.

### Direct-copy alternative

Use this only when the target does not already contain `.codex` or `.agents`:

```bash
cp -R .codex .agents /absolute/path/to/project/
```

For a project with either directory already present, use the installer so conflicts are detected before anything is written. Review [Customization and safety](#customization-and-safety) before manually merging existing configuration.

## Validate the starter

From the starter repository:

```bash
python3 .starter/validate.py
```

Validation parses the TOML configuration, checks agent registrations and skill structure, scans for portability problems, and simulates installation into an isolated temporary project. Run it after every customization.

## Use the manager

Explicitly invoke the manager for a substantial task:

```text
$manager-orchestrator implement account recovery across the API and web app,
including migration-safe persistence, regression tests, and security review
```

The manager inspects the repository and applicable `AGENTS.md` files, derives acceptance criteria, reads available agent descriptions, and creates bounded workstreams. It does not automatically spawn every role. The root manager remains responsible for architecture, integration, conflict resolution, repair routing, and the final tested result.

Use a focused skill directly when full orchestration would be unnecessary, for example:

```text
$documentation-authoring update the local development guide to match the current scripts
```

## Create a project skill

Invoke `$create-skill` explicitly when the desired deliverable is a reusable skill rather than a custom-agent role. New skills default to `.agents/skills/<normalized-name>` in the current project. Writing to a personal or global skill directory, installing or publishing the skill, or installing and executing dependencies requires separate explicit authorization.

To reproduce or adapt a particular public GitHub skill, provide a URL that identifies one skill directory at an exact ref or immutable commit, for example:

```text
$create-skill create a project-scoped skill from
https://github.com/example-org/example-skills/tree/0123456789abcdef0123456789abcdef01234567/skills/release-notes
```

The creator freezes the resolved source commit, inventories the skill directory and its required local resources, and reports provenance and license status. GitHub content is treated as untrusted, inert evidence: downloaded scripts are statically inspected but not executed, and nested links, submodules, symlinks, dependencies, and credentials are not followed or used. Repository-root URLs, moving default-branch URLs without an exact skill path, and other ambiguous references require clarification. When licensing or unavailable resources prevent reuse, the creator may produce an original behavioral adaptation, but it does not claim exact parity.

To design a new workflow from its purpose, describe the intended users, work, outputs, and important constraints:

```text
$create-skill create a changelog-authoring skill for a TypeScript monorepo.
It should derive release notes from merged changes, preserve package boundaries,
and validate Markdown links without publishing a release.
```

Research uses callable Brave Search first, then available direct built-in web search. Chrome is reserved for evidence that requires interaction, authentication, JavaScript rendering, or visual inspection. These integrations are conditional and are not bundled or guaranteed by the starter.

## Customize the team

Common adjustments include:

- Change concurrency in `[agents]` inside [`.codex/config.toml`](.codex/config.toml). The starter permits up to eight concurrent threads per session.
- Change a role's `model`, `model_reasoning_effort`, sandbox, or instructions in its [`.codex/agents/`](.codex/agents/) TOML file.
- Remove an optional role by deleting both its `[agents.<name>]` registration and matching role file.
- Add or revise a workflow under [`.agents/skills/`](.agents/skills/) and keep its `SKILL.md` focused on executable workflow instructions.
- Tighten permissions and integrations to match the target repository's policies.

The manager is intentionally configured for `gpt-5.6-sol` with `ultra` reasoning. Other roles use capability-appropriate settings. Confirm that selected models and reasoning levels are available in your Codex environment before changing them. See [Customization and safety](#customization-and-safety) for a change checklist.

## Architecture and routing

The starter keeps runtime discovery separate from reusable workflows:

```text
target-project/
├── .codex/
│   ├── config.toml          # Multi-agent settings, concurrency, and registrations
│   └── agents/*.toml        # Per-role model, sandbox, and instructions
└── .agents/
    ├── LICENSE              # MIT notice shipped with the payload
    └── skills/*/SKILL.md    # Reusable task workflows
```

A custom agent defines **who owns a bounded responsibility**; a skill defines **how a repeatable workflow is executed**. When `$manager-orchestrator` is invoked, it:

1. Reads the objective, repository state, supplied artifacts, and applicable `AGENTS.md` instructions.
2. Derives acceptance criteria, constraints, and required validation.
3. Reads registered descriptions and maps the objective into technical domains and dependencies.
4. Selects the smallest effective specialist team, retaining small or tightly coupled work itself.
5. Gives each specialist bounded ownership, resources, dependencies, permissions, acceptance criteria, and validation.
6. Runs independent work concurrently and dependent work in phases.
7. Integrates actual changes, resolves shared contracts and conflicts, and runs final checks.
8. Routes failures to the owning specialist and repeats validation until the original criteria pass or a genuine blocker requires input.

Testing and security review are chosen according to scope and risk. Agent creation, skill creation, and plugin building are explicit-only capabilities, not default implementation steps. Plugin source work remains repository-scoped and offline by default; personal/global writes, installation, live provider tests, and plaintext credential persistence are separate authorization gates. Write-heavy agents should not own the same files concurrently unless the manager deliberately requests competing implementations.

### Configuration sources of truth

| Concern | Source |
| --- | --- |
| Multi-agent settings and concurrency | `.codex/config.toml` |
| Routing descriptions | `[agents.<name>]` in `.codex/config.toml` |
| Per-role model, sandbox, and instructions | `.codex/agents/<name>.toml` |
| Reusable workflows | `.agents/skills/<skill>/SKILL.md` |
| Target-specific constraints | Applicable `AGENTS.md` files |

Keep role names and `config_file` paths synchronized. The validator checks these relationships.

## Customization and safety

The installer is intentionally conservative:

- `--dry-run` reports planned changes without writing.
- Missing destination files can be copied; byte-identical files are skipped.
- A differing file or unsafe destination path is a conflict.
- All conflicts are detected before any write begins.
- Target files are never deleted or automatically overwritten.
- If an unexpected runtime failure happens after creation starts, any newly created entries remain for manual inspection; the installer does not roll back by deleting target names.

The installer intentionally targets POSIX systems. It exits without installing when the host lacks the directory-relative, no-follow operations required to enforce its path-safety guarantees.

This is not a three-way merge tool. Before installing into a project that already has `.codex` or `.agents`, back up those directories, preview the install, review every conflict, and merge TOML or skill changes deliberately. Preserve target-specific `AGENTS.md` requirements and least-privilege choices.

Each role declares either a read-only or workspace-write sandbox according to its responsibility. Sandbox settings do not authorize deployment, shared-infrastructure changes, publishing, commits, pushes, credential disclosure, or destructive actions. Those still require explicit user authorization.

Figma, Brave/direct web search, and Chrome are conditional integrations. Follow the integration's own authentication process and keep API keys, cookies, tokens, and other credentials out of `.codex`, `.agents`, documentation, logs, and version control. If a capability is unavailable, provide the relevant source artifact or require the agent to state the verification limit.

After customization, run `python3 .starter/validate.py` and the target repository's own tests, linting, type checks, builds, and security controls. Starter validation verifies package structure, registration, portability, and isolated installation; it does not prove a target application is correct.

## Update an installed project

Run a dry run against the project again:

```bash
python3 .starter/install.py /absolute/path/to/project --dry-run
```

Unchanged files are skipped. If the installed project has customized a starter file and the new starter contains a different version, installation stops before writing. Compare the two versions, preserve the project's intent, merge manually, then rerun the dry run and validation. There is deliberately no automatic overwrite path.

## Remove the starter

If `.codex` and `.agents` contain only files installed from this starter, back them up and remove those two directories from the target project. If they also contain project-owned configuration or skills, remove only the starter registrations, role files, and skill directories after reviewing their references. The installer does not provide an uninstall command and never deletes project files.

## Troubleshooting

### The manager or skills are not discovered

- Confirm `.codex/config.toml` and `.agents/skills/manager-orchestrator/SKILL.md` exist at the target project root.
- Start a new Codex task rooted in that project after installation.
- Run `python3 .starter/validate.py` in the starter repository.

### Installation reports a conflict

The target contains a file at the same path with different content. No files were written. Compare and merge the reported path manually; do not delete project configuration just to make installation pass.

### A specialist cannot use Figma, search, or Chrome

Those capabilities are conditional. Make the relevant integration available and authenticate it according to your Codex environment, or provide the required design/source material directly. Never store API keys or session credentials in this repository.

### A registered model is unavailable

Choose an available model and supported reasoning effort in the affected role file, then rerun validation. Keep stronger reasoning for architecture, orchestration, security review, and difficult implementation work.

## License

Copyright (c) 2026 Omakidx. Licensed under the [MIT License](LICENSE).
