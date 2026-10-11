# ADR-0003: Integrate Hot Radar In Process

**Date**: 2026-10-01

**Status**: accepted

## Context

Hot Radar previously ran as a second Next.js application on port 1315. Progress only linked to that application, so using Reddit monitoring required another server and duplicated the application shell and theme settings.

## Decision

Hot Radar becomes a feature workspace inside Progress under `/hot-radar`. Its pages, Reddit synchronization loop, and extraction endpoints run in the Progress Next.js process. New Reddit data may be fetched only by the weekly system monitor; there is no manual refresh UI or API. The Progress global theme applies to the workspace. Existing Reddit history is migrated into a dedicated `data/hot-radar.sqlite` store rather than merged into the project-management schema, and weekly snapshots remain browsable by date from a right sidebar and by subreddit in the main view.

## Consequences

Opening Hot Radar no longer requires a second frontend or port. Existing ranked posts and extracted text remain available after migration. Users can inspect historical snapshots but cannot force or restart a fetch. The Reddit monitor starts when the Hot Radar workspace or synchronization API is first used, and `REDDIT_PROXY` remains an optional Progress environment setting. Backups must include the Hot Radar database alongside the other Progress data stores.
