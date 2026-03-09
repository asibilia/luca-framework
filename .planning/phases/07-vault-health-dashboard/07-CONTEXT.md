# Phase 07 — Vault Health Dashboard Context

## Vision

An operational health view for MuninnDB vault. This page gives the user a single-glance
understanding of their vault's state: how many engrams, how much storage, coherence
quality, and the breakdown of engram types.

## What's Essential

- Top-level stats cards (engram count, vault count, index size, storage)
- Coherence metrics display when available from the stats endpoint
- Engram type breakdown using the horizontal bar chart pattern from Phase 06
- Storage metrics formatted as human-readable sizes (KB, MB, GB)
- Consistent with all existing Phase 04-06 patterns

## What's Out of Scope

- Real-time polling or WebSocket updates
- Editing vault configuration
- Entity graph visualization (separate page)
- Historical trends / time series charts
