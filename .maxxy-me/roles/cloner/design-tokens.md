# Design Tokens

> Extracted or user-provided design tokens from the target site.
> Tokens are platform-agnostic values that can be consumed by Tailwind, CSS, Figma, or any toolchain.
> The web-cloner agent will populate this from scraped design data if left empty.

## Token Format

Tokens follow the [W3C Design Tokens](https://design-tokens.github.io/community-group/format/) structure.

```json
{
  "color": {
    "primary": {
      "$value": "{#6366f1}",
      "$type": "color",
      "$description": "Main brand color — buttons, links, active states"
    },
    "primary-hover": {
      "$value": "{#4f46e5}",
      "$type": "color",
      "$description": "Primary hover/pressed state"
    },
    "background": {
      "$value": "{#ffffff}",
      "$type": "color",
      "$description": "Page background"
    },
    "foreground": {
      "$value": "{#0f172a}",
      "$type": "color",
      "$description": "Default text color"
    },
    "surface": {
      "$value": "{#f8fafc}",
      "$type": "color",
      "$description": "Card and section backgrounds"
    },
    "border": {
      "$value": "{#e2e8f0}",
      "$type": "color",
      "$description": "Borders, dividers"
    },
    "muted": {
      "$value": "{#64748b}",
      "$type": "color",
      "$description": "Secondary text, captions"
    },
    "accent": {
      "$value": "{#f59e0b}",
      "$type": "color",
      "$description": "Highlights, badges, secondary CTAs"
    },
    "success": {
      "$value": "{#22c55e}",
      "$type": "color",
      "$description": "Success feedback"
    },
    "error": {
      "$value": "{#ef4444}",
      "$type": "color",
      "$description": "Error feedback, destructive actions"
    },
    "warning": {
      "$value": "{#eab308}",
      "$type": "color",
      "$description": "Warning feedback"
    }
  },
  "typography": {
    "font-sans": {
      "$value": "{Inter, ui-sans-serif, system-ui, sans-serif}",
      "$type": "fontFamily"
    },
    "font-heading": {
      "$value": "{Inter, ui-sans-serif, system-ui, sans-serif}",
      "$type": "fontFamily"
    },
    "font-mono": {
      "$value": "{JetBrains Mono, ui-monospace, monospace}",
      "$type": "fontFamily"
    },
    "heading-1": {
      "$value": {
        "fontFamily": "{Inter}",
        "fontWeight": "{700}",
        "fontSize": "{48px}",
        "lineHeight": "{1.1}",
        "letterSpacing": "{-0.02em}"
      },
      "$type": "typography"
    },
    "heading-2": {
      "$value": {
        "fontFamily": "{Inter}",
        "fontWeight": "{600}",
        "fontSize": "{36px}",
        "lineHeight": "{1.2}",
        "letterSpacing": "{-0.01em}"
      },
      "$type": "typography"
    },
    "body": {
      "$value": {
        "fontFamily": "{Inter}",
        "fontWeight": "{400}",
        "fontSize": "{16px}",
        "lineHeight": "{1.6}",
        "letterSpacing": "{0}"
      },
      "$type": "typography"
    },
    "body-small": {
      "$value": {
        "fontFamily": "{Inter}",
        "fontWeight": "{400}",
        "fontSize": "{14px}",
        "lineHeight": "{1.5}",
        "letterSpacing": "{0}"
      },
      "$type": "typography"
    }
  },
  "spacing": {
    "xs": { "$value": "{4px}", "$type": "dimension" },
    "sm": { "$value": "{8px}", "$type": "dimension" },
    "md": { "$value": "{16px}", "$type": "dimension" },
    "lg": { "$value": "{24px}", "$type": "dimension" },
    "xl": { "$value": "{32px}", "$type": "dimension" },
    "2xl": { "$value": "{48px}", "$type": "dimension" },
    "3xl": { "$value": "{64px}", "$type": "dimension" },
    "4xl": { "$value": "{96px}", "$type": "dimension" }
  },
  "borderRadius": {
    "sm": { "$value": "{4px}", "$type": "dimension" },
    "md": { "$value": "{8px}", "$type": "dimension" },
    "lg": { "$value": "{12px}", "$type": "dimension" },
    "xl": { "$value": "{16px}", "$type": "dimension" },
    "full": { "$value": "{9999px}", "$type": "dimension" }
  },
  "shadow": {
    "sm": {
      "$value": "{0 1px 2px rgba(0,0,0,0.05)}",
      "$type": "shadow"
    },
    "md": {
      "$value": "{0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)}",
      "$type": "shadow"
    },
    "lg": {
      "$value": "{0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.05)}",
      "$type": "shadow"
    }
  },
  "transition": {
    "fast": { "$value": "{150ms ease-in-out}", "$type": "duration" },
    "base": { "$value": "{200ms ease-in-out}", "$type": "duration" },
    "slow": { "$value": "{300ms ease-out}", "$type": "duration" }
  }
}
```

## Token Usage Map

| Token | CSS Variable | Tailwind Class | Figma Style |
|-------|-------------|----------------|-------------|
| `color.primary` | `var(--color-primary)` | `text-primary`, `bg-primary` | `Primary/Default` |
| `color.background` | `var(--color-background)` | `bg-background` | `Background/Default` |
| `color.surface` | `var(--color-surface)` | `bg-surface` | `Surface/Default` |
| `color.border` | `var(--color-border)` | `border-border` | `Border/Default` |
| `typography.heading-1` | Multiple vars | `text-5xl font-bold tracking-tight` | `Heading/H1` |
| `typography.body` | Multiple vars | `text-base leading-relaxed` | `Body/Default` |
| `spacing.md` | `var(--space-4)` | `p-4`, `gap-4` | `Spacing/MD` |
| `borderRadius.lg` | `var(--radius-lg)` | `rounded-lg` | `Radius/LG` |

---

> **Instructions:** Replace all `{placeholder}` values with extracted values.
> The web-cloner agent will auto-fill this from web scraping if left empty.
