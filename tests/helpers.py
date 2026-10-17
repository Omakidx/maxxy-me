"""Shared fixtures for the maxxy-me test suite (standard library only, Python 3.8+)."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pty
import resource
import select
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((REPO / ".starter" / "manifest.json").read_text(encoding="utf-8"))
LEGACY_RELEASE = "b86de6f22c0bdfeb2d705c40d65674215ee7c84b"  # last Codex-only release (2026-08-26)


def load_module(name: str, relative: str):
    """Import a script from the repository by path (they are not packages)."""
    spec = importlib.util.spec_from_file_location(name, REPO / relative)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(root: Path) -> dict:
    """Map every entry below root to its content hash, link target, or "dir"."""
    result = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            result[relative] = "symlink:" + os.readlink(path)
        elif path.is_file():
            result[relative] = sha256_file(path)
        elif path.is_dir():
            result[relative] = "dir"
    return result


def exit_status(status: int) -> int:
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    return -os.WTERMSIG(status)


class Sandbox(unittest.TestCase):
    """A test case with a private temporary directory and helpers for running setup.sh."""

    def setUp(self) -> None:
        super().setUp()
        self._temporary = tempfile.TemporaryDirectory(prefix="maxxy-me-test-")
        self.temp = Path(self._temporary.name).resolve()
        self.addCleanup(self._temporary.cleanup)
        # setup.sh runs `python3`; point it at the interpreter running the tests so a
        # suite run with Python 3.8 really exercises the installer on 3.8.
        shim = self.temp / "_python"
        shim.mkdir()
        (shim / "python3").symlink_to(sys.executable)
        self.env = dict(os.environ, PATH=f"{shim}{os.pathsep}{os.environ.get('PATH', '')}", TERM="xterm-256color")
        self.env.pop("NO_COLOR", None)

    def fresh(self, name: str) -> Path:
        path = self.temp / name
        path.mkdir(parents=True)
        return path

    def run_setup(self, cwd: Path, *args: str, starter: Path = REPO, max_file_bytes=None) -> subprocess.CompletedProcess:
        def limit() -> None:
            if max_file_bytes is not None:
                resource.setrlimit(resource.RLIMIT_FSIZE, (max_file_bytes, max_file_bytes))

        return subprocess.run(
            [str(starter / "setup.sh"), *args],
            cwd=str(cwd),
            env=self.env,
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
            start_new_session=True,  # no controlling terminal
            preexec_fn=limit,
            timeout=120,
            check=False,
        )

    def run_in_pty(self, command: list, cwd: Path, keys: list, wait_for: bytes = b"Which coding agent",
                   timeout: float = 30.0) -> tuple:
        """Run command on a pseudo-terminal, type keys once wait_for appears, return (status, output)."""
        pid, fd = pty.fork()
        if pid == 0:  # child
            try:
                os.chdir(str(cwd))
                os.execvpe(command[0], command, self.env)
            finally:
                os._exit(127)
        output = bytearray()

        def drain(seconds: float) -> bool:
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                ready, _, _ = select.select([fd], [], [], 0.05)
                if ready:
                    try:
                        chunk = os.read(fd, 4096)
                    except OSError:
                        return False
                    if not chunk:
                        return False
                    output.extend(chunk)
            return True

        deadline = time.monotonic() + timeout
        while wait_for not in output and time.monotonic() < deadline:
            if not drain(0.1):
                break
        drain(0.2)
        for key in keys:
            try:
                os.write(fd, key)
            except OSError:
                break
            drain(0.25)
        status = None
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            finished, raw = os.waitpid(pid, os.WNOHANG)
            if finished:
                status = raw
                break
            drain(0.1)
        if status is None:
            os.kill(pid, 9)
            _, status = os.waitpid(pid, 0)
        drain(0.2)
        os.close(fd)
        return exit_status(status), output.decode("utf-8", "replace")

    def assert_installed(self, target: Path, platforms: list) -> None:
        for platform in platforms:
            for path, digest in MANIFEST["platforms"][platform]["files"].items():
                file = target / path
                self.assertTrue(file.is_file(), f"{path} missing")
                self.assertEqual(sha256_file(file), digest, f"{path} content differs")

    def copy_starter(self, name: str = "starter") -> Path:
        destination = self.fresh(name)
        for item in ("setup.sh", "LICENSE", "README.md"):
            shutil.copy2(str(REPO / item), str(destination / item))
        for item in (".starter", ".claude", ".codex", ".agents", "team"):
            shutil.copytree(str(REPO / item), str(destination / item), ignore=shutil.ignore_patterns("__pycache__"))
        return destination


def git_available() -> bool:
    return shutil.which("git") is not None


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=maxxy-test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false",
         *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
