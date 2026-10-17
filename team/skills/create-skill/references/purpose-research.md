# Purpose and research workflow

Use this mode when the user describes what a skill should do without supplying a single source skill to reproduce.

## Research route

1. Turn the purpose into focused questions about real user requests, current product or format behavior, operational constraints, common failure modes, and authoritative validation methods.
2. Prefer Brave Search's web search when it is callable; otherwise use an available built-in web search. Use a browser only for interactive, authenticated, JavaScript-rendered, or visual evidence that direct retrieval cannot provide.
3. Prefer primary sources: official product documentation, standards bodies, protocol or format specifications, maintainer documentation, and original research. Cross-check consequential claims against a second primary source when practical.
4. Record each relied-on URL, the access date, the claim it supports, its publication or update date when visible, and any uncertainty. Respect quotation and license limits; summarize instead of copying manuals.

Do not browse to collect generic advice. Research must change the skill's decisions, resources, boundaries, or validation. Never put search or browser credentials, cookies, tokens, or environment secrets in the repository or your output.

## Turn evidence into a workflow

Write representative invocation prompts before authoring, and use them to decide:

- the narrow capability and the misrouting boundary for the description
- the inputs the skill needs and the outputs it should produce
- the decisions that need domain-specific guidance rather than generic competence
- which external facts are stable enough to encode and which should be rechecked at use time
- the required tools, format-specific resources, and safe approval gates
- validation that measures behavior instead of matching prose

Encode only evidence that materially improves execution, and prefer links to authoritative sources over copied documentation. If durable current facts or citations are necessary to use the skill, create a focused `references/research-sources.md`; otherwise keep the source ledger in your completion report.

If search is unavailable, state the evidence limitation and do not invent current guidance. Continue only with repository-grounded or stable knowledge when that still satisfies the requested skill; otherwise report the blocker.
