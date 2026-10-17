"""End-to-end tests: setup.sh, the interactive picker, upgrades, uninstall, the README one-liner,
and (when available) the real Codex and Claude Code CLIs.

Runs on Python 3.8+. setup.sh is executed with the interpreter running the tests.

Optional environment variables:
  CODEX_CLI_PATH=/path/to/codex   use this Codex binary for the Codex load test
  MAXXY_TEST_CLAUDE_CLI=1         start a headless Claude Code session (may use model quota)
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

from helpers import LEGACY_RELEASE, MANIFEST, REPO, Sandbox, git, git_available, sha256_file, snapshot

CODEX_FILES = MANIFEST["platforms"]["codex"]["files"]
CLAUDE_FILES = MANIFEST["platforms"]["claude"]["files"]


class InstallChoicesTest(Sandbox):
    def test_each_choice_installs_only_its_platform_and_reruns_are_no_ops(self):
        for choice, platforms, absent in (
            ("claude", ["claude"], [".codex", ".agents"]),
            ("codex", ["codex"], [".claude"]),
            ("both", ["claude", "codex"], []),
        ):
            with self.subTest(choice=choice):
                target = self.fresh(f"install-{choice}")
                (target / "app.txt").write_text("keep me\n", encoding="utf-8")
                result = self.run_setup(target, "--agent", choice)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assert_installed(target, platforms)
                self.assertEqual((target / "app.txt").read_text(encoding="utf-8"), "keep me\n")
                for name in absent:
                    self.assertFalse((target / name).exists(), f"{name} written for {choice}")
                hints = {"claude": "/manager-orchestrator", "codex": "$manager-orchestrator"}
                for platform in platforms:
                    self.assertIn(hints[platform], result.stdout)

                before = snapshot(target)
                repeat = self.run_setup(target, "--agent", choice)
                self.assertEqual(repeat.returncode, 0)
                self.assertIn("already up to date", repeat.stdout)
                self.assertEqual(snapshot(target), before)

    def test_dry_run_writes_nothing(self):
        target = self.fresh("dry")
        result = self.run_setup(target, "--agent", "both", "--dry-run")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Dry run complete", result.stdout)
        self.assertEqual(snapshot(target), {})

    def test_explicit_target_argument(self):
        target = self.fresh("explicit")
        result = self.run_setup(self.temp, "--agent", "codex", str(target))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_installed(target, ["codex"])

    def test_without_a_terminal_setup_asks_for_the_agent_option(self):
        target = self.fresh("no-tty")
        result = self.run_setup(target)
        self.assertEqual(result.returncode, 1)
        self.assertIn("--agent claude", result.stderr)
        self.assertEqual(snapshot(target), {})

    def test_usage_errors_and_refusals(self):
        target = self.fresh("usage")
        self.assertEqual(self.run_setup(target, "--agent", "cursor").returncode, 2)
        self.assertEqual(self.run_setup(target, "--agent", "codex", str(self.temp / "missing")).returncode, 1)
        own = self.run_setup(REPO, "--agent", "claude", "--dry-run")
        self.assertEqual(own.returncode, 1)
        self.assertIn("own checkout", own.stderr)
        self.assertEqual(snapshot(target), {})


class ConflictTest(Sandbox):
    def test_a_modified_file_stops_everything_before_writing(self):
        target = self.fresh("conflict")
        self.run_setup(target, "--agent", "codex")
        (target / ".codex/agents/architect.toml").write_text("# customized\n", encoding="utf-8")
        (target / ".codex/agents/backend_engineer.toml").unlink()
        before = snapshot(target)
        result = self.run_setup(target, "--agent", "codex")
        self.assertEqual(result.returncode, 3)
        self.assertIn("modified locally", result.stdout)
        self.assertEqual(snapshot(target), before, "nothing may be written after a conflict")

    def test_existing_codex_config_is_kept_and_roles_still_install(self):
        target = self.fresh("own-config")
        (target / ".codex").mkdir()
        (target / ".codex/config.toml").write_text('model = "gpt-6.1-sol"\n', encoding="utf-8")
        result = self.run_setup(target, "--agent", "codex")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((target / ".codex/config.toml").read_text(encoding="utf-8"), 'model = "gpt-6.1-sol"\n')
        for path, digest in CODEX_FILES.items():
            if path != ".codex/config.toml":
                self.assertEqual(sha256_file(target / path), digest, path)
        self.assertIn("max_concurrent_threads_per_session = 8", result.stdout)

    def test_unsafe_destinations_are_refused(self):
        outside = self.fresh("outside")
        (outside / "marker.txt").write_text("outside\n", encoding="utf-8")
        outside_before = snapshot(outside)

        def symlink_root(target):
            (target / ".claude").symlink_to(outside, target_is_directory=True)

        def symlink_subfolder(target):
            (target / ".codex").mkdir()
            (target / ".codex/agents").symlink_to(outside, target_is_directory=True)

        def file_where_folder_expected(target):
            (target / ".agents").write_text("not a folder\n", encoding="utf-8")

        def folder_where_file_expected(target):
            (target / ".codex/config.toml").mkdir(parents=True)
            (target / ".codex/agents").mkdir()
            (target / ".codex/agents/architect.toml").mkdir()

        for case in (symlink_root, symlink_subfolder, file_where_folder_expected, folder_where_file_expected):
            with self.subTest(case=case.__name__):
                target = self.fresh(case.__name__)
                case(target)
                before = snapshot(target)
                result = self.run_setup(target, "--agent", "both")
                self.assertEqual(result.returncode, 3, result.stdout)
                self.assertEqual(snapshot(target), before)
        self.assertEqual(snapshot(outside), outside_before)

    def test_a_failed_write_leaves_no_partial_files_and_a_rerun_recovers(self):
        target = self.fresh("partial")
        failed = self.run_setup(target, "--agent", "claude", max_file_bytes=2048)
        self.assertNotEqual(failed.returncode, 0)
        for path in target.rglob("*"):
            if path.is_file():
                relative = path.relative_to(target).as_posix()
                self.assertFalse(path.name.endswith(".tmp"), relative)
                self.assertEqual(sha256_file(path), CLAUDE_FILES.get(relative), f"partial file {relative}")
        recovered = self.run_setup(target, "--agent", "claude")
        self.assertEqual(recovered.returncode, 0, recovered.stdout)
        self.assert_installed(target, ["claude"])

    def test_a_tampered_starter_refuses_to_install(self):
        starter = self.copy_starter()
        agent = starter / ".claude/agents/architect.md"
        agent.write_text(agent.read_text(encoding="utf-8") + "tampered\n", encoding="utf-8")
        target = self.fresh("tampered")
        result = self.run_setup(target, "--agent", "claude", starter=starter)
        self.assertEqual(result.returncode, 1)
        self.assertIn("does not match its manifest", result.stderr)
        self.assertEqual(snapshot(target), {})


class UpgradeTest(Sandbox):
    @unittest.skipUnless(git_available(), "git is not installed")
    def test_upgrade_from_the_last_codex_only_release(self):
        probe = subprocess.run(["git", "-C", str(REPO), "cat-file", "-e", f"{LEGACY_RELEASE}^{{commit}}"], capture_output=True)
        if probe.returncode:
            self.skipTest("legacy release commit not in this clone (shallow checkout?)")
        target = self.fresh("legacy")
        archive = subprocess.run(
            ["git", "-C", str(REPO), "archive", LEGACY_RELEASE, ".codex", ".agents"], capture_output=True, check=True
        ).stdout
        subprocess.run(["tar", "-x", "-C", str(target)], input=archive, check=True)
        self.assertTrue((target / ".agents/skills/security-review/SKILL.md").is_file())

        result = self.run_setup(target, "--agent", "codex")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("unmodified earlier starter version", result.stdout)
        self.assertIn("security-review/SKILL.md  (no longer shipped)", result.stdout)
        self.assert_installed(target, ["codex"])
        self.assertFalse((target / ".agents/skills/security-review").exists(), "renamed skill removed")
        installed = {path for path, kind in snapshot(target).items() if kind != "dir"}
        self.assertEqual(installed, set(CODEX_FILES), "upgraded tree equals the new payload exactly")

    def test_upgrade_updates_shipped_versions_and_removes_retired_files(self):
        starter = self.copy_starter()
        old = "# shipped by an earlier release\n"
        old_digest = hashlib.sha256(old.encode()).hexdigest()
        manifest_path = starter / ".starter/manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["history"][".claude/skills/testing/SKILL.md"] = [old_digest]
        manifest["history"][".claude/skills/retired/SKILL.md"] = [old_digest]
        manifest["history"][".claude/skills/retired-edited/SKILL.md"] = [old_digest]
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        target = self.fresh("upgrade")
        for path, text in ((".claude/skills/testing/SKILL.md", old), (".claude/skills/retired/SKILL.md", old),
                           (".claude/skills/retired-edited/SKILL.md", "my edit\n")):
            (target / path).parent.mkdir(parents=True, exist_ok=True)
            (target / path).write_text(text, encoding="utf-8")
        result = self.run_setup(target, "--agent", "claude", starter=starter)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assert_installed(target, ["claude"])
        self.assertFalse((target / ".claude/skills/retired").exists())
        self.assertEqual((target / ".claude/skills/retired-edited/SKILL.md").read_text(encoding="utf-8"), "my edit\n")
        self.assertIn("no longer shipped, but modified locally", result.stdout)


class UninstallTest(Sandbox):
    def test_uninstall_keeps_modified_and_unrelated_files_and_prunes_folders(self):
        target = self.fresh("uninstall")
        self.run_setup(target, "--agent", "both")
        (target / ".claude/agents/architect.md").write_text("mine\n", encoding="utf-8")
        (target / ".claude/settings.local.json").write_text("{}\n", encoding="utf-8")
        (target / "app.txt").write_text("keep me\n", encoding="utf-8")
        result = self.run_setup(target, "--agent", "both", "--uninstall")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("1 kept", result.stdout)
        self.assertEqual(
            set(snapshot(target)),
            {"app.txt", ".claude", ".claude/agents", ".claude/agents/architect.md", ".claude/settings.local.json"},
        )

    def test_uninstall_one_platform_leaves_the_other(self):
        target = self.fresh("partial-uninstall")
        self.run_setup(target, "--agent", "both")
        self.run_setup(target, "--agent", "codex", "--uninstall")
        self.assertFalse((target / ".codex").exists() or (target / ".agents").exists())
        self.assert_installed(target, ["claude"])

    def test_uninstall_skips_a_symlinked_folder_without_touching_it(self):
        outside = self.fresh("outside")
        for path in CLAUDE_FILES:
            relative = path[len(".claude/"):]
            (outside / relative).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(REPO / path), str(outside / relative))
        before = snapshot(outside)
        target = self.fresh("symlinked")
        (target / ".claude").symlink_to(outside, target_is_directory=True)
        result = self.run_setup(target, "--agent", "claude", "--uninstall")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("0 removed, 0 kept", result.stdout)
        self.assertIn(".claude is a symlink", result.stdout)
        self.assertEqual(snapshot(outside), before)


class PickerTest(Sandbox):
    SETUP = [str(REPO / "setup.sh")]

    def pick(self, keys: list) -> tuple:
        target = self.fresh(f"picker-{len(list(self.temp.iterdir()))}")
        status, output = self.run_in_pty(self.SETUP, target, keys)
        return status, output, target

    def installed_platforms(self, target: Path) -> set:
        return {name for name, marker in (("claude", ".claude"), ("codex", ".codex")) if (target / marker).exists()}

    def test_arrow_navigation_selects_and_wraps(self):
        cases = (
            ([b"\r"], {"claude"}),
            ([b"\x1b[B", b"\r"], {"codex"}),
            ([b"\x1b[B", b"\x1b[B", b"\x1b[A", b"\r"], {"codex"}),
            ([b"\x1b[A", b"\r"], {"claude", "codex"}),  # up from the first option wraps to "Both"
            ([b"\x1bOB", b"\r"], {"codex"}),  # application cursor mode
            ([b"j", b"j", b"k", b"\r"], {"codex"}),
            ([b"3"], {"claude", "codex"}),
        )
        for keys, expected in cases:
            with self.subTest(keys=keys):
                status, output, target = self.pick(keys)
                self.assertEqual(status, 0, output)
                self.assertEqual(self.installed_platforms(target), expected)
                self.assertIn("Installing for", output)

    def test_cancel_keys_write_nothing_and_restore_the_cursor(self):
        for keys in ([b"q"], [b"\x1b"], [b"\x03"], [b"\x04"]):
            with self.subTest(keys=keys):
                status, output, target = self.pick(keys)
                self.assertEqual(status, 130, output)
                self.assertEqual(snapshot(target), {})
                self.assertIn("\x1b[?25h", output, "cursor shown again")

    def test_uninstall_uses_the_picker_too(self):
        target = self.fresh("picker-uninstall")
        self.run_setup(target, "--agent", "both")
        status, output = self.run_in_pty(self.SETUP + ["--uninstall"], target, [b"\x1b[B", b"\r"])
        self.assertEqual(status, 0, output)
        self.assertIn("Removing from", output)
        self.assertEqual(self.installed_platforms(target), {"claude"})


@unittest.skipUnless(git_available(), "git is not installed")
class ReadmeOneLinerTest(Sandbox):
    """Run the exact README commands, with only the GitHub URL swapped for a local clone source."""

    URL = "https://github.com/Omakidx/maxxy-me.git"

    def setUp(self):
        super().setUp()
        readme = (REPO / "README.md").read_text(encoding="utf-8")
        self.commands = [line for line in readme.splitlines() if line.startswith("sh -c '")]
        self.assertEqual(len(self.commands), 2, "install and uninstall one-liners")
        origin = self.fresh("origin")
        for item in REPO.iterdir():
            if item.name in (".git",):
                continue
            if item.is_dir():
                shutil.copytree(str(item), str(origin / item.name), symlinks=True, ignore=shutil.ignore_patterns("__pycache__"))
            else:
                shutil.copy2(str(item), str(origin / item.name))
        git(origin, "init", "-q")
        git(origin, "add", "-A")
        git(origin, "commit", "-q", "-m", "snapshot")
        self.origin_url = origin.as_uri()
        self.tmpdir = self.fresh("tmp")
        self.env["TMPDIR"] = str(self.tmpdir)

    def run_command(self, command: str, cwd: Path, *options: str) -> subprocess.CompletedProcess:
        self.assertIn(self.URL, command)
        line = command.replace(self.URL, self.origin_url)
        if options:
            line += " " + " ".join(options)
        return subprocess.run(["sh", "-c", line], cwd=str(cwd), env=self.env, capture_output=True, text=True,
                              stdin=subprocess.DEVNULL, start_new_session=True, timeout=180)

    def test_install_conflict_and_uninstall_one_liners(self):
        install_command, uninstall_command = self.commands
        self.assertTrue(uninstall_command.endswith("--uninstall"))
        target = self.fresh("project")

        result = self.run_command(install_command, target, "--agent", "both")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_installed(target, ["claude", "codex"])
        self.assertEqual(list(self.tmpdir.iterdir()), [], "temporary clone removed")

        (target / ".claude/agents/architect.md").write_text("mine\n", encoding="utf-8")
        conflict = self.run_command(install_command, target, "--agent", "claude")
        self.assertEqual(conflict.returncode, 3, "exit status passes through the one-liner")
        self.assertEqual(list(self.tmpdir.iterdir()), [])

        removed = self.run_command(uninstall_command.replace(" --uninstall", ""), target, "--agent", "both", "--uninstall")
        self.assertEqual(removed.returncode, 0, removed.stdout + removed.stderr)
        self.assertEqual(set(snapshot(target)), {".claude", ".claude/agents", ".claude/agents/architect.md"})

    def test_install_one_liner_shows_the_picker(self):
        target = self.fresh("interactive")
        line = self.commands[0].replace(self.URL, self.origin_url)
        status, output = self.run_in_pty(["sh", "-c", line], target, [b"\x1b[B", b"\r"])
        self.assertEqual(status, 0, output)
        self.assert_installed(target, ["codex"])


def find_codex():
    configured = os.environ.get("CODEX_CLI_PATH")
    if configured and os.access(configured, os.X_OK):
        return configured
    return shutil.which("codex")


@unittest.skipUnless(find_codex(), "Codex CLI not found (set CODEX_CLI_PATH)")
@unittest.skipIf(sys.version_info < (3, 11), "the agent validator's Codex checks need Python 3.11+")
class CodexCliTest(Sandbox):
    """Load installed payloads with the real Codex CLI in an isolated, trusted Codex home."""

    def doctor(self, target: Path) -> subprocess.CompletedProcess:
        validator = target / ".agents/skills/agent-creator/scripts/validate_project_agents.py"
        environment = dict(self.env, CODEX_CLI_PATH=find_codex())
        return subprocess.run([sys.executable, str(validator), "--platform", "codex", "--root", str(target), "--codex-doctor"],
                              env=environment, capture_output=True, text=True, timeout=300)

    def test_codex_loads_the_installed_team_without_warnings(self):
        target = self.fresh("codex-project")
        self.run_setup(target, "--agent", "codex")
        result = self.doctor(target)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_codex_discovers_roles_when_the_project_keeps_its_own_config(self):
        target = self.fresh("codex-own-config")
        (target / ".codex").mkdir()
        (target / ".codex/config.toml").write_text("[features]\nmulti_agent = true\n", encoding="utf-8")
        self.run_setup(target, "--agent", "codex")
        result = self.doctor(target)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_doctor_check_fails_on_a_broken_role(self):
        target = self.fresh("codex-broken")
        self.run_setup(target, "--agent", "codex")
        role = target / ".codex/agents/backend_engineer.toml"
        role.write_text(role.read_text(encoding="utf-8") + "\ntotally_bogus = 1\n", encoding="utf-8")
        result = self.doctor(target)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("totally_bogus", result.stderr)


@unittest.skipUnless(os.environ.get("MAXXY_TEST_CLAUDE_CLI") == "1", "set MAXXY_TEST_CLAUDE_CLI=1 (may use model quota)")
@unittest.skipUnless(shutil.which("claude"), "Claude Code CLI not found")
class ClaudeCliTest(Sandbox):
    """Start a headless Claude Code session and read the agents and skills it loaded."""

    def test_claude_code_loads_every_agent_and_skill(self):
        target = self.fresh("claude-project")
        if git_available():
            git(target, "init", "-q")
        self.run_setup(target, "--agent", "claude")
        process = subprocess.Popen(
            ["claude", "-p", "--output-format", "stream-json", "--verbose", "--max-turns", "1", "--model", "haiku",
             "Reply with OK."],
            cwd=str(target), env=self.env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        try:
            init = json.loads(process.stdout.readline())
        finally:
            process.kill()
            process.wait()
        self.assertEqual((init.get("type"), init.get("subtype")), ("system", "init"))
        agents = {path[len(".claude/agents/"):-3] for path in CLAUDE_FILES if path.startswith(".claude/agents/")}
        skills = {path.split("/")[2] for path in CLAUDE_FILES if path.endswith("/SKILL.md")}
        self.assertLessEqual(agents, set(init["agents"]))
        self.assertLessEqual(skills, set(init["slash_commands"]))


if __name__ == "__main__":
    unittest.main()
