---
title: "Rename config.autopilot to config.lu"
area: config
created: 2026-03-17
source: conversation
---

## Context

v5.1.0 (Phase 182) merged the autopilot skill into lu but deliberately kept the config key as `"autopilot"` for backward compatibility. The milestone audit flagged this as tech debt item #3: "Config key 'autopilot': Backward-compat decision — no deprecation plan exists." Now that `autopilot` no longer exists as a skill, the config section name is confusing and misleading.

## Task

1. Rename `config.autopilot` → `config.lu` in `.planning/config.json`
2. Add a `LuConfigSchema` Zod schema for the section (currently raw JSON property access with inline defaults — violates schema-first-parsing rule)
3. Update `lu.skill.ts` to read from `c.lu` with fallback to `c.autopilot` for one version cycle
4. Rename `skip_uat_in_autopilot` → `skip_uat` (qualifier is meaningless now)
5. Update any other references: state machine types (`packages/luca-framework/src/state/`), luca-observer topology, guard definitions

## Notes

- `lu.skill.ts:283-318` currently reads all settings from `c.autopilot?.` with inline defaults
- `packages/luca-framework/src/state/types.ts`, `events.ts`, `guards.ts`, `persistence.ts` all reference autopilot
- `packages/luca-observer/lib/workflow-topology.ts` references autopilot
- The fallback to `c.autopilot` should be removed in the following milestone
