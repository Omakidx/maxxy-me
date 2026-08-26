---
name: figma-to-code
description: Implement a supplied Figma design or node in an existing frontend with measured visual parity, project-native components, responsive behavior, and accessibility.
---

# Figma to Code

## Acquire the source of truth

Identify the exact Figma file, page, node, variants, and target viewport. When a Figma connector or MCP is callable, fetch design context and a screenshot for the exact node before coding. Retrieve only the assets and component details needed for the assigned surface. If no integration is callable, use supplied screenshots/specifications and state which measurements or variants cannot be verified.

## Map before implementing

Inspect the repository's framework, component library, tokens, fonts, asset conventions, breakpoints, and applicable `AGENTS.md` files. Map Figma colors, type, spacing, radii, effects, and reusable structures to existing tokens and components. Treat generated Figma code as reference data, not production architecture.

Define the component boundary, states, responsive rules, asset handling, and expected interactions. Resolve unclear behavior from nearby variants or project conventions without inventing new product scope.

## Implement and verify

Build the smallest reusable component structure that preserves the design. Use semantic HTML, keyboard-operable controls, visible focus, accessible names, and reduced-motion handling. Preserve supplied assets; do not approximate real icons or imagery with improvised replacements when source assets exist.

Validate the target viewport first, then required responsive sizes and interaction states. Compare layout, typography, spacing, colors, borders, imagery, overflow, and component states against the source. Run relevant type, lint, component, and build checks. Report parity, intentional deviations, and anything blocked by unavailable Figma context.
