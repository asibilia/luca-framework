---
title: "Migrate remaining 38 skills to state machine bridge"
area: architecture
priority: medium
created: 2026-02-16
source: repo-audit
---

## Context

The state machine bridge (`packages/luca-state/src/bridge.ts`) is the canonical way to read/write workflow state. However, only 6 of 44 skills currently use it. The other 38 still directly read/write `.planning/STATE.md` via grep/sed/heredocs.

## Task

1. Identify all 38 skills that directly read/write STATE.md
2. For each skill, replace STATE.md grep/sed patterns with bridge CLI calls:
   - Read: `bun run packages/luca-state/src/bridge.ts read-status`
   - Write: `bun run packages/luca-state/src/bridge.ts transition <event>`
3. Maintain STATE.md fallback for backward compatibility
4. Test each migrated skill

## Already migrated (6 skills)

- `phase-plan.skill.ts`
- `phase-execute.skill.ts`
- `phase-discuss.skill.ts`
- `progress.skill.ts`
- `quick.skill.ts`
- `autopilot.skill.ts`

## Notes

- This was documented in `.planning/todos/done/migrate-skills-to-state-machine-bridge.md`
- Skills contain bash script content (string literals), not executable TypeScript — the migration involves updating those embedded bash patterns
- Low risk due to fallback pattern (`2>/dev/null || true`)
