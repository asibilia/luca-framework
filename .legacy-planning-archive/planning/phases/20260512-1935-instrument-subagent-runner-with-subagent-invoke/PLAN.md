# Plan: Subagent Invocation + Token Cost Telemetry

## Objective

Add `subagent.invoke` and `subagent.complete` telemetry records for every
subagent spawn in the luca pipeline. Adds a `record-subagent` action to
`workflow-state.ts` with a `correlationId` to pair parallel invoke/complete
events. Mode instruction prose instructs agents to call `record-subagent`
before and after each spawn.

> **Working directory for all tasks**: `packages/luca-mastracode/`
> All `src/` paths below resolve relative to that directory.
> All `bun test` commands run from workspace root.

## Context

**Architecture constraint**: Subagents are `HarnessSubagent` definitions
spawned by the Mastra harness — luca has no runner wrapper. The only hook is
the `workflowState` tool, called by mode agents from prose instructions.

**Zod schema** (`recordSubagentAction`):
```ts
z.object({
  action: z.literal('record-subagent'),
  event: z.enum(['invoke', 'complete']),
  role: z.string(),              // subagent id (e.g. 'executor')
  correlationId: z.string(),     // agent-generated; pairs invoke+complete
  inputTokens: z.number().int().nullable().optional(),
  outputTokens: z.number().int().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  success: z.boolean().nullable().optional(),
  model: z.string().nullable().optional(),
})
```
`correlationId` is agent-generated (e.g. `<role>-<ISO-ts-ms>`) before spawn.

**Parallel batch emission protocol** (researcher×5, reviewer×4):
1. Before batch spawn: emit N sequential `subagent.invoke` calls, each with a
   distinct `correlationId` (e.g. `researcher-scope-<ts>`, `researcher-arch-<ts>`).
2. After batch returns: emit N `subagent.complete` calls reusing the matching
   `correlationId`.
This ensures pairing even when the harness returns all results simultaneously.

**Token self-report**: Subagents append
`<!-- usage: {"inputTokens":N,"outputTokens":N,"model":"..."} -->` as the last
line of every response (added to `shared-prefix.ts`). Orchestrator parses the
last 256 bytes of output with a strict regex, validates tokens are non-negative
finite integers ≤ 10_000_000, passes to `record-subagent`. Null accepted if
block absent or malformed.

**TelemetryKind note**: The existing `(string & {})` catch-all already accepts
`'subagent.invoke'`/`'subagent.complete'` at runtime. Adding them as explicit
union variants is documentary — improves IDE completion and grep-ability, but
causes no behavioral change.

**Subagent spawn sites**:
- `execute.md`: executor, verifier, reviewer×4, learner, fix
- `architect.md`: discussion, plan-reviewer
- `research.md`: researcher×5 (parallel batch)
- `review.md`: reviewer×4 (parallel batch)
- `finalize.md`: learner, shadow-scanner

## Phases

### Phase 1: record-subagent action + prose instrumentation

#### Wave 1: Schema + action + manifest (tracer bullet)

- [x] **Task 1.1.1**: Extend `TelemetryKind` union in `telemetry.ts` with
  `'subagent.invoke'` and `'subagent.complete'` as explicit named variants.
  - Files: `packages/luca-mastracode/src/state/telemetry.ts` (L78–86)
  - Verification: `grep "subagent\." packages/luca-mastracode/src/state/telemetry.ts`
    returns both kinds; `bun run tsc --noEmit` clean

- [x] **Task 1.1.2**: Add `record-subagent` action to `workflow-state.ts`.
  Define `recordSubagentAction` Zod schema (see Context). Add `'record-subagent'`
  to `WORKFLOW_STATE_ACTIONS` array. Add switch case: emit `subagent.invoke` or
  `subagent.complete` based on `event`; all fields except `action` go into `meta`;
  clamp `inputTokens`/`outputTokens` with `finiteOrNull`-style guard (reject
  non-finite, negative, >10_000_000 → null).
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts`
  - Verification: `bun test --filter workflow-state-actions` passes with Task 1.3.2 tests

- [x] **Task 1.1.3**: Add `'record-subagent'` to tool-manifest allowlists for
  execute, architect, research, review, finalize.
  - Files: `packages/luca-mastracode/src/tools/tool-manifest.ts`
  - Verification: `grep -c record-subagent packages/luca-mastracode/src/tools/tool-manifest.ts`
    ≥ 5; `bun test --filter preferences-mode-coverage` passes (add assertion for
    `record-subagent` in each of the 5 modes if not already covered)

#### Wave 2: Instruction prose (all 5 spawn-site files)

- [x] **Task 1.2.1**: Add `record-subagent` prose to `execute.md`. Add a
  "Subagent Telemetry" pattern block near the wave-loop section header
  (defines correlationId generation + usage-parse recipe once). At each spawn
  site (executor, verifier, reviewer×4, learner, fix): one-line invoke reminder
  before spawn, one-line complete reminder after return. Parallel reviewer batch:
  4 invokes before batch call, 4 completes after.
  - Files: `packages/luca-mastracode/src/instructions/execute.md`
  - Verification: `grep -c record-subagent packages/luca-mastracode/src/instructions/execute.md`
    ≥ 10

- [x] **Task 1.2.2**: Add `record-subagent` prose to `architect.md` at
  discussion and plan-reviewer spawn sites.
  - Files: `packages/luca-mastracode/src/instructions/architect.md`
  - Verification: `grep -c record-subagent packages/luca-mastracode/src/instructions/architect.md`
    ≥ 4

- [x] **Task 1.2.3**: Add `record-subagent` prose to `research.md` at
  researcher×5 batch. Emit 5 invokes (one per dimension label) before batch;
  5 completes (reusing matching correlationId) after batch returns.
  - Files: `packages/luca-mastracode/src/instructions/research.md`
  - Verification: `grep -c record-subagent packages/luca-mastracode/src/instructions/research.md`
    ≥ 2

- [x] **Task 1.2.4**: Add `record-subagent` prose to `finalize.md` at learner
  and shadow-scanner spawn sites.
  - Files: `packages/luca-mastracode/src/instructions/finalize.md`
  - Verification: `grep -c record-subagent packages/luca-mastracode/src/instructions/finalize.md`
    ≥ 4

- [x] **Task 1.2.5**: Add `record-subagent` prose to `review.md` at
  reviewer×4 parallel batch. Emit 4 invokes before batch; 4 completes after.
  - Files: `packages/luca-mastracode/src/instructions/review.md`
  - Verification: `grep -c record-subagent packages/luca-mastracode/src/instructions/review.md`
    ≥ 8

#### Wave 3: Subagent self-report + tests

- [x] **Task 1.3.1**: Add usage self-report instruction to `shared-prefix.ts`.
  Append one sentence: "At the end of every response, append exactly:
  `<!-- usage: {"inputTokens":<N>,"outputTokens":<N>,"model":"<id>"} -->`".
  Target: ≤30 token addition. Verify prefix delta: character count of
  `SUBAGENT_SHARED_PREFIX` must increase by < 200 chars vs. pre-change.
  - Files: `packages/luca-mastracode/src/subagents/shared-prefix.ts`
  - Verification: `grep 'usage.*inputTokens' packages/luca-mastracode/src/subagents/shared-prefix.ts`
    returns match; character delta < 200

- [x] **Task 1.3.2**: Add 6 tests to `workflow-state-actions.test.ts`:
  (a) invoke emits `subagent.invoke` kind with correlationId + role in meta;
  (b) complete emits `subagent.complete` with tokens + durationMs + success;
  (c) missing role → validation error (ActionValidationError);
  (d) null tokens accepted — record still emitted;
  (e) token > 10_000_000 → clamped to null in meta;
  (f) event=invoke → kind `subagent.invoke`; event=complete → kind `subagent.complete`.
  - Files: `packages/luca-mastracode/src/__tests__/workflow-state-actions.test.ts`
  - Verification: `bun test --filter workflow-state-actions` passes with 6 new tests

- [x] **Task 1.3.3**: Create `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts`.
  Positive presence scan: for each of the 5 instruction files, assert
  `fileContent.includes('record-subagent')`. One `describe` per file.
  Do NOT add to `no-luca-leak.test.ts` (that is a negative-pattern leak scanner).
  - Files: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts`
  - Verification: `bun test --filter subagent-telemetry-prose` passes 5 describes;
    `bun test` full suite passes; `bun run tsc --noEmit` clean

## Verification Criteria

- `record-subagent` in `WORKFLOW_STATE_ACTIONS`; `subagent.invoke` +
  `subagent.complete` as named variants in `TelemetryKind` union
- All 5 instruction files contain `record-subagent` prose (verified by test)
- `shared-prefix.ts` has usage self-report instruction; delta < 200 chars
- Token clamp guard in `record-subagent` case (non-negative, finite, ≤10M)
- `correlationId` field in schema; parallel batch protocol in prose + Tasks 1.2.x
- All tests pass; tsc clean

## Risks & Mitigations

- **Token data unavailable**: Subagent self-report (last 256 bytes, strict parse);
  null accepted on absent/malformed block.
- **shared-prefix budget**: 9× multiplier. ≤30 token / <200 char addition limit;
  Task 1.3.1 includes delta measurement.
- **Prose drift**: `subagent-telemetry-prose.test.ts` presence scan on all 5 files.
- **Parallel pairing**: `correlationId` per spawn + N-before/N-after protocol.
