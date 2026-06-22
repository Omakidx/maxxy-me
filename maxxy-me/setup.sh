#!/usr/bin/env bash
# Maxxy-Agent installer and project-local integration manager.
set -euo pipefail

VERSION="3.1.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_MARKER="$SCRIPT_DIR/.source-package"

usage() {
  cat <<'EOF'
Maxxy-Agent Setup — install into any project

USAGE:
  setup.sh <target-directory> [ide] [--no-cli]
  setup.sh --uninstall [target-directory] [--remove-cli]
  setup.sh --help
  setup.sh --version

IDE:
  auto (default), windsurf, cursor, claude, codex, copilot, opencode,
  all, or minimal

EXAMPLES:
  ./setup.sh ../my-project
  ./setup.sh ../my-project cursor
  ./setup.sh ../my-project minimal --no-cli
  ./setup.sh --uninstall ../my-project

CLI COMMANDS:
  maxxy-me activate <ide>     Add or refresh an IDE integration
  maxxy-me uninstall          Remove unmodified Maxxy-owned files
  maxxy-me --help             Show this help
  maxxy-me --version          Show the installed version

The installer never overwrites untracked or locally modified IDE files.
EOF
}

die() {
  printf '  ERROR: %s\n' "$*" >&2
  exit 1
}

resolve_directory() {
  local directory="$1"
  (cd "$directory" 2>/dev/null && pwd -P) || return 1
}

is_valid_ide() {
  case "$1" in
    auto|windsurf|cursor|claude|codex|copilot|opencode|all|minimal) return 0 ;;
    *) return 1 ;;
  esac
}

install_cli() {
  local cli_dir="$HOME/.local/bin"
  local cli_path="$cli_dir/maxxy-me"

  if [ -e "$cli_path" ] && ! grep -q -e '^# Managed by Maxxy-Agent$' -e '^# Maxxy-Agent CLI' "$cli_path" 2>/dev/null; then
    echo "  SKIP  $cli_path (existing command is not Maxxy-managed)"
    return
  fi

  mkdir -p "$cli_dir"
  local cli_tmp
  cli_tmp="$(mktemp "$cli_dir/maxxy-me.XXXXXX")"
  cat >"$cli_tmp" <<'CLIMEOF'
#!/usr/bin/env bash
# Managed by Maxxy-Agent
set -euo pipefail

find_project_root() {
  local directory="$PWD"
  while :; do
    if [ -x "$directory/maxxy-me/setup.sh" ]; then
      printf '%s\n' "$directory"
      return 0
    fi
    [ "$directory" = "/" ] && return 1
    directory="$(dirname "$directory")"
  done
}

PROJECT_ROOT="$(find_project_root)" || {
  echo "Error: no maxxy-me directory found in the current or parent directories." >&2
  exit 1
}
SETUP="$PROJECT_ROOT/maxxy-me/setup.sh"

case "${1:-}" in
  uninstall)
    "$SETUP" --uninstall "$PROJECT_ROOT" "${2:-}"
    ;;
  activate)
    [ -n "${2:-}" ] || {
      echo "Usage: maxxy-me activate <ide>" >&2
      exit 1
    }
    "$SETUP" "$PROJECT_ROOT" "$2" --no-cli
    ;;
  --version|-v)
    "$SETUP" --version
    ;;
  --help|-h|"")
    "$SETUP" --help
    ;;
  *)
    echo "Unknown command: $1" >&2
    echo "Run 'maxxy-me --help' for usage." >&2
    exit 1
    ;;
esac
CLIMEOF
  chmod 755 "$cli_tmp"
  mv -f "$cli_tmp" "$cli_path"
  echo "  CLI   $cli_path"

  if [[ ":$PATH:" != *":$cli_dir:"* ]]; then
    echo "  NOTE  Add $cli_dir to PATH to use the maxxy-me command."
  fi
}

uninstall_project() {
  local project_input="${1:-}"
  local remove_cli="${2:-}"
  local project_root

  if [ -n "$project_input" ] && [ "$project_input" != "--remove-cli" ]; then
    project_root="$(resolve_directory "$project_input")" || die "Directory '$project_input' does not exist."
  elif [ ! -e "$SOURCE_MARKER" ]; then
    project_root="$(dirname "$SCRIPT_DIR")"
  else
    die "A target directory is required when uninstalling from a source checkout."
  fi

  if [ "$project_input" = "--remove-cli" ] || [ "$remove_cli" = "--remove-cli" ]; then
    remove_cli="true"
  elif [ -n "$remove_cli" ]; then
    die "Unknown uninstall option '$remove_cli'."
  else
    remove_cli="false"
  fi

  local agent_dir="$project_root/maxxy-me"
  local manifest="$agent_dir/.install-manifest"
  local directory_manifest="$agent_dir/.install-directories"
  local package_manifest="$agent_dir/.package-manifest"
  [ -d "$agent_dir" ] || die "No Maxxy-Agent installation found in '$project_root'."
  [ ! -e "$agent_dir/.source-package" ] || die "Refusing to uninstall a Maxxy-Agent source checkout."

  echo "Uninstalling Maxxy-Agent from: $project_root"

  if [ -f "$manifest" ] && [ ! -L "$manifest" ]; then
    local expected relative destination actual
    while IFS=$'\t' read -r expected relative; do
      [ -n "$expected" ] && [ -n "$relative" ] || continue
      case "/$relative/" in
        *'/../'*|*'/./'*|'//'*)
          echo "  KEEP    invalid manifest path: $relative"
          continue
          ;;
      esac
      destination="$project_root/$relative"
      [ -f "$destination" ] || continue
      actual="$(sha256sum "$destination" | awk '{print $1}')"
      if [ "$actual" = "$expected" ]; then
        rm -f "$destination"
        echo "  REMOVE  $destination"
      else
        echo "  KEEP    $destination (locally modified)"
      fi
    done <"$manifest"
  else
    echo "  NOTE    No ownership manifest found; preserving all root IDE files."
  fi

  if [ -f "$directory_manifest" ] && [ ! -L "$directory_manifest" ]; then
    local relative_directory directory
    while IFS= read -r relative_directory; do
      [ -n "$relative_directory" ] || continue
      case "/$relative_directory/" in
        *'/../'*|*'/./'*|'//'*) continue ;;
      esac
      directory="$project_root/$relative_directory"
      if [ -d "$directory" ] && [ ! -L "$directory" ] \
        && [ -z "$(find "$directory" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
        rmdir "$directory"
      fi
    done < <(tac "$directory_manifest")
  fi

  if [ -f "$package_manifest" ] && [ ! -L "$package_manifest" ]; then
    local package_relative package_destination
    while IFS=$'\t' read -r expected package_relative; do
      [ -n "$expected" ] && [ -n "$package_relative" ] || continue
      case "/$package_relative/" in
        *'/../'*|*'/./'*|'//'*)
          echo "  KEEP    invalid package manifest path: $package_relative"
          continue
          ;;
      esac
      package_destination="$agent_dir/$package_relative"
      [ -f "$package_destination" ] && [ ! -L "$package_destination" ] || continue
      actual="$(sha256sum "$package_destination" | awk '{print $1}')"
      if [ "$actual" = "$expected" ]; then
        rm -f "$package_destination"
      else
        echo "  KEEP    $package_destination (locally modified)"
      fi
    done <"$package_manifest"

    rm -f "$manifest" "$directory_manifest" "$package_manifest"
    find "$agent_dir" -depth -type d -empty -delete
    if [ -d "$agent_dir" ]; then
      echo "  KEEP    $agent_dir (contains custom or modified package files)"
    else
      echo "  REMOVE  $agent_dir"
    fi
  else
    echo "  KEEP    $agent_dir (legacy install has no package ownership manifest)"
  fi

  if [ "$remove_cli" = "true" ]; then
    local cli_path="$HOME/.local/bin/maxxy-me"
    if [ -f "$cli_path" ] && grep -q '^# Managed by Maxxy-Agent$' "$cli_path"; then
      rm -f "$cli_path"
      echo "  REMOVE  $cli_path"
    else
      echo "  KEEP    $cli_path (not Maxxy-managed or not present)"
    fi
  fi

  echo "DONE. Unmodified Maxxy-Agent files were removed; custom and modified files were preserved."
}

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
  --version|-v)
    echo "maxxy-agent v$VERSION"
    exit 0
    ;;
  --uninstall)
    [ "$#" -le 3 ] || die "Too many uninstall arguments."
    uninstall_project "${2:-}" "${3:-}"
    exit 0
    ;;
esac

TARGET_INPUT="${1:-.}"
IDE="${2:-auto}"
CLI_OPTION="${3:-}"
[ "$#" -le 3 ] || die "Too many arguments."
[ -z "$CLI_OPTION" ] || [ "$CLI_OPTION" = "--no-cli" ] || die "Unknown option '$CLI_OPTION'."
is_valid_ide "$IDE" || die "Unknown IDE '$IDE'. Valid values: auto, windsurf, cursor, claude, codex, copilot, opencode, all, minimal."
TARGET="$(resolve_directory "$TARGET_INPUT")" || die "Target directory '$TARGET_INPUT' does not exist."

detect_ide() {
  # STRICT detection: only use environment variables and running processes.
  # We do NOT guess from existing config files in the target directory,
  # because those may be leftover from a prior install with a different IDE.

  # 1. Cursor — has its own env vars
  if [ -n "${CURSOR_TRACE_DIR:-}" ] || [ -n "${CURSOR_CHANNEL:-}" ]; then
    echo cursor
    return
  fi

  # 2. Windsurf — has its own env vars
  if [ -n "${WINDSURF_TRACE_DIR:-}" ] || [ -n "${CODEIUM_TRACE_DIR:-}" ]; then
    echo windsurf
    return
  fi

  # 3. CLI tools — check if a specific CLI is available
  if command -v claude >/dev/null 2>&1; then
    echo claude
    return
  fi
  if command -v codex >/dev/null 2>&1; then
    echo codex
    return
  fi
  if command -v opencode >/dev/null 2>&1; then
    echo opencode
    return
  fi

  # 5. No IDE detected — fall back to minimal and warn
  echo ""
  echo "  WARNING: Could not auto-detect your IDE." >&2
  echo "  Falling back to 'minimal' (core package only, no IDE config at root)." >&2
  echo "  To install with a specific IDE, re-run with:" >&2
  echo "    setup.sh <target> <ide>" >&2
  echo "  Valid IDEs: windsurf, cursor, claude, codex, copilot, opencode" >&2
  echo minimal
}

if [ "$IDE" = "auto" ]; then
  IDE="$(detect_ide)"
fi

for required in skills roles tools templates ide-configs; do
  [ -d "$SCRIPT_DIR/$required" ] || die "Source package is incomplete: missing '$required'."
done

AGENT_DIR="$TARGET/maxxy-me"
CFG_DIR="$AGENT_DIR/ide-configs"
[ ! -L "$AGENT_DIR" ] || die "Refusing to install through symlink '$AGENT_DIR'."
if [ -e "$AGENT_DIR/.source-package" ] && [ "$SCRIPT_DIR" != "$AGENT_DIR" ]; then
  die "Refusing to overwrite the Maxxy-Agent source checkout at '$AGENT_DIR'."
fi
if [ -e "$AGENT_DIR" ] && [ "$SCRIPT_DIR" != "$AGENT_DIR" ] \
  && [ ! -f "$AGENT_DIR/.version" ] \
  && { [ ! -f "$AGENT_DIR/setup.sh" ] || [ ! -d "$AGENT_DIR/roles" ] || [ ! -d "$AGENT_DIR/skills" ]; }; then
  die "'$AGENT_DIR' exists but is not a recognizable Maxxy-Agent installation."
fi
command -v sha256sum >/dev/null 2>&1 || die "Required command 'sha256sum' is not available."
IN_PLACE=false
if [ "$SCRIPT_DIR" = "$AGENT_DIR" ]; then
  IN_PLACE=true
fi

echo "Installing Maxxy-Agent v$VERSION"
echo "  Target: $TARGET"
echo "  IDE:    $IDE"

PACKAGE_MANIFEST="$AGENT_DIR/.package-manifest"
PACKAGE_TRACKING=false
PACKAGE_DIRECTORY_EXISTED=false
[ -d "$AGENT_DIR" ] && PACKAGE_DIRECTORY_EXISTED=true
if [ -f "$PACKAGE_MANIFEST" ] && [ ! -L "$PACKAGE_MANIFEST" ]; then
  PACKAGE_TRACKING=true
fi

if $IN_PLACE; then
  echo "  Core:   already present"
else
  [ ! -L "$PACKAGE_MANIFEST" ] || die "Refusing symbolic-link package manifest '$PACKAGE_MANIFEST'."
  mkdir -p "$AGENT_DIR"
  touch "$PACKAGE_MANIFEST"

  package_checksum() {
    local wanted="$1"
    awk -F '\t' -v path="$wanted" '$2 == path { value=$1 } END { print value }' "$PACKAGE_MANIFEST"
  }

  record_package_file() {
    local checksum="$1" relative="$2"
    if ! $PACKAGE_TRACKING; then
      printf '%s\t%s\n' "$checksum" "$relative" >>"$PACKAGE_MANIFEST"
      return
    fi
    local manifest_tmp
    manifest_tmp="$(mktemp "$AGENT_DIR/.package.XXXXXX")"
    awk -F '\t' -v path="$relative" '$2 != path' "$PACKAGE_MANIFEST" >"$manifest_tmp"
    printf '%s\t%s\n' "$checksum" "$relative" >>"$manifest_tmp"
    mv -f "$manifest_tmp" "$PACKAGE_MANIFEST"
  }

  copy_core_file() {
    local source="$1" destination="$2"
    local relative source_checksum old_checksum current_checksum path_component
    relative="${destination#"$AGENT_DIR/"}"
    source_checksum="$(sha256sum "$source" | awk '{print $1}')"
    old_checksum="$(package_checksum "$relative")"

    [ ! -L "$destination" ] || die "Refusing to overwrite package symlink '$destination'."
    path_component="$(dirname "$destination")"
    while [ "$path_component" != "$AGENT_DIR" ]; do
      [ ! -L "$path_component" ] || die "Refusing to copy through package symlink '$path_component'."
      path_component="$(dirname "$path_component")"
    done

    if [ -e "$destination" ]; then
      [ -f "$destination" ] || die "Package path is not a regular file: '$destination'."
      if [ -z "$old_checksum" ]; then
        if ! $PACKAGE_TRACKING; then
          current_checksum="$(sha256sum "$destination" | awk '{print $1}')"
          if [ "$current_checksum" != "$source_checksum" ]; then
            local backup="$AGENT_DIR/.legacy-backup/$relative"
            mkdir -p "$(dirname "$backup")"
            if [ ! -e "$backup" ]; then
              cp -p "$destination" "$backup"
              echo "  BACKUP  $destination -> $backup"
            fi
          fi
        else
          echo "  KEEP    $destination (untracked package file)"
          return
        fi
      fi
      current_checksum="$(sha256sum "$destination" | awk '{print $1}')"
      if [ -n "$old_checksum" ] && [ "$current_checksum" != "$old_checksum" ]; then
        echo "  KEEP    $destination (locally modified package file)"
        return
      fi
      if [ "$current_checksum" = "$source_checksum" ]; then
        if [ -z "$old_checksum" ] && ! $PACKAGE_TRACKING; then
          record_package_file "$source_checksum" "$relative"
        fi
        return
      fi
    fi

    mkdir -p "$(dirname "$destination")"
    cp "$source" "$destination"
    record_package_file "$source_checksum" "$relative"
  }

  copy_core_tree() {
    local source_root="$1" destination_root="$2"
    local source relative destination
    while IFS= read -r -d '' source; do
      relative="${source#"$source_root/"}"
      destination="$destination_root/$relative"
      copy_core_file "$source" "$destination"
    done < <(find "$source_root" -type f -print0 | sort -z)
  }

  for directory in skills roles tools templates ide-configs; do
    copy_core_tree "$SCRIPT_DIR/$directory" "$AGENT_DIR/$directory"
  done
  copy_core_file "$SCRIPT_DIR/setup.sh" "$AGENT_DIR/setup.sh"
  chmod 755 "$AGENT_DIR/setup.sh"
  version_file="$(mktemp "$AGENT_DIR/.version.XXXXXX")"
  printf '%s\n' "$VERSION" >"$version_file"
  copy_core_file "$version_file" "$AGENT_DIR/.version"
  rm -f "$version_file"
  if $PACKAGE_DIRECTORY_EXISTED && ! $PACKAGE_TRACKING; then
    echo "  NOTE:   Legacy package differences were backed up under maxxy-me/.legacy-backup/."
  fi
  echo "  Core:   installed"
fi

MANIFEST="$AGENT_DIR/.install-manifest"
DIRECTORY_MANIFEST="$AGENT_DIR/.install-directories"
[ ! -L "$MANIFEST" ] || die "Refusing symbolic-link ownership manifest '$MANIFEST'."
[ ! -L "$DIRECTORY_MANIFEST" ] || die "Refusing symbolic-link directory manifest '$DIRECTORY_MANIFEST'."
touch "$MANIFEST"
touch "$DIRECTORY_MANIFEST"

tracked_checksum() {
  local wanted="$1"
  awk -F '\t' -v path="$wanted" '$2 == path { value=$1 } END { print value }' "$MANIFEST"
}

record_owned() {
  local checksum="$1" relative="$2"
  if ! awk -F '\t' -v path="$relative" '$2 == path { found=1 } END { exit !found }' "$MANIFEST"; then
    printf '%s\t%s\n' "$checksum" "$relative" >>"$MANIFEST"
    return
  fi
  local manifest_tmp
  manifest_tmp="$(mktemp "$AGENT_DIR/.manifest.XXXXXX")"
  awk -F '\t' -v path="$relative" '$2 != path' "$MANIFEST" >"$manifest_tmp"
  printf '%s\t%s\n' "$checksum" "$relative" >>"$manifest_tmp"
  mv -f "$manifest_tmp" "$MANIFEST"
}

copy_owned() {
  local source="$1" relative="$2"
  local destination="$TARGET/$relative"
  local source_checksum current_checksum old_checksum
  source_checksum="$(sha256sum "$source" | awk '{print $1}')"
  old_checksum="$(tracked_checksum "$relative")"

  if [ -L "$destination" ]; then
    echo "  SKIP    $destination (symbolic link)"
    return
  fi

  local path_component
  path_component="$(dirname "$destination")"
  while [ "$path_component" != "$TARGET" ]; do
    if [ -L "$path_component" ]; then
      echo "  SKIP    $destination (parent is a symbolic link)"
      return
    fi
    path_component="$(dirname "$path_component")"
  done

  if [ -e "$destination" ]; then
    if [ -z "$old_checksum" ]; then
      echo "  SKIP    $destination (pre-existing)"
      return
    fi
    if [ ! -f "$destination" ]; then
      echo "  SKIP    $destination (not a regular file)"
      return
    fi
    current_checksum="$(sha256sum "$destination" | awk '{print $1}')"
    if [ "$current_checksum" != "$old_checksum" ]; then
      echo "  KEEP    $destination (locally modified)"
      return
    fi
    if [ "$current_checksum" = "$source_checksum" ]; then
      echo "  KEEP    $destination"
      return
    fi
    cp "$source" "$destination"
    record_owned "$source_checksum" "$relative"
    echo "  UPDATE  $destination"
    return
  fi

  local parent directory relative_directory index
  local -a missing_directories=()
  parent="$(dirname "$destination")"
  while [ "$parent" != "$TARGET" ] && [ ! -d "$parent" ]; do
    missing_directories+=("$parent")
    parent="$(dirname "$parent")"
  done
  mkdir -p "$(dirname "$destination")"
  for ((index=${#missing_directories[@]}-1; index>=0; index--)); do
    directory="${missing_directories[$index]}"
    relative_directory="${directory#"$TARGET/"}"
    if ! grep -Fqx "$relative_directory" "$DIRECTORY_MANIFEST"; then
      printf '%s\n' "$relative_directory" >>"$DIRECTORY_MANIFEST"
    fi
  done
  cp "$source" "$destination"
  record_owned "$source_checksum" "$relative"
  echo "  COPY    $destination"
}

copy_tree_owned() {
  local source_root="$1"
  local source relative
  while IFS= read -r -d '' source; do
    relative="${source#"$CFG_DIR/"}"
    copy_owned "$source" "$relative"
  done < <(find "$source_root" -type f -print0 | sort -z)
}

copy_owned "$AGENT_DIR/templates/team-memory.txt" "team-memory.txt"

activate_windsurf() {
  copy_owned "$CFG_DIR/.windsurfrules" ".windsurfrules"
  copy_tree_owned "$CFG_DIR/.windsurf/rules"
  copy_tree_owned "$CFG_DIR/.windsurf/workflows"
}

activate_cursor() {
  copy_owned "$CFG_DIR/.cursorrules" ".cursorrules"
  copy_tree_owned "$CFG_DIR/.cursor/rules"
}

activate_claude() {
  copy_owned "$CFG_DIR/CLAUDE.md" "CLAUDE.md"
}

activate_codex() {
  copy_owned "$CFG_DIR/AGENTS.md" "AGENTS.md"
  copy_tree_owned "$CFG_DIR/.codex"
}

activate_copilot() {
  copy_owned "$CFG_DIR/.github/copilot-instructions.md" ".github/copilot-instructions.md"
}

activate_opencode() {
  copy_tree_owned "$CFG_DIR/.opencode"
}

case "$IDE" in
  minimal) ;;
  windsurf) activate_windsurf ;;
  cursor) activate_cursor ;;
  claude) activate_claude ;;
  codex) activate_codex ;;
  copilot) activate_copilot ;;
  opencode) activate_opencode ;;
  all)
    activate_windsurf
    activate_cursor
    activate_claude
    activate_codex
    activate_copilot
    activate_opencode
    ;;
esac

if [ "$CLI_OPTION" != "--no-cli" ]; then
  install_cli
fi

echo "DONE. Maxxy-Agent is ready in $TARGET (IDE: $IDE)."
