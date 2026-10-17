#!/usr/bin/env python3
"""Statically validate the maxxy-me starter: sources, generated payloads, and package files.

    python3 .starter/validate.py                  # static validation of this checkout
    python3 .starter/validate.py --codex-doctor   # also load the Codex payload with the Codex CLI
    python3 .starter/validate.py --root PROJECT   # check an installed project's agents and skills

Behavioral tests of the installer live in tests/ (python3 -m unittest discover -s tests).
Validation only runs scripts from this trusted checkout; it never executes helpers found in
an inspected project.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import tomllib
from pathlib import Path


TRUSTED_ROOT = Path(__file__).resolve().parent.parent
AGENT_VALIDATOR = TRUSTED_ROOT / "team" / "skills" / "agent-creator" / "scripts" / "validate_project_agents.py"

TEXT_SUFFIXES = {".md", ".py", ".toml", ".yaml", ".yml", ".txt", ".json", ".sh"}
PORTABILITY_PATTERNS = {
    "machine-specific home path": re.compile(r"/(?:home|Users)/[^/\s]+/"),
    "file URI": re.compile("file:" + "//"),
    "unfinished placeholder": re.compile(r"\b(?:TODO|FIXME|TBD)\s*:"),
}
TEMPLATE_SYNTAX = re.compile(r"\{\{|\}\}")
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CLAUDE_SKILL_KEYS = {
    "name", "description", "when_to_use", "argument-hint", "arguments", "disable-model-invocation",
    "user-invocable", "allowed-tools", "disallowed-tools", "model", "effort", "context", "agent",
    "background", "hooks", "paths", "shell", "metadata", "license", "compatibility",
}
CODEX_SKILL_KEYS = {"name", "description", "license", "allowed-tools", "metadata"}
CLAUDE_PLACEHOLDER = re.compile(r"(?<!\\)\$(?:ARGUMENTS|\d)")
EXPLICIT_SKILLS = {"manager-orchestrator", "agent-creator", "create-skill"}
EXPECTED_MANAGER = {"model": "gpt-6.1-sol", "model_reasoning_effort": "ultra"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, help="validate the agents and skills installed in another project")
    parser.add_argument(
        "--codex-doctor",
        action="store_true",
        help="also load an isolated Codex install with the Codex CLI (needs codex on PATH or CODEX_CLI_PATH)",
    )
    return parser.parse_args()


def load_build_module():
    spec = importlib.util.spec_from_file_location("maxxy_build", TRUSTED_ROOT / ".starter" / "build.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------- static checks


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    lines = path.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0] != "---":
        raise ValueError(f"{path}: missing YAML frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError(f"{path}: unterminated YAML frontmatter") from exc
    values: dict[str, str] = {}
    for line in lines[1:end]:
        if not line.strip() or line.startswith((" ", "\t", "-")):
            continue
        key, _, raw = line.partition(":")
        raw = raw.strip()
        values[key.strip()] = json.loads(raw) if raw.startswith('"') else raw
    return values, "\n".join(lines[end + 1 :])


def parse_simple_yaml(path: Path) -> dict:
    """Parse the mapping-and-quoted-scalar subset used by agents/openai.yaml."""
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
            raise ValueError(f"{path}:{number}: unsupported YAML structure")
        key, raw_value = (part.strip() for part in content.split(":", 1))
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if key in parent:
            raise ValueError(f"{path}:{number}: duplicate key {key!r}")
        if not raw_value:
            parent[key] = {}
            stack.append((indent, parent[key]))
        elif raw_value in {"true", "false"}:
            parent[key] = raw_value == "true"
        elif raw_value.startswith('"'):
            parent[key] = json.loads(raw_value)
        else:
            raise ValueError(f"{path}:{number}: scalar strings must be quoted")
    return root


def check_links(skill_dir: Path) -> list[str]:
    errors: list[str] = []
    skill_root = skill_dir.resolve()
    for markdown in sorted(skill_dir.rglob("*.md")):
        if markdown.is_symlink():
            continue
        for match in MARKDOWN_LINK.finditer(markdown.read_text(encoding="utf-8")):
            target = match.group(1).strip().strip("<>").split("#", 1)[0]
            if not target or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target):
                continue
            if Path(target).is_absolute():
                errors.append(f"{markdown}: absolute local link is not portable: {target}")
                continue
            resolved = (markdown.parent / target).resolve()
            try:
                resolved.relative_to(skill_root)
            except ValueError:
                errors.append(f"{markdown}: local link escapes the skill directory: {target}")
                continue
            if not resolved.exists():
                errors.append(f"{markdown}: missing linked resource: {target}")
    return errors


def check_skills(root: Path, platform: str) -> list[str]:
    skills_dir = root / (".claude/skills" if platform == "claude" else ".agents/skills")
    errors: list[str] = []
    if skills_dir.is_symlink() or (skills_dir.exists() and not skills_dir.is_dir()):
        return [f"{skills_dir}: skills directory must be a real directory"]
    for parent in (skills_dir.parent,):
        if parent.is_symlink():
            return [f"{parent}: must not be a symlink"]
    if not skills_dir.is_dir():
        return [f"missing skills directory: {skills_dir}"]

    for skill_dir in sorted(skills_dir.iterdir()):
        if skill_dir.is_symlink():
            errors.append(f"{skill_dir}: skill directories must not be symlinks")
            continue
        if not skill_dir.is_dir():
            continue
        symlinks = [entry for entry in skill_dir.rglob("*") if entry.is_symlink()]
        errors.extend(f"{entry}: skill entries must not be symlinks" for entry in symlinks)
        entrypoint = skill_dir / "SKILL.md"
        if not entrypoint.is_file():
            errors.append(f"{skill_dir}: missing SKILL.md")
            continue
        try:
            meta, body = parse_frontmatter(entrypoint)
        except (OSError, ValueError) as exc:
            errors.append(str(exc))
            continue
        name = meta.get("name", "")
        if name != skill_dir.name:
            errors.append(f"{entrypoint}: name must match folder {skill_dir.name!r}")
        if not SKILL_NAME.match(name) or len(name) > 64:
            errors.append(f"{entrypoint}: name must be hyphen-case and at most 64 characters")
        description = meta.get("description", "")
        if not description or len(description) > 1024:
            errors.append(f"{entrypoint}: description must be 1-1024 characters")
        allowed = CLAUDE_SKILL_KEYS if platform == "claude" else CODEX_SKILL_KEYS
        for key in sorted(set(meta) - allowed):
            errors.append(f"{entrypoint}: frontmatter key {key!r} is not supported on {platform}")
        if platform == "claude":
            for match in CLAUDE_PLACEHOLDER.finditer(body):
                errors.append(f"{entrypoint}: unescaped argument placeholder {match.group(0)!r}")
        errors.extend(check_links(skill_dir))
        if platform == "codex":
            errors.extend(check_openai_yaml(skill_dir))
    return errors


def check_openai_yaml(skill_dir: Path) -> list[str]:
    metadata_path = skill_dir / "agents" / "openai.yaml"
    explicit = skill_dir.name in EXPLICIT_SKILLS
    if not metadata_path.is_file():
        return [f"{metadata_path}: explicit-only skills need policy metadata"] if explicit else []
    try:
        metadata = parse_simple_yaml(metadata_path)
    except (OSError, ValueError) as exc:
        return [str(exc)]
    errors: list[str] = []
    interface = metadata.get("interface", {})
    policy = metadata.get("policy", {})
    for key in sorted(set(metadata) - {"interface", "policy", "dependencies"}):
        errors.append(f"{metadata_path}: unknown top-level key {key!r}")
    if explicit and policy.get("allow_implicit_invocation") is not False:
        errors.append(f"{metadata_path}: {skill_dir.name} must stay explicit-only")
    short = interface.get("short_description")
    if short is not None and not 25 <= len(short) <= 64:
        errors.append(f"{metadata_path}: short_description should be 25-64 characters")
    prompt = interface.get("default_prompt")
    if prompt is not None and f"${skill_dir.name}" not in prompt:
        errors.append(f"{metadata_path}: default_prompt must mention ${skill_dir.name}")
    return errors


def check_claude_explicit(root: Path) -> list[str]:
    errors: list[str] = []
    for name in EXPLICIT_SKILLS:
        path = root / ".claude" / "skills" / name / "SKILL.md"
        if path.is_file():
            meta, _ = parse_frontmatter(path)
            if meta.get("disable-model-invocation") != "true":
                errors.append(f"{path}: {name} must keep disable-model-invocation: true")
    return errors


def run_agent_validator(root: Path, platform: str, codex_doctor: bool = False) -> list[str]:
    command = [sys.executable, str(AGENT_VALIDATOR), "--platform", platform, "--root", str(root)]
    if codex_doctor:
        command.append("--codex-doctor")
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        return [f"{platform} agent validation failed: {(result.stderr or result.stdout).strip()}"]
    return []


def portability(paths: list[Path], payload: bool = True) -> list[str]:
    errors: list[str] = []
    for base in paths:
        if base.is_symlink() or not base.exists():
            continue
        files = [base] if base.is_file() else sorted(base.rglob("*"))
        for path in files:
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
            if payload and TEMPLATE_SYNTAX.search(text):
                errors.append(f"{path}: contains unrendered template syntax")
    return errors


def check_payload(root: Path, platforms: list[str]) -> list[str]:
    errors: list[str] = []
    for platform in platforms:
        errors.extend(check_skills(root, platform))
        errors.extend(run_agent_validator(root, platform))
    if "claude" in platforms:
        errors.extend(check_claude_explicit(root))
    if "codex" in platforms:
        manager = root / ".codex" / "agents" / "manager_orchestrator.toml"
        if manager.is_file():
            role = tomllib.loads(manager.read_text(encoding="utf-8"))
            for key, expected in EXPECTED_MANAGER.items():
                if role.get(key) != expected:
                    errors.append(f"{manager}: {key} must be {expected!r} (found {role.get(key)!r})")
    roots = {"claude": [root / ".claude"], "codex": [root / ".codex", root / ".agents"]}
    errors.extend(portability([path for platform in platforms for path in roots[platform]]))
    return errors


def check_starter(build) -> list[str]:
    errors: list[str] = []
    try:
        payload = build.render_payload(TRUSTED_ROOT)
        manifest = build.build_manifest(TRUSTED_ROOT, payload)
    except Exception as exc:  # noqa: BLE001 - report any build failure as a validation error
        return [f"build failed: {exc}"]
    errors.extend(build.stale_files(TRUSTED_ROOT, payload, manifest))

    for path in ("README.md", "LICENSE", "setup.sh", ".starter/install.py", ".starter/build.py"):
        if not (TRUSTED_ROOT / path).is_file():
            errors.append(f"missing package file: {path}")
    license_bytes = (TRUSTED_ROOT / "LICENSE").read_bytes()
    for platform, spec in build.PLATFORMS.items():
        shipped = TRUSTED_ROOT / spec["license"]
        if shipped.is_file() and shipped.read_bytes() != license_bytes:
            errors.append(f"{spec['license']} must match the root LICENSE")

    claude_skills = {path.parent.name for path in (TRUSTED_ROOT / ".claude/skills").glob("*/SKILL.md")}
    codex_skills = {path.parent.name for path in (TRUSTED_ROOT / ".agents/skills").glob("*/SKILL.md")}
    if claude_skills != codex_skills:
        errors.append(f"skill sets differ between platforms: {sorted(claude_skills ^ codex_skills)}")
    claude_agents = {path.stem for path in (TRUSTED_ROOT / ".claude/agents").glob("*.md")}
    codex_agents = {path.stem.replace("_", "-") for path in (TRUSTED_ROOT / ".codex/agents").glob("*.toml")}
    if codex_agents - claude_agents != {"manager-orchestrator"} or claude_agents - codex_agents:
        errors.append("agent sets differ: Claude Code should have every Codex role except manager-orchestrator")

    errors.extend(check_payload(TRUSTED_ROOT, ["claude", "codex"]))
    errors.extend(
        portability([TRUSTED_ROOT / "README.md", TRUSTED_ROOT / ".starter", TRUSTED_ROOT / "setup.sh"], payload=False)
    )
    for script in (TRUSTED_ROOT / "setup.sh", TRUSTED_ROOT / ".starter" / "install.py"):
        if not os.access(script, os.X_OK):
            errors.append(f"{script.name} must be executable")
    syntax = subprocess.run(["sh", "-n", str(TRUSTED_ROOT / "setup.sh")], capture_output=True, text=True)
    if syntax.returncode:
        errors.append(f"setup.sh has invalid POSIX shell syntax: {syntax.stderr.strip()}")
    return errors


# --------------------------------------------------------------------------- main


def main() -> int:
    args = parse_args()
    if args.root is not None:
        root = args.root.resolve()
        platforms = [
            platform
            for platform, marker in (("claude", root / ".claude" / "agents"), ("codex", root / ".codex" / "config.toml"))
            if marker.exists()
        ]
        if not platforms:
            print(f"error: no Claude Code or Codex team found in {root}", file=sys.stderr)
            return 1
        errors = check_payload(root, platforms)
        if args.codex_doctor and "codex" in platforms:
            errors.extend(run_agent_validator(root, "codex", codex_doctor=True))
    else:
        errors = check_starter(load_build_module())
        if args.codex_doctor:
            errors.extend(run_agent_validator(TRUSTED_ROOT, "codex", codex_doctor=True))

    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print("validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
