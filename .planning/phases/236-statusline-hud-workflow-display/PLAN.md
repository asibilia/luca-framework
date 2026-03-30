# Phase 236 — Verification Plan: Statusline HUD Workflow Display

**Date:** 2026-03-30
**Complexity:** SIMPLE
**Status:** Implementation already complete — verification pass only

---

## Objective

The Statusline HUD Workflow Display feature is fully implemented in
`src/hooks/scripts/statusline.ts`. This plan confirms correctness, spec compliance, and
code-convention adherence before closing the phase.

No new code is written during this wave. The only external action required before
verification is: **user runs `bun run build:all` outside this Claude Code session** to
regenerate `.claude/statusline.sh` (per MEMORY.md: running `build:all` during a session
crashes the process).

---

## Context

**Source spec:** `.planning/todos/pending/statusline-hud-workflow-display.md`
**Implementation:** `src/hooks/scripts/statusline.ts` (402 lines)
**Discussion output:** `.planning/phases/236-statusline-hud-workflow-display/01-CONTEXT.md`
**Generated artifact (needs rebuild):** `.claude/statusline.sh`

Key finding from the discussion agent: 0 gaps found. All 7 spec steps are present and
correct. TypeScript compiles cleanly. The one divergence (passing `cyan` in the Step 7
call) is a beneficial correction — omitting it would have caused a TypeScript error.

---

## Wave 01: Verify Existing Implementation

### Task 1 — TypeScript Compilation

**Action:** Run `bunx --bun tsc --noEmit` and confirm zero errors.

**Verification criterion:** Exit code 0, no error output. The discussion agent confirmed
this passes; this task re-runs it as the authoritative gate for this wave.

---

### Task 2 — Spec Compliance: All 7 Implementation Steps Present

**Action:** Read `src/hooks/scripts/statusline.ts` and confirm each step from the spec is
present and structurally correct.

| Step | What to confirm                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | `zod` and `lodash/get` imports present                                                                                       |
| 2    | `DisplayStateEnum`, `WorkflowHudStateSchema`, `WorkflowHudState` type, and `readWorkflowState()` present before `main`       |
| 3    | `renderProgressBar` pure function with `total === 0` guard and `\u2588`/`\u2591` characters                                  |
| 4    | `renderHudLine` with idle path (`gray(" ◇ idle")`), active path with icon/phase/state/progress/complexity/milestone segments |
| 5    | `boldYellow` helper defined inside `main`                                                                                    |
| 6    | `readWorkflowState(pd)` called in `main` before git branch resolution                                                        |
| 7    | Two-line output: `hudLine + "\n" + systemLine` when `hudState` is non-null; single-line fallback otherwise                   |

**Verification criterion:** All 7 steps confirmed present in source. The `cyan` helper
passed in the Step 7 call is expected and required (see 01-CONTEXT.md §Step 7 note).

---

### Task 3 — Edge Case Coverage

**Action:** Confirm all four specified edge cases have graceful fallback behavior in the
implementation.

| Edge Case                       | Expected behavior                                                      | Location                              |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `state.json` missing            | `Bun.file().exists()` check returns `null` → single-line output        | `readWorkflowState`                   |
| `value: "idle"` (stateMap miss) | Returns `{ displayState: "idle", icon: "◇" }` → idle HUD line          | `readWorkflowState` stateMap fallback |
| `total_waves: 0`                | `hasWaveData: false` → progress bar segment skipped in `renderHudLine` | `renderHudLine` `hasWaveData` guard   |
| Empty `current_milestone`       | `milestone: ""` → milestone segment skipped                            | `renderHudLine` milestone guard       |

**Verification criterion:** All four cases handled without throwing. Fallback to
`null`/empty string results in graceful degradation (idle line or single-line output).

---

### Task 4 — Schema-First Parsing Patterns

**Action:** Confirm `readWorkflowState` uses `safeParse()` (not `parse()`), returns `null`
on failure, and that no destructuring defaults appear in place of schema defaults.

**Verification criterion:**

- `WorkflowHudStateSchema.safeParse(...)` is called (not `.parse()`)
- On `!result.success`, function returns `null`
- No `= defaultValue` patterns in destructuring of schema output

---

### Task 5 — Lodash `get` for Safe Nested Access

**Action:** Confirm state JSON paths are accessed via `get(raw, 'path', fallback)` rather
than direct dot-notation chaining (which would throw on missing intermediate keys).

**Verification criterion:** All nested accesses on the raw `state.json` object use
`import get from 'lodash/get'` calls with appropriate fallback values.

---

### Task 6 — Graceful Degradation in `readWorkflowState`

**Action:** Confirm the top-level try/catch (or equivalent) in `readWorkflowState` returns
`null` on any exception, ensuring the statusline never crashes due to malformed state.

**Verification criterion:** `readWorkflowState` returns `null` on any error path (file
missing, JSON parse failure, schema validation failure, unexpected exception). The caller
in `main` handles `null` by falling back to single-line output.

---

## Success Criteria

- [ ] `bunx --bun tsc --noEmit` exits with code 0 and zero errors
- [ ] All 7 spec implementation steps are confirmed present in `src/hooks/scripts/statusline.ts`
- [ ] All 4 edge cases have verified graceful fallback behavior
- [ ] `safeParse()` is used (not `parse()`), with `null` returned on any failure
- [ ] Lodash `get` is used for all nested state JSON accesses
- [ ] `readWorkflowState` never throws — returns `null` on all error paths
- [ ] Code follows project conventions: Zod schemas, lodash, functional patterns, no classes

---

## Post-Verification Action (Out of Band)

After this verification wave passes, the user must run `bun run build:all` outside this
Claude Code session to regenerate `.claude/statusline.sh`. Once complete:

1. Start a new Claude Code session
2. Confirm the two-line HUD appears above the existing system statusline
3. Confirm single-line fallback when `state.json` is absent
4. Mark `.planning/todos/pending/statusline-hud-workflow-display.md` complete
5. Close phase 236
