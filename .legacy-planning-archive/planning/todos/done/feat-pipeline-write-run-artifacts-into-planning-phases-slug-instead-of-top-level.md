---
title: "feat(pipeline): write run artifacts into .planning/phases/<slug>/ instead of top-level"
area: pipeline
created: 2026-05-05
priority: medium
source: gh-issue-#220
---

## Task

feat(pipeline): write run artifacts into .planning/phases/<slug>/ instead of top-level

> GitHub Issue: #220 — https://github.com/asibilia/luca-framework/issues/220

## Problem

When the Luca pipeline runs to completion, session artifacts (`CONTEXT.md`, `PLAN.md`, `RESEARCH.md`, `REVIEW-N.md`, `POSTMORTEM.md`, `FINAL-SUMMARY.md`, `SESSION-SUMMARY.md`, `SESSION-ARCHIVE.md`, `PR-BODY.md`, `PR-DRAFT.md`, `verification-wave-N.json`, `shadow-scan-report.json`, `runs/<run-id>/`, etc.) are written directly to the **top level** of `.planning/`.

Issues:
1. Manual archival required — users must `mkdir .planning/phases/<slug>/` and move artifacts after each run.
2. Silent clobbering — next run overwrites prior artifacts.
3. Polluted top level obscures cross-phase state (`ROADMAP.md`, `todos/`, `luca-state.json`).

## Proposed Behavior

Derive a phase slug during triage (`<TICKET-ID>-<kebab-intent>`, falling back to `<YYYYMMDD-HHmm>-<kebab-intent>`) and write all session artifacts into `.planning/phases/<slug>/` from the start.

Top level reserved for shared/cross-phase state: `ROADMAP.md`, `luca-state.json`, `todos/`, runtime lock/metrics files (already gitignored).

## Acceptance Criteria

- [ ] `triage` derives and persists `phaseSlug` in `luca-state.json` (prefer `<TICKET-ID>-<kebab-intent>`, fallback `<YYYYMMDD-HHmm>-<kebab-intent>`).
- [ ] All subsequent phase tools (`research`, `architect`, `execute`, `review`, `finalize`) write artifacts to `.planning/phases/<phaseSlug>/`.
- [ ] `finalize` verifies no session artifacts remain at top-level `.planning/` before releasing the lock; holds lock and prompts on stragglers.
- [ ] Slug collisions append numeric suffix (`-2`, `-3`, …) — never overwrite.
- [ ] Documentation updated (framework README / `.luca/AGENTS.md`).
- [ ] Migration helper (e.g. `luca archive-loose`) for users with in-flight runs at upgrade time.

## Migration / Compatibility

- Existing top-level artifacts continue to work; migration command provides clean path forward.
- Runtime state files (`luca-state.json`, `.pipeline-lock.json`, `state.json`, `session-ledger.jsonl`, `.statusline.json`, `.context-metrics.json`, `.session-end-marker.json`) stay at top level — gitignored runtime state, not session artifacts.
- `ROADMAP.md` and `todos/` stay at top level — cross-phase state.

## References

- Real-world example: [`cadence-group/percent-ui#2599`](https://github.com/cadence-group/percent-ui/pull/2599) — `chore(planning): PT-11089 archive session artifacts` commit (`183080804`) is exactly the bookkeeping a user shouldn't have to do.

