# {Site Name} — Style Reference

> **Source URL:** {https://example.com}
> **Theme:** {light / dark / auto}
> **Last Scraped:** {YYYY-MM-DD}

{Brief description of the site's visual aesthetic — mood, era, style family.}

## Typography

| Role | Font Family | Weight | Size | Line Height | Letter Spacing |
|------|-------------|--------|------|-------------|----------------|
| **Heading 1** | {Inter} | {700} | {48px} | {1.1} | {-0.02em} |
| **Heading 2** | {Inter} | {600} | {36px} | {1.2} | {-0.01em} |
| **Heading 3** | {Inter} | {600} | {24px} | {1.3} | {0} |
| **Body** | {Inter} | {400} | {16px} | {1.6} | {0} |
| **Body Small** | {Inter} | {400} | {14px} | {1.5} | {0} |
| **Caption** | {Inter} | {500} | {12px} | {1.4} | {0.02em} |
| **Button** | {Inter} | {600} | {14px} | {1} | {0.01em} |
| **Nav Link** | {Inter} | {500} | {14px} | {1} | {0} |

**Font Sources:**
- {Google Fonts / self-hosted / system font stack}
- {URL: https://fonts.google.com/specimen/Inter}

## Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| {Primary} | {#6366f1} | {--color-primary} | {Buttons, links, active states} |
| {Primary Hover} | {#4f46e5} | {--color-primary-hover} | {Button hover, link hover} |
| {Background} | {#ffffff} | {--color-bg} | {Page background} |
| {Surface} | {#f8fafc} | {--color-surface} | {Card backgrounds, sections} |
| {Border} | {#e2e8f0} | {--color-border} | {Dividers, card borders, inputs} |
| {Text Primary} | {#0f172a} | {--color-text} | {Headings, body text} |
| {Text Secondary} | {#64748b} | {--color-text-secondary} | {Captions, muted text} |
| {Accent} | {#f59e0b} | {--color-accent} | {Highlights, badges, CTAs} |
| {Success} | {#22c55e} | {--color-success} | {Success states, checkmarks} |
| {Error} | {#ef4444} | {--color-error} | {Error states, destructive actions} |
| {Warning} | {#eab308} | {--color-warning} | {Warning banners} |

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| {--space-xs} | {4px} | {Inline gaps, icon padding} |
| {--space-sm} | {8px} | {Tight spacing, input padding} |
| {--space-md} | {16px} | {Default gap, card padding} |
| {--space-lg} | {24px} | {Section padding, large gaps} |
| {--space-xl} | {32px} | {Section margins} |
| {--space-2xl} | {48px} | {Hero padding} |
| {--space-3xl} | {64px} | {Major section breaks} |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| {--radius-sm} | {4px} | {Badges, tags} |
| {--radius-md} | {8px} | {Buttons, inputs, cards} |
| {--radius-lg} | {12px} | {Modals, large cards} |
| {--radius-xl} | {16px} | {Hero sections, featured cards} |
| {--radius-full} | {9999px} | {Avatars, pills} |

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| {--shadow-sm} | {0 1px 2px rgba(0,0,0,0.05)} | {Subtle lift} |
| {--shadow-md} | {0 4px 6px rgba(0,0,0,0.07)} | {Cards, dropdowns} |
| {--shadow-lg} | {0 10px 15px rgba(0,0,0,0.1)} | {Modals, popovers} |

## Layout

- **Max Width:** {1280px}
- **Grid Columns:** {12}
- **Gutter:** {24px}
- **Container Padding:** {16px mobile / 24px tablet / 32px desktop}

## Breakpoints

| Name | Value | Description |
|------|-------|-------------|
| {sm} | {640px} | {Mobile landscape} |
| {md} | {768px} | {Tablet} |
| {lg} | {1024px} | {Desktop} |
| {xl} | {1280px} | {Wide desktop} |
| {2xl} | {1536px} | {Ultra-wide} |

## Component Patterns

### Buttons
- **Primary:** {bg-primary, text-white, rounded-md, px-4 py-2, hover:bg-primary-hover, transition-colors}
- **Secondary:** {bg-transparent, border border-border, text-text, rounded-md, hover:bg-surface}
- **Ghost:** {bg-transparent, text-text-secondary, hover:text-text, hover:bg-surface}

### Cards
- **Default:** {bg-surface, border border-border, rounded-lg, shadow-sm, p-6}
- **Hover effect:** {hover:shadow-md, transition-shadow}

### Navigation
- **Style:** {fixed / sticky / static}
- **Background:** {bg-bg/80 backdrop-blur-sm}
- **Height:** {64px}

## Animations & Transitions

| Property | Duration | Easing | Usage |
|----------|----------|--------|-------|
| {color, background} | {150ms} | {ease-in-out} | {Hover states} |
| {transform, opacity} | {300ms} | {ease-out} | {Enter animations} |
| {box-shadow} | {200ms} | {ease} | {Card hover lift} |

## Assets Inventory

- **Logo:** {/public/images/logo.svg}
- **Favicon:** {/public/seo/favicon.ico}
- **OG Image:** {/public/seo/og-image.png}
- **Hero Image:** {/public/images/hero.webp}

---

> **Instructions:** Replace all `{placeholder}` values with actual extracted values.
> The web-cloner agent will auto-fill this file via web scraping if left empty.
