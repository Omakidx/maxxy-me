"""Unit tests for the bundled validate_project_agents.py (Codex checks need Python 3.11+)."""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

if sys.version_info < (3, 11):
    raise unittest.SkipTest("Codex validation needs Python 3.11+")

from helpers import Sandbox, load_module  # noqa: E402

validator = load_module("maxxy_agent_validator", "team/skills/agent-creator/scripts/validate_project_agents.py")


class FrontmatterParserTest(Sandbox):
    def parse(self, frontmatter: str) -> dict:
        path = self.temp / "agent.md"
        path.write_text(f"---\n{frontmatter}\n---\nbody\n", encoding="utf-8")
        return validator.parse_frontmatter(path)[0]

    def test_scalars_lists_and_comments(self):
        values = self.parse(
            "name: a\n"
            "model: sonnet # fast\n"
            'color: "blue" # comment\n'
            "quoted: \"has # hash\"\n"
            "single: 'it''s'\n"
            "skills:\n- testing\n  - deployment\n"
            "tools: [Read, Grep]\n"
            "empty: []\n"
        )
        self.assertEqual(values["model"], "sonnet")
        self.assertEqual(values["color"], "blue")
        self.assertEqual(values["quoted"], "has # hash")
        self.assertEqual(values["single"], "it's")
        self.assertEqual(values["skills"], ["testing", "deployment"])
        self.assertEqual(values["tools"], ["Read", "Grep"])
        self.assertEqual(values["empty"], [])

    def test_multi_line_and_block_scalars(self):
        values = self.parse("description:\n  first line\n  second line\nfolded: >\n  a\n  b\nbare:\nnext: x\n")
        self.assertEqual(values["description"], "first line second line")
        self.assertEqual(values["folded"], "a\nb")
        self.assertEqual(values["bare"], "")
        self.assertEqual(values["next"], "x")

    def test_nested_mappings_are_tolerated(self):
        values = self.parse("name: a\nhooks:\n  PreToolUse:\n    - matcher: Bash\nmodel: opus\n")
        self.assertEqual(values["model"], "opus")

    def test_errors_name_the_file_and_line(self):
        for frontmatter, message in (
            ("description: \"unterminated", "agent.md:2: invalid double-quoted string"),
            ("name: a\nname: b", "duplicate key 'name'"),
            ("just text", "expected 'key: value'"),
        ):
            with self.subTest(frontmatter=frontmatter), self.assertRaisesRegex(ValueError, message):
                self.parse(frontmatter)


class ClaudeRulesTest(Sandbox):
    def setUp(self):
        super().setUp()
        self.root = self.fresh("project")
        (self.root / ".claude/agents").mkdir(parents=True)
        for name, explicit in (("testing", False), ("secret", True)):
            (self.root / ".claude/skills" / name).mkdir(parents=True)
            flag = "disable-model-invocation: true\n" if explicit else ""
            (self.root / ".claude/skills" / name / "SKILL.md").write_text(
                f"---\nname: {name}\ndescription: d\n{flag}---\nbody\n", encoding="utf-8"
            )

    def agent(self, file: str, frontmatter: str, body: str = "Do the work.") -> None:
        (self.root / ".claude/agents" / file).write_text(f"---\n{frontmatter}\n---\n{body}\n", encoding="utf-8")

    def errors(self, only=None) -> str:
        errors, warnings, _ = validator.validate_claude(self.root, only)
        return "\n".join(errors + warnings)

    def test_valid_agent_passes(self):
        self.agent("ok.md", "name: ok\ndescription: d\nmodel: fable\ncolor: cyan\ndisallowedTools: Agent\nskills:\n  - testing")
        self.assertEqual(self.errors(), "")

    def test_each_rule_reports_a_specific_problem(self):
        cases = {
            "Bad_Name.md": ("name: Bad_Name\ndescription: d", "lowercase letters"),
            "mismatch.md": ("name: other\ndescription: d", "must match the file name"),
            "nodesc.md": ("name: nodesc", "description must be a non-empty string"),
            "model.md": ("name: model\ndescription: d\nmodel: gpt-6-sol", "unsupported model"),
            "color.md": ("name: color\ndescription: d\ncolor: teal", "unsupported color"),
            "mode.md": ("name: mode\ndescription: d\npermissionMode: yolo", "unsupported permissionMode"),
            "tools.md": ("name: tools\ndescription: d\ntools: []", "tools allowlist is empty"),
            "missing.md": ("name: missing\ndescription: d\nskills: [nope]", "skill 'nope' does not exist"),
            "explicit.md": ("name: explicit\ndescription: d\nskills: [secret]", "cannot be preloaded"),
            "typo.md": ("name: typo\ndescription: d\nmodle: opus", "unknown frontmatter key 'modle'"),
        }
        for file, (frontmatter, message) in cases.items():
            with self.subTest(file=file):
                for existing in (self.root / ".claude/agents").iterdir():
                    existing.unlink()
                self.agent(file, frontmatter)
                self.assertIn(message, self.errors())

    def test_empty_body_and_symlinked_agent_are_errors(self):
        self.agent("empty.md", "name: empty\ndescription: d", body="")
        self.assertIn("body (system prompt) is empty", self.errors())
        (self.root / ".claude/agents/empty.md").unlink()
        target = self.temp / "elsewhere.md"
        target.write_text("---\nname: link\ndescription: d\n---\nx\n", encoding="utf-8")
        (self.root / ".claude/agents/link.md").symlink_to(target)
        self.assertIn("must not be symlinks", self.errors())

    def test_single_agent_mode(self):
        self.agent("ok.md", "name: ok\ndescription: d")
        self.assertIn("has no file", self.errors(only="ghost"))
        self.assertEqual(self.errors(only="ok"), "")


class CodexRulesTest(Sandbox):
    def setUp(self):
        super().setUp()
        self.root = self.fresh("project")
        (self.root / ".codex/agents").mkdir(parents=True)

    def config(self, registrations: str) -> None:
        (self.root / ".codex/config.toml").write_text(
            "[agents]\nmax_concurrent_threads_per_session = 8\n" + registrations, encoding="utf-8"
        )

    def role(self, name: str, body: str) -> None:
        (self.root / ".codex/agents" / f"{name}.toml").write_text(body, encoding="utf-8")

    def errors(self) -> str:
        errors, warnings, _ = validator.validate_codex(self.root, None)
        return "\n".join(errors + warnings)

    ROLE = 'model = "{model}"\nmodel_reasoning_effort = "{effort}"\ndeveloper_instructions = "Work."\n'

    def test_registered_role_passes(self):
        self.config('[agents.worker]\ndescription = "d"\nconfig_file = "agents/worker.toml"\n')
        self.role("worker", self.ROLE.format(model="gpt-6.1-sol", effort="ultra"))
        self.assertEqual(self.errors(), "")

    def test_registration_and_role_problems(self):
        self.config(
            '[agents.missing]\ndescription = "d"\nconfig_file = "agents/missing.toml"\n'
            '[agents.escape]\ndescription = "d"\nconfig_file = "../outside.toml"\n'
            '[agents.renamed]\ndescription = "d"\nconfig_file = "agents/renamed.toml"\n'
            '[agents.luna]\ndescription = "d"\nconfig_file = "agents/luna.toml"\n'
        )
        self.role("renamed", 'name = "other"\n' + self.ROLE.format(model="gpt-6-sol", effort="high"))
        self.role("luna", self.ROLE.format(model="gpt-6-luna", effort="ultra"))
        report = self.errors()
        self.assertIn("missing role file agents/missing.toml", report)
        self.assertIn("must resolve under .codex/agents", report)
        self.assertIn("would rename registration 'renamed'", report)
        self.assertIn("gpt-6-luna does not support effort 'ultra'", report)

    def test_discovered_role_must_be_self_describing_and_unknown_keys_warn(self):
        self.config("")
        self.role("half", 'name = "half"\n' + self.ROLE.format(model="gpt-6-sol", effort="high"))
        self.role("odd", 'name = "odd"\ndescription = "d"\nwhatever = 1\n' + self.ROLE.format(model="gpt-6-sol", effort="high"))
        report = self.errors()
        self.assertIn("unregistered role files must define description", report)
        self.assertIn("key 'whatever' is not applied", report)

    def test_reserved_agent_settings_are_not_treated_as_roles(self):
        self.config('max_depth = 1\n[agents.job_max_runtime_seconds]\n')
        self.assertNotIn("job_max_runtime_seconds", self.errors())


class CodexDoctorParsingTest(Sandbox):
    """codex_doctor() against a fake codex executable that prints canned doctor JSON."""

    def run_doctor(self, payload) -> str:
        fake = self.temp / "codex"
        output = payload if isinstance(payload, str) else json.dumps(payload)
        fake.write_text(f"#!/bin/sh\ncat <<'JSON'\n{output}\nJSON\n", encoding="utf-8")
        fake.chmod(0o755)
        with mock.patch.dict(os.environ, {"CODEX_CLI_PATH": str(fake)}):
            return validator.codex_doctor(self.fresh("project")) or ""

    @staticmethod
    def report(status: str, warning=None) -> dict:
        details = {} if warning is None else {"startup warning": warning}
        return {"checks": {"config.load": {"status": status, "summary": "config loaded", "details": details}}}

    def test_clean_load_passes(self):
        self.assertEqual(self.run_doctor(self.report("ok")), "")

    def test_single_warning_string_is_reported_intact(self):
        message = self.run_doctor(self.report("warning", "Ignoring malformed agent role definition: x"))
        self.assertIn("Ignoring malformed agent role definition: x", message)

    def test_warning_list_is_joined(self):
        message = self.run_doctor(self.report("warning", ["first problem", "second problem"]))
        self.assertIn("first problem; second problem", message)

    def test_unreadable_output_is_an_error(self):
        self.assertIn("cannot read codex doctor output", self.run_doctor("not json at all"))

    def test_missing_codex_is_reported(self):
        with mock.patch.dict(os.environ, {"CODEX_CLI_PATH": "", "PATH": str(self.fresh("empty-bin"))}):
            self.assertIn("codex is not on PATH", validator.codex_doctor(self.fresh("p")))


if __name__ == "__main__":
    unittest.main()
