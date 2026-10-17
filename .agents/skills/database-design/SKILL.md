---
name: database-design
description: "Design or evolve schemas, migrations, constraints, queries, indexes, and backfills while preserving data integrity, deployability with zero or bounded downtime, and performance."
---

# Database Design

## 1. Model the requirements

- Inspect the current schema's source of truth, the migration history, ORM and query conventions, the database engine and version, the deployment model, representative access patterns and data volumes, and the applicable `AGENTS.md` files.
- Translate business rules into entities, relationships, lifecycle states, cardinality, nullability, uniqueness, and transactional invariants.

## 2. Plan a safe evolution

- Prefer database constraints (`NOT NULL`, `UNIQUE`, foreign keys, `CHECK`) for durable invariants, and document any invariant that must stay application-enforced.
- Design indexes from the actual query predicates and orderings, weighing write cost and selectivity.
- For existing data, plan the migration order, the compatibility window between old and new code, the backfill strategy, locking risk, the rollback or forward-repair path, and the validation queries.
- Use expand-and-contract for renames, type changes, and new required columns: add the new shape, dual-write or backfill in batches, switch reads, then remove the old shape in a later release.
- Watch for operations that lock or rewrite large tables (adding non-null columns with defaults on older engines, creating indexes without the engine's concurrent option, changing column types) and choose online alternatives.
- Never execute destructive changes against shared or production data without explicit authorization.
- Coordinate application contract changes with the backend owner. Avoid speculative fields and indexes. Keep migrations deterministic and ordered according to repository conventions.

## 3. Verify

- Validate migration syntax and apply it, and roll it back where supported, on a disposable database when available.
- Test constraints, representative reads and writes, transaction boundaries, and concurrency-sensitive paths.
- Check query plans where performance matters.

## Definition of done

- [ ] Invariants are encoded as constraints or explicitly documented
- [ ] The migration is ordered, deterministic, and safe for the deployment model (locks and downtime considered)
- [ ] The backfill and rollback or forward-repair path is defined
- [ ] The migration was applied (and rolled back where supported) on a disposable database, or the reason it could not be is stated
- [ ] The report lists irreversible steps, operational assumptions, and integrity checks
