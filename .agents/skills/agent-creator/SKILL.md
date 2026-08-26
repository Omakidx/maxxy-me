---
name: agent-creator
description: Create or refine project-scoped Codex custom agents when explicitly requested, using current research, least-privilege design, deterministic validation, and output-driven iteration.
---

# Agent Creator

Create one useful, discoverable project role—or improve an existing one—without expanding the team speculatively. Treat the user's requested agent outcome as the authority. Agent creation does not authorize global configuration changes, plugin installation, credential handling, deployment, or unrelated repository edits.

## Establish the role contract

Resolve the repository root, then inspect the full request, repository structure, applicable `AGENTS.md` files, `.codex/config.toml`, registered role descriptions, and relevant `.codex/agents/*.toml` files. Check the project skill catalog before adding a companion skill. Keep discovery within that root; use hidden-aware searches such as `rg --hidden --files` so `.codex` and `.agents` are included, and never scan parent or sibling directories.

Define these acceptance criteria before editing:

- requests that should and should not route to the role
- owned decisions, artifacts, and allowed mutations
- required inputs and result format
- trust boundaries, approval points, and least-privilege sandbox
- model and reasoning level justified by task difficulty
- reusable skill or research/tool dependencies, if any
- static checks and a realistic forward-evaluation prompt

Prefer refining an existing agent when its core responsibility already matches. Create a new role only when the responsibility is durable, distinct, and discriminating enough for a parent orchestrator to route reliably.

## Research current practice

Research only questions whose answers are current, uncertain, or consequential to the role design.

1. When callable, prefer the Brave Search plugin's `search_web` tool for general technical research. Use `search_news`, `search_images`, or `search_videos` only when that media type directly affects the requested role.
2. Prioritize official product documentation, primary specifications, maintainers' documentation, and original research. Cross-check consequential claims with a second independent primary source when practical.
3. If Brave tools are not callable or authentication is missing, use another available direct web-search tool and state the fallback in the evaluation record. If no search capability is available, record that limitation and avoid claims that require current external verification.
4. Use Chrome only when it is available and a page requires interactive, authenticated, JavaScript-rendered, or visual inspection. Follow its skill when present, and do not use browser automation when a direct API or connector can retrieve the evidence.
5. Record the URL, publication/update date when available, claim supported, and any uncertainty. Do not copy long source passages into agent instructions.

Never write `BRAVE_SEARCH_API_KEY` or any credential into the repository. When a search plugin is used, its configured environment owns authentication.

## Design and implement

Add a discriminating `[agents.<name>]` registration to `.codex/config.toml` and resolve its `config_file` beneath `.codex/agents/`. Preserve every unrelated setting and existing invocation policy.

The role file should normally specify:

- a supported model and intentional `model_reasoning_effort`
- the least-privileged `sandbox_mode`
- focused `developer_instructions` covering ownership, inspection, workflow, constraints, collaboration boundaries, validation, and result evidence

Keep the description precise enough that the manager can choose the role without opening its file. Avoid overlapping ownership, catch-all descriptions, generic persona language, hard-coded secrets, absolute machine-specific paths, and instructions that silently broaden authorization.

Create a companion skill only when the agent needs a reusable workflow that changes decisions. Follow the system Skill Creator instructions, use progressive disclosure, and keep automatic versus explicit invocation aligned with the user's request. Update `manager-orchestrator` routing only when the new role should be selectable by that manager.

## Validate and improve from output

Run `python3 .agents/skills/agent-creator/scripts/validate_project_agents.py --root <repository> --agent <name> --strict-codex` and the Skill Creator validator for every new or changed skill. The helper must confirm Codex loads the strict project configuration and resolves the registered role file.

Forward-test the role with a realistic, bounded prompt in an isolated temporary workspace. Do not tell the evaluating agent the intended answer. Score the actual artifacts and response against:

- correct routing and responsibility boundaries
- compliance with acceptance criteria and repository instructions
- least-privilege and approval behavior
- correct, minimal tool use and evidence quality
- artifact correctness, validation, and result completeness

Use an independent reviewer when the role is complex, security-sensitive, or can create other agents. Turn each material failure into one narrow correction, then rerun the same evaluation so the comparison is meaningful. Do not accumulate speculative rules from one-off preferences.

Repeat until the target passes or a genuine blocker remains. By default, stop after three measured refinement cycles; request direction before expanding cost, time, privileges, or external side effects. If the evidence exposes a flaw in this creator itself, report a minimal proposed change. Modify this creator's own role or skill only when the user explicitly authorizes self-improvement, and obtain independent review before accepting it.

Report the role contract, files changed, research sources, evaluation prompt and evidence, corrections made across iterations, final validation, and residual limitations.
