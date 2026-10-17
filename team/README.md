# Team sources

Every agent and skill is authored once in this folder. `python3 .starter/build.py` renders it into the Claude Code payload (`.claude/`) and the Codex payload (`.codex/` and `.agents/`) and refreshes `.starter/manifest.json`. Do not edit the generated directories; `python3 .starter/validate.py` fails when they drift from these sources.

```text
team/
├── agents/<name>.toml       one file per agent (hyphen-case name)
├── skills/<name>/SKILL.md   one folder per skill, plus optional references/ and scripts/
└── partials/<name>.md       shared text, pulled in with {{include:<name>}}
```

## Agent files

```toml
order = 40                        # position in .codex/config.toml (lower comes first)
description = "Use for ..."       # routing description, shared by both platforms
color = "blue"                    # Claude Code only: red, blue, green, yellow, purple, orange, pink, cyan
skills = ["backend-development"]  # skills the role follows; preloaded on Claude Code unless explicit-only
read_only = false                 # true: Claude Code removes Write/Edit/NotebookEdit; Codex gets sandbox_mode = "read-only"
                                  # (ignored by current Codex builds), so also add {{include:readonly}} to the instructions
platforms = ["codex"]             # optional; defaults to both
instructions = '''
The agent's system prompt (Claude Code body / Codex developer_instructions).
'''

[claude]
model = "sonnet"                  # opus, sonnet, haiku, fable, or inherit

[codex]
model = "gpt-6-sol"
model_reasoning_effort = "high"
```

Specialist instructions must end with `{{include:teamwork}}` and `{{include:report}}` (read-only roles add `{{include:readonly}}` first): together they give every role the same collaboration rules and report format. Every Claude Code specialist gets `disallowedTools: Agent`, so only the manager delegates; on Codex the teamwork rules carry the no-spawn policy. The Codex role file name is the agent name in snake_case (`backend-engineer` becomes `backend_engineer`).

## Skill files

`SKILL.md` frontmatter takes single-line `key: value` pairs:

| Key | Purpose |
| --- | --- |
| `name` | Must match the folder name. |
| `description` | Trigger description for both platforms (1,024 characters at most). |
| `explicit` | `true` makes the skill explicit-only: `disable-model-invocation: true` on Claude Code, `policy.allow_implicit_invocation: false` on Codex. |
| `display_name`, `short_description`, `default_prompt` | Codex `agents/openai.yaml` interface fields. |
| `argument_hint` | Claude Code `argument-hint`. |

Markdown files under the skill folder are rendered with the template syntax below. Other files, such as scripts, are copied unchanged.

## Template syntax

| Syntax | Claude Code | Codex |
| --- | --- | --- |
| `{{skill:testing}}` | `/testing` | `$testing` |
| `{{skill_ref:testing}}` | `` `testing` skill `` | `` `testing` skill `` |
| `{{skill_path:testing}}` | `.claude/skills/testing/SKILL.md` | `.agents/skills/testing/SKILL.md` |
| `{{agent:code-reviewer}}` | `code-reviewer` | `code_reviewer` |
| `{{platform}}` / `{{platform_id}}` | `Claude Code` / `claude` | `Codex` / `codex` |
| `{{skills_dir}}` / `{{agents_dir}}` | `.claude/skills` / `.claude/agents` | `.agents/skills` / `.codex/agents` |
| `{{instruction_files}}` | `` `CLAUDE.md`/`AGENTS.md` `` | `` `AGENTS.md` `` |
| `{{claude:text}}` / `{{codex:text}}` | inline text for one platform only | |
| `{{include:report}}` | contents of `partials/report.md` | |

Whole-line blocks hold content for one platform:

```text
{{#claude}}
Only rendered for Claude Code.
{{/claude}}
{{#codex}}
Only rendered for Codex.
{{/codex}}
```

The build fails on unknown tokens, unknown skill or agent names, unbalanced blocks, and any leftover `{{` or `}}`. Use `{{skill:...}}` only in text a user reads (default prompts, examples); in instructions an agent follows, refer to skills with `{{skill_ref:...}}`. Claude Code substitutes `$ARGUMENTS` and a dollar sign followed by a digit inside skills, so escape a literal dollar sign as `\$`.

## Release checklist

1. Edit sources here, then run `python3 .starter/build.py`.
2. Bump `VERSION` in `.starter/build.py` for a release.
3. Run `python3 .starter/validate.py` and `python3 -m unittest discover -s tests` (set `CODEX_CLI_PATH` to include the real Codex load test).
4. Commit the sources, the generated payloads, and the manifest together. The manifest's history is built from committed versions, which is what lets installed projects upgrade unmodified files safely.
