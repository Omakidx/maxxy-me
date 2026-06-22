#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

pass_count=0

pass() {
  pass_count=$((pass_count + 1))
  printf 'ok %d - %s\n' "$pass_count" "$1"
}

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

assert_file() {
  [ -f "$1" ] || fail "expected file: $1"
}

assert_directory() {
  [ -d "$1" ] || fail "expected directory: $1"
}

assert_absent() {
  [ ! -e "$1" ] || fail "expected path to be absent: $1"
}

assert_contains() {
  grep -Fq "$2" "$1" || fail "expected '$2' in $1"
}

bash -n "$REPO_ROOT/setup.sh" "$REPO_ROOT/.maxxy-me/setup.sh"
"$REPO_ROOT/setup.sh" --help >/dev/null
[ "$("$REPO_ROOT/setup.sh" --version)" = "maxxy-agent v3.1.0" ] || fail "unexpected version"
pass "entry points parse and expose help/version"

minimal_target="$TMP_ROOT/project with spaces"
mkdir -p "$minimal_target"
HOME="$TMP_ROOT/home-minimal" "$REPO_ROOT/setup.sh" "$minimal_target" minimal --no-cli >/dev/null
assert_directory "$minimal_target/.maxxy-me/roles"
assert_directory "$minimal_target/.maxxy-me/ide-configs"
assert_file "$minimal_target/.maxxy-me/setup.sh"
assert_file "$minimal_target/team-memory.txt"
assert_absent "$minimal_target/.maxxy-me/.source-package"
assert_absent "$minimal_target/AGENTS.md"
pass "fresh minimal install copies the complete package and supports spaces"

invalid_target="$TMP_ROOT/invalid"
mkdir -p "$invalid_target"
if HOME="$TMP_ROOT/home-invalid" "$REPO_ROOT/setup.sh" "$invalid_target" made-up-ide --no-cli >/dev/null 2>&1; then
  fail "invalid IDE unexpectedly succeeded"
fi
assert_absent "$invalid_target/.maxxy-me"
pass "invalid IDE fails before changing the target"

unrelated_target="$TMP_ROOT/unrelated"
mkdir -p "$unrelated_target/.maxxy-me"
printf '%s\n' 'unrelated data' >"$unrelated_target/.maxxy-me/data"
if HOME="$TMP_ROOT/home-unrelated" "$REPO_ROOT/setup.sh" "$unrelated_target" minimal --no-cli >/dev/null 2>&1; then
  fail "installer accepted an unrelated .maxxy-me directory"
fi
assert_contains "$unrelated_target/.maxxy-me/data" "unrelated data"
pass "installer refuses an unrelated package directory"

source_target="$TMP_ROOT/source-checkout"
mkdir -p "$source_target/.maxxy-me"
printf '%s\n' 'source marker' >"$source_target/.maxxy-me/.source-package"
if HOME="$TMP_ROOT/home-source" "$REPO_ROOT/setup.sh" --uninstall "$source_target" >/dev/null 2>&1; then
  fail "uninstaller accepted a source checkout"
fi
assert_file "$source_target/.maxxy-me/.source-package"
pass "uninstaller refuses to delete a source checkout"

existing_target="$TMP_ROOT/existing"
mkdir -p "$existing_target"
printf '%s\n' 'user-owned instructions' >"$existing_target/AGENTS.md"
HOME="$TMP_ROOT/home-existing" "$REPO_ROOT/setup.sh" "$existing_target" codex --no-cli >/dev/null
assert_contains "$existing_target/AGENTS.md" "user-owned instructions"
assert_file "$existing_target/.codex/instructions.md"
HOME="$TMP_ROOT/home-existing" "$existing_target/.maxxy-me/setup.sh" --uninstall "$existing_target" >/dev/null
assert_contains "$existing_target/AGENTS.md" "user-owned instructions"
assert_absent "$existing_target/.codex"
assert_absent "$existing_target/.maxxy-me"
pass "pre-existing files survive install and uninstall"

modified_target="$TMP_ROOT/modified"
mkdir -p "$modified_target"
HOME="$TMP_ROOT/home-modified" "$REPO_ROOT/setup.sh" "$modified_target" codex --no-cli >/dev/null
printf '%s\n' 'local AGENTS customization' >>"$modified_target/AGENTS.md"
printf '%s\n' 'local team decision' >>"$modified_target/team-memory.txt"
HOME="$TMP_ROOT/home-modified" "$modified_target/.maxxy-me/setup.sh" --uninstall "$modified_target" >/dev/null
assert_contains "$modified_target/AGENTS.md" "local AGENTS customization"
assert_contains "$modified_target/team-memory.txt" "local team decision"
pass "uninstall preserves locally modified managed files"

custom_target="$TMP_ROOT/custom-package"
mkdir -p "$custom_target"
HOME="$TMP_ROOT/home-custom" "$REPO_ROOT/setup.sh" "$custom_target" minimal --no-cli >/dev/null
printf '%s\n' 'local planner customization' >>"$custom_target/.maxxy-me/skills/planner.md"
printf '%s\n' '# Custom role' >"$custom_target/.maxxy-me/roles/custom-role.md"
HOME="$TMP_ROOT/home-custom" "$custom_target/.maxxy-me/setup.sh" --uninstall "$custom_target" >/dev/null
assert_contains "$custom_target/.maxxy-me/skills/planner.md" "local planner customization"
assert_contains "$custom_target/.maxxy-me/roles/custom-role.md" "Custom role"
assert_absent "$custom_target/.maxxy-me/skills/debugger.md"
pass "uninstall preserves custom and modified package content"

symlink_target="$TMP_ROOT/symlink-target"
symlink_outside="$TMP_ROOT/symlink-outside"
mkdir -p "$symlink_target" "$symlink_outside"
ln -s "$symlink_outside" "$symlink_target/.github"
HOME="$TMP_ROOT/home-symlink" "$REPO_ROOT/setup.sh" "$symlink_target" copilot --no-cli >/dev/null
assert_absent "$symlink_outside/copilot-instructions.md"
HOME="$TMP_ROOT/home-symlink" "$symlink_target/.maxxy-me/setup.sh" --uninstall "$symlink_target" >/dev/null
[ -L "$symlink_target/.github" ] || fail "pre-existing parent symlink was removed"
pass "IDE activation cannot escape the project through parent symlinks"

all_target="$TMP_ROOT/all"
mkdir -p "$all_target/nested"
all_home="$TMP_ROOT/home-all"
HOME="$all_home" "$REPO_ROOT/setup.sh" "$all_target" all >/dev/null
assert_file "$all_target/.windsurf/workflows/plan.md"
assert_file "$all_target/.cursor/rules/maxxy-agent.mdc"
assert_file "$all_target/CLAUDE.md"
assert_file "$all_target/AGENTS.md"
assert_file "$all_target/.codex/instructions.md"
assert_file "$all_target/.github/copilot-instructions.md"
assert_file "$all_target/.opencode/rules.md"
(cd "$all_target/nested" && HOME="$all_home" "$all_home/.local/bin/maxxy-me" activate cursor >/dev/null)
(cd "$all_target/nested" && HOME="$all_home" "$all_home/.local/bin/maxxy-me" uninstall --remove-cli >/dev/null)
assert_absent "$all_target/.maxxy-me"
assert_absent "$all_home/.local/bin/maxxy-me"
pass "all integrations and the global helper complete their lifecycle"

printf '1..%d\n' "$pass_count"
