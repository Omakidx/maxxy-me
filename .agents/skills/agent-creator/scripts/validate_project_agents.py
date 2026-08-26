#!/usr/bin/env python3
"""Validate project-scoped Codex custom-agent registration and role files."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tomllib
from pathlib import Path


REQUIRED_ROLE_KEYS = {
    "model",
    "model_reasoning_effort",
    "sandbox_mode",
    "developer_instructions",
}

SUPPORTED_MODEL_EFFORTS = {
    "gpt-5.6-sol": {"low", "medium", "high", "xhigh", "max", "ultra"},
    "gpt-5.6-terra": {"low", "medium", "high", "xhigh", "max", "ultra"},
    "gpt-5.6-luna": {"low", "medium", "high", "xhigh", "max"},
    "gpt-5.5": {"low", "medium", "high", "xhigh"},
    "gpt-5.4": {"low", "medium", "high", "xhigh"},
}
SUPPORTED_REASONING_EFFORTS = set().union(*SUPPORTED_MODEL_EFFORTS.values())
SUPPORTED_SANDBOX_MODES = {"read-only", "workspace-write", "danger-full-access"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--agent", help="Validate only this registered agent")
    parser.add_argument(
        "--strict-codex",
        action="store_true",
        help="Run Codex Doctor and require its strict config.load check to pass",
    )
    return parser.parse_args()


def load_toml(path: Path) -> dict:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise ValueError(f"cannot load {path}: {exc}") from exc


def validate_strict_codex(root: Path) -> str | None:
    candidates: list[Path] = []
    configured = os.environ.get("CODEX_CLI_PATH")
    if configured:
        candidates.append(Path(configured))
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if directory:
            candidates.append(Path(directory) / "codex")

    executable_candidates: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate not in seen and candidate.is_file() and os.access(candidate, os.X_OK):
            seen.add(candidate)
            executable_candidates.append(candidate)
    if not executable_candidates:
        return "cannot run strict Codex validation: codex is not on PATH"

    failures: list[str] = []
    for codex in executable_candidates:
        try:
            result = subprocess.run(
                [str(codex), "--strict-config", "-C", str(root), "doctor", "--json"],
                capture_output=True,
                check=False,
                text=True,
                timeout=45,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            failures.append(f"{codex}: {exc}")
            continue
        try:
            json_start = result.stdout.index("{")
            report, _ = json.JSONDecoder().raw_decode(result.stdout[json_start:])
            config_check = report["checks"]["config.load"]
        except (ValueError, json.JSONDecodeError, KeyError, TypeError) as exc:
            failures.append(f"{codex}: unreadable Doctor output ({exc})")
            continue
        if config_check.get("status") != "ok":
            return f"Codex strict config.load failed: {config_check.get('summary', 'unknown error')}"
        return None

    return "cannot read Codex Doctor config.load result from available executables: " + "; ".join(failures)


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    codex_dir = (root / ".codex").resolve()
    config_path = codex_dir / "config.toml"
    errors: list[str] = []
    warnings: list[str] = []

    try:
        config = load_toml(config_path)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1

    agents = config.get("agents")
    if not isinstance(agents, dict):
        print(f"{config_path}: missing [agents] table", file=sys.stderr)
        return 1

    registrations = {name: value for name, value in agents.items() if isinstance(value, dict)}
    if args.agent:
        if args.agent not in registrations:
            errors.append(f"agent {args.agent!r} is not registered")
            registrations = {}
        else:
            registrations = {args.agent: registrations[args.agent]}

    for name, registration in sorted(registrations.items()):
        description = registration.get("description")
        config_file = registration.get("config_file")
        if not isinstance(description, str) or not description.strip():
            errors.append(f"agents.{name}: description must be a non-empty string")
        if not isinstance(config_file, str) or not config_file.strip():
            errors.append(f"agents.{name}: config_file must be a non-empty string")
            continue
        if Path(config_file).is_absolute():
            errors.append(f"agents.{name}: config_file must be relative to .codex: {config_file}")
            continue

        role_path = (codex_dir / config_file).resolve()
        try:
            role_path.relative_to(codex_dir)
        except ValueError:
            errors.append(f"agents.{name}: config_file escapes .codex: {config_file}")
            continue
        if role_path.parent != codex_dir / "agents":
            errors.append(f"agents.{name}: config_file must resolve directly under .codex/agents")
            continue
        if not role_path.is_file():
            errors.append(f"agents.{name}: missing role file {role_path}")
            continue

        try:
            role = load_toml(role_path)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        missing = sorted(REQUIRED_ROLE_KEYS - role.keys())
        if missing:
            errors.append(f"agents.{name}: missing role keys: {', '.join(missing)}")
        model = role.get("model")
        effort = role.get("model_reasoning_effort")
        sandbox = role.get("sandbox_mode")
        if not isinstance(model, str) or not model.strip():
            errors.append(f"agents.{name}: model must be a non-empty string")
        elif model not in SUPPORTED_MODEL_EFFORTS:
            warnings.append(
                f"agents.{name}: model {model!r} is not in the validator's known model catalog; "
                "skipping model-specific effort compatibility"
            )
        if not isinstance(effort, str) or not effort.strip():
            errors.append(f"agents.{name}: model_reasoning_effort must be a non-empty string")
        elif effort not in SUPPORTED_REASONING_EFFORTS:
            errors.append(f"agents.{name}: unsupported model_reasoning_effort {effort!r}")
        elif isinstance(model, str) and model in SUPPORTED_MODEL_EFFORTS:
            if effort not in SUPPORTED_MODEL_EFFORTS[model]:
                errors.append(f"agents.{name}: {model!r} does not support effort {effort!r}")
        if sandbox not in SUPPORTED_SANDBOX_MODES:
            errors.append(f"agents.{name}: unsupported sandbox_mode {sandbox!r}")
        instructions = role.get("developer_instructions")
        if not isinstance(instructions, str) or not instructions.strip():
            errors.append(f"agents.{name}: developer_instructions must be non-empty")

    if args.strict_codex:
        strict_error = validate_strict_codex(root)
        if strict_error:
            errors.append(strict_error)

    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"validated {len(registrations)} project agent registration(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
