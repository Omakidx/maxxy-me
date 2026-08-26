---
name: documentation-authoring
description: Create, restructure, or maintain repository-grounded documentation across text, web, API, code-reference, Word, and PDF formats; do not use when product implementation is the primary deliverable.
---

# Documentation Authoring

Produce documentation that is accurate for its intended audience, conforms to the repository's publishing system, and remains verifiable from maintained sources.

## Establish the documentation contract

Before editing, identify or reasonably infer:

- intended audience and the task or decision the document supports
- requested format, destination, publishing or rendering target, and document lifecycle
- required scope, depth, tone, terminology, localization, and accessibility constraints
- authoritative sources and any facts that require current external verification
- acceptance criteria, including builds, linting, links, examples, schemas, and visual rendering

Inspect applicable `AGENTS.md` instructions, nearby documentation, navigation, frontmatter, templates, style configuration, generators, and validation commands. Preserve the existing information architecture and voice unless the request authorizes changing them.

## Choose the correct format workflow

Read [references/format-routing.md](references/format-routing.md) and use only the section matching the requested deliverable. Treat HTML as the document format; HTMX may progressively enhance an HTML documentation experience when the publishing target supports it.

Use an available format-specific skill whenever the deliverable requires specialized artifact tooling, especially DOCX, PDF, Google Docs, diagrams, or rendered website validation. Follow that skill's complete creation and verification requirements.

## Ground every claim

Use this source order:

1. repository code, tests, schemas, configuration, generated interfaces, and runnable behavior
2. user-supplied requirements, designs, source documents, and approved internal references
3. current primary external sources when the fact is unstable, external, uncertain, or explicitly needs citation

Do not browse merely to decorate the document. When web research is necessary, prefer direct search or documentation connectors over browser interaction, use official specifications and maintainer documentation, record source URLs and relevant dates, and separate external claims from repository-derived behavior. Use Chrome only when direct retrieval cannot supply required interactive, authenticated, rendered, or visual evidence. Never expose credentials or perform external writes without authorization.

Do not invent APIs, commands, options, compatibility, output, or operational guarantees. Run examples or validate them against source when practical; otherwise mark them as illustrative or unverified. If the documented product behavior is missing or contradictory, report the mismatch rather than silently changing product code.

## Write for successful use

Lead with the user's task and required context. Make prerequisites, inputs, ordered actions, expected results, failure recovery, limitations, and next steps explicit when they affect success. Use consistent terminology, descriptive headings and links, accessible tables and media alternatives, and code blocks that identify their language or shell.

Avoid duplicated reference truth across multiple pages. Link to the canonical source when repetition would create maintenance drift. Preserve stable anchors and compatibility aliases where existing links may depend on them.

## Validate the actual deliverable

Run the repository's relevant documentation lint, formatter, link checker, schema validator, example tests, type checks, or docs build. Check navigation, anchors, relative paths, assets, and frontmatter. For HTML, inspect semantics, keyboard behavior, responsive layout, and progressive enhancement. For Word and PDF, render and visually inspect the produced pages through the applicable format skill.

Report audience and format assumptions, files changed, sources used, exact validation results, anything intentionally left unverified, and any remaining mismatch between documentation and implementation.
