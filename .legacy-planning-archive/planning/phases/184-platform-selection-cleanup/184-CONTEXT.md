# Phase 184 Context — Platform Selection Cleanup

## Gray Area 1: How to Remove Platform Selection [researched]

**Question:** Should the wizard question be hidden entirely or show Claude as the only option?

**Decision:** Remove the multiselect question entirely and hardcode `["claude"]`. Showing a single-option multiselect is pointless UX.

**Implementation:**

- In `wizard.ts`: remove the platform multiselect prompt (lines ~158-167)
- Hardcode `platforms: ["claude"]` in the config result
- Remove any conditional logic that branches on platform selection

## Gray Area 2: Preset Default Cleanup [researched]

**Question:** Which presets reference non-Claude platforms?

**Decision:** Update all presets (`standard`, `full`, `minimal`) in `presets.ts` to only include `claude`. Remove any `cursor` or `pi` entries from platform arrays.

## Gray Area 3: Directory Creation Cleanup [researched]

**Question:** Where does `.cursor/` and `.pi/` directory creation happen?

**Decision:** Remove all non-Claude directory creation from `generateFiles()` in `files.ts`. This includes `.cursor/`, `.pi/`, and any template copying targeting those directories. Also remove the Cursor/Pi hook installation logic.

**Constraint:** Phase 183 already added `planningOnly` mode to `generateFiles()` — ensure the cleanup doesn't conflict with that change.

## Deferred Ideas

None — this is a pure removal phase.

---

_Context created: 2026-03-17 — auto mode, full-auto oversight_
