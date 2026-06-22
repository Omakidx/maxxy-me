#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT"

failures=0

fail() {
  printf 'not ok - %s\n' "$1" >&2
  failures=$((failures + 1))
}

assert_referenced_path() {
  local path="$1"
  [ -e "$path" ] || fail "referenced path does not exist: $path"
}

role_count=0
for role_file in .maxxy-me/roles/*.md; do
  role_slug="$(basename "$role_file" .md)"
  [ "$role_slug" = "_team-protocol" ] && continue
  role_count=$((role_count + 1))

  frontmatter_name="$(awk -F ': *' '$1 == "name" { print $2; exit }' "$role_file")"
  [ "$frontmatter_name" = "$role_slug" ] || fail "$role_file frontmatter name does not match its filename"
  rg -q '^## Team Collaboration$' "$role_file" || fail "$role_file has no Team Collaboration section"
  rg -q '^## Connected Tools$' "$role_file" || fail "$role_file has no Connected Tools section"
  assert_referenced_path ".maxxy-me/ide-configs/.windsurf/workflows/$role_slug.md"

  for registry in \
    .maxxy-me/roles/_team-protocol.md \
    .maxxy-me/ide-configs/AGENTS.md \
    .maxxy-me/ide-configs/CLAUDE.md; do
    rg -q "/$role_slug" "$registry" || fail "$role_slug is missing from $registry"
  done
done
[ "$role_count" -eq 18 ] || fail "expected 18 specialist roles, found $role_count"

for skill_file in .maxxy-me/skills/*.md; do
  skill_name="$(awk -F ': *' '$1 == "name" { print $2; exit }' "$skill_file")"
  skill_trigger="$(awk -F ': *' '$1 == "trigger" { print $2; exit }' "$skill_file")"
  [ -n "$skill_name" ] || fail "$skill_file has no frontmatter name"
  [[ "$skill_trigger" == /* ]] || fail "$skill_file has no slash trigger"
  rg -q -- "\`$skill_trigger\`" .maxxy-me/ide-configs/AGENTS.md || fail "$skill_trigger is missing from AGENTS.md"
  rg -q -- "\`$skill_trigger\`" .maxxy-me/ide-configs/CLAUDE.md || fail "$skill_trigger is missing from CLAUDE.md"
done

while IFS= read -r path; do
  assert_referenced_path "$path"
done < <(rg -o --no-filename '\.maxxy-me/(tools|roles|skills)/[a-z0-9_/-]+\.md' .maxxy-me README.md | sort -u)

while IFS= read -r markdown_file; do
  fence_count="$(rg -c '^```' "$markdown_file" || true)"
  if [ $((fence_count % 2)) -ne 0 ]; then
    fail "$markdown_file has an unclosed fenced code block"
  fi
done < <(find .maxxy-me -type f -name '*.md' -print)

stale_patterns='clonner|OWASP Top 10 \(2021\)|git add -A &&|curl .*\| *(ba)?sh|POSTGRES_PASSWORD: password'
if rg -n --hidden "$stale_patterns" .maxxy-me README.md; then
  fail "stale or unsafe content pattern remains"
fi

cmp -s .github/copilot-instructions.md .maxxy-me/ide-configs/.github/copilot-instructions.md || \
  fail "active and canonical Copilot instructions have drifted"

if [ "$failures" -ne 0 ]; then
  printf 'FAILED: %d content validation issue(s)\n' "$failures" >&2
  exit 1
fi

printf 'ok - validated %d roles, skills, references, and Markdown fences\n' "$role_count"
