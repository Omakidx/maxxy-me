#!/usr/bin/env python3
"""Safely install this starter's project-scoped Codex payload."""

from __future__ import annotations

import argparse
import os
import shutil
import stat
import sys
from dataclasses import dataclass
from pathlib import Path


PAYLOAD_DIRS = (".codex", ".agents")
IGNORED_NAMES = {".DS_Store", "__pycache__"}
IGNORED_SUFFIXES = {".pyc", ".pyo"}


@dataclass(frozen=True)
class CopyPlan:
    source: Path
    destination: Path
    relative: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Add the starter's .codex and .agents files to an existing project. "
            "Differing destination files are never overwritten."
        )
    )
    parser.add_argument("target", type=Path, help="existing project directory")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="show the plan without creating or changing files",
    )
    return parser.parse_args()


def payload_files(source_root: Path) -> list[Path]:
    files: list[Path] = []
    for directory_name in PAYLOAD_DIRS:
        directory = source_root / directory_name
        if not directory.is_dir():
            raise ValueError(f"starter payload is missing {directory}")
        for path in sorted(directory.rglob("*")):
            if path.is_symlink():
                raise ValueError(f"starter payload cannot contain symlinks: {path}")
            if not path.is_file():
                continue
            if any(part in IGNORED_NAMES for part in path.parts):
                continue
            if path.suffix in IGNORED_SUFFIXES:
                continue
            files.append(path)
    return files


def unsafe_parent(target: Path, destination: Path) -> Path | None:
    current = destination.parent
    while current != target:
        if current.is_symlink() or (current.exists() and not current.is_dir()):
            return current
        current = current.parent
    return None


def build_plan(source_root: Path, target: Path) -> tuple[list[CopyPlan], list[Path], list[Path]]:
    additions: list[CopyPlan] = []
    identical: list[Path] = []
    conflicts: list[Path] = []

    for source in payload_files(source_root):
        relative = source.relative_to(source_root)
        destination = target / relative
        bad_parent = unsafe_parent(target, destination)
        if bad_parent is not None:
            conflicts.append(bad_parent)
            continue
        if destination.is_symlink() or (destination.exists() and not destination.is_file()):
            conflicts.append(destination)
        elif destination.is_file():
            if source.read_bytes() == destination.read_bytes():
                identical.append(relative)
            else:
                conflicts.append(relative)
        else:
            additions.append(CopyPlan(source=source, destination=destination, relative=relative))

    return additions, identical, sorted(set(conflicts), key=str)


def validate_target(raw_target: Path) -> Path:
    if not raw_target.exists():
        raise ValueError(f"target does not exist: {raw_target}")
    if not raw_target.is_dir():
        raise ValueError(f"target is not a directory: {raw_target}")

    target = raw_target.resolve()
    if target == Path(target.anchor) or target == Path.home().resolve():
        raise ValueError(f"refusing broad installation target: {target}")
    return target


def require_secure_directory_operations() -> None:
    required_dir_fd = (os.open, os.mkdir)
    if not hasattr(os, "O_DIRECTORY") or not hasattr(os, "O_NOFOLLOW"):
        raise OSError("this installer requires POSIX no-follow directory operations")
    if any(function not in os.supports_dir_fd for function in required_dir_fd):
        raise OSError("this installer requires POSIX directory-relative file operations")


def open_directory(name: str | Path, parent_fd: int | None = None) -> int:
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    return os.open(name, flags, dir_fd=parent_fd)


def open_absolute_directory(path: Path) -> int:
    if not path.is_absolute():
        raise OSError(f"expected an absolute directory path: {path}")
    current_fd = open_directory(Path(path.anchor))
    try:
        for component in path.parts[1:]:
            next_fd = open_directory(component, current_fd)
            previous_fd = current_fd
            current_fd = next_fd
            os.close(previous_fd)
        return current_fd
    except BaseException:
        os.close(current_fd)
        raise


def open_existing_parent(root_fd: int, components: tuple[str, ...]) -> int:
    current_fd = os.dup(root_fd)
    try:
        for component in components:
            next_fd = open_directory(component, current_fd)
            previous_fd = current_fd
            current_fd = next_fd
            os.close(previous_fd)
        return current_fd
    except BaseException:
        os.close(current_fd)
        raise


def open_or_create_parent(
    target_fd: int,
    components: tuple[str, ...],
) -> int:
    current_fd = os.dup(target_fd)
    try:
        for component in components:
            try:
                next_fd = open_directory(component, current_fd)
            except FileNotFoundError:
                os.mkdir(component, mode=0o755, dir_fd=current_fd)
                next_fd = open_directory(component, current_fd)
            previous_fd = current_fd
            current_fd = next_fd
            os.close(previous_fd)
        return current_fd
    except BaseException:
        os.close(current_fd)
        raise


def copy_new_file(item: CopyPlan, source_root_fd: int, destination_parent_fd: int) -> None:
    source_fd: int | None = None
    source_parent_fd: int | None = None
    destination_fd: int | None = None
    try:
        source_parent_fd = open_existing_parent(source_root_fd, item.relative.parts[:-1])
        source_fd = os.open(
            item.relative.name,
            os.O_RDONLY | os.O_NOFOLLOW,
            dir_fd=source_parent_fd,
        )
        source_stat = os.fstat(source_fd)
        if not stat.S_ISREG(source_stat.st_mode):
            raise OSError(f"starter source is not a regular file: {item.source}")

        destination_fd = os.open(
            item.relative.name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=destination_parent_fd,
        )
        with os.fdopen(source_fd, "rb", closefd=False) as source, os.fdopen(
            destination_fd, "wb", closefd=False
        ) as destination:
            shutil.copyfileobj(source, destination)
            destination.flush()
            os.fsync(destination.fileno())

        installed_mode = stat.S_IMODE(source_stat.st_mode) & ~0o022
        os.fchmod(destination_fd, installed_mode)
    finally:
        try:
            if destination_fd is not None:
                os.close(destination_fd)
        finally:
            try:
                if source_fd is not None:
                    os.close(source_fd)
            finally:
                if source_parent_fd is not None:
                    os.close(source_parent_fd)


def apply_plan(source_root: Path, target: Path, additions: list[CopyPlan]) -> None:
    require_secure_directory_operations()
    source_root_fd = open_absolute_directory(source_root)
    try:
        target_fd = open_absolute_directory(target)
        try:
            for item in additions:
                parent_fd = open_or_create_parent(
                    target_fd,
                    item.relative.parts[:-1],
                )
                try:
                    copy_new_file(item, source_root_fd, parent_fd)
                finally:
                    os.close(parent_fd)
        finally:
            os.close(target_fd)
    finally:
        os.close(source_root_fd)


def main() -> int:
    args = parse_args()
    source_root = Path(__file__).resolve().parent.parent

    try:
        target = validate_target(args.target)
        additions, identical, conflicts = build_plan(source_root, target)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if conflicts:
        print("installation stopped; these destinations differ or are unsafe:", file=sys.stderr)
        for path in conflicts:
            print(f"  {path}", file=sys.stderr)
        print("no files were written", file=sys.stderr)
        return 2

    action = "would add" if args.dry_run else "adding"
    for item in additions:
        print(f"{action} {item.destination.relative_to(target)}")

    if not args.dry_run:
        try:
            apply_plan(source_root, target, additions)
        except OSError as exc:
            print(f"error: installation stopped: {exc}", file=sys.stderr)
            print(
                "existing files were not overwritten or deleted; newly created files are left "
                "in place for manual inspection",
                file=sys.stderr,
            )
            return 1

    print(
        f"complete: {len(additions)} file(s) {'planned' if args.dry_run else 'added'}, "
        f"{len(identical)} identical file(s) skipped"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
