---
trigger: always
---

# System Architecture Constitution

## Clean Architecture (The Inward Rule)

Dependencies must only point **inward**. An inner layer cannot know about an outer layer.

| Layer | Responsibility | Allowed Dependencies |
|-------|---------------|---------------------|
| **1. Domain/Core** | Entities, pure functions, interfaces | None (strictly isolated) |
| **2. Application** | Use cases, orchestrators, workflows | Domain only |
| **3. Infrastructure** | DB repos, API clients, auth providers | Application, Domain |
| **4. Presentation** | UI components, API controllers, CLI | Infrastructure, Application |

## Data Flow & Validation

- **Zero-Trust Input** — Every external payload validated at the boundary (Zod, Pydantic, JSON Schema).
- **Sanitization** — All strings sanitized before reaching use cases (SQL injection, XSS).
- **DTO Pattern** — Never leak raw DB models. External responses use Data Transfer Objects.
- **Standardized Errors** — Global error handler. Descriptive for devs, sanitized for users.

## State & Communication

- **Single Source of Truth** — Centralized state. No shadow states that drift.
- **Atomic Operations** — All mutations are atomic. Multi-step failures rollback or compensate.
- **Async Offloading** — Long-running tasks to queues/workers. Main thread stays responsive.

## Configuration & Secrets

- **Environment Variables** — All config driven by env vars. Zero hardcoded values.
- **Secret Isolation** — `.env` in `.gitignore`. No secrets in tracked files.
- **Least Privilege** — Code requests minimum permissions for its task.

## Pre-Submit Verification

1. No UI component imported into business logic.
2. Schema validation exists for every new input.
3. Every function has error handling.
4. No function does more than its name implies.
5. Logic testable without mocking entire databases.
