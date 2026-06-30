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

bash -n "$REPO_ROOT/setup.sh" "$REPO_ROOT/maxxy-me/setup.sh"
"$REPO_ROOT/setup.sh" --help >/dev/null
[ "$("$REPO_ROOT/setup.sh" --version)" = "maxxy-me v4.1.0" ] || fail "unexpected version"
pass "entry points parse and expose help/version"

minimal_target="$TMP_ROOT/project with spaces"
mkdir -p "$minimal_target"
HOME="$TMP_ROOT/home-minimal" "$REPO_ROOT/setup.sh" "$minimal_target" minimal --no-cli >/dev/null
assert_directory "$minimal_target/maxxy-me/roles"
assert_directory "$minimal_target/maxxy-me/ide-configs"
assert_file "$minimal_target/maxxy-me/roles/figma-expert.md"
assert_file "$minimal_target/maxxy-me/setup.sh"
assert_file "$minimal_target/FIGMA_DESIGN_MEMORY.md"
assert_file "$minimal_target/maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md"
assert_contains "$minimal_target/FIGMA_DESIGN_MEMORY.md" "strictly forbidden to bypass"
assert_contains "$minimal_target/FIGMA_DESIGN_MEMORY.md" "FIGMA_SYSTEM_DESIGN.md"
assert_contains "$minimal_target/FIGMA_DESIGN_MEMORY.md" "clarifying question"
assert_contains "$minimal_target/FIGMA_DESIGN_MEMORY.md" "Target tech stack"
assert_contains "$minimal_target/maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md" "### Buttons"
assert_contains "$minimal_target/maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md" "unsupported assumptions"
assert_contains "$minimal_target/maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md" "Confirmed target tech stack"
assert_contains "$minimal_target/FIGMA_DESIGN_MEMORY.md" "auto-correct"
assert_absent "$minimal_target/maxxy-me/.source-package"
assert_absent "$minimal_target/maxxy-me/skills"
assert_absent "$minimal_target/maxxy-me/tools"
assert_absent "$minimal_target/AGENTS.md"
pass "fresh minimal install copies the Figma-only package and supports spaces"

invalid_target="$TMP_ROOT/invalid"
mkdir -p "$invalid_target"
if HOME="$TMP_ROOT/home-invalid" "$REPO_ROOT/setup.sh" "$invalid_target" made-up-ide --no-cli >/dev/null 2>&1; then
  fail "invalid IDE unexpectedly succeeded"
fi
assert_absent "$invalid_target/maxxy-me"
pass "invalid IDE fails before changing the target"

unrelated_target="$TMP_ROOT/unrelated"
mkdir -p "$unrelated_target/maxxy-me"
printf '%s\n' 'unrelated data' >"$unrelated_target/maxxy-me/data"
if HOME="$TMP_ROOT/home-unrelated" "$REPO_ROOT/setup.sh" "$unrelated_target" minimal --no-cli >/dev/null 2>&1; then
  fail "installer accepted an unrelated maxxy-me directory"
fi
assert_contains "$unrelated_target/maxxy-me/data" "unrelated data"
pass "installer refuses an unrelated package directory"

source_target="$TMP_ROOT/source-checkout"
mkdir -p "$source_target/maxxy-me"
printf '%s\n' 'source marker' >"$source_target/maxxy-me/.source-package"
if HOME="$TMP_ROOT/home-source" "$REPO_ROOT/setup.sh" --uninstall "$source_target" >/dev/null 2>&1; then
  fail "uninstaller accepted a source checkout"
fi
assert_file "$source_target/maxxy-me/.source-package"
pass "uninstaller refuses to delete a source checkout"

existing_target="$TMP_ROOT/existing"
mkdir -p "$existing_target"
printf '%s\n' 'user-owned instructions' >"$existing_target/AGENTS.md"
HOME="$TMP_ROOT/home-existing" "$REPO_ROOT/setup.sh" "$existing_target" codex --no-cli >/dev/null
assert_contains "$existing_target/AGENTS.md" "user-owned instructions"
assert_file "$existing_target/.codex/instructions.md"
HOME="$TMP_ROOT/home-existing" "$existing_target/maxxy-me/setup.sh" --uninstall "$existing_target" >/dev/null
assert_contains "$existing_target/AGENTS.md" "user-owned instructions"
assert_absent "$existing_target/.codex"
assert_absent "$existing_target/maxxy-me"
pass "pre-existing files survive install and uninstall"

modified_target="$TMP_ROOT/modified"
mkdir -p "$modified_target"
HOME="$TMP_ROOT/home-modified" "$REPO_ROOT/setup.sh" "$modified_target" codex --no-cli >/dev/null
printf '%s\n' 'local AGENTS customization' >>"$modified_target/AGENTS.md"
printf '%s\n' 'local Figma implementation note' >>"$modified_target/FIGMA_DESIGN_MEMORY.md"
HOME="$TMP_ROOT/home-modified" "$modified_target/maxxy-me/setup.sh" --uninstall "$modified_target" >/dev/null
assert_contains "$modified_target/AGENTS.md" "local AGENTS customization"
assert_contains "$modified_target/FIGMA_DESIGN_MEMORY.md" "local Figma implementation note"
pass "uninstall preserves locally modified managed files"

custom_target="$TMP_ROOT/custom-package"
mkdir -p "$custom_target"
HOME="$TMP_ROOT/home-custom" "$REPO_ROOT/setup.sh" "$custom_target" minimal --no-cli >/dev/null
printf '%s\n' 'local figma role customization' >>"$custom_target/maxxy-me/roles/figma-expert.md"
printf '%s\n' '# Custom local role' >"$custom_target/maxxy-me/roles/custom-role.md"
HOME="$TMP_ROOT/home-custom" "$custom_target/maxxy-me/setup.sh" --uninstall "$custom_target" >/dev/null
assert_contains "$custom_target/maxxy-me/roles/figma-expert.md" "local figma role customization"
assert_contains "$custom_target/maxxy-me/roles/custom-role.md" "Custom local role"
pass "uninstall preserves custom and modified package content"

prune_target="$TMP_ROOT/prune"
mkdir -p "$prune_target"
HOME="$TMP_ROOT/home-prune" "$REPO_ROOT/setup.sh" "$prune_target" minimal --no-cli >/dev/null
mkdir -p "$prune_target/maxxy-me/skills"
printf '%s\n' 'legacy debugger' >"$prune_target/maxxy-me/skills/debugger.md"
debugger_checksum="$(sha256sum "$prune_target/maxxy-me/skills/debugger.md" | awk '{print $1}')"
printf '%s\t%s\n' "$debugger_checksum" "skills/debugger.md" >>"$prune_target/maxxy-me/.package-manifest"
printf '%s\n' 'legacy planner' >"$prune_target/maxxy-me/skills/planner.md"
planner_checksum="$(sha256sum "$prune_target/maxxy-me/skills/planner.md" | awk '{print $1}')"
printf '%s\t%s\n' "$planner_checksum" "skills/planner.md" >>"$prune_target/maxxy-me/.package-manifest"
printf '%s\n' 'locally modified obsolete package file' >>"$prune_target/maxxy-me/skills/planner.md"
mkdir -p "$prune_target/maxxy-me/tools"
printf '%s\n' 'legacy git reference' >"$prune_target/maxxy-me/tools/git.md"
git_tool_checksum="$(sha256sum "$prune_target/maxxy-me/tools/git.md" | awk '{print $1}')"
printf '%s\t%s\n' "$git_tool_checksum" "tools/git.md" >>"$prune_target/maxxy-me/.package-manifest"
printf '%s\n' 'legacy docker reference' >"$prune_target/maxxy-me/tools/docker.md"
docker_tool_checksum="$(sha256sum "$prune_target/maxxy-me/tools/docker.md" | awk '{print $1}')"
printf '%s\t%s\n' "$docker_tool_checksum" "tools/docker.md" >>"$prune_target/maxxy-me/.package-manifest"
printf '%s\n' 'locally modified obsolete tool file' >>"$prune_target/maxxy-me/tools/docker.md"
HOME="$TMP_ROOT/home-prune" "$REPO_ROOT/setup.sh" "$prune_target" minimal --no-cli >/dev/null
assert_absent "$prune_target/maxxy-me/skills/debugger.md"
assert_contains "$prune_target/maxxy-me/skills/planner.md" "locally modified obsolete package file"
assert_absent "$prune_target/maxxy-me/tools/git.md"
assert_contains "$prune_target/maxxy-me/tools/docker.md" "locally modified obsolete tool file"
pass "upgrade prunes only unmodified obsolete package files and tool references"

owned_prune_target="$TMP_ROOT/owned-prune"
mkdir -p "$owned_prune_target"
HOME="$TMP_ROOT/home-owned-prune" "$REPO_ROOT/setup.sh" "$owned_prune_target" windsurf --no-cli >/dev/null
printf '%s\n' 'legacy log' >"$owned_prune_target/figma-implementation-log.md"
legacy_log_checksum="$(sha256sum "$owned_prune_target/figma-implementation-log.md" | awk '{print $1}')"
printf '%s\t%s\n' "$legacy_log_checksum" "figma-implementation-log.md" >>"$owned_prune_target/maxxy-me/.install-manifest"
mkdir -p "$owned_prune_target/.windsurf/workflows"
printf '%s\n' 'legacy plan workflow' >"$owned_prune_target/.windsurf/workflows/plan.md"
legacy_plan_checksum="$(sha256sum "$owned_prune_target/.windsurf/workflows/plan.md" | awk '{print $1}')"
printf '%s\t%s\n' "$legacy_plan_checksum" ".windsurf/workflows/plan.md" >>"$owned_prune_target/maxxy-me/.install-manifest"
HOME="$TMP_ROOT/home-owned-prune" "$REPO_ROOT/setup.sh" "$owned_prune_target" windsurf --no-cli >/dev/null
assert_absent "$owned_prune_target/figma-implementation-log.md"
assert_absent "$owned_prune_target/.windsurf/workflows/plan.md"
assert_file "$owned_prune_target/FIGMA_DESIGN_MEMORY.md"
pass "upgrade prunes unmodified obsolete managed root files"

symlink_target="$TMP_ROOT/symlink-target"
symlink_outside="$TMP_ROOT/symlink-outside"
mkdir -p "$symlink_target" "$symlink_outside"
ln -s "$symlink_outside" "$symlink_target/.github"
HOME="$TMP_ROOT/home-symlink" "$REPO_ROOT/setup.sh" "$symlink_target" copilot --no-cli >/dev/null
assert_absent "$symlink_outside/copilot-instructions.md"
HOME="$TMP_ROOT/home-symlink" "$symlink_target/maxxy-me/setup.sh" --uninstall "$symlink_target" >/dev/null
[ -L "$symlink_target/.github" ] || fail "pre-existing parent symlink was removed"
pass "IDE activation cannot escape the project through parent symlinks"

all_target="$TMP_ROOT/all"
mkdir -p "$all_target/nested"
all_home="$TMP_ROOT/home-all"
HOME="$all_home" "$REPO_ROOT/setup.sh" "$all_target" all >/dev/null
assert_file "$all_target/.windsurf/workflows/figma-expert.md"
assert_absent "$all_target/.windsurf/workflows/plan.md"
assert_file "$all_target/.cursor/rules/maxxy-agent.mdc"
assert_file "$all_target/CLAUDE.md"
assert_file "$all_target/AGENTS.md"
assert_file "$all_target/.codex/instructions.md"
assert_file "$all_target/.github/copilot-instructions.md"
assert_file "$all_target/.opencode/rules.md"
assert_contains "$all_target/AGENTS.md" "Auto-correct known Figma translation errors"
assert_contains "$all_target/AGENTS.md" "Mandatory Clarification Gate"
assert_contains "$all_target/AGENTS.md" "target tech stack"
assert_contains "$all_target/.codex/instructions.md" "Mandatory clarification gate"
(cd "$all_target/nested" && HOME="$all_home" "$all_home/.local/bin/maxxy-me" activate cursor >/dev/null)
(cd "$all_target/nested" && HOME="$all_home" "$all_home/.local/bin/maxxy-me" uninstall --remove-cli >/dev/null)
assert_absent "$all_target/maxxy-me"
assert_absent "$all_home/.local/bin/maxxy-me"
pass "all integrations and the global helper complete their lifecycle"

printf '1..%d\n' "$pass_count"
