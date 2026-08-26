---
name: website-development
description: Build or extend complete website pages and landing experiences, coordinating content, interaction, responsiveness, metadata, accessibility, performance, and production validation.
---

# Website Development

## Frame the site

Inspect the existing project, routes, framework, package scripts, design system, hosting metadata, and applicable `AGENTS.md` instructions. Define the audience, primary action, content hierarchy, required routes or sections, interaction model, and completion checks. Preserve established architecture and package management.

Plan the first viewport around the requested product rather than generic chrome. Use concrete product-specific copy and realistic states. Reuse project tokens and components; add capabilities only when the request requires them.

## Build the experience

Implement semantic landmarks, logical headings, keyboard and touch behavior, responsive layouts from small screens upward, and useful loading, empty, error, and success states. Honor reduced motion and contrast requirements. Set site-specific title, description, social metadata, and assets when branding changes or metadata is missing.

Keep client state minimal and separate browser-only behavior from server concerns. Coordinate APIs, persistence, and deployment through their owning workflows rather than embedding them ad hoc in page components.

## Validate completion

Run the repository's production build and relevant type/lint checks. Verify primary navigation and actions, content accuracy, viewport overflow, accessible labels and focus, metadata/assets, and error-free route responses. Use browser visual testing only when requested or available within the task's authorized workflow. Hand deployment requirements to the deployment workflow after the source is validated.
