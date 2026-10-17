# maxxy-me: a multi-agent team for Claude Code and Codex

maxxy-me adds a ready-made engineering team to any project: a **manager orchestrator** that plans and delegates complex work, **13 specialist agents** (architect, frontend, backend, database, testing, code review, security, DevOps, docs, and more), and **12 workflow skills** they follow. One installer sets it up for **Claude Code**, **Codex**, or both.

The manager picks the smallest team that fits the task, gives each specialist a self-contained brief, runs independent work in parallel, integrates the results, routes failures back to their owner, and keeps going until your acceptance criteria pass. Small tasks stay single-agent.

Created by **Omakidx** and released under the [MIT License](LICENSE).

## Install

Open a terminal in your project's root directory and run:

```bash
sh -c 'd=$(mktemp -d) && git clone -q --depth 1 https://github.com/Omakidx/maxxy-me.git "$d" && sh "$d/setup.sh" "$@"; s=$?; rm -rf "$d"; exit $s' maxxy-me
```

The command works in any shell. It clones the starter into a fresh private temporary directory, runs setup, and deletes the clone afterwards. To pass options, add them at the end, after `maxxy-me` (for example `... maxxy-me --agent codex`).

Before anything is written, setup asks which coding agent you use. Move with <kbd>↑</kbd>/<kbd>↓</kbd> and press <kbd>Enter</kbd> (or press <kbd>1</kbd>–<kbd>3</kbd>, or <kbd>q</kbd> to cancel):

```text
maxxy-me multi-agent starter 4.0.0
Project: /path/to/your-project

? Which coding agent are you installing maxxy-me for?
  ❯ Claude Code  .claude/agents + .claude/skills
    Codex        .codex + .agents/skills
    Both         Claude Code and Codex side by side
  ↑/↓ to move · enter to select · q to quit
```

Setup only touches its own files in the project you are in: it adds them, and on later runs updates or removes the versions it shipped earlier. It never overwrites a file you have changed, and it stops before writing anything if it finds a conflict.

**Requirements:** Git, Python 3.8 or newer, and Linux, macOS, or WSL. Figma, web search, and browser tools are used when your agent has them, but they are optional.

### Setup options

| Option | What it does |
| --- | --- |
| `--agent claude` / `codex` / `both` | Skip the menu, for scripts and CI. Required when no terminal is available. |
| `--dry-run` | Show the plan without changing any files. |
| `--uninstall` | Remove the starter's files that you have not modified. |
| `--verbose` | List every file in the plan. |
| `PATH` | Install into another project instead of the current directory. |

Exit codes: `0` success, `1` error, `2` invalid options, `3` stopped on a conflict (nothing written), `130` cancelled.

## What gets installed

| Claude Code | Codex |
| --- | --- |
| `.claude/agents/*.md` (13 specialist subagents) | `.codex/config.toml` (multi-agent settings and role registrations; an existing one is kept) |
| `.claude/skills/*/SKILL.md` (12 skills) | `.codex/agents/*.toml` (manager plus 13 specialist roles) |
| `.claude/maxxy-me/LICENSE` | `.agents/skills/*/` (12 skills with `agents/openai.yaml` metadata) |
| | `.agents/LICENSE` |

Nothing else in your project is touched: no root `CLAUDE.md`, `AGENTS.md`, settings files, or `LICENSE`.

## Use it

### Claude Code

1. Start a new Claude Code session in the project (or run `/agents` to reload agents).
2. Hand the manager a substantial objective:

   ```text
   /manager-orchestrator implement account recovery across the API and web app,
   with migration-safe persistence, regression tests, and a security review
   ```

In Claude Code, your main session *is* the manager: the skill gives it the orchestration workflow, and it dispatches the specialist subagents. Use a strong session model for large jobs (`/model opus`, or `/model fable` when available).

You can also run a workflow skill directly (`/testing add regression tests for the reset flow`) or ask for a specialist by name ("have the code-reviewer agent review my diff").

### Codex

1. Open the project in Codex and **trust it when asked**. Codex ignores a project's `.codex/` configuration until the project is trusted, so the team stays invisible until you do.
2. Start a new task:

   ```text
   $manager-orchestrator implement account recovery across the API and web app,
   with migration-safe persistence, regression tests, and a security review
   ```

`$manager-orchestrator` runs the workflow in your current session, on that session's model, and spawns the specialist roles with Codex's multi-agent tools. Pick `gpt-6.1-sol` with high reasoning for large jobs.

For the dedicated manager instead, ask Codex to spawn it: `Spawn the manager_orchestrator agent to implement account recovery ...`. That role is pinned to `gpt-6.1-sol` with `ultra` reasoning. It reports questions and plan approvals back to your session, because a spawned agent cannot ask you directly.

Run a focused skill directly with `$testing`, `$documentation-authoring`, and so on.

## The team

| Agent | Owns | Write access | Claude Code model | Codex model / effort |
| --- | --- | --- | --- | --- |
| manager-orchestrator | Triage, delegation, integration, final validation | Yes | your session model (skill) | your session model (skill); `gpt-6.1-sol` / ultra when spawned as the role |
| architect | Boundaries, contracts, sequencing, trade-offs | Read-only | opus | `gpt-6.1-sol` / xhigh |
| figma-engineer | Figma-sourced UI with measured parity | Yes | sonnet | `gpt-6-sol` / high |
| frontend-engineer | Browser UI, state, accessibility, performance | Yes | sonnet | `gpt-6-sol` / high |
| backend-engineer | APIs, auth, server logic, jobs, integrations | Yes | sonnet | `gpt-6-sol` / high |
| database-engineer | Schemas, migrations, queries, backfills | Yes | sonnet | `gpt-6-sol` / high |
| test-engineer | Test strategy, reproductions, acceptance checks | Tests only | sonnet | `gpt-6-luna` / high |
| code-reviewer | Independent correctness review of a diff | Read-only | opus | `gpt-6.1-sol` / xhigh |
| security-reviewer | Threat modeling and security review | Read-only | opus | `gpt-6.1-sol` / xhigh |
| devops-engineer | CI/CD, containers, environments, releases | Yes | sonnet | `gpt-6-sol` / high |
| docs-writer | Documentation in any format | Yes | sonnet | `gpt-6-sol` / high |
| agent-creator | Creating or refining custom agents (explicit only) | Yes | opus | `gpt-6.1-sol` / xhigh |
| skill-creator | Creating or updating one skill (explicit only) | Skills only | opus | `gpt-6.1-sol` / xhigh |
| plugin-builder | Plugin source; install only with separate consent | Yes | opus | `gpt-6.1-sol` / xhigh |

Specialists don't spawn other agents; only the manager delegates. Claude Code enforces this by removing their `Agent` tool, and on Codex each role is instructed not to. Each one finishes with the same structured report (status, outcome, changed files, validation run, contracts, risks), so the manager can integrate results without redoing the work.

| Skill | Workflow | Invocation |
| --- | --- | --- |
| `manager-orchestrator` | Triage, team selection, briefs, phased delegation, integration, repair | Explicit only |
| `agent-creator` | Role contract, research, least-privilege design, forward evaluation | Explicit only |
| `create-skill` | One skill from a pinned GitHub reference or researched purpose | Explicit only |
| `figma-to-code` | Figma to production UI with parity checks | Automatic or explicit |
| `website-development` | Complete pages and landing experiences | Automatic or explicit |
| `frontend-development` | Bounded frontend features | Automatic or explicit |
| `backend-development` | APIs and server-side behavior | Automatic or explicit |
| `database-design` | Schemas, migrations, integrity, backfills | Automatic or explicit |
| `testing` | Deterministic unit, integration, and E2E coverage | Automatic or explicit |
| `security-audit` | Read-only, evidence-based security assessment | Automatic or explicit |
| `deployment` | CI/CD, containers, releases, rollback safety | Automatic or explicit |
| `documentation-authoring` | Repository-grounded docs in any format | Automatic or explicit |

Invoke skills with `/name` in Claude Code or `$name` in Codex. Explicit-only skills never load on their own: Claude Code marks them `disable-model-invocation: true`, and Codex sets `allow_implicit_invocation: false`.

## Update or remove

Rerun the install command to update. Every shipped file is recorded with its hash, along with the hashes of earlier releases, so setup can:

- add new files and skip files that are already current;
- update files that still match an earlier release you never edited;
- remove unmodified files that a newer release no longer ships (for example, the old `security-review` skill, now `security-audit`);
- stop, before writing anything, if a file differs from every shipped version. Merge or move the listed files, then run setup again.

Installs of the earlier Codex-only release upgrade the same way.

To remove the starter, run this from the project root:

```bash
sh -c 'd=$(mktemp -d) && git clone -q --depth 1 https://github.com/Omakidx/maxxy-me.git "$d" && sh "$d/setup.sh" "$@"; s=$?; rm -rf "$d"; exit $s' maxxy-me --uninstall
```

It deletes only files that are byte-identical to a shipped version, keeps anything you changed (and tells you), and removes folders it leaves empty.

## Customize

Edit the installed files in your project directly:

- **Models:** `model` in `.claude/agents/<name>.md` (`opus`, `sonnet`, `haiku`, `fable`, or `inherit`), or `model` and `model_reasoning_effort` in `.codex/agents/<name>.toml`. Confirm that the models are available to your account.
- **Tool access (Claude Code):** each specialist lists `disallowedTools`. `Agent` is always removed so only the manager delegates; read-only roles also lose `Write`, `Edit`, and `NotebookEdit`. They keep `Bash` for inspection, so their instructions also carry a read-only contract.
- **Concurrency (Codex):** `max_concurrent_threads_per_session` in `.codex/config.toml` (8 by default).
- **Routing:** agent descriptions decide when each specialist is chosen. Keep them specific and non-overlapping.
- **New roles and skills:** ask for them with `/agent-creator` or `/create-skill` (`$agent-creator` or `$create-skill` in Codex).

Current Codex builds ignore `sandbox_mode` in role files (subagents inherit the parent session's sandbox), so every read-only role also states its policy in its instructions.

Files you customize are never overwritten, but a customized file stops the whole update (exit code `3`, nothing written). Move it aside, rerun setup, then reapply your change. The one exception is `.codex/config.toml`: if yours differs, setup keeps it and still installs the roles, because Codex discovers them in `.codex/agents/` on its own. Add `max_concurrent_threads_per_session = 8` under `[agents]` in your config for full parallelism.

To check a customized install, run the bundled validator (Python 3.11 or newer):

```bash
python3 .claude/skills/agent-creator/scripts/validate_project_agents.py --platform claude
python3 .agents/skills/agent-creator/scripts/validate_project_agents.py --platform codex --codex-doctor
```

`--codex-doctor` loads the project in an isolated, trusted Codex home and fails if Codex would skip or reject any role.

## Troubleshooting

- **"No interactive terminal available"**: you ran setup without a terminal (CI, or a piped shell). Add `--agent claude`, `--agent codex`, or `--agent both`.
- **Setup stopped on a conflict (exit code 3)**: a listed file differs from every version the starter has shipped. Nothing was written. Move the file aside, rerun setup, then merge your change back.
- **Codex doesn't see the agents**: trust the project (see [Codex](#codex)), then start a new task. Run the validator with `--codex-doctor` to see any role Codex rejects.
- **Claude Code doesn't list the agents or skills**: start a new session in the project root, or run `/agents`.
- **A model is unavailable**: change `model` in the affected agent file to one your account has, then rerun the validator.

## Develop the starter

Agents and skills are written once, in [`team/`](team/), and rendered for each platform:

```bash
python3 .starter/build.py                    # regenerate .claude/, .codex/, .agents/ and .starter/manifest.json
python3 .starter/validate.py                 # static checks: build sync, structure, portability
python3 -m unittest discover -s tests -v     # unit, contract, and end-to-end installer tests
```

The test suite uses only the standard library. Unit tests cover the renderer, manifest history, installer planning, file operations, the arrow-key parser, and the agent validator. Contract tests check the generated payloads, and integration tests run `setup.sh` end to end. The end-to-end tests cover every install choice, the interactive picker on a pseudo-terminal, conflicts, symlink attacks, failed writes, a real upgrade from the last Codex-only release, uninstall, and the README one-liner itself.

`setup.sh` runs with the interpreter that runs the tests, so `python3.8 -m unittest discover -s tests` checks the installer on Python 3.8 (the build and validator tests skip below 3.11). Two optional checks use real CLIs: set `CODEX_CLI_PATH` (or put `codex` on `PATH`) to load the installed team with Codex, and set `MAXXY_TEST_CLAUDE_CLI=1` to start a headless Claude Code session that must load every agent and skill (this may use a little model quota). CI runs the suite on Linux and macOS, plus the installer tests on Python 3.8.

Never edit the generated `.claude/`, `.codex/`, or `.agents/` directories in this repository; `validate.py` and the tests fail when they drift from `team/`. Commit the generated files together with their sources: the manifest's upgrade history comes from previously committed versions. [`team/README.md`](team/README.md) documents the source format and template syntax. Maintainer scripts need Python 3.11 or newer.

## License

Copyright (c) 2026 Omakidx. Licensed under the [MIT License](LICENSE).
