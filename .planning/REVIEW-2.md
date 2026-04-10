# REVIEW-2: PR #138 — Code Review

**PR**: feat(luca-mastracode): render pipeline mode transitions as system-reminder TUI boxes  
**Branch**: feat/system-reminder-tui-notifications  
**Review Date**: 2026-04-10  
**Iteration**: 2 (post Copilot review address)  
**Reviewer Perspectives**: Architecture · DX · Security · Simplification

---

## Automated Checks

| Check | Status |
|-------|--------|
| tsc | ✅ Pass (0 errors) |
| Commit count | 3 (feature + 2 fix commits) |
| Open PR threads | 0 (all prior Copilot comments addressed) |

---

## Cross-Perspective Summary

| Perspective | MUST-FIX | SHOULD-FIX | NOTES | Verdict |
|-------------|----------|------------|-------|---------|
| Architecture | 1 | 3 | 3 | REQUEST_CHANGES |
| DX | 0 | 4 | 4 | APPROVED |
| Security | 0 | 2 | 4 | APPROVED |
| Simplification | 0 | 3 | 3 | APPROVED |
| **Consolidated** | **1** | **7 (deduped)** | **5 (deduped)** | **REQUEST_CHANGES** |

---

## MUST-FIX (1)

### MF-1 — Triplicated pipeline step registry [Architecture]

**File**: `packages/luca-mastracode/src/index.ts:229–236`  
**Also affects**: `tools/workflow-state.ts:18–25`, `luca-store.ts:99–107`

The pipeline step list is now independently encoded in **three** places:

1. `PIPELINE_ORDER` (`workflow-state.ts`) — linked-list `Record<modeId, nextModeId>` for step transitions
2. `BARE_TO_NAMESPACED` (`luca-store.ts`) — migration map for rename tracking
3. `PIPELINE_STEPS_ORDERED` (`index.ts`) — ordered `{id, label}` array for TUI display (NEW)

Adding a 7th pipeline step requires updating all three independently, with no compile-time enforcement that they stay synchronized. A step present in `PIPELINE_ORDER` but missing from `PIPELINE_STEPS_ORDERED` silently produces a blank progress header — no error, no warning.

**Suggested fix**: Designate `PIPELINE_STEPS_ORDERED` as the canonical source and derive the others from it. Extract to a shared `pipeline-steps.ts` module (or promote to `workflow-state.ts`). Derive `PIPELINE_ORDER` (step→nextStep linked-list) from the ordered array:

```ts
// pipeline-steps.ts
export const PIPELINE_STEPS_ORDERED = [
  { id: "luca:1-triage",    label: "Triage" },
  // ...
] as const;

export type PipelineStepId = typeof PIPELINE_STEPS_ORDERED[number]["id"];
export const PIPELINE_STEP_IDS = PIPELINE_STEPS_ORDERED.map((s) => s.id);
export const PIPELINE_ORDER: Record<string, string | undefined> =
  Object.fromEntries(
    PIPELINE_STEPS_ORDERED.map((s, i) => [s.id, PIPELINE_STEPS_ORDERED[i + 1]?.id])
  );
```

Note: `BARE_TO_NAMESPACED` in `luca-store.ts` serves a different semantic purpose (migration mapping), so deriving it programmatically may be over-engineering — a comment linking it to the canonical source and a lint rule are likely sufficient.

---

## SHOULD-FIX (7 deduped)

### SF-1 — `escapeSystemReminderBody` over-escapes LLM instruction content [Architecture / DX / Security — cross-cutting]

**File**: `packages/luca-mastracode/src/index.ts:274–291` + call site at `391`

`escapeSystemReminderBody` HTML-encodes ALL `<` and `>` characters in the body. However, `buildContinuationMessage` produces content with literal angle brackets used as option syntax — e.g., at line 391:

```ts
`4. IMMEDIATELY call workflowState(action: "switch-mode", targetMode: "<luca:2-research|luca:3-architect>")`
```

After escaping, the triage agent sees `&lt;luca:2-research|luca:3-architect&gt;` in its kick-off message. If MastraTUI does **not** HTML-decode the system-reminder body before displaying it to the agent, the LLM reads corrupted instructions.

The `</system-reminder>` injection protection only requires escaping sequences that would close the XML tag, not all angle brackets.

**Suggested fix**: Replace broad XML escaping with targeted closing-tag sanitization:

```ts
function escapeSystemReminderBody(body: string): string {
  // Only prevent </system-reminder> from closing the tag prematurely.
  // Full XML escaping corrupts angle-bracket content in LLM instructions.
  return body.replace(/<\/system-reminder>/gi, "<\\/system-reminder>");
}
```

Alternatively, verify MastraTUI's rendering contract: if it HTML-decodes entities before showing to the agent, the current broad escape is safe (and the JSDoc should document this).

### SF-2 — `PIPELINE_STEP_IDS` is a redundant intermediate constant [Architecture / Simplification]

**File**: `packages/luca-mastracode/src/index.ts:242`

Used at exactly one site (line 758). Inline:
```ts
const PIPELINE_STEPS = new Set(PIPELINE_STEPS_ORDERED.map((s) => s.id));
```

### SF-3 — `modeId` parameter typed as `string` loses type safety [Architecture]

**File**: `packages/luca-mastracode/src/index.ts:250`

With `PIPELINE_STEPS_ORDERED as const`, a union type is available for free:
```ts
type PipelineStepId = typeof PIPELINE_STEPS_ORDERED[number]["id"];
function buildPipelineProgressHeader(modeId: PipelineStepId | string): string
```
(or just `PipelineStepId` if callers can be narrowed). Catches modeId typos at compile time rather than producing silent empty strings.

### SF-4 — TUI helpers placed in 905-line orchestration entrypoint [Architecture]

**File**: `packages/luca-mastracode/src/index.ts:225–291`

`index.ts` serves as top-level orchestration entrypoint. The 65-line block of TUI formatting functions (`buildPipelineProgressHeader`, `escapeSystemReminderBody`, `wrapInSystemReminder`) is a presentation concern that doesn't belong there. Moving to `pipeline-tui.ts` would improve testability and keep `index.ts` focused on wiring. (Can be done alongside MF-1.)

### SF-5 — Inline `escapeSystemReminderBody` into `wrapInSystemReminder` [Simplification / DX]

**File**: `packages/luca-mastracode/src/index.ts:274–291`

Called from exactly one site. Premature decomposition. Inline the `.replace()` chain. If a second call site appears, trivial to extract. (Note: if SF-1 changes the escape logic to a one-liner, this suggestion becomes even stronger.)

### SF-6 — Inline intermediate variables `total` and `stepNum` [Simplification]

**File**: `packages/luca-mastracode/src/index.ts:255–256`

Both are used exactly once:
```ts
const line1 = `${step.label.toUpperCase()} MODE  ·  Step ${currentIndex + 1} of ${PIPELINE_STEPS_ORDERED.length}`;
```

### SF-7 — JSDoc on `wrapInSystemReminder` missing encoding side-effect warning [DX]

**File**: `packages/luca-mastracode/src/index.ts:283–291`

JSDoc says "escaped to prevent tag-injection" but doesn't document that ALL angle brackets and quotes in the body will be HTML-encoded, affecting readability of any code samples or paths in continuation messages. Should be clarified (or removed if SF-1 is applied and only `</system-reminder>` is escaped).

---

## NOTES (5 deduped)

- **N-1**: `wrapInSystemReminder` is a single-caller function but the name communicates *intent* over *mechanism* — keeping it named is a reasonable trade-off.
- **N-2**: The ternary guard at lines 811-813 is dead-code defensiveness — `state.nextMode` is only set to pipeline step IDs, so `buildPipelineProgressHeader` always returns a non-empty string at the call site. Safe to keep as a safety net, but worth documenting with a comment.
- **N-3**: `buildContinuationMessage` switch/case is a 4th location encoding pipeline step knowledge (alongside the 3 counted in MF-1). Structural context for MF-1.
- **N-4**: No unit tests for pure helper functions. `buildPipelineProgressHeader`, `escapeSystemReminderBody`, `wrapInSystemReminder` are ideal snapshot test candidates.
- **N-5**: Escape ordering is correct: `&` first, preventing double-encoding. Unicode bypass not possible (regex uses ASCII tag name).

---

## Verdict: **REQUEST_CHANGES**

**Blocking**: 1 MUST-FIX (MF-1: triplicated pipeline step registry)

The feature is **functionally correct** and the PR is safe to use as-is — the three step lists are currently identical so no production bug exists today. However, the structural duplication is a maintenance hazard that will silently manifest when the pipeline evolves. The fix is a straightforward extraction/derivation refactor.

**Also recommended before merge**: SF-1 (over-broad escaping of LLM instruction content) — this is a latent correctness bug: if MastraTUI does not HTML-decode system-reminder bodies, the triage agent's kick-off message is currently corrupted.

**Advisory only (ship if time-constrained)**: SF-2 through SF-7.

---

## Recommended Iteration Plan

1. **Extract `PIPELINE_STEPS_ORDERED` to a shared module** and derive `PIPELINE_ORDER` (and optionally `PIPELINE_MODES`) from it — resolves MF-1
2. **Fix `escapeSystemReminderBody`** to use targeted `</system-reminder>` escape only, or verify MastraTUI decodes entities — resolves SF-1
3. **Inline `PIPELINE_STEP_IDS`** at its single usage site — resolves SF-2 (2-line change)
4. Optional: inline `total`/`stepNum` — resolves SF-6 (cosmetic)
5. Optional: move TUI helpers to `pipeline-tui.ts` — resolves SF-4 (if doing MF-1 extraction anyway, this comes for free)
