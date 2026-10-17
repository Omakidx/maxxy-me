---
name: documentation-authoring
description: "Create, restructure, or maintain repository-grounded documentation across text, web, API, code-reference, Word, and PDF formats; do not use when product implementation is the primary deliverable."
---

# Documentation Authoring

Produce documentation that is accurate for its audience, fits the repository's publishing system, and stays verifiable from maintained sources.

## 1. Establish the documentation contract

Before editing, identify or reasonably infer:

- the audience and the task or decision the document supports
- the requested format, destination, rendering target, and document lifecycle
- the required scope, depth, tone, terminology, localization, and accessibility constraints
- the authoritative sources, and any facts that need current external verification
- the acceptance criteria, including builds, linting, links, examples, schemas, and visual rendering

Inspect the applicable `CLAUDE.md`/`AGENTS.md` files, nearby documentation, navigation, frontmatter, templates, style configuration, generators, and validation commands. Preserve the existing information architecture and voice unless the request authorizes changing them.

## 2. Choose the format workflow

Read [references/format-routing.md](references/format-routing.md) and use only the section that matches the deliverable. HTML is the document format; HTMX may progressively enhance an HTML documentation experience when the publishing target supports it.

Use an available format-specific skill whenever the deliverable needs specialized tooling, especially DOCX, PDF, slides, Google Docs, diagrams, or rendered-website validation, and follow its creation and verification requirements in full.

## 3. Ground every claim

Use this source order:

1. repository code, tests, schemas, configuration, generated interfaces, and runnable behavior
2. user-supplied requirements, designs, source documents, and approved internal references
3. current primary external sources, when a fact is unstable, external, uncertain, or explicitly needs a citation

Do not browse merely to decorate the document. When web research is necessary, prefer direct search or documentation connectors over browser interaction, use official specifications and maintainer documentation, record source URLs and relevant dates, and keep external claims separate from repository-derived behavior. Never expose credentials or perform external writes without authorization.

Never invent APIs, commands, options, compatibility, output, or operational guarantees. Run examples or validate them against the source when practical; otherwise mark them as illustrative or unverified. If the documented behavior is missing or contradictory, report the mismatch instead of silently changing product code.

## 4. Write for successful use

- Lead with the reader's task and the context they need. Make prerequisites, inputs, ordered steps, expected results, failure recovery, limitations, and next steps explicit wherever they affect success.
- Use consistent terminology, descriptive headings and link text, accessible tables and media alternatives, and code blocks labeled with their language or shell.
- Do not duplicate reference truth across pages; link to the canonical source when repetition would drift. Preserve stable anchors and add redirects or aliases when moving pages that others may link to.

## 5. Validate the actual deliverable

Run the repository's documentation lint, formatter, link checker, schema validator, example tests, type checks, or docs build as applicable. Check navigation, anchors, relative paths, assets, and frontmatter. For HTML, check semantics, keyboard behavior, responsive layout, and progressive enhancement. For Word and PDF, render the pages through the matching format skill and inspect them visually.

## Definition of done

- [ ] Audience, format, and destination are explicit; existing structure and voice are preserved
- [ ] Every command, API, and option is verified against the repository or labeled illustrative
- [ ] Links, anchors, frontmatter, and the docs build or lint pass
- [ ] Visual formats were rendered and inspected
- [ ] The report lists sources, files changed, validation results, and any documentation-versus-implementation mismatch
