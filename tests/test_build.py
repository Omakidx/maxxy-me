"""Unit tests for .starter/build.py (needs Python 3.11+ for tomllib)."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import unittest
from pathlib import Path

if sys.version_info < (3, 11):
    raise unittest.SkipTest("build.py needs Python 3.11+")

import tomllib  # noqa: E402

from helpers import REPO, Sandbox, git, git_available, load_module  # noqa: E402

build = load_module("maxxy_build", ".starter/build.py")


def make_team(root: Path, agents: dict = None, skills: dict = None, partials: dict = None) -> Path:
    """Write a minimal team/ tree plus LICENSE under root."""
    (root / "LICENSE").write_text("MIT\n", encoding="utf-8")
    (root / ".starter").mkdir(exist_ok=True)
    for folder in ("agents", "skills", "partials"):
        (root / "team" / folder).mkdir(parents=True, exist_ok=True)
    for name, text in (partials or {}).items():
        (root / "team" / "partials" / f"{name}.md").write_text(text, encoding="utf-8")
    for name, text in (skills or {"testing": "---\nname: testing\ndescription: Test things.\n---\n\nBody.\n"}).items():
        (root / "team" / "skills" / name).mkdir(parents=True, exist_ok=True)
        (root / "team" / "skills" / name / "SKILL.md").write_text(text, encoding="utf-8")
    for name, text in (agents or {}).items():
        (root / "team" / "agents" / f"{name}.toml").write_text(text, encoding="utf-8")
    return root


AGENT = """description = 'Use for {thing}.'
read_only = {read_only}
skills = {skills}
instructions = '''
Work with {{{{agent:code-reviewer}}}} and the {{{{skill_ref:testing}}}}.
'''

[claude]
model = "sonnet"

[codex]
model = "gpt-6-sol"
model_reasoning_effort = "high"
"""


def agent(thing="tests", read_only="false", skills='["testing"]') -> str:
    return AGENT.format(thing=thing, read_only=read_only, skills=skills)


class RenderTest(Sandbox):
    def setUp(self):
        super().setUp()
        root = make_team(
            self.fresh("repo"),
            agents={"code-reviewer": agent()},
            partials={"note": "Shared {{platform}} note.", "outer": "{{include:note}} and more"},
        )
        self.team = build.Team(root)

    def render(self, text: str, platform: str) -> str:
        return self.team.render(text, platform, "test")

    def test_tokens_render_per_platform(self):
        source = "{{skill:testing}} {{skill_ref:testing}} {{skill_path:testing}} {{agent:code-reviewer}} {{instruction_files}}"
        self.assertEqual(
            self.render(source, "claude").strip(),
            "/testing `testing` skill .claude/skills/testing/SKILL.md code-reviewer `CLAUDE.md`/`AGENTS.md`",
        )
        self.assertEqual(
            self.render(source, "codex").strip(),
            "$testing `testing` skill .agents/skills/testing/SKILL.md code_reviewer `AGENTS.md`",
        )

    def test_inline_conditionals_may_contain_colons_and_tokens(self):
        source = "A{{claude: Claude: {{skill:testing}}}}{{codex: Codex | {{skill:testing}}}}"
        self.assertEqual(self.render(source, "claude").strip(), "A Claude: /testing")
        self.assertEqual(self.render(source, "codex").strip(), "A Codex | $testing")

    def test_blocks_keep_only_the_matching_platform(self):
        source = "start\n{{#claude}}\nclaude only\n{{/claude}}\n{{#codex}}\ncodex only\n{{/codex}}\nend"
        self.assertEqual(self.render(source, "claude"), "start\nclaude only\nend\n")
        self.assertEqual(self.render(source, "codex"), "start\ncodex only\nend\n")

    def test_nested_includes_expand_and_render(self):
        self.assertEqual(self.render("{{include:outer}}", "codex").strip(), "Shared Codex note. and more")

    def test_template_errors_are_reported(self):
        cases = {
            "{{skill:missing}}": "unknown skill",
            "{{agent:missing}}": "unknown agent",
            "{{nonsense}}": "unknown token",
            "{{include:missing}}": "unknown partial",
            "{{#claude}}\nx": "unterminated",
            "{{#claude}}\n{{#codex}}\n{{/codex}}\n{{/claude}}": "nested platform block",
            "{{/codex}}": "unmatched",
            "left {{ over": "unresolved template syntax",
        }
        for source, message in cases.items():
            with self.subTest(source=source), self.assertRaisesRegex(build.BuildError, message):
                self.render(source, "claude")

    def test_recursive_includes_are_rejected(self):
        root = make_team(self.fresh("loop"), partials={"a": "{{include:b}}", "b": "{{include:a}}"})
        with self.assertRaisesRegex(build.BuildError, "nest too deeply"):
            build.Team(root).render("{{include:a}}", "claude", "test")


class AgentRenderTest(Sandbox):
    def team(self, **agents) -> "build.Team":
        skills = {
            "testing": "---\nname: testing\ndescription: Test.\n---\nBody\n",
            "secret": "---\nname: secret\ndescription: Explicit.\nexplicit: true\n---\nBody\n",
        }
        root = self.fresh(f"repo-{sum(1 for _ in self.temp.iterdir())}")
        return build.Team(make_team(root, agents=agents, skills=skills))

    def test_claude_specialist_cannot_delegate_and_preloads_only_automatic_skills(self):
        team = self.team(**{"code-reviewer": agent(skills='["testing", "secret"]')})
        text = build.render_claude_agent(team, team.agents["code-reviewer"])
        self.assertIn("disallowedTools: Agent\n", text)
        self.assertIn("skills:\n  - testing\n---", text)
        self.assertNotIn("secret", text.split("---")[1])

    def test_read_only_roles_lose_write_tools_and_get_read_only_sandbox(self):
        team = self.team(**{"code-reviewer": agent(read_only="true")})
        claude = build.render_claude_agent(team, team.agents["code-reviewer"])
        self.assertIn("disallowedTools: Agent, Write, Edit, NotebookEdit", claude)
        codex = tomllib.loads(build.render_codex_role(team, team.agents["code-reviewer"]))
        self.assertEqual(codex["sandbox_mode"], "read-only")
        self.assertEqual(codex["name"], "code_reviewer")

    def test_codex_instructions_round_trip_quotes_and_backslashes(self):
        tricky = agent().replace("Work with", 'Literal """ quotes, a \\ backslash, and')
        team = self.team(**{"code-reviewer": tricky})
        role = tomllib.loads(build.render_codex_role(team, team.agents["code-reviewer"]))
        self.assertIn('Literal """ quotes, a \\ backslash', role["developer_instructions"])

    def test_descriptions_are_quoted_yaml(self):
        team = self.team(**{"code-reviewer": agent(thing='colons: "quotes" and # hashes')})
        text = build.render_claude_agent(team, team.agents["code-reviewer"])
        line = next(line for line in text.splitlines() if line.startswith("description: "))
        self.assertEqual(json.loads(line[len("description: "):]), 'Use for colons: "quotes" and # hashes.')

    def test_invalid_settings_are_rejected(self):
        bad_model = agent().replace('model = "sonnet"', 'model = "gpt-6-sol"')
        with self.assertRaisesRegex(build.BuildError, "unsupported Claude model"):
            team = self.team(**{"code-reviewer": bad_model})
            build.render_claude_agent(team, team.agents["code-reviewer"])
        with self.assertRaisesRegex(build.BuildError, "unknown fields"):
            self.team(**{"code-reviewer": "sandbox = 1\n" + agent()})
        with self.assertRaisesRegex(build.BuildError, "unknown skill"):
            self.team(**{"code-reviewer": agent(skills='["nope"]')})

    def test_skill_metadata_per_platform(self):
        team = self.team()
        explicit = team.skills["secret"]
        self.assertIn("disable-model-invocation: true", build.render_skill_markdown(team, explicit, "claude"))
        self.assertNotIn("disable-model-invocation", build.render_skill_markdown(team, explicit, "codex"))
        self.assertIn("allow_implicit_invocation: false", build.render_openai_yaml(team, explicit))
        self.assertIsNone(build.render_openai_yaml(team, team.skills["testing"]))


class HistoryTest(Sandbox):
    def payload_for(self, root: Path) -> dict:
        return build.render_payload(root)

    @unittest.skipUnless(git_available(), "git is not installed")
    def test_git_history_records_every_committed_version_including_unusual_names(self):
        repo = self.fresh("repo")
        git(repo, "init", "-q")
        odd = ".agents/skills/testing/réf é\t\"q\".md"
        for version in ("v1", "v2"):
            for path in (".codex/config.toml", odd):
                (repo / path).parent.mkdir(parents=True, exist_ok=True)
                (repo / path).write_text(version, encoding="utf-8")
            git(repo, "add", "-A")
            git(repo, "commit", "-q", "-m", version)
        history = build.git_history(repo)
        expected = {hashlib.sha256(v.encode()).hexdigest() for v in ("v1", "v2")}
        self.assertEqual(history[".codex/config.toml"], expected)
        self.assertEqual(history[odd], expected)

    def test_git_history_is_none_outside_a_repository(self):
        self.assertIsNone(build.git_history(self.fresh("not-a-repo")))

    def test_without_git_the_previous_build_becomes_history(self):
        root = make_team(self.fresh("repo"))
        (root / ".starter" / "manifest.json").write_text(
            json.dumps({"platforms": {"claude": {"files": {".claude/skills/testing/SKILL.md": "1" * 64}}}}),
            encoding="utf-8",
        )
        history = build.expected_history(root, self.payload_for(root))
        self.assertEqual(history[".claude/skills/testing/SKILL.md"], ["1" * 64])

    def test_history_excludes_current_versions_and_foreign_paths(self):
        root = make_team(self.fresh("repo"))
        payload = self.payload_for(root)
        current = hashlib.sha256(payload["claude"][".claude/skills/testing/SKILL.md"]).hexdigest()
        (root / ".starter" / "manifest.json").write_text(
            json.dumps({"history": {".claude/skills/testing/SKILL.md": [current, "2" * 64], "README.md": ["3" * 64]}}),
            encoding="utf-8",
        )
        history = build.expected_history(root, payload)
        self.assertEqual(history, {".claude/skills/testing/SKILL.md": ["2" * 64]})


class WritePayloadTest(Sandbox):
    def built_repo(self) -> Path:
        root = make_team(self.fresh("repo"))
        payload = build.render_payload(root)
        manifest = build.build_manifest(root, payload)
        build.write_payload(root, payload, manifest, prune=False)
        return root

    def check(self, root: Path) -> list:
        payload = build.render_payload(root)
        return build.stale_files(root, payload, build.build_manifest(root, payload))

    def test_fresh_build_is_up_to_date(self):
        self.assertEqual(self.check(self.built_repo()), [])

    def test_stale_and_unexpected_files_are_reported(self):
        root = self.built_repo()
        (root / ".claude/skills/testing/SKILL.md").write_text("edited", encoding="utf-8")
        (root / ".claude/agents").mkdir(exist_ok=True)
        (root / ".claude/agents/extra.md").write_text("x", encoding="utf-8")
        problems = "\n".join(self.check(root))
        self.assertIn("stale generated file: .claude/skills/testing/SKILL.md", problems)
        self.assertIn("unexpected file in generated payload: .claude/agents/extra.md", problems)

    def test_missing_history_is_reported(self):
        root = self.built_repo()
        manifest_path = root / ".starter" / "manifest.json"
        recorded = json.loads(manifest_path.read_text(encoding="utf-8"))
        payload = build.render_payload(root)
        expected = build.build_manifest(root, payload)
        expected["history"] = {".claude/skills/testing/SKILL.md": ["4" * 64]}
        manifest_path.write_text(json.dumps(recorded), encoding="utf-8")
        self.assertTrue(any("history lacks" in p for p in build.stale_files(root, payload, expected)))

    def test_unknown_files_are_kept_unless_pruned_and_generated_leftovers_are_removed(self):
        root = self.built_repo()
        mine = root / ".claude/agents/mine.md"
        mine.parent.mkdir(exist_ok=True)
        mine.write_text("mine", encoding="utf-8")
        payload = build.render_payload(root)
        manifest = build.build_manifest(root, payload)
        with self.assertRaisesRegex(build.BuildError, "not generated by an earlier build"):
            build.write_payload(root, payload, manifest, prune=False)
        self.assertTrue(mine.exists())
        build.write_payload(root, payload, manifest, prune=True)
        self.assertFalse(mine.exists())

        shutil.rmtree(root / "team/skills/testing")
        (root / "team/skills/other").mkdir()
        (root / "team/skills/other/SKILL.md").write_text("---\nname: other\ndescription: O.\n---\nB\n", encoding="utf-8")
        payload = build.render_payload(root)
        build.write_payload(root, payload, build.build_manifest(root, payload), prune=False)
        self.assertFalse((root / ".claude/skills/testing").exists(), "previously generated skill removed")

    def test_symlinked_payload_folder_is_refused(self):
        root = self.built_repo()
        outside = self.fresh("outside")
        (outside / "keep.md").write_text("keep", encoding="utf-8")
        shutil.rmtree(root / ".claude/skills")
        (root / ".claude/skills").symlink_to(outside, target_is_directory=True)
        payload = build.render_payload(root)
        with self.assertRaisesRegex(build.BuildError, "is a symlink"):
            build.write_payload(root, payload, build.build_manifest(root, payload), prune=True)
        self.assertTrue((outside / "keep.md").exists())


class RepositoryBuildTest(unittest.TestCase):
    def test_committed_payload_matches_team_sources(self):
        payload = build.render_payload(REPO)
        self.assertEqual(build.stale_files(REPO, payload, build.build_manifest(REPO, payload)), [])


if __name__ == "__main__":
    unittest.main()
