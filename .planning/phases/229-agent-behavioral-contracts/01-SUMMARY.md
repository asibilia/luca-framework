# Phase 229: Agent Behavioral Contracts -- Execution Summary

## Objective

Define and enforce hard/soft invariants for critical workflow paths. Behavioral contracts express cross-step temporal properties that state machines alone cannot (e.g., "no push without LEARNED transition").

## Tasks Completed

### Task 1: Contract Schema Definitions

- **Commit:** `6fbd1441`
- **Files:** `src/workflow/__schemas/contracts/contract.schemas.ts`, `src/workflow/__schemas/contracts/index.ts`
- Created Zod schemas: InvariantKindSchema, ContractInvariantSchema, BehavioralContractSchema, ContractViolationSchema, ContractAuditSummarySchema, ContractAuditResultSchema
- All types inferred from schemas via `z.infer`
- Barrel created at `src/workflow/__schemas/contracts/index.ts`

### Task 2: Contract Definitions for 5 Critical Workflows

- **Commit:** `48ae7711`
- **File:** `src/workflow/__helpers/contract-definitions.ts`
- Defined contracts using actual state machine state names:
  1. **pr-address** (hard): `learned` -> `pushed` -- "No push without LEARNED"
  2. **milestone-complete** (soft): `scanned` -> `archived` -- "No archive without shadow scan"
  3. **lu** (hard): `configured` -> `executing` -- "No execute without configured"
  4. **verify** (hard): `extracted` -> `reviewed` -- "No review without extract"
  5. **phase-execute** (hard): `verified` -> `committed` -- "No commit without harness"
- CONTRACT_REGISTRY deep-frozen via `deepFreeze()`

### Task 3: Contract Evaluation Engine

- **Commit:** `7122262c`
- **File:** `src/workflow/__helpers/contract-evaluator.ts`
- Three pure evaluation functions:
  - `evaluateContract()` -- checkpoint-based evaluation against DAGCheckpoint
  - `evaluateContractFromLedger()` -- event-sourced evaluation against session ledger entries
  - `mergeContractAndGapAudits()` -- unified reporting pipeline merging contract violations into gap audit results
- Hard violations produce "fail" severity gaps, soft violations produce "warning" gaps

### Task 4: Integration with Gap Detection and Enforcement Hooks

- **Commit:** `207d1db0`
- **Files:** `src/workflow/__helpers/gap-detector.ts` (extended), `src/workflow/__helpers/contract-hook-adapter.ts` (new)
- Extended `detectGaps()` with optional `contracts?: BehavioralContract[]` parameter (backward compatible)
- Created `checkContractPreconditions()` async function using `Bun.file()` for context reading
- Contract-hook-adapter lives in T1 (workflow) for tier-safe import from T3 (hooks)

### Task 5: Drift Metrics for MuninnDB

- **Commit:** `92e2a4c0`
- **File:** `src/workflow/__helpers/contract-metrics.ts`
- `formatContractMetrics()` -- single audit to MuninnDB metric (concept: `metric:contract-violations-{workflow}`)
- `buildContractDriftReport()` -- multiple audits to markdown drift summary with health indicator, per-workflow table, and violation details

## Success Criteria Verification

- [x] Contract schemas validate correctly with Zod safeParse
- [x] 5 workflow contracts defined with correct state references
- [x] Evaluation engine detects violations from both checkpoints and ledger entries
- [x] Gap detector accepts optional contracts parameter (backward compatible)
- [x] Contract hook adapter provides pre-step precondition checking
- [x] Drift metrics formatted for MuninnDB storage
- [x] All new code exported via src/workflow/index.ts barrel
- [x] `bunx --bun tsc --noEmit` passes (source code clean; pre-existing dist/plugin/ errors only)
- [x] No tier violations (all new code in T1 workflow domain)

## Deviations

- **milestone-complete contract kind changed to soft**: The plan specified "No archive without shadow scan" but shadow scanning can be legitimately disabled via config (`shadow_debt.enabled = false`). Changed from hard to soft invariant with `recovery_limit: 1` to reflect that this is a "should" not a "must".
- **checkContractPreconditions made async**: Originally planned as synchronous, but changed to async to use `Bun.file()` API per bun-preference rule instead of `require("node:fs").readFileSync`.

## Files Created/Modified

### New Files (6)

- `src/workflow/__schemas/contracts/contract.schemas.ts` -- Behavioral contract Zod schemas
- `src/workflow/__schemas/contracts/index.ts` -- Contract schemas barrel
- `src/workflow/__helpers/contract-definitions.ts` -- 5 workflow contract definitions + registry
- `src/workflow/__helpers/contract-evaluator.ts` -- Contract evaluation engine
- `src/workflow/__helpers/contract-hook-adapter.ts` -- Hook adapter for pre-step enforcement
- `src/workflow/__helpers/contract-metrics.ts` -- MuninnDB drift metrics

### Modified Files (2)

- `src/workflow/__helpers/gap-detector.ts` -- Added optional `contracts` parameter to `detectGaps()`
- `src/workflow/index.ts` -- Added all new exports to workflow barrel
