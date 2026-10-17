#!/usr/bin/env python3
"""Render the single-source team in team/ into the Claude Code and Codex payloads.

team/ is the only place agents and skills are authored. This script renders it into
.claude/ (Claude Code) and .codex/ + .agents/ (Codex), then writes .starter/manifest.json,
which the installer uses to add, update, and remove files safely.

    python3 .starter/build.py           # regenerate payloads and manifest
    python3 .starter/build.py --check   # exit 1 if generated files are stale
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VERSION = "4.0.0"

PLATFORMS: dict[str, dict] = {
    "claude": {
        "label": "Claude Code",
        "owned": (".claude/agents/", ".claude/skills/", ".claude/maxxy-me/"),
        "optional": (),
        "license": ".claude/maxxy-me/LICENSE",
        "context": {
            "platform": "Claude Code",
            "platform_id": "claude",
            "skills_dir": ".claude/skills",
            "agents_dir": ".claude/agents",
            "instruction_files": "`CLAUDE.md`/`AGENTS.md`",
        },
    },
    "codex": {
        "label": "Codex",
        "owned": (".codex/config.toml", ".codex/agents/", ".agents/skills/", ".agents/LICENSE"),
        # Codex discovers role files on its own, so a project's existing config.toml can be kept.
        "optional": (".codex/config.toml",),
        "license": ".agents/LICENSE",
        "context": {
            "platform": "Codex",
            "platform_id": "codex",
            "skills_dir": ".agents/skills",
            "agents_dir": ".codex/agents",
            "instruction_files": "`AGENTS.md`",
        },
    },
}

CODEX_MAX_THREADS = 8
CLAUDE_MODELS = {"opus", "sonnet", "haiku", "fable", "inherit"}
CLAUDE_COLORS = {"red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"}
CODEX_SANDBOX_COMMENT = (
    "# Older Codex builds honor sandbox_mode here; current builds inherit the parent\n"
    "# session's sandbox, so the instructions below also state this role's write policy.\n"
)
SKILL_FIELDS = {
    "name",
    "description",
    "explicit",
    "display_name",
    "short_description",
    "default_prompt",
    "argument_hint",
}
AGENT_FIELDS = {"order", "description", "color", "skills", "read_only", "platforms", "instructions", "claude", "codex"}

BLOCK_LINE = re.compile(r"^[ \t]*\{\{([#/])(claude|codex)\}\}[ \t]*$")
INCLUDE = re.compile(r"\{\{include:([a-z0-9-]+)\}\}")
SIMPLE_TOKEN = re.compile(r"\{\{([a-z_]+)(?::([a-z0-9_-]+))?\}\}")
INLINE_CONDITION = re.compile(r"\{\{(claude|codex):(.*?)\}\}")


class BuildError(Exception):
    pass


@dataclass(frozen=True)
class Skill:
    name: str
    meta: dict[str, str]
    body: str
    directory: Path

    @property
    def explicit(self) -> bool:
        return self.meta.get("explicit", "false") == "true"


@dataclass(frozen=True)
class Agent:
    name: str
    spec: dict

    @property
    def platforms(self) -> list[str]:
        return list(self.spec.get("platforms", list(PLATFORMS)))

    @property
    def read_only(self) -> bool:
        return bool(self.spec.get("read_only", False))


def codex_name(name: str) -> str:
    return name.replace("-", "_")


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    if not lines or lines[0] != "---":
        raise BuildError(f"{path}: missing frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise BuildError(f"{path}: unterminated frontmatter") from exc
    values: dict[str, str] = {}
    for number, line in enumerate(lines[1:end], 2):
        if not line.strip():
            continue
        key, separator, value = line.partition(":")
        if not separator or key != key.strip() or not key:
            raise BuildError(f"{path}:{number}: expected 'key: value'")
        value = value.strip()
        if value.startswith('"'):
            value = json.loads(value)
        values[key] = value
    return values, "\n".join(lines[end + 1 :]).lstrip("\n")


class Team:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.partials = {
            path.stem: path.read_text(encoding="utf-8")
            for path in sorted((root / "team" / "partials").glob("*.md"))
        }
        self.skills = self._load_skills()
        self.agents = self._load_agents()

    def _load_skills(self) -> dict[str, Skill]:
        skills: dict[str, Skill] = {}
        for directory in sorted((self.root / "team" / "skills").iterdir()):
            if not directory.is_dir():
                continue
            meta, body = parse_frontmatter(directory / "SKILL.md")
            unknown = set(meta) - SKILL_FIELDS
            if unknown:
                raise BuildError(f"{directory}/SKILL.md: unknown fields {sorted(unknown)}")
            if meta.get("name") != directory.name:
                raise BuildError(f"{directory}/SKILL.md: name must match folder")
            if not meta.get("description"):
                raise BuildError(f"{directory}/SKILL.md: missing description")
            skills[directory.name] = Skill(directory.name, meta, body, directory)
        return skills

    def _load_agents(self) -> dict[str, Agent]:
        agents: dict[str, Agent] = {}
        for path in sorted((self.root / "team" / "agents").glob("*.toml")):
            spec = tomllib.loads(path.read_text(encoding="utf-8"))
            unknown = set(spec) - AGENT_FIELDS
            if unknown:
                raise BuildError(f"{path}: unknown fields {sorted(unknown)}")
            for key in ("description", "instructions"):
                if not isinstance(spec.get(key), str) or not spec[key].strip():
                    raise BuildError(f"{path}: missing {key}")
            agent = Agent(path.stem, spec)
            for platform in agent.platforms:
                if platform not in PLATFORMS:
                    raise BuildError(f"{path}: unknown platform {platform!r}")
                if platform not in spec:
                    raise BuildError(f"{path}: missing [{platform}] table")
            for skill in spec.get("skills", []):
                if skill not in self.skills:
                    raise BuildError(f"{path}: unknown skill {skill!r}")
            agents[path.stem] = agent
        return dict(sorted(agents.items(), key=lambda item: (item[1].spec.get("order", 1000), item[0])))

    def render(self, text: str, platform: str, origin: str) -> str:
        for _ in range(5):
            expanded = INCLUDE.sub(lambda match: self._partial(match.group(1), origin), text)
            if expanded == text:
                break
            text = expanded
        else:
            raise BuildError(f"{origin}: includes nest too deeply")

        output: list[str] = []
        active: str | None = None
        for number, line in enumerate(text.split("\n"), 1):
            block = BLOCK_LINE.match(line)
            if block:
                marker, name = block.groups()
                if marker == "#":
                    if active is not None:
                        raise BuildError(f"{origin}:{number}: nested platform block")
                    active = name
                elif active != name:
                    raise BuildError(f"{origin}:{number}: unmatched {{{{/{name}}}}}")
                else:
                    active = None
                continue
            if active is None or active == platform:
                output.append(line)
        if active is not None:
            raise BuildError(f"{origin}: unterminated {{{{#{active}}}}} block")
        text = "\n".join(output)

        context = PLATFORMS[platform]["context"]

        def simple(match: re.Match[str]) -> str:
            kind, argument = match.groups()
            if kind in PLATFORMS:
                return match.group(0)
            if kind == "skill":
                self._require_skill(argument, origin)
                return f"/{argument}" if platform == "claude" else f"${argument}"
            if kind == "skill_ref":
                self._require_skill(argument, origin)
                return f"`{argument}` skill"
            if kind == "skill_path":
                self._require_skill(argument, origin)
                return f"{context['skills_dir']}/{argument}/SKILL.md"
            if kind == "agent":
                agent = self.agents.get(argument)
                if agent is None:
                    raise BuildError(f"{origin}: unknown agent {argument!r}")
                return argument if platform == "claude" else codex_name(argument)
            if argument is None and kind in context:
                return context[kind]
            raise BuildError(f"{origin}: unknown token {match.group(0)}")

        text = SIMPLE_TOKEN.sub(simple, text)
        text = INLINE_CONDITION.sub(lambda m: m.group(2) if m.group(1) == platform else "", text)
        if "{{" in text or "}}" in text:
            leftover = text[text.find("{{") :][:60] if "{{" in text else "}}"
            raise BuildError(f"{origin}: unresolved template syntax near {leftover!r}")
        return re.sub(r"\n{3,}", "\n\n", text).strip("\n") + "\n"

    def _partial(self, name: str, origin: str) -> str:
        if name not in self.partials:
            raise BuildError(f"{origin}: unknown partial {name!r}")
        return self.partials[name].strip("\n")

    def _require_skill(self, name: str | None, origin: str) -> None:
        if name not in self.skills:
            raise BuildError(f"{origin}: unknown skill {name!r}")


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def toml_multiline(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"""', '""\\"')
    return '"""\n' + escaped.rstrip("\n") + '\n"""'


def render_claude_agent(team: Team, agent: Agent) -> str:
    settings = agent.spec["claude"]
    model = settings.get("model")
    if model not in CLAUDE_MODELS:
        raise BuildError(f"{agent.name}: unsupported Claude model {model!r}")
    color = agent.spec.get("color")
    if color is not None and color not in CLAUDE_COLORS:
        raise BuildError(f"{agent.name}: unsupported color {color!r}")
    disallowed = ["Agent"]
    if agent.read_only:
        disallowed += ["Write", "Edit", "NotebookEdit"]
    preload = [name for name in agent.spec.get("skills", []) if not team.skills[name].explicit]

    lines = [
        "---",
        f"name: {agent.name}",
        f"description: {yaml_string(team.render(agent.spec['description'], 'claude', agent.name).strip())}",
        f"model: {model}",
    ]
    if color:
        lines.append(f"color: {color}")
    lines.append(f"disallowedTools: {', '.join(disallowed)}")
    if preload:
        lines.append("skills:")
        lines.extend(f"  - {name}" for name in preload)
    lines.append("---")
    body = team.render(agent.spec["instructions"], "claude", f"team/agents/{agent.name}.toml")
    return "\n".join(lines) + "\n\n" + body


def render_codex_role(team: Team, agent: Agent) -> str:
    settings = agent.spec["codex"]
    for key in ("model", "model_reasoning_effort"):
        if not isinstance(settings.get(key), str):
            raise BuildError(f"{agent.name}: [codex] requires {key}")
    description = team.render(agent.spec["description"], "codex", agent.name).strip()
    instructions = team.render(agent.spec["instructions"], "codex", f"team/agents/{agent.name}.toml")
    sandbox = "read-only" if agent.read_only else "workspace-write"
    text = (
        f"name = {json.dumps(codex_name(agent.name))}\n"
        f"description = {json.dumps(description, ensure_ascii=False)}\n"
        f"model = {json.dumps(settings['model'])}\n"
        f"model_reasoning_effort = {json.dumps(settings['model_reasoning_effort'])}\n"
        f"{CODEX_SANDBOX_COMMENT}"
        f"sandbox_mode = {json.dumps(sandbox)}\n"
        f"developer_instructions = {toml_multiline(instructions)}\n"
    )
    parsed = tomllib.loads(text)
    if parsed["developer_instructions"].rstrip("\n") != instructions.rstrip("\n"):
        raise BuildError(f"{agent.name}: developer_instructions did not round-trip through TOML")
    return text


def render_codex_config(team: Team) -> str:
    lines = [
        "# maxxy-me multi-agent team for Codex.",
        "# Codex loads this project config only after you trust the project.",
        "",
        "[features]",
        "multi_agent = true",
        "",
        "[agents]",
        f"max_concurrent_threads_per_session = {CODEX_MAX_THREADS}",
    ]
    for agent in team.agents.values():
        if "codex" not in agent.platforms:
            continue
        name = codex_name(agent.name)
        description = team.render(agent.spec["description"], "codex", agent.name).strip()
        lines += [
            "",
            f"[agents.{name}]",
            f"description = {json.dumps(description, ensure_ascii=False)}",
            f'config_file = "agents/{name}.toml"',
        ]
    text = "\n".join(lines) + "\n"
    tomllib.loads(text)
    return text


def render_skill_markdown(team: Team, skill: Skill, platform: str) -> str:
    origin = f"team/skills/{skill.name}/SKILL.md"
    description = team.render(skill.meta["description"], platform, origin).strip()
    lines = ["---", f"name: {skill.name}", f"description: {yaml_string(description)}"]
    if platform == "claude":
        if skill.explicit:
            lines.append("disable-model-invocation: true")
        if skill.meta.get("argument_hint"):
            lines.append(f"argument-hint: {yaml_string(skill.meta['argument_hint'])}")
    lines.append("---")
    return "\n".join(lines) + "\n\n" + team.render(skill.body, platform, origin)


def render_openai_yaml(team: Team, skill: Skill) -> str | None:
    origin = f"team/skills/{skill.name}/SKILL.md"
    interface = [
        (key, team.render(skill.meta[key], "codex", origin).strip())
        for key in ("display_name", "short_description", "default_prompt")
        if skill.meta.get(key)
    ]
    if not interface and not skill.explicit:
        return None
    lines: list[str] = []
    if interface:
        lines.append("interface:")
        lines.extend(f"  {key}: {yaml_string(value)}" for key, value in interface)
    if skill.explicit:
        lines += ["policy:", "  allow_implicit_invocation: false"]
    return "\n".join(lines) + "\n"


def render_payload(root: Path = ROOT) -> dict[str, dict[str, bytes]]:
    team = Team(root)
    license_bytes = (root / "LICENSE").read_bytes()
    payload: dict[str, dict[str, bytes]] = {platform: {} for platform in PLATFORMS}

    for platform in PLATFORMS:
        files = payload[platform]
        files[PLATFORMS[platform]["license"]] = license_bytes
        skills_dir = PLATFORMS[platform]["context"]["skills_dir"]
        for skill in team.skills.values():
            base = f"{skills_dir}/{skill.name}"
            files[f"{base}/SKILL.md"] = render_skill_markdown(team, skill, platform).encode()
            for resource in sorted(skill.directory.rglob("*")):
                if resource.is_symlink():
                    raise BuildError(f"{resource}: symlinks are not allowed in team/")
                if not resource.is_file() or resource.name == "SKILL.md":
                    continue
                if "__pycache__" in resource.parts or resource.suffix in {".pyc", ".pyo"}:
                    continue
                relative = resource.relative_to(skill.directory).as_posix()
                if resource.suffix == ".md":
                    origin = f"team/skills/{skill.name}/{relative}"
                    rendered = team.render(resource.read_text(encoding="utf-8"), platform, origin)
                    files[f"{base}/{relative}"] = rendered.encode()
                else:
                    files[f"{base}/{relative}"] = resource.read_bytes()
            if platform == "codex":
                metadata = render_openai_yaml(team, skill)
                if metadata is not None:
                    files[f"{base}/agents/openai.yaml"] = metadata.encode()

    for agent in team.agents.values():
        if "claude" in agent.platforms:
            payload["claude"][f".claude/agents/{agent.name}.md"] = render_claude_agent(team, agent).encode()
        if "codex" in agent.platforms:
            role = f".codex/agents/{codex_name(agent.name)}.toml"
            payload["codex"][role] = render_codex_role(team, agent).encode()
    payload["codex"][".codex/config.toml"] = render_codex_config(team).encode()

    for platform, files in payload.items():
        for path in files:
            if not owned_by(path, platform):
                raise BuildError(f"{path}: outside {platform} ownership")
    return payload


def owned_by(path: str, platform: str) -> bool:
    return any(
        path.startswith(prefix) if prefix.endswith("/") else path == prefix
        for prefix in PLATFORMS[platform]["owned"]
    )


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_history(root: Path) -> dict[str, set[str]] | None:
    """Return every committed version of payload paths reachable from HEAD, or None without git."""
    pathspecs = sorted({prefix.rstrip("/") for spec in PLATFORMS.values() for prefix in spec["owned"]})
    try:
        log = subprocess.run(
            ["git", "-C", str(root), "log", "-z", "--raw", "--no-abbrev", "--no-renames", "--format=",
             "HEAD", "--", *pathspecs],
            capture_output=True,
            check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return None

    # With -z each raw record is ":<modes> <old> <new> <status>" NUL "<path>" NUL, unquoted.
    blobs_by_path: dict[str, set[str]] = {}
    tokens = log.split(b"\0")
    index = 0
    while index < len(tokens) - 1:
        meta = tokens[index].lstrip(b"\n")
        if not meta.startswith(b":"):
            index += 1
            continue
        path = tokens[index + 1].decode("utf-8", "surrogateescape")
        old_blob, new_blob = meta.decode().split()[2:4]
        for blob in (old_blob, new_blob):
            if set(blob) != {"0"}:
                blobs_by_path.setdefault(path, set()).add(blob)
        index += 2

    blobs = sorted({blob for values in blobs_by_path.values() for blob in values})
    if not blobs:
        return {}
    batch = subprocess.run(
        ["git", "-C", str(root), "cat-file", "--batch"],
        input=("\n".join(blobs) + "\n").encode(),
        capture_output=True,
        check=True,
    ).stdout
    digests: dict[str, str] = {}
    offset = 0
    while offset < len(batch):
        header_end = batch.index(b"\n", offset)
        blob, kind, size = batch[offset:header_end].decode().split()
        start = header_end + 1
        end = start + int(size)
        if kind == "blob":
            digests[blob] = sha256(batch[start:end])
        offset = end + 1

    return {
        path: {digests[blob] for blob in values if blob in digests}
        for path, values in blobs_by_path.items()
    }


def read_manifest(root: Path) -> dict:
    path = root / ".starter" / "manifest.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def expected_history(root: Path, payload: dict[str, dict[str, bytes]]) -> dict[str, list[str]]:
    """Hashes of every earlier shipped version of each payload path (current versions excluded)."""
    previous = read_manifest(root)
    history: dict[str, set[str]] = {}
    for path, digests in previous.get("history", {}).items():
        history.setdefault(path, set()).update(digests)
    committed = git_history(root)
    if committed is None:
        # No git (for example a tarball checkout): keep the last build's files as history so
        # projects installed from it can still upgrade.
        for spec in previous.get("platforms", {}).values():
            for path, digest in spec.get("files", {}).items():
                history.setdefault(path, set()).add(digest)
    else:
        for path, digests in committed.items():
            history.setdefault(path, set()).update(digests)

    current = {path: sha256(data) for files in payload.values() for path, data in files.items()}
    cleaned: dict[str, list[str]] = {}
    for path, digests in sorted(history.items()):
        if not any(owned_by(path, platform) for platform in PLATFORMS):
            continue
        remaining = sorted(digests - {current.get(path)})
        if remaining:
            cleaned[path] = remaining
    return cleaned


def build_manifest(root: Path, payload: dict[str, dict[str, bytes]]) -> dict:
    return {
        "name": "maxxy-me",
        "version": VERSION,
        "platforms": {
            platform: {
                "label": PLATFORMS[platform]["label"],
                "owned": list(PLATFORMS[platform]["owned"]),
                "optional": list(PLATFORMS[platform]["optional"]),
                "files": {path: sha256(files[path]) for path in sorted(files)},
            }
            for platform, files in payload.items()
        },
        "history": expected_history(root, payload),
    }


def manifest_bytes(manifest: dict) -> bytes:
    return (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()


def require_real_directories(root: Path) -> None:
    """Refuse to read or write through a symlinked payload directory."""
    for spec in PLATFORMS.values():
        for prefix in spec["owned"]:
            current = root
            for part in Path(prefix.rstrip("/")).parts:
                current = current / part
                if current.is_symlink():
                    raise BuildError(f"{current.relative_to(root)} is a symlink; refusing to touch generated files")


def existing_generated(root: Path) -> dict[str, set[str]]:
    """List files present inside each platform's owned namespaces, without following links."""
    require_real_directories(root)
    found: dict[str, set[str]] = {platform: set() for platform in PLATFORMS}
    for platform, spec in PLATFORMS.items():
        for prefix in spec["owned"]:
            base = root / prefix.rstrip("/")
            if not prefix.endswith("/"):
                if base.is_file() or base.is_symlink():
                    found[platform].add(prefix)
                continue
            if not base.is_dir():
                continue
            for directory, subdirectories, filenames in os.walk(base):
                subdirectories[:] = [name for name in subdirectories if name != "__pycache__"]
                for name in filenames + [d for d in subdirectories if Path(directory, d).is_symlink()]:
                    found[platform].add(Path(directory, name).relative_to(root).as_posix())
    return found


def stale_files(root: Path, payload: dict[str, dict[str, bytes]], manifest: dict) -> list[str]:
    problems: list[str] = []
    present = existing_generated(root)
    for platform, files in payload.items():
        for path, data in sorted(files.items()):
            target = root / path
            if target.is_symlink() or not target.is_file():
                problems.append(f"missing generated file: {path}")
            elif target.read_bytes() != data:
                problems.append(f"stale generated file: {path}")
        for path in sorted(present[platform] - set(files)):
            problems.append(f"unexpected file in generated payload: {path}")
    recorded = read_manifest(root)
    if not recorded:
        problems.append("missing .starter/manifest.json")
        return problems
    if any(recorded.get(key) != manifest[key] for key in ("version", "platforms")):
        problems.append("stale .starter/manifest.json")
    recorded_history = recorded.get("history", {})
    for path, digests in manifest["history"].items():
        missing = set(digests) - set(recorded_history.get(path, ()))
        if missing:
            problems.append(f".starter/manifest.json history lacks {len(missing)} earlier version(s) of {path}")
    return problems


def write_payload(root: Path, payload: dict[str, dict[str, bytes]], manifest: dict, prune: bool) -> list[str]:
    present = existing_generated(root)
    previously_generated = {
        path for spec in read_manifest(root).get("platforms", {}).values() for path in spec.get("files", {})
    }
    unknown = sorted(
        path
        for platform, files in payload.items()
        for path in present[platform] - set(files)
        if path not in previously_generated
    )
    if unknown and not prune:
        listing = "\n  ".join(unknown)
        raise BuildError(
            "these files sit in generated folders but were not generated by an earlier build:\n  "
            f"{listing}\nmove them into team/, or rerun with --prune to delete them"
        )

    changes: list[str] = []
    for platform, files in payload.items():
        for path in sorted(present[platform] - set(files)):
            (root / path).unlink()
            changes.append(f"removed {path}")
        for path, data in sorted(files.items()):
            target = root / path
            if target.is_file() and not target.is_symlink() and target.read_bytes() == data:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.is_symlink():
                target.unlink()
            target.write_bytes(data)
            target.chmod(0o644)
            changes.append(f"wrote {path}")
    for spec in PLATFORMS.values():
        for prefix in spec["owned"]:
            base = root / prefix.rstrip("/")
            if prefix.endswith("/") and base.is_dir():
                for directory, _, _ in sorted(os.walk(base, topdown=False), key=lambda e: -len(Path(e[0]).parts)):
                    path = Path(directory)
                    if not path.is_symlink() and not any(path.iterdir()):
                        path.rmdir()
    manifest_path = root / ".starter" / "manifest.json"
    data = manifest_bytes(manifest)
    if not manifest_path.is_file() or manifest_path.read_bytes() != data:
        manifest_path.write_bytes(data)
        changes.append("wrote .starter/manifest.json")
    return changes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="report stale generated files without writing")
    parser.add_argument(
        "--prune",
        action="store_true",
        help="also delete files in generated folders that no earlier build created",
    )
    args = parser.parse_args()
    try:
        payload = render_payload(ROOT)
        manifest = build_manifest(ROOT, payload)
    except (BuildError, OSError, tomllib.TOMLDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.check:
        problems = stale_files(ROOT, payload, manifest)
        for problem in problems:
            print(f"error: {problem}", file=sys.stderr)
        if problems:
            print("run: python3 .starter/build.py", file=sys.stderr)
            return 1
        print("generated payloads are up to date")
        return 0

    try:
        changes = write_payload(ROOT, payload, manifest, args.prune)
    except (BuildError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    for change in changes:
        print(change)
    counts = ", ".join(f"{PLATFORMS[p]['label']}: {len(files)} files" for p, files in payload.items())
    print(f"build complete ({counts})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
