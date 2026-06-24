# Phase 215 Context — Home & Sessions Data Fixes

## Decisions

### Home Page Field Mismatches (REQ-03)

- **S-01 fix:** Change `get(entry, "event", "unknown")` to `get(entry, "event_type", "unknown")` in `use-home-data.ts:83`
- **S-01 constants:** Add state machine event types to `constants.ts` EVENT_TYPES: `START`, `RESET`, `PREFLIGHT_COMPLETE`, `PHASE_STARTED`, `PHASE_COMPLETE`, `VERIFY_PASS`, `field_set`, `ROUTE_COMPLETE`, `DISCUSS_COMPLETE`, `PLAN_COMPLETE`, `COMMIT_COMPLETE`, `LEARN_COMPLETE`
- **S-02 summaries:** Synthesize summary from `event_data` fields. Use `previous_state → current_state` transition as fallback, then `actions_executed` array.
- **S-03 status card:** Change `current_phase_id` → `current_phase` and `milestone_label` → `current_milestone` in `status-card.tsx:58-60`

### Sessions Page Empty Data (REQ-04)

- **S-04 filter:** Replace `e.memory_type === type` with `e.concept?.startsWith(type + ":")` in `engrams/route.ts:43`
- **S-05 vault:** Auto-detect repo vault from `/api/config` on app initialization. Add a `useEffect` in vault store or app layout that fetches config and sets the vault atom if still at default. The config API already returns `muninn.vault` from `.planning/config.json`.

---

_Context created: 2026-03-27 — Phase 215 (SIMPLE complexity)_
