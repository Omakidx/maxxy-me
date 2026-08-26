# Purpose and research workflow

Use this mode when the user describes a skill's intended job without supplying a single source skill to reproduce.

## Research route

1. Turn the purpose into focused questions about real user requests, current product or format behavior, operational constraints, common failure modes, and authoritative validation methods.
2. Prefer Brave Search's web search when callable. If unavailable or unauthenticated, use an available direct built-in web search. Use a browser or Chrome only for interactive, authenticated, JavaScript-rendered, or visual evidence that direct retrieval cannot provide.
3. Prefer primary sources: official product documentation, standards bodies, protocol or format specifications, maintainer documentation, and original research. Cross-check consequential claims with another primary source when practical.
4. Record each relied-on URL, access date, supported claim, publication/update date when visible, and uncertainty. Respect source quotation and license limits; summarize rather than copying manuals.

Do not browse merely to collect generic advice. Research must change the skill's decisions, resources, boundaries, or validation. Never put search or browser credentials, cookies, tokens, or environment secrets in the repository or result.

## Convert evidence into a workflow

Derive representative invocation prompts before authoring. Use them to decide:

- the narrow capability and misrouting boundary for the description
- inputs the skill needs and outputs it should produce
- decisions that require domain-specific guidance rather than generic competence
- which external facts are stable enough to encode and which should be rechecked at use time
- required tools, format-specific resources, and safe approval gates
- validation that measures behavior instead of matching prose

Encode only evidence that materially improves execution. Prefer links to authoritative sources over copied documentation. If durable current facts or citations are necessary to use the skill, create a focused `references/research-sources.md`; otherwise keep the source ledger in the completion report.

If search is unavailable, state the evidence limitation. Do not invent current guidance. Continue only with repository-grounded or stable knowledge when that can still satisfy the requested skill; otherwise report the blocker.
