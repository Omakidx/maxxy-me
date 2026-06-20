#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Maxxy-Agent Setup — Install into any project
# Usage: ./setup.sh <target-directory> [ide]
#
# Core content (skills, roles, tools, templates) → .maxxy-agent/
# IDE configs → project root (so slash commands work out of the box)
#
# Examples:
#   ./setup.sh .                    # Full install (all IDE configs at root)
#   ./setup.sh . windsurf           # Only Windsurf configs at root
#   ./setup.sh . cursor             # Only Cursor configs at root
#   ./setup.sh . minimal            # .maxxy-agent/ only (no root configs)
#   ./setup.sh ~/my-project
#
# IDEs: windsurf, cursor, claude, codex, copilot, opencode, all, minimal
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="2.2.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Flags ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Maxxy-Agent Setup — Install into any project

USAGE:
  setup.sh <target-directory> [ide]

ARGUMENTS:
  target-directory   Path to your project (use . for current directory)
  ide                IDE to activate at project root (default: all)
                     Options: windsurf, cursor, claude, codex, copilot,
                              opencode, all, minimal

EXAMPLES:
  # One-liner install (clone + install + cleanup):
  git clone https://github.com/Omakidx/maxxy-me.git /tmp/maxxy-agent && /tmp/maxxy-agent/setup.sh . && rm -rf /tmp/maxxy-agent

  # Install into current project (all IDEs):
  ./setup.sh .

  # Install with only Cursor configs:
  ./setup.sh . cursor

  # Core only (no IDE configs at root):
  ./setup.sh . minimal

  # Re-activate an IDE later (from installed location):
  .maxxy-agent/setup.sh . windsurf

  # Uninstall — remove all maxxy-agent files from project:
  .maxxy-agent/setup.sh --uninstall

FLAGS:
  --help, -h         Show this help message
  --version, -v      Show version number
  --uninstall        Remove all maxxy-agent files from the project
EOF
  exit 0
fi

if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then
  echo "maxxy-agent v${VERSION}"
  exit 0
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  # Detect project root: if running from .maxxy-agent/, go up one level
  if [[ "$SCRIPT_DIR" == */.maxxy-agent ]]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
  else
    PROJECT_ROOT="${2:-.}"
    PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd)" || {
      echo "  ERROR: Directory '$2' does not exist."
      exit 1
    }
  fi

  echo "╔══════════════════════════════════════════╗"
  echo "║      MAXXY-AGENT UNINSTALLER v${VERSION}      ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "  Project: $PROJECT_ROOT"
  echo ""

  # Remove IDE configs at project root
  for item in \
    "$PROJECT_ROOT/.windsurfrules" \
    "$PROJECT_ROOT/.cursorrules" \
    "$PROJECT_ROOT/CLAUDE.md" \
    "$PROJECT_ROOT/AGENTS.md" \
    "$PROJECT_ROOT/team-memory.txt"; do
    if [ -e "$item" ]; then
      rm -f "$item"
      echo "  REMOVE  $item"
    fi
  done

  # Remove IDE directories (only maxxy-agent-owned content)
  for dir in \
    "$PROJECT_ROOT/.windsurf/rules" \
    "$PROJECT_ROOT/.windsurf/workflows" \
    "$PROJECT_ROOT/.cursor/rules" \
    "$PROJECT_ROOT/.codex" \
    "$PROJECT_ROOT/.opencode" \
    "$PROJECT_ROOT/.github/copilot-instructions.md"; do
    if [ -e "$dir" ]; then
      rm -rf "$dir"
      echo "  REMOVE  $dir"
    fi
  done

  # Clean up empty parent dirs left behind
  for parent in \
    "$PROJECT_ROOT/.windsurf" \
    "$PROJECT_ROOT/.cursor" \
    "$PROJECT_ROOT/.github"; do
    if [ -d "$parent" ] && [ -z "$(ls -A "$parent")" ]; then
      rmdir "$parent"
      echo "  REMOVE  $parent (empty)"
    fi
  done

  # Remove .maxxy-agent/ itself (must be last — this script lives here)
  if [ -d "$PROJECT_ROOT/.maxxy-agent" ]; then
    rm -rf "$PROJECT_ROOT/.maxxy-agent"
    echo "  REMOVE  $PROJECT_ROOT/.maxxy-agent"
  fi

  echo ""
  echo "═══════════════════════════════════════════"
  echo "  DONE. Maxxy-Agent fully removed."
  echo "═══════════════════════════════════════════"
  exit 0
fi

TARGET="${1:-.}"
IDE="${2:-all}"

# ─── Detect Context ────────────────────────────────────────────────────────
# Are we running from an installed .maxxy-agent/ directory or from the repo?
# If SCRIPT_DIR ends with .maxxy-agent, we're in "re-activation" mode.
INSTALLED=false
if [[ "$SCRIPT_DIR" == */.maxxy-agent ]]; then
  INSTALLED=true
  # Source of truth for IDE configs is the installed .maxxy-agent/ itself
  SRC_DIR="$SCRIPT_DIR"
else
  # Running from cloned repo (e.g., /tmp/maxxy-agent/setup.sh .)
  SRC_DIR="$SCRIPT_DIR"
fi

echo "╔══════════════════════════════════════════╗"
echo "║       MAXXY-AGENT INSTALLER v${VERSION}       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Target: $TARGET"
echo "  IDE:    $IDE"
if $INSTALLED; then
  echo "  Mode:   Re-activation (from installed .maxxy-agent/)"
else
  echo "  Mode:   Fresh install"
fi
echo ""

# Resolve TARGET to absolute path for safe comparisons
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
  echo "  ERROR: Target directory '$1' does not exist."
  exit 1
}

copy_if_missing() {
  local src="$1" dst="$2"
  if [ -e "$dst" ]; then
    echo "  SKIP  $dst (already exists)"
  else
    mkdir -p "$(dirname "$dst")"
    cp -r "$src" "$dst"
    echo "  COPY  $dst"
  fi
}

# ─── Core Package (always → .maxxy-agent/) ────────────────────────────────
if $INSTALLED; then
  echo "Core package already installed — skipping."
  echo ""
else
  echo "Installing core package → .maxxy-agent/"
  echo ""

  mkdir -p "$TARGET/.maxxy-agent"

  copy_if_missing "$SRC_DIR/skills" "$TARGET/.maxxy-agent/skills"
  copy_if_missing "$SRC_DIR/roles" "$TARGET/.maxxy-agent/roles"
  copy_if_missing "$SRC_DIR/tools" "$TARGET/.maxxy-agent/tools"
  copy_if_missing "$SRC_DIR/templates" "$TARGET/.maxxy-agent/templates"

  # Store all IDE configs inside .maxxy-agent/ (source of truth)
  copy_if_missing "$SRC_DIR/.windsurfrules" "$TARGET/.maxxy-agent/.windsurfrules"
  copy_if_missing "$SRC_DIR/.windsurf" "$TARGET/.maxxy-agent/.windsurf"
  copy_if_missing "$SRC_DIR/.cursorrules" "$TARGET/.maxxy-agent/.cursorrules"
  copy_if_missing "$SRC_DIR/.cursor" "$TARGET/.maxxy-agent/.cursor"
  copy_if_missing "$SRC_DIR/CLAUDE.md" "$TARGET/.maxxy-agent/CLAUDE.md"
  copy_if_missing "$SRC_DIR/AGENTS.md" "$TARGET/.maxxy-agent/AGENTS.md"
  copy_if_missing "$SRC_DIR/.codex" "$TARGET/.maxxy-agent/.codex"
  copy_if_missing "$SRC_DIR/.github/copilot-instructions.md" "$TARGET/.maxxy-agent/.github/copilot-instructions.md"
  copy_if_missing "$SRC_DIR/.opencode" "$TARGET/.maxxy-agent/.opencode"

  # Copy setup.sh itself so user can re-activate IDEs later
  cp "$SRC_DIR/setup.sh" "$TARGET/.maxxy-agent/setup.sh"
  chmod +x "$TARGET/.maxxy-agent/setup.sh"
fi

# ─── IDE Activation (copies configs from .maxxy-agent/ to project root) ───
# Always source from the installed .maxxy-agent/ location
AGENT_DIR="$TARGET/.maxxy-agent"

activate_windsurf() {
  copy_if_missing "$AGENT_DIR/.windsurfrules" "$TARGET/.windsurfrules"
  copy_if_missing "$AGENT_DIR/.windsurf/rules" "$TARGET/.windsurf/rules"
  copy_if_missing "$AGENT_DIR/.windsurf/workflows" "$TARGET/.windsurf/workflows"
}

activate_cursor() {
  copy_if_missing "$AGENT_DIR/.cursorrules" "$TARGET/.cursorrules"
  copy_if_missing "$AGENT_DIR/.cursor/rules" "$TARGET/.cursor/rules"
}

activate_claude() {
  copy_if_missing "$AGENT_DIR/CLAUDE.md" "$TARGET/CLAUDE.md"
}

activate_codex() {
  copy_if_missing "$AGENT_DIR/AGENTS.md" "$TARGET/AGENTS.md"
  copy_if_missing "$AGENT_DIR/.codex" "$TARGET/.codex"
}

activate_copilot() {
  copy_if_missing "$AGENT_DIR/.github/copilot-instructions.md" "$TARGET/.github/copilot-instructions.md"
}

activate_opencode() {
  copy_if_missing "$AGENT_DIR/.opencode" "$TARGET/.opencode"
}

if [ "$IDE" != "minimal" ]; then
  echo ""
  echo "Activating IDE configs → project root"
  echo ""

  case "$IDE" in
    windsurf)  activate_windsurf ;;
    cursor)    activate_cursor ;;
    claude)    activate_claude ;;
    codex)     activate_codex ;;
    copilot)   activate_copilot ;;
    opencode)  activate_opencode ;;
    all)
      activate_windsurf
      activate_cursor
      activate_claude
      activate_codex
      activate_copilot
      activate_opencode
      ;;
    *)
      echo "  ERROR: Unknown IDE '$IDE'"
      echo "  Valid: windsurf, cursor, claude, codex, copilot, opencode, all, minimal"
      exit 1
      ;;
  esac
fi

# ─── Done ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  DONE. Maxxy-Agent installed to: $TARGET"
echo ""
echo "  IDE activated: $IDE"
echo ""
echo "  Quick start: /plan, /debug, /review, /security, /ship"
echo "  All roles:   /frontend-dev, /backend-dev, /devops, /dba, etc."
if ! $INSTALLED; then
  echo ""
  echo "  Re-activate an IDE later:"
  echo "    $TARGET/.maxxy-agent/setup.sh $TARGET <ide>"
fi
echo "═══════════════════════════════════════════"
