# Phase 190 Context — Config Rename: autopilot to lu

## Gray Area 1: Rename Strategy [researched]

**Decision:** Rename `config.autopilot` to `config.lu` in .planning/config.json. Create a `LuConfigSchema` Zod schema for the section. One-version fallback: read `c.lu` first, fall back to `c.autopilot` if not found.

## Gray Area 2: Key Renames [researched]

**Decision:** Rename `skip_uat_in_autopilot` to `skip_uat` within the section. All other keys stay the same.

## Gray Area 3: Scope of References [researched]

**Decision:** Update lu.skill.ts (primary consumer), state machine types/guards/persistence, and any other files that reference `autopilot` config. Observer topology references are out of scope (observer was removed in v4.5.0).

---

_Context created: 2026-03-17 — auto mode, full-auto oversight_
