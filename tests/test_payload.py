"""Contract tests for the generated Claude Code and Codex payloads (needs Python 3.11+)."""

from __future__ import annotations

import re
import subprocess
import sys
import unittest

if sys.version_info < (3, 11):
    raise unittest.SkipTest("payload checks need Python 3.11+")

import tomllib  # noqa: E402

from helpers import MANIFEST, REPO, load_module, sha256_file  # noqa: E402

validator = load_module("maxxy_payload_validator", "team/skills/agent-creator/scripts/validate_project_agents.py")

EXPLICIT = {"manager-orchestrator", "agent-creator", "create-skill"}
READ_ONLY = {"architect", "code-reviewer", "security-reviewer"}
REPORT_HEADING = "## Report back"
TEAMWORK_HEADING = "## Working in the team"
READ_ONLY_HEADING = "## Read-only contract"


def claude_agents() -> dict:
    agents = {}
    for path in sorted((REPO / ".claude/agents").glob("*.md")):
        meta, body = validator.parse_frontmatter(path)
        agents[path.stem] = (meta, body)
    return agents


def codex_roles() -> dict:
    return {path.stem: tomllib.loads(path.read_text(encoding="utf-8")) for path in sorted((REPO / ".codex/agents").glob("*.toml"))}


def skill_names(base: str) -> set:
    return {path.parent.name for path in (REPO / base).glob("*/SKILL.md")}


class ParityTest(unittest.TestCase):
    def test_both_platforms_ship_the_same_skills(self):
        self.assertEqual(skill_names(".claude/skills"), skill_names(".agents/skills"))
        self.assertEqual(len(skill_names(".claude/skills")), 12)

    def test_claude_has_every_codex_role_except_the_manager(self):
        codex = {name.replace("_", "-") for name in codex_roles()}
        self.assertEqual(codex - set(claude_agents()), {"manager-orchestrator"})
        self.assertEqual(set(claude_agents()) - codex, set())
        self.assertEqual(len(claude_agents()), 13)

    def test_codex_config_registers_every_role_file(self):
        config = tomllib.loads((REPO / ".codex/config.toml").read_text(encoding="utf-8"))
        registered = {name for name, value in config["agents"].items() if isinstance(value, dict)}
        self.assertEqual(registered, set(codex_roles()))
        self.assertEqual(config["agents"]["max_concurrent_threads_per_session"], 8)

    def test_manifest_hashes_match_the_files_on_disk(self):
        for platform, spec in MANIFEST["platforms"].items():
            for path, digest in spec["files"].items():
                with self.subTest(path=path):
                    self.assertEqual(sha256_file(REPO / path), digest)

    def test_shipped_licenses_match_the_root_license(self):
        license_text = (REPO / "LICENSE").read_bytes()
        for path in (".claude/maxxy-me/LICENSE", ".agents/LICENSE"):
            self.assertEqual((REPO / path).read_bytes(), license_text, path)


class InvocationPolicyTest(unittest.TestCase):
    def test_explicit_skills_are_explicit_on_both_platforms_and_others_are_not(self):
        for name in skill_names(".claude/skills"):
            claude_meta, _ = validator.parse_frontmatter(REPO / ".claude/skills" / name / "SKILL.md")
            metadata = REPO / ".agents/skills" / name / "agents/openai.yaml"
            codex_explicit = metadata.is_file() and "allow_implicit_invocation: false" in metadata.read_text("utf-8")
            with self.subTest(skill=name):
                self.assertEqual(claude_meta.get("disable-model-invocation") == "true", name in EXPLICIT)
                self.assertEqual(codex_explicit, name in EXPLICIT)

    def test_codex_default_prompts_invoke_their_own_skill(self):
        for path in (REPO / ".agents/skills").glob("*/agents/openai.yaml"):
            text = path.read_text(encoding="utf-8")
            if "default_prompt" in text:
                self.assertIn(f"${path.parent.parent.name}", text, str(path))

    def test_claude_skills_have_no_unescaped_argument_placeholders(self):
        for path in (REPO / ".claude/skills").rglob("*.md"):
            body = path.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"(?<!\\)\$(?:ARGUMENTS|\d)", body), str(path))


class RoleContractTest(unittest.TestCase):
    def test_every_specialist_has_the_teamwork_and_report_contracts(self):
        for name, (_, body) in claude_agents().items():
            with self.subTest(agent=name):
                self.assertIn(TEAMWORK_HEADING, body)
                self.assertIn(REPORT_HEADING, body)
        for name, role in codex_roles().items():
            if name == "manager_orchestrator":
                continue
            with self.subTest(role=name):
                self.assertIn(TEAMWORK_HEADING, role["developer_instructions"])
                self.assertIn(REPORT_HEADING, role["developer_instructions"])

    def test_read_only_roles_are_read_only_everywhere(self):
        for name, (meta, body) in claude_agents().items():
            read_only = name in READ_ONLY
            with self.subTest(agent=name):
                self.assertEqual(READ_ONLY_HEADING in body, read_only)
                tools = validator.as_list(meta["disallowedTools"])
                self.assertIn("Agent", tools)
                self.assertEqual({"Write", "Edit", "NotebookEdit"} <= set(tools), read_only)
        for name, role in codex_roles().items():
            read_only = name.replace("_", "-") in READ_ONLY
            with self.subTest(role=name):
                self.assertEqual(role["sandbox_mode"], "read-only" if read_only else "workspace-write")
                self.assertEqual(READ_ONLY_HEADING in role["developer_instructions"], read_only)

    def test_codex_manager_is_pinned_and_never_spawns_itself(self):
        manager = codex_roles()["manager_orchestrator"]
        self.assertEqual((manager["model"], manager["model_reasoning_effort"]), ("gpt-6.1-sol", "ultra"))
        skill = (REPO / ".agents/skills/manager-orchestrator/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("never spawn `manager_orchestrator`", skill)

    def test_preloaded_skills_exist_and_are_automatic(self):
        for name, (meta, _) in claude_agents().items():
            for skill in validator.as_list(meta.get("skills", [])):
                with self.subTest(agent=name, skill=skill):
                    self.assertNotIn(skill, EXPLICIT)
                    self.assertTrue((REPO / ".claude/skills" / skill / "SKILL.md").is_file())


class CrossReferenceTest(unittest.TestCase):
    def test_backticked_agent_and_skill_names_exist_on_their_platform(self):
        platforms = {
            "claude": (set(claude_agents()), skill_names(".claude/skills"), [".claude"], re.compile(r"`([a-z]+(?:-[a-z]+)+)`")),
            "codex": (set(codex_roles()), skill_names(".agents/skills"), [".codex", ".agents"], re.compile(r"`([a-z]+(?:_[a-z]+)+)`")),
        }
        for platform, (agents, skills, roots, pattern) in platforms.items():
            for root in roots:
                for path in (REPO / root).rglob("*"):
                    if path.suffix not in (".md", ".toml"):
                        continue
                    for name in pattern.findall(path.read_text(encoding="utf-8")):
                        looks_like_role = name.endswith(("-engineer", "_engineer", "-reviewer", "_reviewer", "-writer", "_writer", "-builder", "_builder", "-creator", "_creator"))
                        if looks_like_role:
                            with self.subTest(platform=platform, file=str(path.relative_to(REPO)), name=name):
                                self.assertTrue(name in agents or name in skills, f"{name} is not a {platform} agent or skill")

    def test_no_platform_leakage(self):
        for path in (REPO / ".claude").rglob("*.md"):
            text = path.read_text(encoding="utf-8")
            with self.subTest(file=str(path.relative_to(REPO))):
                self.assertNotIn("spawn_agent", text)
                self.assertIsNone(re.search(r"\$(manager-orchestrator|agent-creator|create-skill|testing)\b", text))
        for path in list((REPO / ".agents").rglob("*.md")) + list((REPO / ".codex").rglob("*.toml")):
            text = path.read_text(encoding="utf-8")
            with self.subTest(file=str(path.relative_to(REPO))):
                self.assertNotIn("subagent_type", text)
                self.assertNotIn("disable-model-invocation", text)
                self.assertNotIn(".claude/", text)


class ReadmeTest(unittest.TestCase):
    def test_readme_team_table_matches_the_role_files(self):
        readme = (REPO / "README.md").read_text(encoding="utf-8")
        rows = re.findall(r"^\| ([a-z][a-z-]+) \| [^|]+ \| [^|]+ \| ([^|]+) \| ([^|]+) \|$", readme, re.MULTILINE)
        table = {name: (claude.strip(), codex.strip()) for name, claude, codex in rows}
        self.assertEqual(set(table), set(claude_agents()) | {"manager-orchestrator"})
        self.assertIn("`gpt-6.1-sol` / ultra", table["manager-orchestrator"][1])
        for name, (meta, _) in claude_agents().items():
            role = codex_roles()[name.replace("-", "_")]
            with self.subTest(agent=name):
                self.assertEqual(table[name][0], meta["model"])
                self.assertEqual(table[name][1], f"`{role['model']}` / {role['model_reasoning_effort']}")

    def test_readme_counts_match_the_payload(self):
        readme = (REPO / "README.md").read_text(encoding="utf-8")
        self.assertIn(f"**{len(claude_agents())} specialist agents**", readme)
        self.assertIn(f"**{len(skill_names('.claude/skills'))} workflow skills**", readme)


class StaticValidatorTest(unittest.TestCase):
    def test_validate_script_passes_on_the_repository(self):
        result = subprocess.run([sys.executable, str(REPO / ".starter/validate.py")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
