# ADR-0001: Share the Progress Codex Runtime with Deep Radar

**Date**: 2026-09-30

**Status**: accepted

## Context

Before integration, Progress and Deep Radar each maintained a separate Codex Home, model configuration, login state, and local execution service. Keeping that isolation would preserve independent configuration, but it would also retain duplicate services and operational setup inside one application.

## Decision

Deep Radar will use the Progress Codex Runtime and model catalog. Deep Radar retains an independent research-model selection, but it does not maintain a separate Codex Home or execution service.

## Consequences

Users configure and authenticate Codex once, and Progress runs only one Codex execution service. Deep Radar can still choose a research model independently from the shared catalog. Changes to the shared provider and model catalog affect every Progress capability, so Deep Radar no longer has provider-level isolation.
