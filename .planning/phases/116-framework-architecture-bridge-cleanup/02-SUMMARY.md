---
id: "02"
title: "Fix Cross-Subdirectory __helpers/ Import and Add Observer Schema Drift Check"
phase: 116
status: complete
---

# SUMMARY-116-02: Fix \_\_helpers/ Import and Add Schema Drift Check

## Outcome: Complete

### Changes

1. **Fixed barrel import** in `config-generators.ts` — Changed from `../pi-extensions/__helpers/sanitize` to `../pi-extensions/__helpers`.

2. **Created drift check script** — `scripts/check-observer-schema-drift.ts` compares field names between luca-framework source schemas and observer-local mirrors. Uses structural `ZodObjectLike` interface to handle cross-version Zod compatibility.

3. **Added `check:observer-drift` script** to root `package.json`.

4. **Verified schema exports** — Corrected PascalCase names (`ParsedErrorSchema`, `CheckResultSchema`) and harness path (in `src/harness/`, not `packages/`).

5. **Updated types.ts header** to reference `bun run check:observer-drift`.

### Findings

The drift check correctly detects expected camelCase/snake_case differences between framework schemas (camelCase: `exitCode`, `rawOutput`) and observer mirrors (snake_case: `exit_code`, `raw_output`). This is by design (API convention).

### Verification

- `bunx --bun tsc --noEmit` — clean
- `bun scripts/check-observer-schema-drift.ts` — runs and reports expected drift
