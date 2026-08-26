#!/usr/bin/env python3
"""Validate the reusable Codex team starter and its safe installer."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path


TEXT_SUFFIXES = {".md", ".py", ".toml", ".yaml", ".yml", ".txt"}
PORTABILITY_PATTERNS = {
    "machine-specific home path": re.compile(r"/(?:home|Users)/[^/\s]+/"),
    "file URI": re.compile("file:" + "//"),
    "unfinished placeholder": re.compile(r"\b(?:TODO|FIXME|TBD)\s*:"),
}
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument(
        "--strict-codex",
        action="store_true",
        help="also require Codex Doctor's strict config.load check",
    )
    parser.add_argument(
        "--skip-install-test",
        action="store_true",
        help="skip the isolated dry-run, install, and conflict-safety checks",
    )
    return parser.parse_args()


def load_toml(path: Path) -> dict:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise ValueError(f"cannot parse {path}: {exc}") from exc


def parse_skill_frontmatter(path: Path) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        raise ValueError(f"{path}: missing YAML frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError(f"{path}: unterminated YAML frontmatter") from exc

    values: dict[str, str] = {}
    for line in lines[1:end]:
        if ":" not in line or line[:1].isspace():
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip().strip('"\'')
    return values


def parse_simple_yaml_mapping(path: Path) -> dict:
    """Parse the mapping-and-scalar subset used by skill UI metadata."""
    root: dict = {}
    stack: list[tuple[int, dict]] = [(-1, root)]
    for number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if "\t" in raw_line:
            raise ValueError(f"{path}:{number}: tabs are not allowed in YAML indentation")
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        content = raw_line.strip()
        if content.startswith("-") or ":" not in content:
            raise ValueError(f"{path}:{number}: unsupported or invalid YAML structure")
        key, raw_value = content.split(":", 1)
        key = key.strip()
        if not key:
            raise ValueError(f"{path}:{number}: empty YAML key")
        while stack and indent <= stack[-1][0]:
            stack.pop()
        if not stack:
            raise ValueError(f"{path}:{number}: invalid YAML indentation")
        parent = stack[-1][1]
        if key in parent:
            raise ValueError(f"{path}:{number}: duplicate YAML key {key!r}")
        raw_value = raw_value.strip()
        if not raw_value:
            value: object = {}
            parent[key] = value
            stack.append((indent, value))
        elif raw_value in {"true", "false"}:
            parent[key] = raw_value == "true"
        elif raw_value.startswith('"'):
            try:
                parent[key] = json.loads(raw_value)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{number}: invalid quoted YAML string: {exc}") from exc
        else:
            raise ValueError(f"{path}:{number}: scalar strings must be quoted")
    return root


def validate_skill_resources(skill_dir: Path) -> list[str]:
    errors: list[str] = []
    if skill_dir.is_symlink():
        return [f"{skill_dir}: skill directories must not be symlinks"]
    skill_root = skill_dir.resolve()
    entries = [skill_dir, *sorted(skill_dir.rglob("*"))]
    for entry in entries:
        if entry.is_symlink():
            errors.append(f"{entry}: skill entries must not be symlinks")

    for markdown in sorted(skill_dir.rglob("*.md")):
        if markdown.is_symlink() or not markdown.is_file():
            continue
        text = markdown.read_text(encoding="utf-8")
        for match in MARKDOWN_LINK.finditer(text):
            raw_target = match.group(1).strip()
            if raw_target.startswith("<") and raw_target.endswith(">"):
                raw_target = raw_target[1:-1]
            raw_target = raw_target.split("#", 1)[0]
            if not raw_target or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", raw_target):
                continue
            target = Path(raw_target)
            if target.is_absolute():
                errors.append(f"{markdown}: absolute local link is not portable: {raw_target}")
                continue
            resolved = (markdown.parent / target).resolve()
            try:
                resolved.relative_to(skill_root)
            except ValueError:
                errors.append(f"{markdown}: local link escapes skill directory: {raw_target}")
                continue
            if not resolved.exists():
                errors.append(f"{markdown}: missing linked resource: {raw_target}")

    metadata_path = skill_dir / "agents" / "openai.yaml"
    if metadata_path.is_symlink():
        errors.append(f"{metadata_path}: skill metadata must not be a symlink")
    elif metadata_path.is_file():
        try:
            metadata = parse_simple_yaml_mapping(metadata_path)
        except (OSError, ValueError) as exc:
            errors.append(str(exc))
        else:
            if skill_dir.name == "create-skill":
                policy = metadata.get("policy", {})
                interface = metadata.get("interface", {})
                if not isinstance(policy, dict) or policy.get("allow_implicit_invocation") is not False:
                    errors.append(f"{metadata_path}: create-skill must remain explicit-only")
                prompt = interface.get("default_prompt") if isinstance(interface, dict) else None
                if not isinstance(prompt, str) or "$create-skill" not in prompt:
                    errors.append(f"{metadata_path}: default_prompt must mention $create-skill")
    return errors


def validate_core(root: Path) -> list[str]:
    errors: list[str] = []
    config_path = root / ".codex" / "config.toml"
    try:
        config = load_toml(config_path)
    except ValueError as exc:
        return [str(exc)]

    agents = config.get("agents")
    if not isinstance(agents, dict):
        return [f"{config_path}: missing [agents] table"]
    if config.get("features", {}).get("multi_agent") is not True:
        errors.append(f"{config_path}: features.multi_agent must be true")
    concurrency = agents.get("max_concurrent_threads_per_session")
    if not isinstance(concurrency, int) or concurrency < 1:
        errors.append(f"{config_path}: agents.max_concurrent_threads_per_session must be positive")

    registrations = {name: value for name, value in agents.items() if isinstance(value, dict)}
    referenced_roles: set[Path] = set()
    for name, registration in sorted(registrations.items()):
        description = registration.get("description")
        config_file = registration.get("config_file")
        if not isinstance(description, str) or not description.strip():
            errors.append(f"agents.{name}: missing description")
        if not isinstance(config_file, str):
            errors.append(f"agents.{name}: missing config_file")
            continue
        role = (root / ".codex" / config_file).resolve()
        agents_dir = (root / ".codex" / "agents").resolve()
        try:
            role.relative_to(agents_dir)
        except ValueError:
            errors.append(f"agents.{name}: config_file escapes .codex/agents")
            continue
        referenced_roles.add(role)
        if not role.is_file():
            errors.append(f"agents.{name}: missing {role}")

    role_files = set((root / ".codex" / "agents").glob("*.toml"))
    unregistered = sorted(path for path in role_files if path.resolve() not in referenced_roles)
    for path in unregistered:
        errors.append(f"unregistered role file: {path}")

    agents_root = root / ".agents"
    skills_dir = agents_root / "skills"
    if agents_root.is_symlink():
        errors.append(f"{agents_root}: .agents must not be a symlink")
    elif skills_dir.is_symlink():
        errors.append(f"{skills_dir}: skills directory must not be a symlink")
    elif not skills_dir.is_dir():
        errors.append(f"missing skills directory: {skills_dir}")
    else:
        for skill_dir in sorted(skills_dir.iterdir()):
            if skill_dir.is_symlink():
                errors.append(f"{skill_dir}: skill directories must not be symlinks")
                continue
            if not skill_dir.is_dir():
                continue
            entrypoint = skill_dir / "SKILL.md"
            if not entrypoint.is_file():
                errors.append(f"{skill_dir}: missing SKILL.md")
                continue
            try:
                frontmatter = parse_skill_frontmatter(entrypoint)
            except (OSError, ValueError) as exc:
                errors.append(str(exc))
                continue
            if frontmatter.get("name") != skill_dir.name:
                errors.append(f"{entrypoint}: name must match folder {skill_dir.name!r}")
            if not frontmatter.get("description"):
                errors.append(f"{entrypoint}: missing description")
            errors.extend(validate_skill_resources(skill_dir))

    scan_roots = (root / ".codex", root / ".agents", root / ".starter")
    for base in scan_roots:
        if base.is_symlink() or not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if path.is_symlink() or not path.is_file() or path.suffix not in TEXT_SUFFIXES:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                errors.append(f"expected UTF-8 text: {path}")
                continue
            for label, pattern in PORTABILITY_PATTERNS.items():
                if pattern.search(text):
                    errors.append(f"{path}: contains {label}")

    for path in (root / "README.md",):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for label, pattern in PORTABILITY_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"{path}: contains {label}")

    return errors


def snapshot(root: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            result[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def run_project_agent_validator(
    trusted_starter_root: Path,
    inspected_root: Path,
    strict_codex: bool,
) -> list[str]:
    validator = (
        trusted_starter_root
        / ".agents"
        / "skills"
        / "agent-creator"
        / "scripts"
        / "validate_project_agents.py"
    )
    if not validator.is_file():
        return [f"missing project agent validator: {validator}"]
    command = [sys.executable, str(validator), "--root", str(inspected_root)]
    if strict_codex:
        command.append("--strict-codex")
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        return [f"project agent validation failed: {detail}"]
    print(result.stdout.strip())
    return []


def validate_installer(source_root: Path) -> list[str]:
    errors: list[str] = []
    installer = source_root / ".starter" / "install.py"
    if not installer.is_file():
        return [f"missing installer: {installer}"]
    setup = source_root / "setup.sh"
    if not setup.is_file():
        return [f"missing setup wrapper: {setup}"]
    if not setup.stat().st_mode & 0o111:
        errors.append(f"setup wrapper is not executable: {setup}")
    syntax = subprocess.run(
        ["sh", "-n", str(setup)], capture_output=True, text=True, check=False
    )
    if syntax.returncode:
        errors.append(f"setup wrapper has invalid POSIX shell syntax: {syntax.stderr.strip()}")

    help_result = subprocess.run(
        [sys.executable, str(installer), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    help_text = help_result.stdout.lower()
    if help_result.returncode or "[target]" not in help_text or "defaults to the current directory" not in help_text:
        errors.append("installer help does not describe an optional current-directory target")

    with tempfile.TemporaryDirectory(prefix="codex-team-starter-") as temporary:
        temp_root = Path(temporary)
        dry_target = temp_root / "dry-run"
        dry_target.mkdir()
        before = snapshot(dry_target)
        dry = subprocess.run(
            [sys.executable, str(installer), "--dry-run", str(dry_target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if dry.returncode or snapshot(dry_target) != before:
            errors.append("installer dry-run failed or changed the target")

        no_argument_target = temp_root / "no-argument"
        no_argument_target.mkdir()
        no_argument = subprocess.run(
            [sys.executable, str(installer)],
            cwd=no_argument_target,
            capture_output=True,
            text=True,
            check=False,
        )
        if no_argument.returncode:
            errors.append(
                f"zero-argument installation failed: {(no_argument.stderr or no_argument.stdout).strip()}"
            )
        else:
            errors.extend(
                f"zero-argument install: {error}"
                for error in validate_core(no_argument_target)
            )

        wrapper_dry_target = temp_root / "wrapper-dry-run"
        wrapper_dry_target.mkdir()
        wrapper_dry_before = snapshot(wrapper_dry_target)
        wrapper_dry = subprocess.run(
            [str(setup), "--dry-run"],
            cwd=wrapper_dry_target,
            capture_output=True,
            text=True,
            check=False,
        )
        wrapper_dry_output = wrapper_dry.stdout.lower()
        if wrapper_dry.returncode or snapshot(wrapper_dry_target) != wrapper_dry_before:
            errors.append("setup wrapper dry-run failed or changed its current directory")
        elif "dry run complete" not in wrapper_dry_output:
            errors.append("setup wrapper dry-run did not identify itself as a dry run")
        elif "reopen this project in codex" in wrapper_dry_output:
            errors.append("setup wrapper dry-run incorrectly printed the Codex reopen instruction")

        wrapper_missing_target = temp_root / "missing-wrapper-target"
        wrapper_failure = subprocess.run(
            [str(setup), str(wrapper_missing_target)],
            cwd=temp_root,
            capture_output=True,
            text=True,
            check=False,
        )
        if wrapper_failure.returncode == 0:
            errors.append("setup wrapper did not propagate a failed installer exit status")

        wrapper_target = temp_root / "wrapper"
        wrapper_target.mkdir()
        wrapper = subprocess.run(
            [str(setup)],
            cwd=wrapper_target,
            capture_output=True,
            text=True,
            check=False,
        )
        if wrapper.returncode:
            errors.append(f"setup wrapper installation failed: {(wrapper.stderr or wrapper.stdout).strip()}")
        elif "reopen this project in codex" not in wrapper.stdout.lower():
            errors.append("setup wrapper did not print the Codex next step after success")
        else:
            errors.extend(
                f"setup wrapper install: {error}"
                for error in validate_core(wrapper_target)
            )

        wrapper_explicit_target = temp_root / "wrapper-explicit"
        wrapper_explicit_target.mkdir()
        wrapper_explicit = subprocess.run(
            [str(setup), str(wrapper_explicit_target)],
            cwd=temp_root,
            capture_output=True,
            text=True,
            check=False,
        )
        if wrapper_explicit.returncode:
            errors.append(
                f"setup wrapper explicit-target forwarding failed: "
                f"{(wrapper_explicit.stderr or wrapper_explicit.stdout).strip()}"
            )
        else:
            errors.extend(
                f"setup wrapper explicit target: {error}"
                for error in validate_core(wrapper_explicit_target)
            )

        install_target = temp_root / "install"
        install_target.mkdir()
        unrelated = install_target / "application.txt"
        unrelated.write_text("keep me\n", encoding="utf-8")
        install = subprocess.run(
            [sys.executable, str(installer), str(install_target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if install.returncode:
            errors.append(f"isolated installation failed: {(install.stderr or install.stdout).strip()}")
        else:
            errors.extend(f"isolated install: {error}" for error in validate_core(install_target))
            errors.extend(run_project_agent_validator(source_root, install_target, False))
            if unrelated.read_text(encoding="utf-8") != "keep me\n":
                errors.append("installer changed an unrelated target file")
            first_snapshot = snapshot(install_target)
            repeat = subprocess.run(
                [sys.executable, str(installer), str(install_target)],
                capture_output=True,
                text=True,
                check=False,
            )
            if repeat.returncode or snapshot(install_target) != first_snapshot:
                errors.append("repeated installation was not an idempotent no-op")

            outside_skill = temp_root / "outside-skill"
            outside_skill.mkdir()
            (outside_skill / "SKILL.md").write_text(
                "---\nname: linked\ndescription: Outside marker fixture.\n---\n"
                "[outside-only-marker](missing-outside-resource.md)\n",
                encoding="utf-8",
            )
            linked_skill = install_target / ".agents" / "skills" / "linked"
            linked_skill.symlink_to(outside_skill, target_is_directory=True)
            symlink_errors = validate_core(install_target)
            if not any("skill directories must not be symlinks" in error for error in symlink_errors):
                errors.append("validator did not reject a symlinked skill directory")
            if any("outside-only-marker" in error or "missing-outside-resource" in error for error in symlink_errors):
                errors.append("validator followed a symlinked skill directory during inspection")
            linked_skill.unlink()

            image_skill = install_target / ".agents" / "skills" / "image-link-fixture"
            image_skill.mkdir()
            (image_skill / "SKILL.md").write_text(
                "---\nname: image-link-fixture\ndescription: Image link fixture.\n---\n"
                "![escape](../../outside.png)\n![missing](assets/missing.png)\n",
                encoding="utf-8",
            )
            image_errors = validate_core(install_target)
            if not any("local link escapes skill directory" in error for error in image_errors):
                errors.append("validator did not reject an escaping Markdown image link")
            if not any("missing linked resource" in error for error in image_errors):
                errors.append("validator did not reject a missing Markdown image asset")
            shutil.rmtree(image_skill)

            marker = temp_root / "untrusted-validator-ran"
            untrusted_validator = (
                install_target
                / ".agents"
                / "skills"
                / "agent-creator"
                / "scripts"
                / "validate_project_agents.py"
            )
            untrusted_validator.write_text(
                "from pathlib import Path\n"
                f"Path({str(marker)!r}).write_text('unsafe', encoding='utf-8')\n",
                encoding="utf-8",
            )
            errors.extend(run_project_agent_validator(source_root, install_target, False))
            if marker.exists():
                errors.append("validation executed the inspected project's untrusted helper")

            untrusted_installer_marker = temp_root / "untrusted-installer-ran"
            untrusted_installer = install_target / ".starter" / "install.py"
            untrusted_installer.parent.mkdir()
            untrusted_installer.write_text(
                "from pathlib import Path\n"
                f"Path({str(untrusted_installer_marker)!r}).write_text('unsafe', encoding='utf-8')\n",
                encoding="utf-8",
            )
            subprocess.run(
                [
                    sys.executable,
                    str(source_root / ".starter" / "validate.py"),
                    "--root",
                    str(install_target),
                    "--skip-install-test",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if untrusted_installer_marker.exists():
                errors.append("validation executed the inspected project's untrusted installer")

        conflict_target = temp_root / "conflict"
        (conflict_target / ".codex").mkdir(parents=True)
        conflict_file = conflict_target / ".codex" / "config.toml"
        conflict_file.write_text("different = true\n", encoding="utf-8")
        conflict_before = snapshot(conflict_target)
        conflict = subprocess.run(
            [sys.executable, str(installer), str(conflict_target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if conflict.returncode == 0:
            errors.append("installer accepted a differing destination file")
        if snapshot(conflict_target) != conflict_before:
            errors.append("installer changed the target after detecting a conflict")

        collision_target = temp_root / "collision"
        (collision_target / ".codex" / "config.toml").mkdir(parents=True)
        collision_before = snapshot(collision_target)
        collision = subprocess.run(
            [sys.executable, str(installer), str(collision_target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if collision.returncode == 0 or snapshot(collision_target) != collision_before:
            errors.append("installer did not safely reject a file/directory collision")

        symlink_target = temp_root / "symlink"
        outside = temp_root / "outside"
        symlink_target.mkdir()
        outside.mkdir()
        (symlink_target / ".codex").symlink_to(outside, target_is_directory=True)
        outside_before = snapshot(outside)
        symlink = subprocess.run(
            [sys.executable, str(installer), str(symlink_target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if symlink.returncode == 0 or snapshot(outside) != outside_before:
            errors.append("installer did not safely reject a destination symlink")

        scan_target = temp_root / "scan-root-symlink"
        (scan_target / ".codex" / "agents").mkdir(parents=True)
        (scan_target / ".codex" / "config.toml").write_text(
            "[agents]\nmax_concurrent_threads_per_session = 1\n"
            "[features]\nmulti_agent = true\n",
            encoding="utf-8",
        )
        outside_agents = temp_root / "outside-agents"
        outside_agents.mkdir()
        (outside_agents / "outside-root-marker.md").write_text(
            "machine marker /" + "home/outside-user/private\n",
            encoding="utf-8",
        )
        (scan_target / ".agents").symlink_to(outside_agents, target_is_directory=True)
        scan_errors = validate_core(scan_target)
        if not any(".agents must not be a symlink" in error for error in scan_errors):
            errors.append("validator did not reject a symlinked .agents root")
        if any("outside-root-marker" in error or "outside-user" in error for error in scan_errors):
            errors.append("validator followed a symlinked scan root during portability inspection")

    return errors


def main() -> int:
    args = parse_args()
    trusted_starter_root = Path(__file__).resolve().parent.parent
    root = args.root.resolve()
    errors = validate_core(root)
    required_package_files = (
        root / "README.md",
        root / "LICENSE",
        root / ".agents" / "LICENSE",
        root / ".starter" / "install.py",
        root / "setup.sh",
    )
    for path in required_package_files:
        if not path.is_file():
            errors.append(f"missing package file: {path}")
    root_license = root / "LICENSE"
    payload_license = root / ".agents" / "LICENSE"
    if root_license.is_file() and payload_license.is_file():
        if root_license.read_bytes() != payload_license.read_bytes():
            errors.append("root LICENSE and .agents/LICENSE must be identical")
    errors.extend(run_project_agent_validator(trusted_starter_root, root, args.strict_codex))
    if not args.skip_install_test:
        errors.extend(validate_installer(trusted_starter_root))

    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    print("starter validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
