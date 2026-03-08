# Plan 11-05 Summary: MODEL_ROUTING_TABLE Preset Consolidation

## Objective

Consolidate the MODEL_ROUTING_TABLE from 36 individual agent entries (each 5+ lines) to 7 named presets with single-line references. Pure DRY refactor with zero behavioral change.

## Tasks Completed

### Task 1: Define named routing presets

- Added 7 named preset constants before MODEL_ROUTING_TABLE:
  - `ALWAYS_FAST` -- fast across all complexity levels (1 agent)
  - `FAST_PROMOTED` -- fast everywhere, balanced at CRITICAL (3 agents)
  - `ROUTER` -- balanced from MODERATE upward (1 agent)
  - `ORCHESTRATOR` -- balanced at SIMPLE/MODERATE, capable at COMPLEX+ (19 agents)
  - `DEEP_ANALYSIS` -- capable from MODERATE upward (10 agents)
  - `DEBUGGER_PRESET` -- balanced at TRIVIAL/SIMPLE, capable from MODERATE+ (1 agent)
  - `ALWAYS_CAPABLE` -- capable at all levels (1 agent)
- Exported `ROUTING_PRESETS` record mapping preset names to their rows
- Added `ROUTING_PRESETS` to the `src/complexity/index.ts` barrel export

### Task 2: Refactor MODEL_ROUTING_TABLE to use presets

- Replaced all 36 individual 5-line agent entries with single-line preset references
- Every agent maps to the exact same tiers as before (verified manually)
- File reduced from ~393 lines to 261 lines (33% reduction)

### Task 3: Update complexity-gating rule documentation

- Replaced the per-category footnoted table with a preset-based summary table
- Shows all 7 presets with their tier mappings and agent groupings
- Added note about upcoming frontmatter override removal in Plan 07
- Updated terminology to use fast/balanced/capable consistently (matching code)

## Files Changed

| File                                          | Change                                        |
| --------------------------------------------- | --------------------------------------------- |
| `src/complexity/__helpers/model-routing.ts`   | Added 7 presets, refactored table to use them |
| `src/complexity/index.ts`                     | Added `ROUTING_PRESETS` to barrel export      |
| `src/rules/general/complexity-gating.rule.ts` | Updated documentation to reference presets    |

## Line Count Reduction

- **Before:** ~393 lines (model-routing.ts)
- **After:** 261 lines (model-routing.ts)
- **Reduction:** ~132 lines (33%)

## Verification Results

- `bunx --bun tsc --noEmit` passes cleanly at each commit
- All 36 agents still present in MODEL_ROUTING_TABLE
- Every agent resolves to identical tiers as before the refactor

## Commits

| Hash       | Message                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| `656084b7` | refactor(11-05): consolidate MODEL_ROUTING_TABLE with named routing presets   |
| `a294a1b3` | docs(11-05): update complexity-gating rule to reference named routing presets |

## Deviations

None. Plan executed as specified.
