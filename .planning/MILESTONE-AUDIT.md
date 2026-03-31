# Milestone Audit — v8.6.0 Scout Article Intelligence + Statusline Rework

**Audited:** 2026-03-31
**Phases:** 241-246 (6 phases)
**Files changed:** 50 TypeScript files (212 total including templates)

## Requirements Coverage

| Phase | Goal | Status |
|---|---|---|
| 241 | Scout Foundation — directory structure, state machine, templates, orchestrator | COMPLETE |
| 242 | Per-Article Pipeline — 8 agents/skills for ingest through analysis | COMPLETE |
| 243 | Cross-Cutting Batch — integration, planning, graduation | COMPLETE |
| 244 | UX + Docs — review/deferred commands, documentation | COMPLETE |
| 245 | Fix deepFreeze Zod v4 crash on lazy getters | COMPLETE |
| 246 | Statusline rework — status bus, skill identity, wave counter fix, 27 skill wirings | COMPLETE |

**Score: 6/6 phases complete**

## Integration Check

**Status: PASSED (7/7)**

All integration points verified:
1. Scout orchestrator → sub-skill chain
2. Status bus end-to-end flow (writer → bridge → renderer)
3. deepFreeze Zod v4 fix
4. StatusBusSchema barrel exports
5. Bridge write-status/clear-status registered
6. SET_WAVE_COUNT wired into XState executing state
7. All 27 skills have matching write-status/clear-status

## Code Quality Findings

### HIGH (2)

| # | File | Issue | Suggestion |
|---|---|---|---|
| H1 | bridge.ts:671,1078,1130 | Three inline copies of status bus write logic bypass StatusBusSchema.safeParse — divergent validation from shared helper | Extract private `writeBusAtomic()` helper in bridge.ts; add inline schema validation |
| H2 | bridge.ts:1106-1108 | parseInt on --phase/--wave-current/--wave-total has no NaN guard | Add isNaN checks or rely on schema validation |

### MEDIUM (6)

| # | File | Issue | Suggestion |
|---|---|---|---|
| M1 | status-bus.ts:92 | Uses `import("node:fs/promises").unlink` instead of Bun.file().unlink() | Replace with Bun-native API |
| M2 | bridge.ts:1133 | Same Bun-preference violation for unlink | Replace with Bun.file().unlink() |
| M3 | statusline.ts:34-45 | WorkflowHudStateSchema uses camelCase while StatusBusSchema uses snake_case | Rename to snake_case for consistency |
| M4 | bridge.ts | STATUS_BUS_PATH not extracted as module constant (3 local declarations) | Extract to module-level constant |
| M5 | bridge.ts:1078-1125 | Unvalidated writes allow arbitrary keys to reach disk | Add StatusBusSchema.safeParse before write |
| M6 | bridge.ts:669 | cwd-relative path without project root anchor | Resolve against anchored project root |

### LOW (5)

| # | File | Issue | Suggestion |
|---|---|---|---|
| L1 | status-bus.ts:6 | BUS_PATH not exported; statusline.ts hardcodes same path | Export constant, import in statusline |
| L2 | statusline.ts:19 | Direct __helpers/ import instead of barrel | Import from `../../shared` barrel |
| L3 | bridge.ts:669 | Transition to idle doesn't clear skill/step from bus | Clear on idle transition |
| L4 | status-bus.ts:22-30 | Read-for-merge doesn't validate existing file through schema | safeParse existing before merge |
| L5 | deep-freeze.ts:17 | Getter skip leaves accessor subtrees unfrozen (documented limitation) | Add JSDoc documenting the trade-off |

## Security Assessment

- **Path safety**: statusline.ts cwd validation is correct (slash-suffix prevents prefix-collision)
- **deepFreeze getter skip**: Negligible prototype pollution risk — objects are internally constructed
- **Atomic writes**: tmp+rename pattern is correct throughout
- **JSON parsing**: Zod safeParse at read boundaries prevents injection from reaching display

## Tech Debt

1. Bridge/shared bus write divergence (H1) — bridge can't import shared, so logic is duplicated; needs inline validation
2. Bun-preference gaps (M1, M2) — node:fs/promises unlink used instead of Bun.file().unlink()
3. HUD schema naming (M3) — camelCase/snake_case inconsistency at bus integration boundary

## Verdict

**PASSED** — no CRITICAL findings. 2 HIGH issues are correctness risks in the bridge's CLI arg handling and validation bypass, but the statusline renderer's safeParse on read provides defense-in-depth.

Recommended: close H1+H2 as a quick follow-up before next milestone.

## Gap Closure Status

All 13 findings planned in v8.6.1, plus critical architectural fix:
- **Phase 247** — Bridge hardening (H1, H2, M2, M4, M5, M6, L3)
- **Phase 248** — Shared + renderer cleanup (M1, M3, L1, L2, L4, L5)
- **Phase 249** — Deterministic skill lifecycle hooks (supersedes template-based statusline writes)
- **Phase 250** — Deterministic init/snapshot migration (future deterministic side-effect moves)
