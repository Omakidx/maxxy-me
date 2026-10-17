---
name: website-development
description: "Build or extend complete website pages and landing experiences, coordinating content hierarchy, interaction, responsiveness, metadata, accessibility, performance, and production validation."
---

# Website Development

## 1. Frame the site

- Inspect the project's routes, framework, rendering mode (static, server, or client), package scripts, design system, content sources, hosting metadata, and applicable `CLAUDE.md`/`AGENTS.md` files. Preserve the established architecture and package manager.
- Define the audience, the primary action, the content hierarchy, the routes or sections required, the interaction model, and the completion checks.
- Plan the first viewport around the product and its primary action, not generic chrome. Use concrete, product-specific copy; never ship lorem ipsum or invented testimonials, metrics, or customer logos.

## 2. Build the experience

- Use semantic landmarks, a single logical heading outline, keyboard and touch support, and layouts that work from small screens upward.
- Implement loading, empty, error, and success states for anything dynamic. Honor reduced motion and contrast requirements.
- Set the title, description, canonical URL, social metadata, and icons when branding changes or they are missing. Add structured data only when it is accurate.
- Optimize for Core Web Vitals: size images and reserve their space, lazy-load below-the-fold media, avoid layout shift, and keep client JavaScript to what interaction needs.
- Keep client state minimal and browser-only behavior separate from server concerns. Hand APIs, persistence, and deployment to their owning workflows instead of embedding them in page components.

## 3. Validate

- Run the production build and the relevant type and lint checks.
- Verify primary navigation and actions, content accuracy, horizontal overflow at narrow widths, accessible labels and focus order, metadata and assets, and error-free route responses (including 404 handling).
- Use browser or visual testing when it is available within the authorized workflow.
- Hand deployment requirements to the `deployment` skill after the source is validated.

## Definition of done

- [ ] The primary action is clear in the first viewport, and the copy is real and product-specific
- [ ] The page is responsive, with no horizontal overflow, and accessible landmarks, headings, focus, and names
- [ ] All dynamic sections have their states; reduced motion is respected
- [ ] Metadata and assets are set and correct
- [ ] The production build, type, and lint checks pass, and routes respond without errors
