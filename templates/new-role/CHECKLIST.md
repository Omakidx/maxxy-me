# New Role Quality Checklist

Run through this checklist before finalizing a new role.

## File Structure

- [ ] `.maxxy-agent/roles/<role-slug>.md` exists with complete role definition
- [ ] `.windsurf/workflows/<role-slug>.md` exists with workflow wrapper
- [ ] Role added to `AGENTS.md` specialist roles table
- [ ] Role added to `CLAUDE.md` specialist roles table
- [ ] Naming follows convention: kebab-case slug, `/slug` trigger, Title Case title

## Frontmatter

- [ ] `name:` matches file name (without .md)
- [ ] `trigger:` is `/<role-slug>`
- [ ] `role:` is the full role title (e.g., "Senior Redis Engineer")
- [ ] `description:` is 2-4 lines summarizing the role's domain and authority

## Persona Section

- [ ] Specifies seniority level (senior, staff, principal)
- [ ] Names 2-3 mental models the expert thinks in
- [ ] Includes 1-2 personality traits that define operating style
- [ ] Feels like a real human expert, not a generic assistant

## Expertise Section

- [ ] Lists 5-10+ expertise areas with specific tools and concepts
- [ ] Uses bold category names with inline tool/pattern details
- [ ] Grouped into subsections if extensive (>8 areas)
- [ ] Covers the full breadth of the domain (not just basics)

## Decision Lens

- [ ] 4-6 priorities, ranked by importance
- [ ] Each has a name + guiding question
- [ ] Priorities are specific to the domain (not generic advice)

## Canonical Patterns

- [ ] 5-15 patterns with real, copy-paste-ready code/config
- [ ] Each pattern has a clear "when to use" description
- [ ] Includes decision tables for "X vs Y" choices
- [ ] Code examples use proper syntax highlighting
- [ ] No placeholder code — everything should work as-is

## Tools & References

- [ ] Reference table of ecosystem .maxxy-agent/tools/libraries/CLIs
- [ ] Each tool has: name, purpose, when to use it

## Anti-Patterns

- [ ] 10-25 "Do Not" items grouped by category
- [ ] Each names the bad practice AND explains why/what instead
- [ ] Covers the most common real-world mistakes in the domain

## Verification Checklist

- [ ] 8-15 domain-specific quality checks
- [ ] Covers security, performance, correctness, and completeness

## Output Format

- [ ] Structured template for the role's recommendations
- [ ] Field names are specific to the domain
- [ ] Format is scannable (not walls of text)

## Overall Quality

- [ ] Research-backed: based on official docs, agent-skills repos, or standards
- [ ] Sophisticated: covers simple through ultra-complex scenarios
- [ ] Practical: code examples work, commands are real, advice is actionable
- [ ] Opinionated: takes clear stances (e.g., "always use X", "never do Y")
- [ ] No placeholders or TODOs remaining
- [ ] All `<!-- comments -->` removed from final version
