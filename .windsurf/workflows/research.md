---
description: Deep autonomous research using Lightpanda headless browser. Use when the agent needs to research tools, libraries, APIs, best practices, or any technical topic in depth. Supports three depth levels — minimal, deep, and super-deep. Invoke with /research.
---

# /research — Auto-Researcher

## Overview

Uses **Lightpanda** — a headless browser built for machines — to fetch, parse, and synthesize web content as clean markdown. No Chrome, no Selenium, no bloat. 10x faster, 16x less RAM, native markdown output.

## Step 0: Ensure Lightpanda Is Installed

Check if Lightpanda is available. If not, install it.

```bash
if ! command -v lightpanda &>/dev/null; then
  echo "Installing Lightpanda..."
  curl -fsSL https://pkg.lightpanda.io/install.sh | bash
  echo "Lightpanda installed."
else
  echo "Lightpanda: $(lightpanda --version 2>&1 | head -1)"
fi
```

Verify it works:
```bash
lightpanda fetch --dump markdown https://example.com 2>/dev/null | head -5
```

If installation fails, report BLOCKED with the error. Do not proceed without a working Lightpanda.

## Step 1: Classify Research Depth

Ask the user OR infer from context:

| Depth | Trigger | Sources | Output |
|-------|---------|---------|--------|
| **Minimal** | Quick lookup, single question | 2-3 pages | Short answer with citations |
| **Deep** | Tool evaluation, API learning | 5-10 pages | Structured report with examples |
| **Super-Deep** | Architecture decision, full landscape survey | 10-20+ pages | Comprehensive dossier with comparisons |

User can specify: `/research deep <topic>` or `/research super-deep <topic>`.
Default: **deep** if not specified.

## Step 2: Build Research Plan

Before fetching anything, plan the research:

```
RESEARCH PLAN
═══════════════════════════════════════════
Topic:       <what we're researching>
Depth:       minimal / deep / super-deep
Objective:   <specific question to answer>

Sources to fetch:
  1. <url> — <why this source>
  2. <url> — <why this source>
  ...

Search queries:
  1. "<query>" — <what this should surface>
  2. "<query>" — <what this should surface>
```

### Source Selection Strategy

**Minimal (2-3 sources):**
- Official docs landing page
- GitHub README
- One tutorial/quickstart

**Deep (5-10 sources):**
- Official docs (getting started + API reference)
- GitHub README + issues (known limitations)
- 2-3 tutorials or blog posts (real-world usage)
- Changelog or release notes (maturity signal)
- Comparison articles (alternatives)

**Super-Deep (10-20+ sources):**
- Everything from Deep, plus:
- Architecture docs / design decisions
- Performance benchmarks
- Community discussions (GitHub Discussions, Stack Overflow)
- Security advisories / CVE history
- Migration guides (if replacing something)
- Case studies / production usage reports
- Competing tools (same analysis for 2-3 alternatives)

## Step 3: Execute Research

### Fetching Pages with Lightpanda

For each source, fetch as markdown:

```bash
lightpanda fetch --dump markdown "<url>" 2>/dev/null
```

**Rules:**
- Respect `robots.txt` — add `--obey-robots` flag when appropriate
- If a page fails, note it and move on. Do not block on one source.
- If a page returns empty/garbage, try the raw HTML fallback:
  ```bash
  lightpanda fetch --dump html "<url>" 2>/dev/null
  ```
- Rate limit: wait 1-2 seconds between fetches to avoid hammering small sites.
- Timeout: skip pages that take >15 seconds.

### For JavaScript-Heavy Pages (SPA, dynamic content)

Start Lightpanda as a CDP server and use it interactively:

```bash
# Start Lightpanda CDP server in background
lightpanda serve --host 127.0.0.1 --port 9222 &
LP_PID=$!

# Wait for server to be ready
sleep 1

# Use via CDP for pages that need JS execution
# (Lightpanda executes JS natively, then converts to markdown)

# Cleanup when done
kill $LP_PID 2>/dev/null
```

### Search Expansion

If initial sources are insufficient:
1. Use web search to find additional sources
2. Follow links discovered in fetched pages (max 2 levels deep)
3. Check GitHub repos for examples, tests, and edge cases

## Step 4: Synthesize Findings

### Minimal Report

```
RESEARCH: <topic>
════════════════════════════

Answer: <direct answer to the question>

Key facts:
  • <fact 1> — [source]
  • <fact 2> — [source]
  • <fact 3> — [source]

Sources:
  [1] <url> — <title>
  [2] <url> — <title>
```

### Deep Report

```
RESEARCH REPORT: <topic>
══════════════════════════════════════════════════

## Summary
<2-3 sentence executive summary>

## What It Is
<description, purpose, core value proposition>

## Key Features
  • <feature 1> — <why it matters>
  • <feature 2> — <why it matters>
  • ...

## Installation & Setup
<exact commands, prerequisites, config>

## Usage Examples
<real code examples from docs/tutorials>

## API / Interface
<key APIs, methods, endpoints, CLI commands>

## Limitations & Known Issues
  • <limitation 1> — <workaround if any>
  • <limitation 2> — <workaround if any>

## Alternatives
| Tool | Pros | Cons | When to Use |
|------|------|------|-------------|
| <alt1> | ... | ... | ... |
| <alt2> | ... | ... | ... |

## Recommendation
<should we use this? when? with what caveats?>

## Sources
  [1] <url> — <what was extracted>
  [2] <url> — <what was extracted>
  ...
```

### Super-Deep Dossier

Everything from Deep Report, plus:

```
## Architecture & Design
<how it works internally, design decisions, trade-offs>

## Performance
<benchmarks, resource usage, scalability characteristics>

## Security Posture
<CVE history, security model, trust boundaries>

## Ecosystem & Community
<GitHub stars/activity, npm downloads, community size, corporate backing>

## Maturity Assessment
| Signal | Status |
|--------|--------|
| Version | <semver, pre-1.0 = caution> |
| Last release | <date> |
| Open issues | <count> |
| Contributors | <count> |
| Test coverage | <if available> |
| Breaking changes | <frequency> |
| Docs quality | <rating: excellent/good/fair/poor> |

## Migration Path
<how to adopt, what to replace, migration steps, rollback plan>

## Competitive Landscape
<detailed comparison matrix of all alternatives>

## Decision Matrix
| Criterion | Weight | <tool1> | <tool2> | <tool3> |
|-----------|--------|---------|---------|---------|
| Performance | 25% | 8/10 | 6/10 | 7/10 |
| DX | 20% | 9/10 | 7/10 | 8/10 |
| Maturity | 20% | 5/10 | 9/10 | 7/10 |
| Security | 15% | 7/10 | 8/10 | 6/10 |
| Community | 10% | 4/10 | 9/10 | 6/10 |
| Cost | 10% | 10/10 | 7/10 | 8/10 |
| **Total** | | **X** | **Y** | **Z** |

## Verdict
<final recommendation with confidence level and reasoning>
```

## Step 5: Cache & Reuse

After research completes, offer to save the report:

```bash
mkdir -p .research
# Save report with timestamp
echo "<report content>" > ".research/<topic>-$(date +%Y%m%d).md"
```

Benefits:
- Avoid re-researching the same topic
- Build a project-level knowledge base
- Other agents can read `.research/` for context

## Advanced: Multi-Topic Research

For super-deep research that compares multiple tools:

1. Research each tool independently (parallel if IDE supports it)
2. Normalize findings into the comparison matrix
3. Apply project-specific weights (ask user or infer from codebase)
4. Produce a single decision document

## Advanced: Recursive Link Following

For super-deep mode, follow references discovered in pages:

```
Depth 0: Initial sources (user-provided or searched)
  ↓ extract links matching topic
Depth 1: Referenced docs, guides, examples
  ↓ extract links matching topic (selective)
Depth 2: Edge cases, advanced usage, known issues
  STOP — do not go deeper
```

Filter rules:
- Only follow links on the same domain or known-good domains (GitHub, MDN, official docs)
- Skip social media, ads, unrelated marketing pages
- Prioritize: docs > tutorials > blog posts > forum threads

## Guardrails

- **Never fetch more than 30 pages** in a single research session
- **Respect robots.txt** — use `--obey-robots` for sites with restrictive policies
- **No credentials** — never pass API keys, tokens, or auth headers in research fetches
- **Sanitize output** — strip tracking parameters, session IDs from URLs before reporting
- **Cite everything** — every claim in the report must link to a source
- **Flag uncertainty** — if sources conflict, note the disagreement explicitly
- **Timeout** — if total research exceeds 5 minutes for minimal, 15 for deep, 30 for super-deep, stop and report what you have

## Completion

Report status:
- **DONE** — Research complete, all sources fetched, report generated
- **DONE_WITH_GAPS** — Some sources failed or were unavailable. Gaps noted.
- **BLOCKED** — Lightpanda not available or critical sources unreachable
