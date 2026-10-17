#!/usr/bin/env python3
"""Install the maxxy-me multi-agent team into a project for Claude Code, Codex, or both.

Every file the starter ships is listed with its SHA-256 in .starter/manifest.json,
together with the hashes of earlier releases. That lets the installer:

  * add missing files and skip files that are already up to date;
  * update files that still match an earlier, unmodified starter release;
  * remove unmodified files that a newer release no longer ships;
  * stop before writing anything if a file was modified locally or a path is unsafe.

--uninstall removes only files that are byte-identical to a shipped version.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import select
import stat
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


STARTER_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = STARTER_ROOT / ".starter" / "manifest.json"

CHOICES = (
    ("claude", "Claude Code", ".claude/agents + .claude/skills"),
    ("codex", "Codex", ".codex + .agents/skills"),
    ("both", "Both", "Claude Code and Codex side by side"),
)
ALIASES = {"claude": "claude", "claude-code": "claude", "codex": "codex", "both": "both", "all": "both"}

EXIT_ERROR = 1  # argparse uses 2 for usage errors
EXIT_CONFLICT = 3
EXIT_CANCELLED = 130


class InstallError(Exception):
    pass


class Cancelled(Exception):
    pass


@dataclass(frozen=True)
class Step:
    action: str  # add | update | remove | skip | keep | conflict
    path: str
    platform: str
    detail: str = ""
    expected: str | None = None


# --------------------------------------------------------------------------- manifest


def load_manifest() -> dict:
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise InstallError(f"cannot read starter manifest {MANIFEST_PATH}: {exc}") from exc
    platforms = manifest.get("platforms")
    if not isinstance(platforms, dict) or not {"claude", "codex"} <= set(platforms):
        raise InstallError("starter manifest is missing platform definitions")
    for name, spec in platforms.items():
        owned = spec.get("owned", [])
        for path in list(spec.get("files", {})):
            check_relative(path)
            if not is_owned(path, owned):
                raise InstallError(f"manifest path {path} is outside the {name} payload")
    for path in manifest.get("history", {}):
        check_relative(path)
    return manifest


def check_relative(path: str) -> None:
    pure = PurePosixPath(path)
    if (
        not path
        or pure.is_absolute()
        or "\\" in path
        or any(part in ("", ".", "..") for part in path.split("/"))
    ):
        raise InstallError(f"unsafe path in starter manifest: {path!r}")


def is_owned(path: str, owned: list) -> bool:
    return any(path.startswith(prefix) if prefix.endswith("/") else path == prefix for prefix in owned)


def platforms_for(choice: str) -> list[str]:
    return ["claude", "codex"] if choice == "both" else [choice]


# --------------------------------------------------------------------------- picker


class Picker:
    """Arrow-key selection menu drawn on the controlling terminal (/dev/tty)."""

    def __init__(self, fd: int) -> None:
        self.fd = fd
        locale_name = next(
            (os.environ[key] for key in ("LC_ALL", "LC_CTYPE", "LANG") if os.environ.get(key)), ""
        ).lower()
        self.unicode = "utf-8" in locale_name or "utf8" in locale_name
        self.color = "NO_COLOR" not in os.environ and os.environ.get("TERM", "dumb") != "dumb"

    def style(self, code: str, text: str) -> str:
        return f"\x1b[{code}m{text}\x1b[0m" if self.color else text

    def write(self, text: str) -> None:
        data = text.encode("utf-8", "replace")
        while data:
            written = os.write(self.fd, data)
            data = data[written:]

    def read_key(self) -> str | None:
        char = os.read(self.fd, 1)
        if char == b"\x1b":
            sequence = b""
            while len(sequence) < 8:
                ready, _, _ = select.select([self.fd], [], [], 0.05)
                if not ready:
                    break
                chunk = os.read(self.fd, 1)
                if not chunk:  # terminal closed mid-sequence
                    break
                sequence += chunk
                if len(sequence) >= 2 and sequence[-1:].isalpha():
                    break
            if sequence in (b"[A", b"OA"):
                return "up"
            if sequence in (b"[B", b"OB"):
                return "down"
            return "cancel" if not sequence else None
        if char in (b"\r", b"\n"):
            return "enter"
        if char in (b"k", b"K"):
            return "up"
        if char in (b"j", b"J"):
            return "down"
        if char in (b"q", b"Q", b"\x03", b"\x04", b""):
            return "cancel"
        if char.isdigit():
            return char.decode()
        return None

    def options_block(self, selected: int) -> list[str]:
        pointer = "❯" if self.unicode else ">"
        width = max(len(label) for _, label, _ in CHOICES)
        lines = []
        for index, (_, label, hint) in enumerate(CHOICES):
            padded = label.ljust(width)
            if index == selected:
                lines.append(f"  {self.style('36;1', pointer + ' ' + padded)}  {self.style('2', hint)}")
            else:
                lines.append(f"    {padded}  {self.style('2', hint)}")
        arrows = "↑/↓" if self.unicode else "up/down"
        lines.append(self.style("2", f"  {arrows} to move · enter to select · q to quit" if self.unicode
                                else f"  {arrows} to move, enter to select, q to quit"))
        return lines

    def choose(self, question: str, answered: str) -> str:
        import termios
        import tty

        saved = termios.tcgetattr(self.fd)
        selected = 0
        try:
            tty.setcbreak(self.fd)
            self.write("\x1b[?25l")
            self.write(f"{self.style('36;1', '?')} {self.style('1', question)}\n")
            block = self.options_block(selected)
            self.write("\n".join(block) + "\n")
            while True:
                key = self.read_key()
                if key == "cancel":
                    raise Cancelled()
                if key == "enter":
                    break
                if key == "up":
                    selected = (selected - 1) % len(CHOICES)
                elif key == "down":
                    selected = (selected + 1) % len(CHOICES)
                elif key is not None and key.isdigit() and 1 <= int(key) <= len(CHOICES):
                    selected = int(key) - 1
                    block = self.redraw(block, selected)
                    break
                else:
                    continue
                block = self.redraw(block, selected)
            check = "✔" if self.unicode else "+"
            self.write(f"\x1b[{len(block) + 1}F\x1b[J")
            self.write(f"{self.style('32;1', check)} {answered}: {self.style('1', CHOICES[selected][1])}\n")
            return CHOICES[selected][0]
        finally:
            termios.tcsetattr(self.fd, termios.TCSADRAIN, saved)
            self.write("\x1b[?25h")

    def redraw(self, block: list[str], selected: int) -> list[str]:
        new_block = self.options_block(selected)
        self.write(f"\x1b[{len(block)}F" + "".join(f"\x1b[2K{line}\n" for line in new_block))
        return new_block


def choose_interactively(uninstall: bool, target: Path, version: str) -> str:
    try:
        fd = os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY)
    except OSError:
        raise InstallError(
            "no interactive terminal available to choose a coding agent; "
            "rerun with --agent claude, --agent codex, or --agent both"
        ) from None
    try:
        picker = Picker(fd)
        picker.write(
            f"\n{picker.style('1', 'maxxy-me')} {picker.style('2', f'multi-agent starter {version}')}\n"
            f"{picker.style('2', f'Project: {target}')}\n\n"
        )
        if uninstall:
            return picker.choose("Which coding agent should maxxy-me be removed from?", "Removing from")
        return picker.choose("Which coding agent are you installing maxxy-me for?", "Installing for")
    finally:
        os.close(fd)


# --------------------------------------------------------------------------- safe file access


def require_secure_operations() -> None:
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        raise InstallError("this installer needs POSIX no-follow directory operations (Linux, macOS, or WSL)")
    needed = (os.open, os.stat, os.mkdir, os.unlink, os.rmdir, os.rename)
    if any(function not in os.supports_dir_fd for function in needed) or os.stat not in os.supports_follow_symlinks:
        raise InstallError("this installer needs POSIX directory-relative file operations (Linux, macOS, or WSL)")


def open_dir(name: str, parent_fd: int | None = None) -> int:
    return os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)


def open_root(path: Path) -> int:
    """Open the resolved target; everything below it is then reached without following links."""
    return os.open(str(path), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)


def walk_parent(root_fd: int, parts: tuple, create: bool) -> int | None:
    """Return an fd for the parent directory of parts, refusing symlinks; None if it is missing."""
    fd = os.dup(root_fd)
    try:
        for index, part in enumerate(parts[:-1]):
            try:
                info = os.stat(part, dir_fd=fd, follow_symlinks=False)
            except FileNotFoundError:
                if not create:
                    os.close(fd)
                    return None
                os.mkdir(part, 0o755, dir_fd=fd)
                info = os.stat(part, dir_fd=fd, follow_symlinks=False)
            if not stat.S_ISDIR(info.st_mode):
                kind = "a symlink" if stat.S_ISLNK(info.st_mode) else "not a directory"
                raise InstallError(f"{'/'.join(parts[: index + 1])} is {kind}")
            next_fd = open_dir(part, fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def digest_fd(fd: int) -> str:
    digest = hashlib.sha256()
    while True:
        chunk = os.read(fd, 1 << 16)
        if not chunk:
            return digest.hexdigest()
        digest.update(chunk)


def leaf_digest(parent_fd: int, name: str, label: str) -> str | None:
    try:
        info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode):
        kind = "a symlink" if stat.S_ISLNK(info.st_mode) else "not a regular file"
        raise InstallError(f"{label} is {kind}")
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        return digest_fd(fd)
    finally:
        os.close(fd)


def inspect(root_fd: int, path: str) -> tuple[str, str | None]:
    """Return ("missing", None), ("file", sha256), or ("unsafe", reason) without following links."""
    parts = tuple(path.split("/"))
    try:
        parent = walk_parent(root_fd, parts, create=False)
        if parent is None:
            return "missing", None
        try:
            digest = leaf_digest(parent, parts[-1], path)
        finally:
            os.close(parent)
    except InstallError as exc:
        return "unsafe", str(exc)
    except OSError as exc:
        return "unsafe", f"{path}: {exc.strerror or exc}"
    return ("missing", None) if digest is None else ("file", digest)


# --------------------------------------------------------------------------- planning


def plan_install(manifest: dict, root_fd: int, selected: list[str]) -> list[Step]:
    steps: list[Step] = []
    history = manifest.get("history", {})
    for platform in selected:
        spec = manifest["platforms"][platform]
        files = spec["files"]
        for path, digest in sorted(files.items()):
            state, value = inspect(root_fd, path)
            if state == "missing":
                steps.append(Step("add", path, platform))
            elif state == "unsafe":
                steps.append(Step("conflict", path, platform, value or "unsafe path"))
            elif value == digest:
                steps.append(Step("skip", path, platform))
            elif value in history.get(path, ()):
                steps.append(Step("update", path, platform, "unmodified earlier starter version", value))
            elif path in spec.get("optional", ()):
                steps.append(Step("keep", path, platform, "your own version was kept"))
            else:
                steps.append(Step("conflict", path, platform, "modified locally"))
        for path, digests in sorted(history.items()):
            if path in files or not is_owned(path, spec["owned"]):
                continue
            state, value = inspect(root_fd, path)
            if state == "file" and value in digests:
                steps.append(Step("remove", path, platform, "no longer shipped", value))
            elif state == "file":
                steps.append(Step("keep", path, platform, "no longer shipped, but modified locally"))
    return steps


def plan_uninstall(manifest: dict, root_fd: int, selected: list[str]) -> list[Step]:
    steps: list[Step] = []
    history = manifest.get("history", {})
    for platform in selected:
        spec = manifest["platforms"][platform]
        candidates = set(spec["files"]) | {path for path in history if is_owned(path, spec["owned"])}
        for path in sorted(candidates):
            known = set(history.get(path, ()))
            if path in spec["files"]:
                known.add(spec["files"][path])
            state, value = inspect(root_fd, path)
            if state == "file" and value in known:
                steps.append(Step("remove", path, platform, "", value))
            elif state == "file":
                steps.append(Step("keep", path, platform, "modified locally"))
            elif state == "unsafe":
                steps.append(Step("unsafe", path, platform, value or "unsafe path"))
    return steps


# --------------------------------------------------------------------------- applying


def source_bytes(path: str, expected: str) -> bytes:
    source = STARTER_ROOT / path
    if source.is_symlink() or not source.is_file():
        raise InstallError(f"starter payload file is missing: {path}")
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise InstallError(
            f"starter payload file {path} does not match its manifest; "
            "re-clone the starter or run python3 .starter/build.py"
        )
    return data


def write_new(parent_fd: int, name: str, data: bytes) -> None:
    """Create name exclusively and write data; remove the partial file if anything fails."""
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644, dir_fd=parent_fd)
    try:
        try:
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view):]
            os.fsync(fd)
            os.fchmod(fd, 0o644)
        finally:
            os.close(fd)
    except BaseException:
        try:
            os.unlink(name, dir_fd=parent_fd)
        except OSError:
            pass
        raise


def apply_step(root_fd: int, step: Step, data: bytes | None = None) -> None:
    parts = tuple(step.path.split("/"))
    name = parts[-1]
    parent = walk_parent(root_fd, parts, create=step.action == "add")
    if parent is None:
        raise InstallError(f"{step.path}: parent directory disappeared")
    try:
        if step.action == "add":
            assert data is not None
            write_new(parent, name, data)
            return
        current = leaf_digest(parent, name, step.path)
        if current != step.expected:
            raise InstallError(f"{step.path} changed while installing; nothing more was written")
        if step.action == "update":
            assert data is not None
            temporary = f".{name}.maxxy-me-{os.getpid()}.tmp"
            write_new(parent, temporary, data)  # cleans up after itself on failure
            try:
                # POSIX rename() atomically replaces the destination.
                os.rename(temporary, name, src_dir_fd=parent, dst_dir_fd=parent)
            except BaseException:
                os.unlink(temporary, dir_fd=parent)
                raise
        elif step.action == "remove":
            os.unlink(name, dir_fd=parent)
    finally:
        os.close(parent)


def prune_empty_directories(root_fd: int, removed: list[str]) -> None:
    directories = set()
    for path in removed:
        parts = path.split("/")
        for depth in range(1, len(parts)):
            directories.add(tuple(parts[:depth]))
    for directory in sorted(directories, key=len, reverse=True):
        try:
            parent = walk_parent(root_fd, directory, create=False)
        except (InstallError, OSError):
            continue
        if parent is None:
            continue
        try:
            os.rmdir(directory[-1], dir_fd=parent)
        except OSError:
            pass
        finally:
            os.close(parent)


# --------------------------------------------------------------------------- reporting


def summarize(steps: list[Step], action: str) -> int:
    return sum(1 for step in steps if step.action == action)


SYMBOLS = {"add": "+", "update": "~", "remove": "-", "keep": "!", "conflict": "x", "skip": "=", "unsafe": "x"}


def print_plan(steps: list[Step], verbose: bool) -> None:
    """Print individual updates, removals, and kept files; summarize plain additions and removals."""
    grouped: dict[tuple, int] = {}
    for step in steps:
        if step.action in ("add", "remove") and not step.detail and not verbose:
            group = "/".join(step.path.split("/")[:2]) + ("/" if step.path.count("/") > 1 else "")
            key = (SYMBOLS[step.action], group)
            grouped[key] = grouped.get(key, 0) + 1
            continue
        if step.action == "skip" and not verbose or step.action == "unsafe":
            continue
        detail = f"  ({step.detail})" if step.detail else ""
        print(f"  {SYMBOLS[step.action]} {step.path}{detail}")
    for (symbol, group), count in sorted(grouped.items()):
        noun = "file" if count == 1 else "files"
        print(f"  {symbol} {group}  ({count} {noun})")
    unsafe = [step for step in steps if step.action == "unsafe"]
    if unsafe:
        print("Skipped unsafe paths (nothing was read or removed through them):")
        print_conflicts(unsafe)


def print_conflicts(conflicts: list[Step]) -> None:
    """List conflicts, collapsing many paths blocked by the same unsafe parent into one line."""
    by_reason: dict[str, list[str]] = {}
    for step in conflicts:
        by_reason.setdefault(step.detail, []).append(step.path)
    for reason, paths in by_reason.items():
        if reason != "modified locally" and len(paths) > 3:
            print(f"  x {reason}  (blocks {len(paths)} starter files)")
            continue
        for path in paths:
            print(f"  x {path}  ({reason})")


def next_steps(selected: list[str]) -> str:
    lines = ["", "Next steps:"]
    if "claude" in selected:
        lines += [
            "  Claude Code",
            "    1. Start a new Claude Code session in this project (or run /agents to reload agents).",
            "    2. Run: /manager-orchestrator <describe your objective>",
            "       Specialists are also available directly, e.g. ask for the code-reviewer agent.",
        ]
    if "codex" in selected:
        lines += [
            "  Codex",
            "    1. Open this project in Codex and trust it when asked; Codex ignores a",
            "       project's .codex/ configuration until the project is trusted.",
            "    2. Start a new task and run: $manager-orchestrator <describe your objective>",
        ]
    return "\n".join(lines)


# --------------------------------------------------------------------------- main


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="setup.sh",
        description=(
            "Install the maxxy-me multi-agent team (a manager orchestrator, specialist agents, "
            "and workflow skills) into a project for Claude Code, Codex, or both. "
            "Locally modified files are never overwritten."
        ),
    )
    parser.add_argument(
        "target",
        type=Path,
        nargs="?",
        default=Path.cwd(),
        help="existing project directory (defaults to the current directory)",
    )
    parser.add_argument(
        "--agent",
        metavar="{claude,codex,both}",
        help="coding agent to set up; without it you choose interactively with the arrow keys",
    )
    parser.add_argument("--dry-run", action="store_true", help="show the plan without changing any files")
    parser.add_argument(
        "--uninstall",
        action="store_true",
        help="remove starter files that are unmodified; locally modified files are kept",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="list every file in the plan")
    args = parser.parse_args()
    if args.agent is not None:
        normalized = ALIASES.get(args.agent.strip().lower())
        if normalized is None:
            parser.error(f"--agent must be claude, codex, or both (got {args.agent!r})")
        args.agent = normalized
    return args


def validate_target(raw: Path) -> Path:
    if not raw.exists():
        raise InstallError(f"target does not exist: {raw}")
    if not raw.is_dir():
        raise InstallError(f"target is not a directory: {raw}")
    target = raw.resolve()
    if target == Path(target.anchor) or target == Path.home().resolve():
        raise InstallError(f"refusing to install into a broad directory: {target}")
    if target == STARTER_ROOT:
        raise InstallError("refusing to install the starter into its own checkout; run setup.sh from your project")
    return target


def run(args: argparse.Namespace) -> int:
    manifest = load_manifest()
    version = manifest.get("version", "?")
    target = validate_target(args.target)
    require_secure_operations()

    choice = args.agent or choose_interactively(args.uninstall, target, version)
    selected = platforms_for(choice)
    labels = " + ".join(manifest["platforms"][platform]["label"] for platform in selected)

    root_fd = open_root(target)
    try:
        planner = plan_uninstall if args.uninstall else plan_install
        steps = planner(manifest, root_fd, selected)
        conflicts = [step for step in steps if step.action == "conflict"]
        verb = "Removing" if args.uninstall else "Installing"
        mode = " (dry run)" if args.dry_run else ""
        print(f"\n{verb} maxxy-me {version} for {labels}{mode}\n  into {target}\n")

        if conflicts:
            print("Stopped before writing anything. These paths differ from every shipped version or are unsafe:")
            print_conflicts(conflicts)
            print(
                "\nNo files were changed. Back up and merge or move the listed files, then run setup again.\n"
                "Use --dry-run to preview, or --uninstall to remove unmodified starter files first.",
            )
            return EXIT_CONFLICT

        work = [step for step in steps if step.action in ("add", "update", "remove")]
        print_plan(steps, args.verbose or args.dry_run)
        if not work:
            print("  Nothing to do: everything is already up to date." if not args.uninstall
                  else "  Nothing to remove.")

        if not args.dry_run and work:
            payload = {
                step.path: source_bytes(step.path, manifest["platforms"][step.platform]["files"][step.path])
                for step in work
                if step.action in ("add", "update")
            }
            done: list[Step] = []
            try:
                for step in work:
                    apply_step(root_fd, step, payload.get(step.path))
                    done.append(step)
            except (InstallError, OSError) as exc:
                print(f"\nerror: stopped after {len(done)} of {len(work)} change(s): {exc}", file=sys.stderr)
                print("Existing modified files were not touched; completed changes were left in place.", file=sys.stderr)
                return EXIT_ERROR
            prune_empty_directories(root_fd, [step.path for step in done if step.action == "remove"])
    finally:
        os.close(root_fd)

    counts = (
        f"{summarize(steps, 'remove')} removed, {summarize(steps, 'keep')} kept, "
        f"{summarize(steps, 'unsafe')} skipped as unsafe"
        if args.uninstall
        else f"{summarize(steps, 'add')} added, {summarize(steps, 'update')} updated, "
        f"{summarize(steps, 'remove')} removed, {summarize(steps, 'skip')} already up to date"
    )
    print(f"\n{'Planned' if args.dry_run else 'Done'}: {counts}.")
    if args.dry_run:
        print("Dry run complete: no files were changed.")
    elif args.uninstall:
        kept = [step for step in steps if step.action == "keep"]
        if kept:
            print("Kept files you modified; review and delete them yourself if you no longer need them.")
        if "codex" in selected and any(step.path == ".codex/config.toml" for step in kept):
            print("Note: .codex/config.toml was kept and may still register removed roles; edit its [agents.*] tables.")
    else:
        if any(step.action == "keep" and step.path == ".codex/config.toml" for step in steps):
            print(
                "\nYour existing .codex/config.toml was kept. Codex discovers the roles in .codex/agents/\n"
                "on its own; for full parallelism add this to your config:\n"
                "  [agents]\n  max_concurrent_threads_per_session = 8"
            )
        print(next_steps(selected))
    return 0


def main() -> int:
    if sys.version_info < (3, 8):
        print("error: Python 3.8 or newer is required", file=sys.stderr)
        return EXIT_ERROR
    args = parse_args()
    try:
        return run(args)
    except Cancelled:
        print("\nCancelled: no files were changed.", file=sys.stderr)
        return EXIT_CANCELLED
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        return EXIT_CANCELLED
    except InstallError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_ERROR
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        print("No further files were changed.", file=sys.stderr)
        return EXIT_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
