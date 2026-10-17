#!/usr/bin/env python3
"""Validate project-scoped custom agents for Claude Code (.claude/agents) or Codex (.codex)."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    tomllib = None  # type: ignore[assignment]


CLAUDE_MODELS = {"opus", "sonnet", "haiku", "fable", "inherit"}
CLAUDE_COLORS = {"red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"}
CLAUDE_PERMISSION_MODES = {"default", "acceptEdits", "auto", "dontAsk", "bypassPermissions", "plan", "manual"}
CLAUDE_AGENT_KEYS = {
    "name",
    "description",
    "tools",
    "disallowedTools",
    "model",
    "permissionMode",
    "skills",
    "color",
    "maxTurns",
    "memory",
    "hooks",
    "isolation",
    "background",
    "effort",
    "mcpServers",
    "initialPrompt",
    "omitClaudeMd",
    "autoCompactWindow",
    "experimental",
}
CLAUDE_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")

CODEX_MODEL_EFFORTS = {
    "gpt-6.1-sol": {"low", "medium", "high", "xhigh", "max", "ultra"},
    "gpt-6-astra": {"low", "medium", "high", "xhigh", "max", "ultra"},
    "gpt-6-sol": {"low", "medium", "high", "xhigh", "max", "ultra"},
    "gpt-6-luna": {"low", "medium", "high", "xhigh", "max"},
    "gpt-5.6-sol": {"low", "medium", "high", "xhigh", "max", "ultra"},
    "gpt-5.6-terra": {"low", "medium", "high", "xhigh", "max", "ultra"},
    "gpt-5.6-luna": {"low", "medium", "high", "xhigh", "max"},
    "gpt-5.5": {"low", "medium", "high", "xhigh"},
}
CODEX_EFFORTS = set().union(*CODEX_MODEL_EFFORTS.values())
CODEX_SANDBOX_MODES = {"read-only", "workspace-write", "danger-full-access"}
# Keys current Codex applies from a role file, plus identity keys and sandbox_mode (honored by older builds).
CODEX_ROLE_KEYS = {
    "name",
    "description",
    "nickname_candidates",
    "model",
    "model_reasoning_effort",
    "model_reasoning_summary",
    "model_verbosity",
    "personality",
    "developer_instructions",
    "features",
    "skills",
    "sandbox_mode",
}
CODEX_RESERVED_AGENT_KEYS = {
    "enabled",
    "max_concurrent_threads_per_session",
    "max_threads",
    "max_depth",
    "default_subagent_model",
    "default_subagent_reasoning_effort",
    "interrupt_message",
    "job_max_runtime_seconds",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=("claude", "codex"), help="agent format to validate")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="repository root (default: current directory)")
    parser.add_argument("--agent", help="validate only this agent")
    parser.add_argument(
        "--codex-doctor",
        action="store_true",
        help="Codex only: load the project in an isolated trusted Codex home and fail on startup warnings",
    )
    args = parser.parse_args()
    if args.platform is None:
        location = Path(__file__).resolve().as_posix()
        if "/.claude/" in location:
            args.platform = "claude"
        elif "/.agents/" in location:
            args.platform = "codex"
        else:
            parser.error("--platform is required")
    return args


def parse_frontmatter(path: Path) -> tuple[dict, str]:
    """Parse the YAML subset agent files use: scalars, quoted strings, block scalars, and string lists."""
    lines = path.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: missing YAML frontmatter")
    try:
        end = next(index for index in range(1, len(lines)) if lines[index].strip() == "---")
    except StopIteration as exc:
        raise ValueError(f"{path}: unterminated YAML frontmatter") from exc

    values: dict = {}
    key: str | None = None
    mode = ""  # "pending" (bare key), "list", "block" (| or >), "scalar", or "" (nested mapping)
    for number, line in enumerate(lines[1:end], 2):
        if not line.strip() or line.lstrip().startswith("#"):
            if mode == "block" and key is not None:
                values[key] += "\n"
            continue
        indented = line.startswith((" ", "\t"))
        item = line.strip()
        if mode == "pending":
            if item.startswith("- "):
                values[key], mode = [], "list"
            elif indented and ":" not in item.split(" ", 1)[0]:
                values[key], mode = "", "scalar"
            else:
                values[key], mode = None, ""
        if mode == "list" and item.startswith("- "):
            values[key].append(scalar(item[2:], path, number))
            continue
        if indented:
            if mode == "block":
                values[key] += item + "\n"
            elif mode == "scalar":
                values[key] = f"{values[key]} {item}".strip()
            continue  # nested mappings (hooks, mcpServers) are accepted but not inspected
        name, separator, raw = line.partition(":")
        if not separator or not name.strip():
            raise ValueError(f"{path}:{number}: expected 'key: value'")
        key = name.strip()
        if key in values:
            raise ValueError(f"{path}:{number}: duplicate key {key!r}")
        raw = strip_comment(raw.strip())
        if raw == "":
            values[key], mode = None, "pending"
        elif raw in ("|", "|-", ">", ">-"):
            values[key], mode = "", "block"
        elif raw.startswith("[") and raw.endswith("]"):
            inner = raw[1:-1].strip()
            values[key] = [scalar(part, path, number) for part in inner.split(",")] if inner else []
            mode = ""
        else:
            values[key], mode = scalar(raw, path, number), "scalar"
    for name, value in values.items():
        if isinstance(value, str):
            values[name] = value.strip()
        elif value is None:
            values[name] = ""
    return values, "\n".join(lines[end + 1 :])


def strip_comment(raw: str) -> str:
    if raw.startswith(("\"", "'")):
        return raw
    return re.split(r"\s+#", raw, maxsplit=1)[0].strip()


def scalar(raw: str, path: Path, number: int) -> str:
    raw = raw.strip()
    if raw.startswith('"'):
        try:
            value, _ = json.JSONDecoder().raw_decode(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{number}: invalid double-quoted string: {exc}") from exc
        return value
    if raw.startswith("'"):
        closing = raw.find("'", 1)
        while closing != -1 and raw[closing : closing + 2] == "''":
            closing = raw.find("'", closing + 2)
        if closing == -1:
            raise ValueError(f"{path}:{number}: unterminated single-quoted string")
        return raw[1:closing].replace("''", "'")
    return strip_comment(raw)


def as_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        return [item.strip() for item in re.split(r"[,\s]+", value) if item.strip()]
    return []


def skill_is_explicit(skill_file: Path) -> bool:
    try:
        meta, _ = parse_frontmatter(skill_file)
    except ValueError:
        return False
    return str(meta.get("disable-model-invocation", "false")).lower() == "true"


def validate_claude(root: Path, only: str | None) -> tuple[list[str], list[str], int]:
    errors: list[str] = []
    warnings: list[str] = []
    agents_dir = root / ".claude" / "agents"
    if agents_dir.is_symlink() or not agents_dir.is_dir():
        return [f"{agents_dir}: missing agents directory (or it is a symlink)"], warnings, 0

    files = sorted(path for path in agents_dir.glob("*.md") if path.is_file())
    if only:
        files = [path for path in files if path.stem == only]
        if not files:
            return [f"agent {only!r} has no file .claude/agents/{only}.md"], warnings, 0

    seen: dict[str, Path] = {}
    for path in files:
        label = path.relative_to(root).as_posix()
        if path.is_symlink():
            errors.append(f"{label}: agent files must not be symlinks")
            continue
        try:
            meta, body = parse_frontmatter(path)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            errors.append(str(exc))
            continue
        name = meta.get("name")
        if not isinstance(name, str) or not CLAUDE_NAME.match(name):
            errors.append(f"{label}: name must use lowercase letters, digits, and hyphens")
        elif name != path.stem:
            errors.append(f"{label}: name {name!r} must match the file name")
        elif name in seen:
            errors.append(f"{label}: duplicate agent name also used by {seen[name].name}")
        else:
            seen[name] = path
        description = meta.get("description")
        if not isinstance(description, str) or not description.strip():
            errors.append(f"{label}: description must be a non-empty string")
        model = meta.get("model")
        if model is not None and model not in CLAUDE_MODELS and not str(model).startswith("claude-"):
            errors.append(f"{label}: unsupported model {model!r}")
        color = meta.get("color")
        if color is not None and color not in CLAUDE_COLORS:
            errors.append(f"{label}: unsupported color {color!r}")
        mode = meta.get("permissionMode")
        if mode is not None and mode not in CLAUDE_PERMISSION_MODES:
            errors.append(f"{label}: unsupported permissionMode {mode!r}")
        if "tools" in meta and not as_list(meta["tools"]):
            errors.append(f"{label}: tools allowlist is empty; the agent could not launch")
        for skill in as_list(meta.get("skills", [])):
            skill_file = root / ".claude" / "skills" / skill / "SKILL.md"
            if not skill_file.is_file():
                errors.append(f"{label}: preloaded skill {skill!r} does not exist")
            elif skill_is_explicit(skill_file):
                errors.append(f"{label}: skill {skill!r} has disable-model-invocation and cannot be preloaded")
        for key in sorted(set(meta) - CLAUDE_AGENT_KEYS):
            warnings.append(f"{label}: unknown frontmatter key {key!r} is ignored by Claude Code")
        if not body.strip():
            errors.append(f"{label}: the body (system prompt) is empty")
    return errors, warnings, len(files)


def load_toml(path: Path) -> dict:
    if tomllib is None:
        raise ValueError("Codex validation requires Python 3.11 or newer (tomllib)")
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise ValueError(f"cannot load {path}: {exc}") from exc


def validate_codex(root: Path, only: str | None) -> tuple[list[str], list[str], int]:
    errors: list[str] = []
    warnings: list[str] = []
    codex_dir = root / ".codex"
    config_path = codex_dir / "config.toml"
    try:
        config = load_toml(config_path)
    except ValueError as exc:
        return [str(exc)], warnings, 0

    agents = config.get("agents", {})
    if not isinstance(agents, dict):
        return [f"{config_path}: [agents] must be a table"], warnings, 0
    threads = agents.get("max_concurrent_threads_per_session", agents.get("max_threads"))
    if threads is not None and (not isinstance(threads, int) or threads < 1):
        errors.append("agents.max_concurrent_threads_per_session must be a positive integer")

    registrations = {
        name: value
        for name, value in agents.items()
        if isinstance(value, dict) and name not in CODEX_RESERVED_AGENT_KEYS
    }
    agents_dir = (codex_dir / "agents").resolve()
    registered_files: set[Path] = set()
    selected = registrations
    if only:
        selected = {only: registrations[only]} if only in registrations else {}
        if not selected:
            discovered = agents_dir / f"{only}.toml"
            if not discovered.is_file():
                return [f"agent {only!r} is neither registered nor discoverable"], warnings, 0

    for name, registration in registrations.items():
        config_file = registration.get("config_file")
        if isinstance(config_file, str):
            registered_files.add((codex_dir / config_file).resolve())

    for name, registration in sorted(selected.items()):
        label = f"agents.{name}"
        for key in sorted(set(registration) - {"description", "config_file", "nickname_candidates"}):
            errors.append(f"{label}: unknown registration key {key!r}")
        config_file = registration.get("config_file")
        if not isinstance(config_file, str) or not config_file.strip():
            errors.append(f"{label}: config_file must be a non-empty string")
            continue
        if Path(config_file).is_absolute():
            errors.append(f"{label}: config_file must be relative to .codex")
            continue
        role_path = (codex_dir / config_file).resolve()
        try:
            role_path.relative_to(agents_dir)
        except ValueError:
            errors.append(f"{label}: config_file must resolve under .codex/agents")
            continue
        if not role_path.is_file():
            errors.append(f"{label}: missing role file {config_file}")
            continue
        errors.extend(check_codex_role(role_path, label, name, registration, warnings))

    for role_path in sorted(agents_dir.rglob("*.toml")) if agents_dir.is_dir() else []:
        if role_path.resolve() in registered_files:
            continue
        if only and role_path.stem != only:
            continue
        label = role_path.relative_to(root).as_posix()
        errors.extend(check_codex_role(role_path, label, None, None, warnings))
    return errors, warnings, len(selected)


def check_codex_role(path: Path, label: str, key: str | None, registration: dict | None, warnings: list[str]) -> list[str]:
    errors: list[str] = []
    try:
        role = load_toml(path)
    except ValueError as exc:
        return [str(exc)]
    for unknown in sorted(set(role) - CODEX_ROLE_KEYS):
        warnings.append(
            f"{label}: key {unknown!r} is not applied to roles by current Codex; if it is not a valid "
            "config.toml key, Codex skips the whole role (confirm with --codex-doctor)"
        )
    name = role.get("name")
    if registration is None:
        for required in ("name", "description", "developer_instructions"):
            if not isinstance(role.get(required), str) or not role[required].strip():
                errors.append(f"{label}: unregistered role files must define {required}")
    else:
        if name is not None and name != key:
            errors.append(f"{label}: role file name {name!r} would rename registration {key!r}")
        description = role.get("description", registration.get("description"))
        if not isinstance(description, str) or not description.strip():
            errors.append(f"{label}: description must be a non-empty string")
    model = role.get("model")
    effort = role.get("model_reasoning_effort")
    if not isinstance(model, str) or not model.strip():
        errors.append(f"{label}: model must be a non-empty string")
    elif model not in CODEX_MODEL_EFFORTS:
        warnings.append(f"{label}: model {model!r} is not in this validator's catalog; effort not checked")
    if not isinstance(effort, str) or effort not in CODEX_EFFORTS:
        errors.append(f"{label}: unsupported model_reasoning_effort {effort!r}")
    elif model in CODEX_MODEL_EFFORTS and effort not in CODEX_MODEL_EFFORTS[model]:
        errors.append(f"{label}: {model} does not support effort {effort!r}")
    sandbox = role.get("sandbox_mode")
    if sandbox is not None and sandbox not in CODEX_SANDBOX_MODES:
        errors.append(f"{label}: unsupported sandbox_mode {sandbox!r}")
    instructions = role.get("developer_instructions")
    if not isinstance(instructions, str) or not instructions.strip():
        errors.append(f"{label}: developer_instructions must be non-empty")
    return errors


def find_executable(name: str, env_var: str) -> str | None:
    configured = os.environ.get(env_var)
    if configured and Path(configured).is_file() and os.access(configured, os.X_OK):
        return configured
    return shutil.which(name)


def codex_doctor(root: Path) -> str | None:
    codex = find_executable("codex", "CODEX_CLI_PATH")
    if codex is None:
        return "cannot run --codex-doctor: codex is not on PATH (set CODEX_CLI_PATH)"
    with tempfile.TemporaryDirectory(prefix="codex-home-") as home:
        Path(home, "config.toml").write_text(
            f"[projects.{json.dumps(str(root))}]\ntrust_level = \"trusted\"\n", encoding="utf-8"
        )
        environment = {**os.environ, "CODEX_HOME": home}
        try:
            result = subprocess.run(
                [codex, "-C", str(root), "doctor", "--json"],
                capture_output=True,
                text=True,
                timeout=120,
                env=environment,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return f"codex doctor failed to run: {exc}"
    try:
        start = result.stdout.index("{")
        report, _ = json.JSONDecoder().raw_decode(result.stdout[start:])
        check = report["checks"]["config.load"]
    except (ValueError, KeyError, TypeError) as exc:
        return f"cannot read codex doctor output ({exc}): {(result.stderr or result.stdout)[:400]}"
    details = check.get("details", {}) if isinstance(check.get("details"), dict) else {}
    startup = details.get("startup warning") or []
    if isinstance(startup, str):
        startup = [startup]
    if check.get("status") != "ok" or startup:
        reasons = "; ".join(str(item).strip() for item in startup) or check.get("summary", "unknown")
        return f"Codex did not load the project cleanly: {reasons}"
    return None


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    if args.platform == "claude":
        errors, warnings, count = validate_claude(root, args.agent)
    else:
        errors, warnings, count = validate_codex(root, args.agent)
        if args.codex_doctor:
            problem = codex_doctor(root)
            if problem:
                errors.append(problem)

    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"validated {count} {args.platform} agent definition(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
