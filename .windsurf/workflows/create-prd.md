---
description: Create a Product Requirements Document for a feature or milestone. Use when starting a new feature, defining requirements, or scoping work.
---

# /prd — Product Requirements

## Steps

1. Ask the user for: **Feature Name**, **Problem Statement**, **Target Audience**.

2. Generate the PRD with these sections:
   - **Executive Summary** (Feature, Problem, Objective, Audience)
   - **User Stories** (As a [User], I want [Action] so that [Value])
   - **Functional Requirements** (ID, Requirement, Priority table)
   - **Non-Functional Requirements** (Performance, Scalability, Security, Accessibility)
   - **UX Flow** (Happy path, edge cases, UI components)
   - **Technical Constraints** (Architecture alignment, DB changes, external deps)
   - **Out of Scope** (Explicit exclusions to prevent scope creep)
   - **Success Metrics** (Measurable indicators)

3. Validate:
   - Every requirement is specific and testable.
   - No architectural violations.
   - Edge cases addressed.
   - Security risks noted.

4. Present to user for approval before proceeding to tech design.
