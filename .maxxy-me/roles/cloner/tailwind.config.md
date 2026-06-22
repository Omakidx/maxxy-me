# Tailwind CSS v4 Configuration

> Auto-generated or user-provided Tailwind configuration extracted from the target site.
> The web-cloner agent will populate this from scraped design data if left empty.

## Theme Tokens (CSS-first, Tailwind v4)

Paste or generate the `@theme` block for your `app/globals.css`:

```css
@import "tailwindcss";

@theme {
  /* ─── Colors ─── */
  --color-primary: {#6366f1};
  --color-primary-hover: {#4f46e5};
  --color-primary-foreground: {#ffffff};

  --color-background: {#ffffff};
  --color-foreground: {#0f172a};

  --color-surface: {#f8fafc};
  --color-surface-foreground: {#1e293b};

  --color-border: {#e2e8f0};
  --color-input: {#e2e8f0};
  --color-ring: {#6366f1};

  --color-muted: {#f1f5f9};
  --color-muted-foreground: {#64748b};

  --color-accent: {#f59e0b};
  --color-accent-foreground: {#ffffff};

  --color-destructive: {#ef4444};
  --color-destructive-foreground: {#ffffff};

  --color-success: {#22c55e};
  --color-warning: {#eab308};

  /* ─── Typography ─── */
  --font-sans: {Inter, ui-sans-serif, system-ui, sans-serif};
  --font-heading: {Inter, ui-sans-serif, system-ui, sans-serif};
  --font-mono: {JetBrains Mono, ui-monospace, monospace};

  /* ─── Border Radius ─── */
  --radius-sm: {4px};
  --radius-md: {8px};
  --radius-lg: {12px};
  --radius-xl: {16px};

  /* ─── Shadows ─── */
  --shadow-sm: {0 1px 2px rgba(0, 0, 0, 0.05)};
  --shadow-md: {0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)};
  --shadow-lg: {0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)};

  /* ─── Spacing (override defaults if site uses non-standard scale) ─── */
  /* --spacing-*: Tailwind v4 uses 4px base by default, override only if needed */

  /* ─── Breakpoints ─── */
  --breakpoint-sm: {640px};
  --breakpoint-md: {768px};
  --breakpoint-lg: {1024px};
  --breakpoint-xl: {1280px};
  --breakpoint-2xl: {1536px};

  /* ─── Animations ─── */
  --animate-fade-in: {fade-in 0.3s ease-out};
  --animate-slide-up: {slide-up 0.4s ease-out};
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

## Dark Mode (if applicable)

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: {#0f172a};
    --color-foreground: {#f8fafc};
    --color-surface: {#1e293b};
    --color-surface-foreground: {#e2e8f0};
    --color-border: {#334155};
    --color-input: {#334155};
    --color-muted: {#1e293b};
    --color-muted-foreground: {#94a3b8};
  }
}
```

## Utility Classes Mapping

Map the target site's custom classes to Tailwind utilities:

| Original Class / Style | Tailwind Equivalent | Notes |
|------------------------|---------------------|-------|
| {.btn-primary} | {bg-primary text-primary-foreground rounded-md px-4 py-2} | {Main CTA button} |
| {.card} | {bg-surface border border-border rounded-lg shadow-sm p-6} | {Standard card} |
| {.section-padding} | {py-16 md:py-24 px-4 md:px-8} | {Section wrapper} |
| {.container} | {max-w-7xl mx-auto px-4 md:px-8} | {Content container} |
| {.heading-1} | {text-5xl font-bold tracking-tight} | {Hero headings} |
| {.body-text} | {text-base text-muted-foreground leading-relaxed} | {Paragraph text} |

---

> **Instructions:** Replace all `{placeholder}` values with extracted values.
> The web-cloner agent will auto-fill this from web scraping if left empty.
