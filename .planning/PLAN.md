# Plan: Luca Mode Display Names

## Objective

Update Luca pipeline mode `.name` fields to include the `luca:` namespace prefix in the TUI display, so users see `luca: Execute`, `luca: Discuss`, etc. instead of generic `Execute`, `Discuss`. Simultaneously consolidate `PIPELINE_STEPS_ORDERED` to derive from mode config objects (closing the PR #138 REVIEW-2.md duplication advisory).

## Context

**Root cause**: MastraTUI uses `mode.name` for badge/picker display (not `mode.id`). Current mode configs define `name: 'Execute'` — TUI shows `execute`. User wants to see the `luca:` namespace prefix in the display.

**Design decision** (full-auto): Use `name: 'luca: Execute'` format — lowercase namespace prefix, colon-space separator, PascalCase role name. This matches the mode ID format (`luca:4-execute`) semantically while being readable.

**Affected areas**:
- 7 Luca-custom mode files (`modes/*.ts`) — NOT stock modes (build, plan, fast)
- `index.ts` — `PIPELINE_STEPS_ORDERED` consolidation (derive labels from mode configs)
- `index.ts` — `buildPipelineProgressHeader` — strip `luca: ` prefix for compact progress bar labels

**Key constraint**: `createStaticAgent({ name: "Execute" })` internal agent names stay unchanged — changing to `"luca: Execute"` would produce `"Luca luca: Execute"` in Mastra's registry (redundant). The `name` param in `createStaticAgent` is internal only, not TUI-visible.

**Branch**: `feat/system-reminder-tui-notifications` (current PR #138)

## Phase 1: Luca Mode Display Names

### Wave 1: Update mode config `.name` fields (7 files)

- [ ] **Task 1.1.1**: Update `modes/triage.ts` name field
  - File: `packages/luca-mastracode/src/modes/triage.ts`
  - Change: `name: 'Triage'` → `name: 'luca: Triage'` (line 73)
  - Verification: File content matches expected after edit; `grep "name: 'luca: Triage'" triage.ts` passes

- [ ] **Task 1.1.2**: Update `modes/research.ts` name field
  - File: `packages/luca-mastracode/src/modes/research.ts`
  - Change: `name: 'Research'` → `name: 'luca: Research'` (line 58)
  - Verification: `grep "name: 'luca: Research'" research.ts` passes

- [ ] **Task 1.1.3**: Update `modes/architect.ts` name field
  - File: `packages/luca-mastracode/src/modes/architect.ts`
  - Change: `name: 'Architect'` → `name: 'luca: Architect'` (line 60)
  - Verification: `grep "name: 'luca: Architect'" architect.ts` passes

- [ ] **Task 1.1.4**: Update `modes/execute.ts` name field
  - File: `packages/luca-mastracode/src/modes/execute.ts`
  - Change: `name: 'Execute'` → `name: 'luca: Execute'` (line 62)
  - Verification: `grep "name: 'luca: Execute'" execute.ts` passes

- [ ] **Task 1.1.5**: Update `modes/review.ts` name field
  - File: `packages/luca-mastracode/src/modes/review.ts`
  - Change: `name: 'Review'` → `name: 'luca: Review'` (line 63)
  - Verification: `grep "name: 'luca: Review'" review.ts` passes

- [ ] **Task 1.1.6**: Update `modes/finalize.ts` name field
  - File: `packages/luca-mastracode/src/modes/finalize.ts`
  - Change: `name: 'Finalize'` → `name: 'luca: Finalize'` (line 59)
  - Verification: `grep "name: 'luca: Finalize'" finalize.ts` passes

- [ ] **Task 1.1.7**: Update `modes/discuss.ts` name field
  - File: `packages/luca-mastracode/src/modes/discuss.ts`
  - Change: `name: 'Discuss'` → `name: 'luca: Discuss'` (line 28)
  - Verification: `grep "name: 'luca: Discuss'" discuss.ts` passes

### Wave 2: Consolidate `PIPELINE_STEPS_ORDERED` and fix progress bar rendering in `index.ts`

- [ ] **Task 1.2.1**: Derive `PIPELINE_STEPS_ORDERED` from mode config imports
  - File: `packages/luca-mastracode/src/index.ts`
  - Change: Replace hardcoded `label:` strings in `PIPELINE_STEPS_ORDERED` (lines 229–236) with values derived from imported mode objects. Since mode `name` will now be `'luca: Execute'` etc., derive the short label by stripping the prefix:
    ```typescript
    const PIPELINE_STEPS_ORDERED = [
      { id: triageMode.id,    label: triageMode.name },
      { id: researchMode.id,  label: researchMode.name },
      { id: architectMode.id, label: architectMode.name },
      { id: executeMode.id,   label: executeMode.name },
      { id: reviewMode.id,    label: reviewMode.name },
      { id: finalizeMode.id,  label: finalizeMode.name },
    ] as const satisfies ReadonlyArray<{ id: string; label: string }>;
    ```
  - Note: Remove `as const` on array (labels become `string` not literal) — use `satisfies` pattern instead for type safety
  - Verification: No TypeScript errors; `PIPELINE_STEPS_ORDERED` correctly derived

- [ ] **Task 1.2.2**: Fix `buildPipelineProgressHeader` to strip `luca: ` prefix for compact display
  - File: `packages/luca-mastracode/src/index.ts`
  - Change: Add a `shortLabel` helper inside `buildPipelineProgressHeader` that strips the `luca: ` prefix for the compact progress bar:
    ```typescript
    function buildPipelineProgressHeader(modeId: string): string {
      const currentIndex = PIPELINE_STEPS_ORDERED.findIndex((s) => s.id === modeId);
      if (currentIndex === -1) return "";

      const step = PIPELINE_STEPS_ORDERED[currentIndex]!;
      const total = PIPELINE_STEPS_ORDERED.length;
      const stepNum = currentIndex + 1;

      // Strip "luca: " prefix for compact display labels
      const shortLabel = (s: { label: string }) => s.label.replace(/^luca: /, '');

      const line1 = `${shortLabel(step).toUpperCase()} MODE  ·  Step ${stepNum} of ${total}`;

      const line2 = PIPELINE_STEPS_ORDERED.map((s, i) => {
        if (i < currentIndex) return `✓ ${shortLabel(s)}`;
        if (i === currentIndex) return `→ ${shortLabel(s)}`;
        return `○ ${shortLabel(s)}`;
      }).join("  ");

      return `${line1}\n${line2}`;
    }
    ```
  - Verification: Progress bar still renders `EXECUTE MODE  ·  Step 4 of 6` and `✓ Triage  ✓ Research  → Execute  ...` (short labels, not `luca: Execute`)

### Wave 3: Verification

- [ ] **Task 1.3.1**: TypeScript compilation check
  - Command: `cd packages/luca-mastracode && bun run typecheck` (or `tsc --noEmit`)
  - Verification: Zero errors

- [ ] **Task 1.3.2**: Spot-check mode name propagation in `index.ts`
  - Verify `triageMode.name` at `index.ts:470` is now `'luca: Triage'` via the mode import
  - Verify `PIPELINE_STEPS_ORDERED` labels are now derived from mode objects
  - Verify `buildPipelineProgressHeader` strips `luca: ` prefix correctly

## Verification Criteria

1. All 7 Luca mode files have `name: 'luca: <Role>'` format
2. Stock modes (build, plan, fast) are unchanged
3. `PIPELINE_STEPS_ORDERED` derives `id` and `label` from imported mode config objects
4. `buildPipelineProgressHeader` produces short labels (strips `luca: ` prefix) for the progress bar
5. `createStaticAgent({ name: "..." })` call sites are **unchanged** (internal names stay short)
6. `tsc --noEmit` passes with zero errors
7. `/mode` listing in TUI will show: `luca:4-execute - luca: Execute` (id - name format)
8. Status badge will show: `luca: execute` (lowercased, clearly branded)

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| TypeScript `as const` on derived array causes type mismatch | Low | Use `satisfies` pattern or remove `as const`, relying on inferred type |
| `buildPipelineProgressHeader` regex strips too aggressively | Low | Regex `^luca: ` anchored to start; only strips exact prefix |
| Stock mode names accidentally changed | None | Explicitly scoped to 7 Luca-specific files only |
| `createStaticAgent` name produces `"Luca luca: Execute"` | None | Explicitly leaving `createStaticAgent` names unchanged |

## Notes

- `PIPELINE_STEPS_ORDERED` was flagged in REVIEW-2.md as a duplication advisory — this change closes it
- The `as const` on `PIPELINE_STEPS_ORDERED` will need to change since labels are now `string` (not string literals). The `buildPipelineProgressHeader` function doesn't rely on literal types, so this is safe. Use `as const satisfies ReadonlyArray<{ id: string; label: string }>` or just remove `as const`.
- The `workflow-state.ts` comment at line 22 ("manually mirror alongside PIPELINE_STEPS_ORDERED in ../index.ts") will remain accurate — that file's `PIPELINE_ORDER` map is still independent and manually maintained (it has different structure/purpose).
