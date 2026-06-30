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

role_count="$(find maxxy-me/roles -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
[ "$role_count" -eq 1 ] || fail "expected 1 specialist role, found $role_count"
assert_referenced_path "maxxy-me/roles/figma-expert.md"
assert_referenced_path "maxxy-me/templates/FIGMA_DESIGN_MEMORY.md"
assert_referenced_path "maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md"

frontmatter_name="$(awk -F ': *' '$1 == "name" { print $2; exit }' maxxy-me/roles/figma-expert.md)"
[ "$frontmatter_name" = "figma-expert" ] || fail "figma-expert frontmatter name mismatch"

workflow_count="$(find maxxy-me/ide-configs/.windsurf/workflows -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
[ "$workflow_count" -eq 1 ] || fail "expected 1 canonical Windsurf workflow, found $workflow_count"
assert_referenced_path "maxxy-me/ide-configs/.windsurf/workflows/figma-expert.md"

root_workflow_count="$(find .windsurf/workflows -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')"
[ "$root_workflow_count" -eq 1 ] || fail "expected 1 active Windsurf workflow, found $root_workflow_count"
assert_referenced_path ".windsurf/workflows/figma-expert.md"

if [ -d maxxy-me/skills ] && [ -n "$(find maxxy-me/skills -type f -print -quit)" ]; then
  fail "maxxy-me/skills still contains files"
fi

[ ! -e skills ] || fail "root skills directory still exists"
[ ! -e roles ] || fail "root roles directory still exists"
[ ! -e tools ] || fail "root tools directory still exists"
[ ! -e templates ] || fail "root templates directory still exists"

old_slash_patterns='/plan|/debug|/review|/security|/ship|/prd|/design|/ticket|/autoplan|/research|/team|/create-role|/frontend-dev|/backend-dev|/devops|/ceo|/cto|/qa-engineer|/dba|/tech-lead|/mobile-dev|/security-engineer|/gsap-expert|/auth-expert|/neondb-expert|/accessibility-expert|/code-rabbit-expert|/realtime-systems|/web-cloner'
if rg -n --hidden "$old_slash_patterns" AGENTS.md CLAUDE.md README.md .codex .cursor .cursorrules .github .opencode .windsurf maxxy-me/ide-configs maxxy-me/roles maxxy-me/templates; then
  fail "obsolete slash command reference remains"
fi

stale_patterns='figma-implementation-log|clonner|Team Collaboration|team-memory|Role Registry|OWASP Top 10 \(2021\)|git add -A &&|curl .*\| *(ba)?sh|POSTGRES_PASSWORD: password'
if rg -n --hidden "$stale_patterns" README.md AGENTS.md CLAUDE.md .codex .cursor .cursorrules .github .opencode .windsurf maxxy-me/ide-configs maxxy-me/roles maxxy-me/templates; then
  fail "stale or unsafe content pattern remains"
fi

[ ! -e maxxy-me/tools ] || fail "maxxy-me/tools directory still exists"

for file in \
  maxxy-me/roles/figma-expert.md \
  maxxy-me/templates/FIGMA_DESIGN_MEMORY.md \
  maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md \
  maxxy-me/ide-configs/AGENTS.md \
  maxxy-me/ide-configs/CLAUDE.md \
  maxxy-me/ide-configs/.codex/instructions.md \
  maxxy-me/ide-configs/.cursor/rules/maxxy-agent.mdc \
  maxxy-me/ide-configs/.cursorrules \
  maxxy-me/ide-configs/.github/copilot-instructions.md \
  maxxy-me/ide-configs/.opencode/rules.md \
  maxxy-me/ide-configs/.windsurfrules \
  maxxy-me/ide-configs/.windsurf/rules/core.md \
  maxxy-me/ide-configs/.windsurf/rules/architecture.md \
  maxxy-me/ide-configs/.windsurf/rules/developer.md \
  maxxy-me/ide-configs/.windsurf/rules/security.md \
  maxxy-me/ide-configs/.windsurf/workflows/figma-expert.md; do
  rg -q 'FIGMA_DESIGN_MEMORY\.md' "$file" || fail "$file does not require FIGMA_DESIGN_MEMORY.md"
done

for file in \
  AGENTS.md \
  CLAUDE.md \
  .codex/instructions.md \
  .cursor/rules/maxxy-agent.mdc \
  .cursorrules \
  .github/copilot-instructions.md \
  .opencode/rules.md \
  .windsurfrules \
  .windsurf/rules/core.md \
  .windsurf/rules/architecture.md \
  .windsurf/rules/developer.md \
  .windsurf/rules/security.md \
  .windsurf/workflows/figma-expert.md \
  maxxy-me/roles/figma-expert.md \
  maxxy-me/templates/FIGMA_DESIGN_MEMORY.md \
  maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md \
  maxxy-me/ide-configs/AGENTS.md \
  maxxy-me/ide-configs/CLAUDE.md \
  maxxy-me/ide-configs/.codex/instructions.md \
  maxxy-me/ide-configs/.cursor/rules/maxxy-agent.mdc \
  maxxy-me/ide-configs/.cursorrules \
  maxxy-me/ide-configs/.github/copilot-instructions.md \
  maxxy-me/ide-configs/.opencode/rules.md \
  maxxy-me/ide-configs/.windsurfrules \
  maxxy-me/ide-configs/.windsurf/rules/core.md \
  maxxy-me/ide-configs/.windsurf/rules/architecture.md \
  maxxy-me/ide-configs/.windsurf/rules/developer.md \
  maxxy-me/ide-configs/.windsurf/rules/security.md \
  maxxy-me/ide-configs/.windsurf/workflows/figma-expert.md; do
  rg -q 'FIGMA_SYSTEM_DESIGN\.md' "$file" || fail "$file does not require FIGMA_SYSTEM_DESIGN.md"
done

for file in \
  AGENTS.md \
  CLAUDE.md \
  .codex/instructions.md \
  .cursor/rules/maxxy-agent.mdc \
  .cursorrules \
  .github/copilot-instructions.md \
  .opencode/rules.md \
  .windsurfrules \
  .windsurf/rules/core.md \
  .windsurf/rules/architecture.md \
  .windsurf/rules/developer.md \
  .windsurf/rules/security.md \
  .windsurf/workflows/figma-expert.md \
  maxxy-me/roles/figma-expert.md \
  maxxy-me/templates/FIGMA_DESIGN_MEMORY.md \
  maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md \
  maxxy-me/ide-configs/AGENTS.md \
  maxxy-me/ide-configs/CLAUDE.md \
  maxxy-me/ide-configs/.codex/instructions.md \
  maxxy-me/ide-configs/.cursor/rules/maxxy-agent.mdc \
  maxxy-me/ide-configs/.cursorrules \
  maxxy-me/ide-configs/.github/copilot-instructions.md \
  maxxy-me/ide-configs/.opencode/rules.md \
  maxxy-me/ide-configs/.windsurfrules \
  maxxy-me/ide-configs/.windsurf/rules/core.md \
  maxxy-me/ide-configs/.windsurf/rules/architecture.md \
  maxxy-me/ide-configs/.windsurf/rules/developer.md \
  maxxy-me/ide-configs/.windsurf/rules/security.md \
  maxxy-me/ide-configs/.windsurf/workflows/figma-expert.md; do
  rg -qi 'clarify|clarifying|clarification' "$file" || fail "$file does not require clarification when unclear"
  rg -qi 'unclear|unsupported assumption' "$file" || fail "$file does not forbid unclear unsupported assumptions"
done

for file in \
  AGENTS.md \
  CLAUDE.md \
  .codex/instructions.md \
  .cursor/rules/maxxy-agent.mdc \
  .cursorrules \
  .github/copilot-instructions.md \
  .opencode/rules.md \
  .windsurfrules \
  .windsurf/rules/core.md \
  .windsurf/rules/architecture.md \
  .windsurf/rules/developer.md \
  .windsurf/rules/security.md \
  .windsurf/workflows/figma-expert.md \
  maxxy-me/roles/figma-expert.md \
  maxxy-me/templates/FIGMA_DESIGN_MEMORY.md \
  maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md \
  maxxy-me/ide-configs/AGENTS.md \
  maxxy-me/ide-configs/CLAUDE.md \
  maxxy-me/ide-configs/.codex/instructions.md \
  maxxy-me/ide-configs/.cursor/rules/maxxy-agent.mdc \
  maxxy-me/ide-configs/.cursorrules \
  maxxy-me/ide-configs/.github/copilot-instructions.md \
  maxxy-me/ide-configs/.opencode/rules.md \
  maxxy-me/ide-configs/.windsurfrules \
  maxxy-me/ide-configs/.windsurf/rules/core.md \
  maxxy-me/ide-configs/.windsurf/rules/architecture.md \
  maxxy-me/ide-configs/.windsurf/rules/developer.md \
  maxxy-me/ide-configs/.windsurf/rules/security.md \
  maxxy-me/ide-configs/.windsurf/workflows/figma-expert.md; do
  rg -qi 'tech stack' "$file" || fail "$file does not require target tech stack confirmation"
done

for file in \
  AGENTS.md \
  CLAUDE.md \
  .codex/instructions.md \
  .cursor/rules/maxxy-agent.mdc \
  .cursorrules \
  .github/copilot-instructions.md \
  .opencode/rules.md \
  .windsurfrules \
  .windsurf/rules/core.md \
  .windsurf/rules/architecture.md \
  .windsurf/rules/developer.md \
  .windsurf/rules/security.md \
  .windsurf/workflows/figma-expert.md \
  maxxy-me/roles/figma-expert.md \
  maxxy-me/templates/FIGMA_DESIGN_MEMORY.md \
  maxxy-me/ide-configs/AGENTS.md \
  maxxy-me/ide-configs/CLAUDE.md \
  maxxy-me/ide-configs/.codex/instructions.md \
  maxxy-me/ide-configs/.cursor/rules/maxxy-agent.mdc \
  maxxy-me/ide-configs/.cursorrules \
  maxxy-me/ide-configs/.github/copilot-instructions.md \
  maxxy-me/ide-configs/.opencode/rules.md \
  maxxy-me/ide-configs/.windsurfrules \
  maxxy-me/ide-configs/.windsurf/rules/core.md \
  maxxy-me/ide-configs/.windsurf/rules/architecture.md \
  maxxy-me/ide-configs/.windsurf/rules/developer.md \
  maxxy-me/ide-configs/.windsurf/rules/security.md \
  maxxy-me/ide-configs/.windsurf/workflows/figma-expert.md; do
  rg -qi 'auto-correct' "$file" || fail "$file does not require translation error auto-correction"
  rg -qi 'project standards?' "$file" || fail "$file does not require project-standard correction"
done

rg -q 'strictly forbidden' maxxy-me/roles/figma-expert.md || fail "role does not forbid bypassing design memory"
rg -q 'strictly forbidden to bypass' maxxy-me/templates/FIGMA_DESIGN_MEMORY.md || fail "memory template does not forbid bypass"
rg -q 'before implementation code starts' maxxy-me/roles/figma-expert.md || fail "role does not gate code on system design"
rg -q 'Before any Figma design starts' maxxy-me/roles/figma-expert.md || fail "role does not gate Figma work on tech stack confirmation"
rg -q 'Target tech stack' maxxy-me/templates/FIGMA_DESIGN_MEMORY.md || fail "memory template does not record target tech stack"
rg -q 'Confirmed target tech stack' maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md || fail "system design template does not record confirmed target tech stack"
rg -q '### Buttons' maxxy-me/templates/FIGMA_SYSTEM_DESIGN.md || fail "system design template does not cover buttons"

while IFS= read -r path; do
  assert_referenced_path "$path"
done < <(rg -o --no-filename 'maxxy-me/(roles|templates|ide-configs)/[a-zA-Z0-9_./-]+\.(md|txt)' maxxy-me README.md AGENTS.md CLAUDE.md | sort -u)

while IFS= read -r markdown_file; do
  fence_count="$(rg -c '^```' "$markdown_file" || true)"
  if [ $((fence_count % 2)) -ne 0 ]; then
    fail "$markdown_file has an unclosed fenced code block"
  fi
done < <(find maxxy-me -type f -name '*.md' -print)

for pair in \
  "AGENTS.md maxxy-me/ide-configs/AGENTS.md" \
  "CLAUDE.md maxxy-me/ide-configs/CLAUDE.md" \
  ".github/copilot-instructions.md maxxy-me/ide-configs/.github/copilot-instructions.md" \
  ".codex/instructions.md maxxy-me/ide-configs/.codex/instructions.md" \
  ".cursor/rules/maxxy-agent.mdc maxxy-me/ide-configs/.cursor/rules/maxxy-agent.mdc" \
  ".cursorrules maxxy-me/ide-configs/.cursorrules" \
  ".opencode/rules.md maxxy-me/ide-configs/.opencode/rules.md" \
  ".windsurfrules maxxy-me/ide-configs/.windsurfrules" \
  ".windsurf/workflows/figma-expert.md maxxy-me/ide-configs/.windsurf/workflows/figma-expert.md" \
  ".windsurf/rules/core.md maxxy-me/ide-configs/.windsurf/rules/core.md" \
  ".windsurf/rules/architecture.md maxxy-me/ide-configs/.windsurf/rules/architecture.md" \
  ".windsurf/rules/developer.md maxxy-me/ide-configs/.windsurf/rules/developer.md" \
  ".windsurf/rules/security.md maxxy-me/ide-configs/.windsurf/rules/security.md"; do
  set -- $pair
  cmp -s "$1" "$2" || fail "active and canonical file drifted: $1"
done

if [ "$failures" -ne 0 ]; then
  printf 'FAILED: %d content validation issue(s)\n' "$failures" >&2
  exit 1
fi

printf 'ok - validated Figma-only role, workflows, references, and Markdown fences\n'
