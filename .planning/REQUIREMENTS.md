# Requirements — v8.4.0 Studio Quality & Bug Fixes

## Overview

Fix 8 bugs and quality issues from the comprehensive Studio audit. All items are scoped to the `packages/luca-studio/` package.

## REQ-01: Fix Jotai Save Callback Crash (P0)

**Source:** S-09/S-10 from `docs/review/studio/04-build-pages.md`, `docs/review/studio/05-config.md`

Jotai primitive atom `set` treats function values as updaters. `stores/layout.ts:130` calls `set(_saveCallbackAtom, callback)` which invokes the callback immediately on every page mount, firing `save()` before data loads. Crashes 5 pages (Agents, Skills, Rules, Config, Pipeline).

**Acceptance criteria:**

- Save callback stored correctly (wrapped: `set(atom, () => callback)`)
- No save triggered on page mount
- ETag null guard prevents 428 errors
- Dirty guard prevents unnecessary config saves

## REQ-02: Fix Build Pages Sidebar Collapse (P0)

**Source:** S-08 from `docs/review/studio/04-build-pages.md`

Build pages set `layoutContextAtom = "editor"` which force-collapses the nav rail to 48px. Entity list panel is inaccessible.

**Acceptance criteria:**

- Entity list accessible on all build pages (Agents, Skills, Rules)
- Nav rail remains collapsed (intentional for editor space)
- Entity sidebar panel renders adjacent to collapsed nav rail

## REQ-03: Fix Home Page Field Mismatches (P1)

**Source:** S-01/S-02/S-03 from `docs/review/studio/01-home.md`

Three field-name mismatches: `event` vs `event_type`, missing summary synthesis, `current_phase_id`/`milestone_label` vs actual field names.

**Acceptance criteria:**

- Activity items show correct event types (not "Unknown")
- Summaries synthesized from event_data/state transitions
- Status card shows phase, milestone, and complexity correctly

## REQ-04: Fix Sessions Page Empty Data (P1)

**Source:** S-04/S-05 from `docs/review/studio/02-sessions.md`

Two compounding failures: API filters on `memory_type` (not populated by MuninnDB), vault defaults to `"default"` but session engrams live in repo vault.

**Acceptance criteria:**

- Session engrams visible on Sessions page
- API filter uses `concept.startsWith("session:")` instead of `memory_type`
- Vault defaults to repo vault (from `/api/config`) for session queries

## REQ-05: Fix Git Routes Bun Shell Runtime (P1)

**Source:** Phase 208 live testing

Git routes use `Bun.$` tagged templates but Next.js API routes run in Node.js runtime. All git features (publish, revert, history) return 500.

**Acceptance criteria:**

- Git publish, revert, and history routes work correctly
- Shell commands use Node.js-compatible API (child_process or sidecar delegation)
- No `Bun.$` usage in Next.js API routes

## REQ-06: Fix Memory Metrics & Timeline (P2)

**Source:** S-06/S-07 from `docs/review/studio/03-memory.md`

Memory Browse shows no recall metrics. Timeline shows only 1 event. Both caused by MuninnDB tag prefix filtering mismatch.

**Acceptance criteria:**

- Memory metrics display correctly (client-side prefix filtering)
- Timeline shows historical zone transitions (not single snapshot)
- Observations endpoint returns filtered results correctly

## REQ-07: Extract Localhost Guard Helper (P3)

**Source:** Phase 208 code review (code-simplifier HIGH, security-auditor HIGH)

Localhost host-header guard copy-pasted across 4+ API routes. DRY violation + Host header spoofing concern.

**Acceptance criteria:**

- `isLocalhostRequest()` helper in `~/lib/request-guards.ts`
- All routes use shared helper instead of inline guard
- SIDECAR_URL moved to `~/lib/constants.ts`

## REQ-08: Address Phase 208 Review Findings (P3)

**Source:** Phase 208 code review HIGH findings

5 HIGH-priority code quality items: import grouping, barrel export, duplication, repeated Date calls, node:fs usage.

**Acceptance criteria:**

- Import grouping fixed in compile/route.ts
- ShikiCodeBlock added to barrel export
- entityType-to-domainPlural extracted to single const
- new Date().toISOString() hoisted in compile/route.ts
- node:fs migrated to Bun.file() in entity-route-helpers.ts

---

_Requirements created: 2026-03-27 — v8.4.0 milestone_
