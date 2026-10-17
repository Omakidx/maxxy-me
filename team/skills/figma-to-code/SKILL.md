---
name: figma-to-code
description: Implement a supplied Figma design, node, or visual specification in an existing frontend with measured visual parity, project-native components and tokens, responsive behavior, and accessibility.
display_name: Figma to Code
short_description: Build UI from Figma with measured parity
default_prompt: Use {{skill:figma-to-code}} to implement this Figma node in our existing component system:
---

# Figma to Code

## 1. Acquire the source of truth

- Identify the exact Figma file, page, node, variants, and target viewport. Ask for a node link when you only have a file or page and the target is ambiguous.
- When a Figma MCP server or connector is available, fetch the design context (layout, styles, variables, component properties) and a screenshot of the exact node before coding. Retrieve only the assets and component details the assigned surface needs.
- Without Figma access, work from supplied screenshots and specifications, and list the measurements, states, and variants you cannot verify.

## 2. Map before implementing

- Inspect the repository's framework, component library, design tokens, fonts, asset pipeline, breakpoints, and applicable {{instruction_files}} files.
- Map Figma colors, typography, spacing, radii, shadows, and reusable structures to existing tokens and components. Add a token or component only when nothing existing fits, and say why.
- Treat generated Figma code as reference data, not production architecture.
- Define the component boundary, its props and states (hover, focus, active, disabled, loading, empty, error), responsive rules, asset handling, and interactions. Resolve unclear behavior from sibling variants or project conventions without inventing product scope.

## 3. Implement

- Build the smallest reusable component structure that preserves the design.
- Use semantic HTML, keyboard-operable controls, visible focus, accessible names, sufficient contrast, and reduced-motion handling, even where the design is silent.
- Use the supplied assets. Never approximate real icons or imagery with improvised replacements when source assets exist; export them at the right density and format.

## 4. Verify parity

- Check the target viewport first, then each required breakpoint and interaction state.
- Compare layout, typography, spacing, colors, borders, imagery, overflow, and states against the source screenshot. Side-by-side screenshots are the most reliable check when a browser is available.
- Run the relevant type, lint, component, and build checks.

## Definition of done

- [ ] The node and viewport are identified, and the design context was fetched or its absence stated
- [ ] Tokens and components are reused; any new ones are justified
- [ ] All required states and breakpoints are implemented and checked
- [ ] Accessibility basics hold (semantics, keyboard, focus, names, contrast, reduced motion)
- [ ] Parity is checked, with intentional deviations and asset provenance reported
- [ ] Type, lint, and build checks pass
