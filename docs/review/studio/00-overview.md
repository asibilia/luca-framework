# Luca Studio Review — Issue Overview

**Date:** 2026-03-27
**App:** Luca Studio (Next.js 15, port 3456)
**Package:** `packages/luca-studio`

## Executive Summary

A comprehensive audit of Luca Studio revealed **6 bug clusters** across 5 sections. The root causes fall into three categories:

1. **Field name mismatches** — Frontend reads fields that don't exist in API responses
2. **Data pipeline gaps** — API filters/queries that return empty results
3. **Component state bugs** — Layout and rendering failures in shared components

## Issue Index

| ID   | Section  | Severity | Summary                                                  | Doc                                      |
| ---- | -------- | -------- | -------------------------------------------------------- | ---------------------------------------- |
| S-01 | Home     | High     | "Unknown" activity items — `event` vs `event_type`       | [01-home.md](./01-home.md)               |
| S-02 | Home     | Medium   | Blank summaries — `summary`/`message` fields don't exist | [01-home.md](./01-home.md)               |
| S-03 | Home     | Medium   | Status card "--" for Phase/Milestone — wrong field paths | [01-home.md](./01-home.md)               |
| S-04 | Sessions | High     | Page always empty — `memory_type` filter never matches   | [02-sessions.md](./02-sessions.md)       |
| S-05 | Sessions | Medium   | Wrong default vault — `"default"` vs repo vault          | [02-sessions.md](./02-sessions.md)       |
| S-06 | Memory   | Medium   | Browse — recall metrics always empty                     | [03-memory.md](./03-memory.md)           |
| S-07 | Memory   | Medium   | Timeline — only 1 event displayed                        | [03-memory.md](./03-memory.md)           |
| S-08 | Build    | Critical | Sidebar permanently collapsed on Agents/Skills/Rules     | [04-build-pages.md](./04-build-pages.md) |
| S-09 | Build    | **P0**   | Jotai save callback bug — `save()` fires on mount        | [04-build-pages.md](./04-build-pages.md) |
| S-10 | Config   | **P0**   | Same Jotai bug — `save()` fires on mount, PUT 500s       | [05-config.md](./05-config.md)           |

## Root Cause Categories

### Category A: Field Name Mismatches (S-01, S-02, S-03)

The frontend was built against an assumed API shape that doesn't match the actual backend schema. The `TransitionRecord` schema in `packages/luca-framework/src/state/types.ts` is the source of truth.

### Category B: Data Pipeline Gaps (S-04, S-05, S-06, S-07)

API route handlers filter on fields that don't exist, or query the wrong vault/data source. The MuninnDB proxy layer needs alignment with how MuninnDB actually returns data.

### Category C: Jotai Functional Updater Bug (S-09, S-10) **CROSS-CUTTING**

`stores/layout.ts:130` calls `set(_saveCallbackAtom, callback)` where `callback` is a function. Jotai's primitive atom `set` treats function values as updaters, so `callback` (i.e., `() => save()`) is **called immediately** instead of being stored. This fires `save()` on every page mount before data loads, crashing Agents, Skills, Rules, Config, and potentially Pipeline pages. **One-line fix in `layout.ts:130`** resolves the crash on all 5 pages.

### Category D: Layout Context (S-08)

Build pages set `layoutContextAtom = "editor"` which force-collapses the nav rail to 48px. This is by design but the entity list panel doesn't compensate for the collapsed state.

## Fix Priority

| Priority | Issues           | Impact                       | Effort                                  |
| -------- | ---------------- | ---------------------------- | --------------------------------------- |
| **P0**   | **S-09, S-10**   | **5 pages crash on mount**   | **Trivial (one line in layout.ts:130)** |
| P0       | S-08             | 3 build pages sidebar broken | Medium (layout rework)                  |
| P1       | S-01, S-02, S-03 | Dashboard misleading         | Low (field renames)                     |
| P1       | S-04, S-05       | Sessions useless             | Low-Medium (filter + vault fix)         |
| P2       | S-06, S-07       | Features incomplete          | Medium (API/query fixes)                |
