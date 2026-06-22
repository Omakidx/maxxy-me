#!/usr/bin/env bash
<<<<<<< HEAD
# ─────────────────────────────────────────────────────────────────────────────
# Maxxy-Agent Setup — Install into any project
# Usage: ./setup.sh <target-directory> [ide]
#
# Everything → .maxxy-me/ (single folder)
# IDE config  → auto-detected or manually specified (only the relevant one)
#
# Examples:
#   ./setup.sh .                    # Auto-detect IDE, install only its config
#   ./setup.sh . cursor             # Force Cursor config
#   ./setup.sh . windsurf           # Force Windsurf config
#   ./setup.sh . minimal            # .maxxy-me/ only (no IDE config at root)
#   ./setup.sh . all                # All IDE configs (not recommended)
#
# IDEs: windsurf, cursor, claude, codex, copilot, opencode, all, minimal
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="3.0.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Flags ─────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Maxxy-Agent Setup — Install into any project

USAGE:
  setup.sh <target-directory> [ide]

ARGUMENTS:
  target-directory   Path to your project (use . for current directory)
  ide                IDE to activate (default: auto-detect)
                     Options: windsurf, cursor, claude, codex, copilot,
                              opencode, all, minimal

EXAMPLES:
  # One-liner install (clone + install + cleanup):
  git clone https://github.com/Omakidx/maxxy-me.git /tmp/maxxy-agent && /tmp/maxxy-agent/setup.sh . && rm -rf /tmp/maxxy-agent

  # Install with specific IDE:
  ./setup.sh . cursor

CLI COMMANDS (available after install):
  maxxy-me uninstall          Remove all maxxy-me files from the project
  maxxy-me activate <ide>     Switch to a different IDE config
  maxxy-me --help             Show this help message
  maxxy-me --version          Show version number
EOF
  exit 0
fi

if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then
  echo "maxxy-agent v${VERSION}"
  exit 0
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  if [[ "$SCRIPT_DIR" == */.maxxy-me ]]; then
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

  for parent in \
    "$PROJECT_ROOT/.windsurf" \
    "$PROJECT_ROOT/.cursor" \
    "$PROJECT_ROOT/.github"; do
    if [ -d "$parent" ] && [ -z "$(ls -A "$parent")" ]; then
      rmdir "$parent"
      echo "  REMOVE  $parent (empty)"
    fi
  done

  if [ -d "$PROJECT_ROOT/.maxxy-me" ]; then
    rm -rf "$PROJECT_ROOT/.maxxy-me"
    echo "  REMOVE  $PROJECT_ROOT/.maxxy-me"
  fi

  # Remove global CLI if it exists and points to this project
  CLI_PATH="$HOME/.local/bin/maxxy-me"
  if [ -f "$CLI_PATH" ]; then
    rm -f "$CLI_PATH"
    echo "  REMOVE  $CLI_PATH (global CLI)"
  fi

  echo ""
  echo "═══════════════════════════════════════════"
  echo "  DONE. Maxxy-Agent fully removed."
  echo "═══════════════════════════════════════════"
  exit 0
fi

TARGET="${1:-.}"
IDE="${2:-auto}"

# ─── Detect Context ────────────────────────────────────────────────────────
INSTALLED=false
if [[ "$SCRIPT_DIR" == */.maxxy-me ]]; then
  INSTALLED=true
  SRC_DIR="$SCRIPT_DIR"
else
  SRC_DIR="$SCRIPT_DIR"
fi

# Resolve TARGET to absolute path
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
  echo "  ERROR: Target directory '$1' does not exist."
  exit 1
}

# ─── Auto-Detect IDE ──────────────────────────────────────────────────────
detect_ide() {
  # 1. Check Cursor-specific env vars (Cursor is a VS Code fork)
  if [ -n "${CURSOR_TRACE_DIR:-}" ] || [ -n "${CURSOR_CHANNEL:-}" ]; then
    echo "cursor"
    return
  fi

  # 2. Check Windsurf-specific env vars
  if [ -n "${WINDSURF_TRACE_DIR:-}" ] || [ -n "${CODEIUM_TRACE_DIR:-}" ]; then
    echo "windsurf"
    return
  fi

  # 3. Check VS Code (GitHub Copilot) — TERM_PROGRAM=vscode
  if [ "${TERM_PROGRAM:-}" = "vscode" ]; then
    echo "copilot"
    return
  fi

  # 4. Check for Claude Code CLI
  if command -v claude &>/dev/null; then
    echo "claude"
    return
  fi

  # 5. Check for Codex CLI
  if command -v codex &>/dev/null; then
    echo "codex"
    return
  fi

  # 6. Check for OpenCode CLI
  if command -v opencode &>/dev/null; then
    echo "opencode"
    return
  fi

  # 7. Check existing IDE config files in target directory
  if [ -e "$TARGET/.cursorrules" ] || [ -d "$TARGET/.cursor" ]; then
    echo "cursor"
    return
  fi
  if [ -e "$TARGET/.windsurfrules" ] || [ -d "$TARGET/.windsurf" ]; then
    echo "windsurf"
    return
  fi
  if [ -e "$TARGET/CLAUDE.md" ]; then
    echo "claude"
    return
  fi
  if [ -e "$TARGET/AGENTS.md" ] || [ -d "$TARGET/.codex" ]; then
    echo "codex"
    return
  fi
  if [ -d "$TARGET/.github" ] && [ -e "$TARGET/.github/copilot-instructions.md" ]; then
    echo "copilot"
    return
  fi
  if [ -d "$TARGET/.opencode" ]; then
    echo "opencode"
    return
  fi

  # 8. Fallback: minimal (no IDE config at root)
  echo "minimal"
}

if [ "$IDE" = "auto" ]; then
  IDE="$(detect_ide)"
fi

echo "╔══════════════════════════════════════════╗"
echo "║       MAXXY-AGENT INSTALLER v${VERSION}       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Target: $TARGET"
echo "  IDE:    $IDE"
if $INSTALLED; then
  echo "  Mode:   Re-activation (from installed .maxxy-me/)"
else
  echo "  Mode:   Fresh install"
fi
echo ""

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

# ─── Core Package (always → .maxxy-me/) ───────────────────────────────────
if $INSTALLED; then
  echo "Core package already installed — skipping."
  echo ""
else
  echo "Installing core package → .maxxy-me/"
  echo ""

  mkdir -p "$TARGET/.maxxy-me"

  # Core content
  copy_if_missing "$SRC_DIR/skills" "$TARGET/.maxxy-me/skills"
  copy_if_missing "$SRC_DIR/roles" "$TARGET/.maxxy-me/roles"
  copy_if_missing "$SRC_DIR/tools" "$TARGET/.maxxy-me/tools"
  copy_if_missing "$SRC_DIR/templates" "$TARGET/.maxxy-me/templates"

  # Store IDE config templates inside .maxxy-me/ (for re-activation)
  mkdir -p "$TARGET/.maxxy-me/ide-configs"
  cp -r "$SRC_DIR/.windsurfrules" "$TARGET/.maxxy-me/ide-configs/.windsurfrules" 2>/dev/null || true
  cp -r "$SRC_DIR/.windsurf" "$TARGET/.maxxy-me/ide-configs/.windsurf" 2>/dev/null || true
  cp -r "$SRC_DIR/.cursorrules" "$TARGET/.maxxy-me/ide-configs/.cursorrules" 2>/dev/null || true
  cp -r "$SRC_DIR/.cursor" "$TARGET/.maxxy-me/ide-configs/.cursor" 2>/dev/null || true
  cp -r "$SRC_DIR/CLAUDE.md" "$TARGET/.maxxy-me/ide-configs/CLAUDE.md" 2>/dev/null || true
  cp -r "$SRC_DIR/AGENTS.md" "$TARGET/.maxxy-me/ide-configs/AGENTS.md" 2>/dev/null || true
  cp -r "$SRC_DIR/.codex" "$TARGET/.maxxy-me/ide-configs/.codex" 2>/dev/null || true
  mkdir -p "$TARGET/.maxxy-me/ide-configs/.github"
  cp "$SRC_DIR/.github/copilot-instructions.md" "$TARGET/.maxxy-me/ide-configs/.github/copilot-instructions.md" 2>/dev/null || true
  cp -r "$SRC_DIR/.opencode" "$TARGET/.maxxy-me/ide-configs/.opencode" 2>/dev/null || true

  # Copy setup.sh itself
  cp "$SRC_DIR/setup.sh" "$TARGET/.maxxy-me/setup.sh"
  chmod +x "$TARGET/.maxxy-me/setup.sh"

  # Install global CLI → ~/.local/bin/maxxy-me
  mkdir -p "$HOME/.local/bin"
  cat > "$HOME/.local/bin/maxxy-me" <<'CLIMEOF'
#!/usr/bin/env bash
# Maxxy-Agent CLI — finds nearest .maxxy-me/ and delegates
find_project_root() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -d "$dir/.maxxy-me" ]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

PROJECT_ROOT="$(find_project_root)" || {
  echo "Error: No .maxxy-me/ found in current or parent directories."
  echo "Run this from inside a project with maxxy-me installed."
  exit 1
}

case "${1:-}" in
  uninstall)
    "$PROJECT_ROOT/.maxxy-me/setup.sh" --uninstall
    ;;
  activate)
    "$PROJECT_ROOT/.maxxy-me/setup.sh" "$PROJECT_ROOT" "${2:-auto}"
    ;;
  --version|-v)
    "$PROJECT_ROOT/.maxxy-me/setup.sh" --version
    ;;
  --help|-h|"")
    "$PROJECT_ROOT/.maxxy-me/setup.sh" --help
    ;;
  *)
    echo "Unknown command: $1"
    echo ""
    echo "Usage:"
    echo "  maxxy-me uninstall          Remove maxxy-me from this project"
    echo "  maxxy-me activate <ide>     Switch IDE config (cursor, windsurf, etc.)"
    echo "  maxxy-me --help             Show help"
    echo "  maxxy-me --version          Show version"
    exit 1
    ;;
esac
CLIMEOF
  chmod +x "$HOME/.local/bin/maxxy-me"
  echo "  CLI   ~/.local/bin/maxxy-me installed"

  # Check if ~/.local/bin is in PATH
  if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo "  NOTE: Add ~/.local/bin to your PATH if not already:"
    echo "        export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
fi

# ─── IDE Activation (only the detected/specified IDE) ─────────────────────
AGENT_DIR="$TARGET/.maxxy-me"
CFG_DIR="$AGENT_DIR/ide-configs"

activate_windsurf() {
  copy_if_missing "$CFG_DIR/.windsurfrules" "$TARGET/.windsurfrules"
  copy_if_missing "$CFG_DIR/.windsurf/rules" "$TARGET/.windsurf/rules"
  copy_if_missing "$CFG_DIR/.windsurf/workflows" "$TARGET/.windsurf/workflows"
}

activate_cursor() {
  copy_if_missing "$CFG_DIR/.cursorrules" "$TARGET/.cursorrules"
  copy_if_missing "$CFG_DIR/.cursor/rules" "$TARGET/.cursor/rules"
}

activate_claude() {
  copy_if_missing "$CFG_DIR/CLAUDE.md" "$TARGET/CLAUDE.md"
}

activate_codex() {
  copy_if_missing "$CFG_DIR/AGENTS.md" "$TARGET/AGENTS.md"
  copy_if_missing "$CFG_DIR/.codex" "$TARGET/.codex"
}

activate_copilot() {
  copy_if_missing "$CFG_DIR/.github/copilot-instructions.md" "$TARGET/.github/copilot-instructions.md"
}

activate_opencode() {
  copy_if_missing "$CFG_DIR/.opencode" "$TARGET/.opencode"
}

if [ "$IDE" != "minimal" ]; then
  echo ""
  echo "Activating IDE: $IDE"
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
if [ "$IDE" = "minimal" ]; then
  echo ""
  echo "  Activate an IDE:     maxxy-me activate <ide>"
fi
echo "  Switch IDE:          maxxy-me activate <ide>"
echo "  Uninstall:           maxxy-me uninstall"
echo "═══════════════════════════════════════════"
=======
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
exec "$SCRIPT_DIR/.maxxy-me/setup.sh" "$@"
>>>>>>> d4da344 (Fixing some bugs in the agent calls and scripts)
