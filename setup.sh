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

TARGET="${1:-.}"
IDE="${2:-all}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════════╗"
echo "║       MAXXY-AGENT INSTALLER v2.1.0       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Target: $TARGET"
echo "  IDE:    $IDE"
echo ""

mkdir -p "$TARGET/.maxxy-agent"

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
echo "Installing core package → .maxxy-agent/"
echo ""

copy_if_missing "$SCRIPT_DIR/skills" "$TARGET/.maxxy-agent/skills"
copy_if_missing "$SCRIPT_DIR/roles" "$TARGET/.maxxy-agent/roles"
copy_if_missing "$SCRIPT_DIR/tools" "$TARGET/.maxxy-agent/tools"
copy_if_missing "$SCRIPT_DIR/templates" "$TARGET/.maxxy-agent/templates"

# Store all IDE configs inside .maxxy-agent/ (source of truth)
copy_if_missing "$SCRIPT_DIR/.windsurfrules" "$TARGET/.maxxy-agent/.windsurfrules"
copy_if_missing "$SCRIPT_DIR/.windsurf" "$TARGET/.maxxy-agent/.windsurf"
copy_if_missing "$SCRIPT_DIR/.cursorrules" "$TARGET/.maxxy-agent/.cursorrules"
copy_if_missing "$SCRIPT_DIR/.cursor" "$TARGET/.maxxy-agent/.cursor"
copy_if_missing "$SCRIPT_DIR/CLAUDE.md" "$TARGET/.maxxy-agent/CLAUDE.md"
copy_if_missing "$SCRIPT_DIR/AGENTS.md" "$TARGET/.maxxy-agent/AGENTS.md"
copy_if_missing "$SCRIPT_DIR/.codex" "$TARGET/.maxxy-agent/.codex"
copy_if_missing "$SCRIPT_DIR/.github/copilot-instructions.md" "$TARGET/.maxxy-agent/.github/copilot-instructions.md"
copy_if_missing "$SCRIPT_DIR/.opencode" "$TARGET/.maxxy-agent/.opencode"

# Copy setup.sh itself so user can activate IDEs later
cp "$SCRIPT_DIR/setup.sh" "$TARGET/.maxxy-agent/setup.sh"
chmod +x "$TARGET/.maxxy-agent/setup.sh"

# ─── IDE Activation (optional — copies configs to project root) ───────────
activate_windsurf() {
  copy_if_missing "$SCRIPT_DIR/.windsurfrules" "$TARGET/.windsurfrules"
  copy_if_missing "$SCRIPT_DIR/.windsurf/rules" "$TARGET/.windsurf/rules"
  copy_if_missing "$SCRIPT_DIR/.windsurf/workflows" "$TARGET/.windsurf/workflows"
}

activate_cursor() {
  copy_if_missing "$SCRIPT_DIR/.cursorrules" "$TARGET/.cursorrules"
  copy_if_missing "$SCRIPT_DIR/.cursor/rules" "$TARGET/.cursor/rules"
}

activate_claude() {
  copy_if_missing "$SCRIPT_DIR/CLAUDE.md" "$TARGET/CLAUDE.md"
}

activate_codex() {
  copy_if_missing "$SCRIPT_DIR/AGENTS.md" "$TARGET/AGENTS.md"
  copy_if_missing "$SCRIPT_DIR/.codex" "$TARGET/.codex"
}

activate_copilot() {
  copy_if_missing "$SCRIPT_DIR/.github/copilot-instructions.md" "$TARGET/.github/copilot-instructions.md"
}

activate_opencode() {
  copy_if_missing "$SCRIPT_DIR/.opencode" "$TARGET/.opencode"
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
echo "═══════════════════════════════════════════"
