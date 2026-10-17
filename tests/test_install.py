"""Unit tests for .starter/install.py (runs on Python 3.8+)."""

from __future__ import annotations

import hashlib
import io
import os
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from helpers import REPO, Sandbox, load_module

install = load_module("maxxy_install", ".starter/install.py")


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def fake_manifest(files=None, history=None, optional=()) -> dict:
    """A small two-platform manifest for planning tests."""
    return {
        "version": "test",
        "platforms": {
            "claude": {
                "label": "Claude Code",
                "owned": [".claude/agents/", ".claude/skills/"],
                "optional": [],
                "files": (files or {}).get("claude", {}),
            },
            "codex": {
                "label": "Codex",
                "owned": [".codex/config.toml", ".codex/agents/"],
                "optional": list(optional),
                "files": (files or {}).get("codex", {}),
            },
        },
        "history": history or {},
    }


class PathRulesTest(unittest.TestCase):
    def test_check_relative_rejects_unsafe_paths(self):
        for path in ("", "/etc/passwd", "../x", "a/../b", "a//b", "./a", "a\\b", "a/./b"):
            with self.subTest(path=path), self.assertRaises(install.InstallError):
                install.check_relative(path)

    def test_check_relative_accepts_normal_paths(self):
        install.check_relative(".claude/agents/architect.md")

    def test_is_owned_distinguishes_directories_and_files(self):
        owned = [".codex/config.toml", ".codex/agents/"]
        self.assertTrue(install.is_owned(".codex/agents/x.toml", owned))
        self.assertTrue(install.is_owned(".codex/config.toml", owned))
        self.assertFalse(install.is_owned(".codex/config.toml.bak", owned))
        self.assertFalse(install.is_owned(".codex/other.toml", owned))

    def test_platform_choice_expansion_and_aliases(self):
        self.assertEqual(install.platforms_for("both"), ["claude", "codex"])
        self.assertEqual(install.platforms_for("codex"), ["codex"])
        self.assertEqual(install.ALIASES["claude-code"], "claude")
        self.assertEqual(install.ALIASES["all"], "both")

    def test_real_manifest_loads_and_stays_in_namespaces(self):
        manifest = install.load_manifest()
        self.assertEqual(set(manifest["platforms"]), {"claude", "codex"})

    def test_manifest_with_path_outside_namespace_is_rejected(self):
        bad = fake_manifest({"claude": {".bashrc": "0" * 64}})
        with mock.patch.object(install, "MANIFEST_PATH") as path:
            path.read_text.return_value = __import__("json").dumps(bad)
            with self.assertRaisesRegex(install.InstallError, "outside the claude payload"):
                install.load_manifest()


class InspectTest(Sandbox):
    def setUp(self):
        super().setUp()
        self.root = self.fresh("project")
        self.fd = install.open_root(self.root)
        self.addCleanup(os.close, self.fd)

    def test_missing_file_and_missing_parent(self):
        self.assertEqual(install.inspect(self.fd, ".claude/agents/a.md"), ("missing", None))
        (self.root / ".claude").mkdir()
        self.assertEqual(install.inspect(self.fd, ".claude/agents/a.md"), ("missing", None))

    def test_regular_file_reports_digest(self):
        (self.root / "a.md").write_text("hello", encoding="utf-8")
        self.assertEqual(install.inspect(self.fd, "a.md"), ("file", digest("hello")))

    def test_symlinks_and_non_directories_are_unsafe(self):
        outside = self.fresh("outside")
        (outside / "a.md").write_text("x", encoding="utf-8")
        (self.root / ".claude").symlink_to(outside, target_is_directory=True)
        state, reason = install.inspect(self.fd, ".claude/a.md")
        self.assertEqual(state, "unsafe")
        self.assertIn(".claude is a symlink", reason)

        (self.root / ".codex").write_text("file, not a dir", encoding="utf-8")
        state, reason = install.inspect(self.fd, ".codex/config.toml")
        self.assertEqual((state, "not a directory" in reason), ("unsafe", True))

        (self.root / "leaf.md").symlink_to(outside / "a.md")
        self.assertEqual(install.inspect(self.fd, "leaf.md")[0], "unsafe")

        (self.root / "dir.md").mkdir()
        self.assertEqual(install.inspect(self.fd, "dir.md")[0], "unsafe")


class PlanTest(Sandbox):
    def setUp(self):
        super().setUp()
        self.root = self.fresh("project")
        self.fd = install.open_root(self.root)
        self.addCleanup(os.close, self.fd)

    def write(self, path: str, text: str) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def actions(self, steps) -> dict:
        return {step.path: step.action for step in steps}

    def test_install_classifies_every_case(self):
        manifest = fake_manifest(
            {
                "claude": {
                    ".claude/agents/new.md": digest("new"),
                    ".claude/agents/same.md": digest("same"),
                    ".claude/agents/old.md": digest("v2"),
                    ".claude/agents/edited.md": digest("v2"),
                }
            },
            history={
                ".claude/agents/old.md": [digest("v1")],
                ".claude/agents/edited.md": [digest("v1")],
                ".claude/skills/retired/SKILL.md": [digest("retired")],
                ".claude/skills/retired-edited/SKILL.md": [digest("retired")],
            },
        )
        self.write(".claude/agents/same.md", "same")
        self.write(".claude/agents/old.md", "v1")
        self.write(".claude/agents/edited.md", "my edit")
        self.write(".claude/skills/retired/SKILL.md", "retired")
        self.write(".claude/skills/retired-edited/SKILL.md", "kept edit")
        self.write(".claude/agents/mine.md", "not starter")

        steps = install.plan_install(manifest, self.fd, ["claude"])
        self.assertEqual(
            self.actions(steps),
            {
                ".claude/agents/new.md": "add",
                ".claude/agents/same.md": "skip",
                ".claude/agents/old.md": "update",
                ".claude/agents/edited.md": "conflict",
                ".claude/skills/retired/SKILL.md": "remove",
                ".claude/skills/retired-edited/SKILL.md": "keep",
            },
        )
        update = next(step for step in steps if step.action == "update")
        self.assertEqual(update.expected, digest("v1"))

    def test_optional_file_is_kept_instead_of_conflicting(self):
        manifest = fake_manifest({"codex": {".codex/config.toml": digest("ours")}}, optional=[".codex/config.toml"])
        self.write(".codex/config.toml", "theirs")
        steps = install.plan_install(manifest, self.fd, ["codex"])
        self.assertEqual(self.actions(steps), {".codex/config.toml": "keep"})

    def test_unsafe_destination_is_a_conflict(self):
        manifest = fake_manifest({"claude": {".claude/agents/a.md": digest("a")}})
        (self.root / ".claude").symlink_to(self.fresh("elsewhere"), target_is_directory=True)
        steps = install.plan_install(manifest, self.fd, ["claude"])
        self.assertEqual(steps[0].action, "conflict")

    def test_only_selected_platforms_are_planned(self):
        manifest = fake_manifest({"claude": {".claude/agents/a.md": digest("a")}, "codex": {".codex/agents/b.toml": digest("b")}})
        self.assertEqual(self.actions(install.plan_install(manifest, self.fd, ["codex"])), {".codex/agents/b.toml": "add"})

    def test_uninstall_removes_only_shipped_versions(self):
        manifest = fake_manifest(
            {"claude": {".claude/agents/a.md": digest("v2"), ".claude/agents/b.md": digest("b")}},
            history={".claude/agents/a.md": [digest("v1")], ".claude/skills/gone/SKILL.md": [digest("gone")]},
        )
        self.write(".claude/agents/a.md", "v1")
        self.write(".claude/agents/b.md", "edited")
        self.write(".claude/skills/gone/SKILL.md", "gone")
        self.write(".claude/agents/mine.md", "mine")
        steps = install.plan_uninstall(manifest, self.fd, ["claude"])
        self.assertEqual(
            self.actions(steps),
            {".claude/agents/a.md": "remove", ".claude/agents/b.md": "keep", ".claude/skills/gone/SKILL.md": "remove"},
        )


class ApplyTest(Sandbox):
    def setUp(self):
        super().setUp()
        self.root = self.fresh("project")
        self.fd = install.open_root(self.root)
        self.addCleanup(os.close, self.fd)

    def test_add_creates_parents_and_world_readable_file(self):
        install.apply_step(self.fd, install.Step("add", ".claude/agents/a.md", "claude"), b"data")
        path = self.root / ".claude/agents/a.md"
        self.assertEqual(path.read_bytes(), b"data")
        self.assertEqual(path.stat().st_mode & 0o777, 0o644)

    def test_add_never_overwrites_an_existing_file(self):
        (self.root / "a.md").write_text("mine", encoding="utf-8")
        with self.assertRaises(FileExistsError):
            install.apply_step(self.fd, install.Step("add", "a.md", "claude"), b"ours")
        self.assertEqual((self.root / "a.md").read_text(encoding="utf-8"), "mine")

    def test_update_and_remove_require_the_planned_content(self):
        (self.root / "a.md").write_text("v1", encoding="utf-8")
        changed = install.Step("update", "a.md", "claude", expected=digest("something else"))
        with self.assertRaisesRegex(install.InstallError, "changed while installing"):
            install.apply_step(self.fd, changed, b"v2")
        self.assertEqual((self.root / "a.md").read_text(encoding="utf-8"), "v1")

        install.apply_step(self.fd, install.Step("update", "a.md", "claude", expected=digest("v1")), b"v2")
        self.assertEqual((self.root / "a.md").read_text(encoding="utf-8"), "v2")
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ["a.md"], "no temporary files left")

        install.apply_step(self.fd, install.Step("remove", "a.md", "claude", expected=digest("v2")))
        self.assertFalse((self.root / "a.md").exists())

    def test_failed_write_removes_the_partial_file(self):
        real_write = os.write
        calls = {"count": 0}

        def failing_write(fd, data):
            calls["count"] += 1
            if calls["count"] > 1:
                raise OSError(28, "No space left on device")
            return real_write(fd, bytes(data[:3]))

        with mock.patch.object(install.os, "write", side_effect=failing_write):
            with self.assertRaises(OSError):
                install.apply_step(self.fd, install.Step("add", "a.md", "claude"), b"abcdef")
        self.assertFalse((self.root / "a.md").exists())

    def test_failed_update_keeps_the_original_and_leaves_no_temporary_file(self):
        (self.root / "a.md").write_text("v1", encoding="utf-8")
        with mock.patch.object(install.os, "fsync", side_effect=OSError(5, "I/O error")):
            with self.assertRaises(OSError):
                install.apply_step(self.fd, install.Step("update", "a.md", "claude", expected=digest("v1")), b"v2")
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ["a.md"])
        self.assertEqual((self.root / "a.md").read_text(encoding="utf-8"), "v1")

    def test_prune_removes_only_empty_directories(self):
        (self.root / ".claude/skills/gone").mkdir(parents=True)
        (self.root / ".claude/agents").mkdir(parents=True)
        (self.root / ".claude/agents/mine.md").write_text("mine", encoding="utf-8")
        install.prune_empty_directories(self.fd, [".claude/skills/gone/SKILL.md", ".claude/agents/x.md"])
        self.assertFalse((self.root / ".claude/skills").exists())
        self.assertTrue((self.root / ".claude/agents/mine.md").exists())


class SourceAndTargetTest(Sandbox):
    def test_source_bytes_rejects_a_payload_that_does_not_match_the_manifest(self):
        path = ".claude/agents/architect.md"
        expected = install.load_manifest()["platforms"]["claude"]["files"][path]
        self.assertEqual(hashlib.sha256(install.source_bytes(path, expected)).hexdigest(), expected)
        with self.assertRaisesRegex(install.InstallError, "does not match its manifest"):
            install.source_bytes(path, "0" * 64)

    def test_validate_target_refusals(self):
        with self.assertRaisesRegex(install.InstallError, "does not exist"):
            install.validate_target(self.temp / "missing")
        file = self.temp / "file.txt"
        file.write_text("x", encoding="utf-8")
        with self.assertRaisesRegex(install.InstallError, "not a directory"):
            install.validate_target(file)
        for broad in (Path("/"), Path.home()):
            with self.subTest(target=broad), self.assertRaisesRegex(install.InstallError, "broad directory"):
                install.validate_target(broad)
        with self.assertRaisesRegex(install.InstallError, "own checkout"):
            install.validate_target(REPO)
        self.assertEqual(install.validate_target(self.temp), self.temp)


class PickerTest(unittest.TestCase):
    def picker_for(self, data: bytes, environment=None):
        read_fd, write_fd = os.pipe()
        os.write(write_fd, data)
        os.close(write_fd)
        self.addCleanup(os.close, read_fd)
        with mock.patch.dict(os.environ, environment or {}, clear=environment is not None):
            return install.Picker(read_fd)

    def keys(self, data: bytes, count: int) -> list:
        picker = self.picker_for(data)
        return [picker.read_key() for _ in range(count)]

    def test_arrow_keys_in_both_cursor_modes(self):
        self.assertEqual(self.keys(b"\x1b[A\x1b[B\x1bOA\x1bOB", 4), ["up", "down", "up", "down"])

    def test_letter_digit_enter_and_cancel_keys(self):
        self.assertEqual(
            self.keys(b"kjK\r\n2qQ\x03\x04x", 11),
            ["up", "down", "up", "enter", "enter", "2", "cancel", "cancel", "cancel", "cancel", None],
        )

    def test_bare_escape_cancels_and_unknown_sequences_are_ignored(self):
        self.assertEqual(self.keys(b"\x1b", 1), ["cancel"])
        self.assertEqual(self.keys(b"\x1b[C", 1), [None])

    def test_end_of_input_cancels(self):
        self.assertEqual(self.keys(b"", 1), ["cancel"])

    def test_locale_precedence_controls_unicode(self):
        self.assertFalse(self.picker_for(b"", {"LC_ALL": "C", "LANG": "en_US.UTF-8", "TERM": "xterm"}).unicode)
        self.assertTrue(self.picker_for(b"", {"LC_CTYPE": "C.UTF-8", "LANG": "C", "TERM": "xterm"}).unicode)
        self.assertFalse(self.picker_for(b"", {"TERM": "xterm"}).unicode)

    def test_no_color_and_dumb_terminals_get_plain_text(self):
        self.assertFalse(self.picker_for(b"", {"NO_COLOR": "1", "TERM": "xterm"}).color)
        self.assertFalse(self.picker_for(b"", {"TERM": "dumb"}).color)
        plain = self.picker_for(b"", {"TERM": "dumb", "LANG": "C"})
        block = plain.options_block(1)
        self.assertEqual(block[1], "  > Codex        .codex + .agents/skills")
        self.assertNotIn("\x1b", "".join(block))


class OutputTest(unittest.TestCase):
    def test_conflicts_from_one_unsafe_folder_collapse_into_one_line(self):
        steps = [install.Step("conflict", f".claude/agents/{n}.md", "claude", ".claude is a symlink") for n in range(5)]
        steps.append(install.Step("conflict", ".codex/config.toml", "codex", "modified locally"))
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            install.print_conflicts(steps)
        lines = buffer.getvalue().splitlines()
        self.assertEqual(lines, ["  x .claude is a symlink  (blocks 5 starter files)", "  x .codex/config.toml  (modified locally)"])

    def test_invalid_agent_option_is_a_usage_error(self):
        with mock.patch.object(sys, "argv", ["setup.sh", "--agent", "cursor"]), redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as raised, mock.patch("sys.stderr", io.StringIO()):
                install.parse_args()
        self.assertEqual(raised.exception.code, 2)

    def test_agent_option_aliases_are_normalized(self):
        with mock.patch.object(sys, "argv", ["setup.sh", "--agent", "Claude-Code"]):
            self.assertEqual(install.parse_args().agent, "claude")


if __name__ == "__main__":
    unittest.main()
