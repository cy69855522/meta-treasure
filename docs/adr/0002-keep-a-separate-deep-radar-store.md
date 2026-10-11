# ADR-0002: Keep a Separate Deep Radar Store

**Date**: 2026-09-30

**Status**: accepted

## Context

After Deep Radar moves into the Progress application, its research sessions could be merged into the existing Progress SQLite database or retained in a dedicated SQLite database. A merged database would reduce the number of files, but it would couple unrelated schemas, migrations, and recovery operations. A dedicated database does not require a separate process or network bridge.

## Decision

Progress and Deep Radar run in one application process but use separate SQLite stores. Existing Deep Radar research sessions are migrated into the dedicated Deep Radar Store inside the Progress project.

## Consequences

Research history can be migrated with minimal transformation, and Deep Radar schema changes remain independent from project-management migrations. Backup and recovery must include both database files, and operations that span both domains cannot rely on a single SQLite transaction.
