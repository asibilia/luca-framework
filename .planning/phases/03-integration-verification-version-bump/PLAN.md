---
phase: 3
plan: 1
type: chore
autonomous: true
wave: 1
depends_on: ["phase-2"]
---

# Phase 3 Plan 1: Integration Verification + Version Bump

## Objective

Bump version to 5.4.0 and verify the complete branding pipeline works end-to-end. Most verification items are manual (run outside Claude Code).

> Appetite: Micro (minimal code change, verification checklist)

## Context

- @packages/luca-framework/package.json -- version field to bump (currently 5.3.5)

## Tasks

### 1. Version bump to 5.4.0

**Type:** auto
**TDD:** false
**Depends on:** none

Edit `packages/luca-framework/package.json` and change `"version": "5.3.5"` to `"version": "5.4.0"`.

**Files to create/edit:**

- `packages/luca-framework/package.json` (edit -- 1 line changed)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- package.json version reads "5.4.0"

### 2. Run typecheck verification

**Type:** auto
**TDD:** false
**Depends on:** Task 1

Run `bunx --bun tsc --noEmit` and confirm zero errors.

**Verification:**

- Exit code 0, no error output

## Verification

1. `bunx --bun tsc --noEmit` passes
2. `packages/luca-framework/package.json` version is "5.4.0"

## Manual Verification Checklist (for user, outside Claude Code)

These items CANNOT be run in Claude Code and must be verified manually:

- [ ] `bun run build:all` clean build
- [ ] `luca vault:init` with custom prefix creates alias skill
- [ ] `/{prefix}` delegates to `/lu`
- [ ] `/help` shows `/{prefix}` not `/lu`
- [ ] Re-run with different prefix cleans up old alias
- [ ] Default prefix "lu" creates no alias

## Success Criteria

- Version bumped to 5.4.0
- Typecheck passes cleanly
- Manual verification checklist documented for user

## Output Specification

- **Modified:** `packages/luca-framework/package.json` -- version bump to 5.4.0
