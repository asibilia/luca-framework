# Execute Review Capture — Architecture [Wave 1]

**Subagent**: reviewer
**Perspective**: architecture
**Timestamp**: 2026-04-10T00:14:00Z

## Findings

## Architecture Review — PR #138

### MUST-FIX

- **Triplicated pipeline step registry — three independent sources of truth**
  File: `packages/luca-mastracode/src/index.ts:229–236`

  The pipeline step list is now encoded in **three** separate locations with no shared derivation:
  1. `PIPELINE_ORDER` in `workflow-state.ts:18–25` — linked-list Record mapping each step to its successor
  2. `BARE_TO_NAMESPACED` in `luca-store.ts:99–107` — migration map from bare names to namespaced IDs
  3. `PIPELINE_STEPS_ORDERED` in `index.ts:229–236` — ordered array with display labels (NEW)

  Adding a 7th pipeline step requires updating all three files independently, with no compile-time or runtime check that they stay in sync. `PIPELINE_ORDER` is the authoritative sequencing source but the new `PIPELINE_STEPS_ORDERED` duplicates the ordering and ID set without referencing it.

  Suggested fix: Create a single canonical pipeline registry (e.g., `pipeline-steps.ts`) that defines the ordered list with labels. Derive `PIPELINE_ORDER`, `PIPELINE_STEP_IDS`, `PIPELINE_MODES`, and the label map from that single source.

### SHOULD-FIX

- **`modeId` parameter typed as `string` loses type safety** (`index.ts:250`)
  Derive a `PipelineStepId` union type from the `as const` array and narrow the parameter.

- **`escapeSystemReminderBody` escapes content passed as LLM instructions — semantic mismatch** (`index.ts:274–291`)
  If MastraTUI renders body as raw text (no XML decode), escaped entities show as `&amp;`, `&lt;`, etc. Need to verify MastraTUI's rendering contract. Add a comment documenting which contract is assumed.

- **TUI presentation helpers in 905-line orchestration entrypoint** (`index.ts:225–291`)
  Extract `buildPipelineProgressHeader`, `escapeSystemReminderBody`, `wrapInSystemReminder` into a dedicated `pipeline-tui.ts` module.

### NOTES

- `buildContinuationMessage` switch/case is a 4th location encoding pipeline step knowledge
- `.gitignore` additions appear already present in working tree (diff artifact from prior commit)
- `PIPELINE_STEP_IDS` is `string[]` not a typed tuple — loses literal types from `as const`

### Verdict
REQUEST_CHANGES
