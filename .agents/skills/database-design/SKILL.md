---
name: database-design
description: Design or evolve schemas, migrations, constraints, queries, indexes, and backfills while preserving data integrity, deployability, and performance.
---

# Database Design

## Model requirements

Inspect the current schema, migration history, ORM/query conventions, database engine, deployment model, representative access patterns, and applicable `AGENTS.md` instructions. Translate business rules into entities, relationships, lifecycle states, cardinality, nullability, uniqueness, and transactional invariants.

## Plan safe evolution

Prefer database constraints for durable invariants. Design indexes from actual query and ordering needs, considering write cost and selectivity. For existing data, define migration order, compatibility window, backfill strategy, locking risk, rollback or forward-repair path, and validation queries. Never execute destructive changes against shared data without explicit authorization.

Coordinate application contract changes with backend ownership. Avoid speculative fields and indexes. Keep migrations deterministic and ordered according to repository conventions.

## Verify

Validate migration syntax and application on a disposable database when available. Test constraints, representative reads/writes, transaction boundaries, concurrency-sensitive paths, and query plans where performance matters. Report irreversible steps, operational assumptions, and integrity checks.
