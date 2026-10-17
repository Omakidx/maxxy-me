---
name: agent-creator
description: "Create or refine project-scoped Claude Code custom agents when explicitly requested, using a written role contract, targeted research, least-privilege design, deterministic validation, and output-driven refinement."
disable-model-invocation: true
argument-hint: "<agent purpose>"
---

# Agent Creator

Create one useful, reliably routable project agent, or improve an existing one, without growing the team speculatively. The user's requested outcome is the authority. Creating an agent does not authorize global configuration changes, plugin installation, credential handling, deployment, or unrelated edits.

## 1. Establish the role contract

Resolve the repository root. Then inspect the request, the repository, the applicable `CLAUDE.md`/`AGENTS.md` files, every `.claude/agents/*.md` definition, and the skill catalog in `.claude/skills`. Use hidden-aware searches (for example `rg --hidden --files`) so dot-directories are included, and never scan outside the repository root.

Write these acceptance criteria before editing:

- at least three requests that should route to the role and three that should not
- the decisions, artifacts, and mutations the role owns
- required inputs and the report format
- trust boundaries, approval points, and least-privilege tool access
- the model, justified by the difficulty of the work
- reusable skills or research and tool dependencies, if any
- static checks and a realistic forward-evaluation prompt

Prefer refining an existing agent when its core responsibility already matches. Create a new one only when the responsibility is durable, distinct, and discriminating enough for a manager to route to it reliably.

## 2. Research only what is uncertain

Research questions whose answers are current, uncertain, or consequential to the design, such as current Claude Code agent configuration fields or the behavior of a tool the role depends on.

1. Use a callable web-search tool (Brave Search tools when available, otherwise the built-in search). Prefer official product documentation, specifications, and maintainer sources, and cross-check consequential claims.
2. Use browser automation only when the evidence needs interaction, authentication, JavaScript rendering, or visual inspection.
3. Record the URL, date, claim supported, and any uncertainty. Do not paste long source passages into agent instructions.
4. If no search capability is available, record the limitation and avoid claims that need current verification.

Never write `BRAVE_SEARCH_API_KEY` or any other credential into the repository or your output.

## 3. Design and implement

Create `.claude/agents/<name>.md`, where `<name>` uses lowercase letters, digits, and hyphens. Set these frontmatter fields:

- `name`: the same as the file name without `.md`.
- `description`: when to delegate to the role, specific enough that a manager can choose it without opening the file.
- `model`: `opus` for hard reasoning and review (`fable` for the hardest problems when the account has it), `sonnet` for most implementation, `haiku` for fast, well-bounded work, or `inherit` to follow the session model.
- Tool access: prefer `disallowedTools` to remove what the role must not have. Always remove `Agent` from team specialists so only the manager delegates; also remove `Write, Edit, NotebookEdit` for read-only roles. Use a `tools` allowlist when the role needs very little.
- `skills`: skills to preload in full. Skills with `disable-model-invocation: true` cannot be preloaded, so tell the agent to read those files instead.
- `color`: optional; one of `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, or `cyan`.

The body is the agent's system prompt: ownership, inspection steps, workflow, constraints, collaboration boundaries, validation, and the report format. A new agent becomes available in a new session, or after reloading agents with `/agents`.

Avoid overlapping ownership, catch-all descriptions, generic persona prose, hard-coded secrets, machine-specific absolute paths, and instructions that silently broaden authorization. Create a companion skill only when the agent needs a reusable workflow that changes its decisions, and build it with `.claude/skills/create-skill/SKILL.md`. Update `manager-orchestrator` routing only when the manager should select the new role.

## 4. Validate and improve from output

Run the bundled validator against the changed role:

```bash
python3 .claude/skills/agent-creator/scripts/validate_project_agents.py --platform claude --root . --agent <name>
```

Forward-test the role with a realistic, bounded prompt in an isolated temporary copy of the repository, without telling the evaluated agent the intended answer. Run it with `claude -p --agent <name> "<prompt>"` from the temporary copy, or ask the user to try it in a new session. A forward test spends the user's model quota, so confirm before running it. As a delegated specialist, return the forward-test prompt to the manager instead of running it. Score the actual artifacts and report against:

- correct routing and responsibility boundaries
- compliance with the acceptance criteria and repository instructions
- least privilege and approval behavior
- correct, minimal tool use and evidence quality
- artifact correctness, validation, and report completeness

Use an independent reviewer (requested through the manager when you are delegated) when the role is complex, security-sensitive, or able to create other agents. Turn each material failure into one narrow correction and rerun the same evaluation so the results stay comparable. Do not accumulate speculative rules from one-off preferences.

Stop after three measured refinement cycles by default, and ask before expanding cost, time, privileges, or side effects. If the evidence exposes a flaw in this creator itself, propose a minimal change; edit this creator only with the user's explicit authorization, followed by an independent review.

## 5. Report

Return the role contract, files changed, research sources, evaluation prompts and evidence, corrections made in each iteration, final validation results, and residual limitations.
