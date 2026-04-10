# Execute Review Capture — Simplification [Wave 1]

**Subagent**: reviewer
**Perspective**: simplification
**Timestamp**: 2026-04-10T00:14:00Z

## Findings

## Simplification Review — PR #138

### MUST-FIX

None.

### SHOULD-FIX

- **`PIPELINE_STEP_IDS` is a redundant intermediate constant** (`index.ts:242`)
  Used at exactly one site (line 758). Delete and inline:
  ```ts
  const PIPELINE_STEPS = new Set(PIPELINE_STEPS_ORDERED.map((s) => s.id));
  ```
  The JSDoc comment "ensures the UI header and pipeline guard reference the same authoritative list" is already guaranteed by both referencing `PIPELINE_STEPS_ORDERED` — the intermediate variable adds no extra safety.

- **`escapeSystemReminderBody` is a single-caller private function — premature decomposition** (`index.ts:274–281`)
  Called from exactly one site (`wrapInSystemReminder`). Inline the 5-line `.replace()` chain directly into `wrapInSystemReminder`. If a second call site appears later, trivial to extract back out.

- **`total` and `stepNum` are unnecessary intermediate variables** (`index.ts:255–256`)
  Both are used exactly once in adjacent template literals. Inline them:
  ```ts
  const line1 = `${step.label.toUpperCase()} MODE  ·  Step ${currentIndex + 1} of ${PIPELINE_STEPS_ORDERED.length}`;
  ```

### NOTES

- **`wrapInSystemReminder` is borderline** — called from one site but the name communicates *intent* (why we're wrapping) over *mechanism* (string concatenation). If `escapeSystemReminderBody` is inlined into it, the function body becomes 6 lines with real substance, justifying the named function.

- **Ternary at lines 811-813 is dead-code defensiveness** — the subscriber's guard at line 799 (`state.nextMode === event.modeId`) ensures only pipeline-driven transitions reach the call site. `nextMode` is only ever set to pipeline step IDs. In practice `buildPipelineProgressHeader` always returns a non-empty string here. Defensible to keep as a safety net, but worth documenting.

- **`as const` on `PIPELINE_STEPS_ORDERED`** — harmless but doesn't earn its keep; only `.findIndex()`, `.map()`, `.length` are called on it.

### Verdict
APPROVED
