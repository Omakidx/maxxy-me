#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Maxxy-Agent Setup — Install into any project
# Usage: ./setup.sh [target-directory]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TARGET="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════════╗"
echo "║       MAXXY-AGENT INSTALLER v1.0.0       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Target: $TARGET"
echo ""

# Create target if needed
mkdir -p "$TARGET"

# Copy IDE-specific config files
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

echo "Installing IDE configurations..."
echo ""

# Universal rule files (root-level)
copy_if_missing "$SCRIPT_DIR/.cursorrules" "$TARGET/.cursorrules"
copy_if_missing "$SCRIPT_DIR/.windsurfrules" "$TARGET/.windsurfrules"
copy_if_missing "$SCRIPT_DIR/CLAUDE.md" "$TARGET/CLAUDE.md"
copy_if_missing "$SCRIPT_DIR/AGENTS.md" "$TARGET/AGENTS.md"

# Windsurf (rules + workflows)
copy_if_missing "$SCRIPT_DIR/.windsurf/rules" "$TARGET/.windsurf/rules"
copy_if_missing "$SCRIPT_DIR/.windsurf/workflows" "$TARGET/.windsurf/workflows"

# Cursor
copy_if_missing "$SCRIPT_DIR/.cursor/rules" "$TARGET/.cursor/rules"

# GitHub Copilot
copy_if_missing "$SCRIPT_DIR/.github/copilot-instructions.md" "$TARGET/.github/copilot-instructions.md"

# OpenCode
copy_if_missing "$SCRIPT_DIR/.opencode" "$TARGET/.opencode"

# Codex CLI
copy_if_missing "$SCRIPT_DIR/.codex" "$TARGET/.codex"

# Skills (universal, all IDEs can reference)
copy_if_missing "$SCRIPT_DIR/skills" "$TARGET/skills"

# Roles (specialist personas)
copy_if_missing "$SCRIPT_DIR/roles" "$TARGET/roles"

echo ""
echo "═══════════════════════════════════════════"
echo "  DONE. Maxxy-Agent installed to: $TARGET"
echo ""
echo "  Supported IDEs:"
echo "    • Windsurf  → .windsurfrules + .windsurf/"
echo "    • Cursor    → .cursorrules + .cursor/rules/"
echo "    • Claude    → CLAUDE.md"
echo "    • Codex     → AGENTS.md + .codex/"
echo "    • Copilot   → .github/copilot-instructions.md"
echo "    • OpenCode  → .opencode/rules.md"
echo ""
echo "  Skills available in: skills/"
echo "  Use /plan, /debug, /review, /security, /ship"
echo "═══════════════════════════════════════════"
