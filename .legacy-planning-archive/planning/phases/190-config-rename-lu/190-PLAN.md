---
phase: 190
plan: A
type: implementation
autonomous: true
complexity: SIMPLE
---

# Phase 190: Config Rename -- autopilot to lu

## Objective

Rename `config.autopilot` to `config.lu` across the codebase with a Zod schema and one-version backward-compatible fallback. This aligns the config key with the unified `/lu` entry point branding established in v5.1.0.

## Context

- @.planning/config.json (config file with autopilot section)
- @src/skills/luca/lu.skill.ts (reads config.autopilot)
- @packages/luca-framework/src/state/types.ts (autopilot_config field)
- @packages/luca-framework/src/state/guards.ts (reads autopilot_config)
- @packages/luca-framework/src/state/persistence.ts (comments)
- @packages/luca-framework/src/state/events.ts (comments)

## Tasks

### Task 1: Rename autopilot to lu in config.json

- Rename `"autopilot"` key to `"lu"` in `.planning/config.json`
- Rename `"skip_uat_in_autopilot"` to `"skip_uat"`

### Task 2: Create LuConfigSchema Zod schema

- Create `src/shared/__schemas/lu-config.schemas.ts` with full schema and defaults
- Export from shared barrel index

### Task 3: Update lu.skill.ts config reads

- Change `c.autopilot?.X` to `(c.lu ?? c.autopilot)?.X` for fallback
- Change `skip_uat_in_autopilot` to `skip_uat` with fallback

### Task 4: Update state machine references

- Rename `autopilot_config` to `lu_config` in workflow context schema
- Update guards, persistence, events references
- Add fallback in `initializeContext` for old config key
- Update persisted `state.json`
- Remove vestigial autopilot skill manifest entry

### Task 5: Verify and create plan/summary

- Run `bunx --bun tsc --noEmit` to verify
- Create 190-PLAN.md and 190-SUMMARY.md

## Verification

- [ ] `.planning/config.json` has `"lu"` key, not `"autopilot"`
- [ ] `LuConfigSchema` exists with all fields and defaults
- [ ] `lu.skill.ts` reads `c.lu` with `c.autopilot` fallback
- [ ] State machine uses `lu_config`, not `autopilot_config`
- [ ] `initializeContext` falls back from `lu` to `autopilot` in config
- [ ] TypeScript compiles without new errors

## Success Criteria

- REQ-20: config.autopilot renamed to config.lu with LuConfigSchema
- REQ-21: lu.skill.ts reads c.lu with fallback; skip_uat renamed
- REQ-22: State machine types/guards/persistence updated to lu
