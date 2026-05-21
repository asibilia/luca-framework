---
title: "Rename-audit skill + finalize claim-verifier extension"
area: pipeline
created: 2026-05-17
priority: high
source: pr-feedback-audit
---

## Task

Rename-audit skill + finalize claim-verifier extension

## Problem

Renames consistently leave stale references that PR reviewers flag as MUST-FIX:
- Stale step cross-references after renumbering
- Zombie exports with stale JSDoc after validator pair splits
- Stale mode names (`luca:5-review` → `luca:3-verify` — PR #249)
- Stale file references (`triage.md` → `plan.md` — PR #249)
- Planning doc drift from shipped schema
- Changeset claims diverging from implementation
- `Phase N: Phase N:` double-prefix from manageRoadmap insert

Pattern across 6+ PRs.

## Recommendations

- **R2.1** New `gh-rename-audit` skill: grep for old name across `.md`, `.ts`, `.test.ts`, `.changeset/*.md`, `ROADMAP.md`, `todos/`, planning artifacts.
- **R2.2** Finalize claim-verifier extension: scan for stale step numbers (`/Step \d+(\.\d+)?/`) when diff touches an instruction file.
- **R2.3** Zombie-export lint: any exported symbol with 0 callers outside its own file flagged at PR-time.
- **R2.4** `manageRoadmap` heading-guard: refuse `Phase N: Phase N:` double-prefix on insert.

## Acceptance

- [ ] `gh-rename-audit` skill exists with documented usage
- [ ] Finalize gate fails on stale `Step N` refs in modified instruction files
- [ ] Zombie-export check integrated into review or finalize
- [ ] manageRoadmap rejects double-prefix headings with clear error

## Memory References

- `01KR4DBFHYGR5FEB6WR0BR3S1A` — stale-step-cross-references-after-renumbering
- `01KREK86JXSV3NZAJ7XRGBWH58` — zombie-export-after-refactor-stale-jsdoc-misdirects
- `01KRESVJX6MMA28B86D9ME32AW` — error-message-blowup-prefix-duplication

## Source

PR feedback audit 2026-05-17 (Theme 2).
