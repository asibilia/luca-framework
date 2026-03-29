---
wave: 1
depends_on: []
autonomous: true
type: feature
---

# Phase 229: Agent Behavioral Contracts

## Objective

Define and enforce hard/soft invariants for critical workflow paths. Behavioral contracts express cross-step temporal properties that state machines alone cannot (e.g., "no push without LEARNED transition"). The contract system integrates with existing gap detection, enforcement hooks, and MuninnDB metrics.

## Context

- **Existing infrastructure**: createSkillStateMachine (XState v5), gap-detector (3-tier), enforcement-hook-factory, progressive-executor
- **Key schemas**: WorkflowStep, DAGCheckpoint, SkippedStepEntry, ExecutionGap, GapAuditResult
- **Barrel**: src/workflow/index.ts re-exports all workflow infrastructure
- **Pattern**: Functional (factory functions, Zod schemas, deep-freeze, no classes)
- **Tier**: T1 Core (workflow domain) — can import T0 (shared, complexity), NOT T2 (agents/skills/rules) or T3 (hooks/compilers/adapters)

## Tasks

### Task 1: Contract Schema Definitions

**File:** `src/workflow/__schemas/contracts/contract.schemas.ts`

Create Zod schemas for behavioral contracts:

- `InvariantKindSchema`: z.enum(["hard", "soft"]) — hard invariants must always hold, soft allow bounded recovery
- `ContractInvariantSchema`: defines a single invariant with:
  - `id`: unique invariant identifier (e.g., "pr-address:no-push-without-learned")
  - `kind`: hard | soft
  - `description`: human-readable explanation
  - `precondition`: step ID that must have completed (the "before")
  - `postcondition`: step ID being gated (the "after")
  - `recovery_limit`: number (soft invariants only, default 1) — max recovery attempts
- `BehavioralContractSchema`: groups invariants for a workflow:
  - `workflow`: workflow name (e.g., "pr-address")
  - `invariants`: array of ContractInvariant
- `ContractViolationSchema`: records a detected violation:
  - `contract_id`: which contract
  - `invariant_id`: which invariant
  - `kind`: hard | soft
  - `violated_at`: ISO timestamp
  - `postcondition_attempted`: step ID that was attempted without precondition
  - `precondition_missing`: step ID that should have completed
  - `recovery_attempted`: boolean
  - `recovery_succeeded`: boolean | null
- `ContractAuditResultSchema`: aggregates violations for a workflow execution:
  - `workflow`: workflow name
  - `status`: "clean" | "violations_found" | "error"
  - `violations`: array of ContractViolation
  - `summary`: { total_invariants, hard_violations, soft_violations, recoveries_attempted, recoveries_succeeded }

Export all schemas and inferred types. Create barrel `src/workflow/__schemas/contracts/index.ts`.

**Verification:** `bunx --bun tsc --noEmit` passes. All schemas parse valid test data.

### Task 2: Contract Definitions for 5 Critical Workflows

**File:** `src/workflow/__helpers/contract-definitions.ts`

Define behavioral contracts for each critical workflow using the schemas from Task 1:

1. **pr-address**: "No push without LEARNED" — postcondition PUSHED requires precondition LEARNED
2. **milestone-complete**: "No archive without shadow scan" — postcondition ARCHIVED requires precondition SCANNED
3. **lu**: "No phase-execute without configured" — postcondition executing requires precondition configured
4. **verify**: "No review without extract" — postcondition reviewed requires precondition extracted
5. **phase-execute**: "No commit without harness" — postcondition committed requires precondition verified

Each contract uses the existing state names from `src/skills/__schemas/states/*.states.ts`.

Export a `CONTRACT_REGISTRY`: Record<string, BehavioralContract> mapping workflow name to contract definition. Deep-freeze the registry.

**Verification:** `bunx --bun tsc --noEmit` passes. Registry contains 5 entries with correct state references.

### Task 3: Contract Evaluation Engine

**File:** `src/workflow/__helpers/contract-evaluator.ts`

Implement the contract evaluation engine as pure functions:

- `evaluateContract(contract: BehavioralContract, checkpoint: DAGCheckpoint): ContractAuditResult`
  - For each invariant in the contract:
    - Check if postcondition step appears in checkpoint.completedSteps
    - If yes, check if precondition step also appears in completedSteps
    - If precondition missing: record violation
    - For soft invariants: check if recovery was attempted (look for precondition in checkpoint with retry evidence)
  - Aggregate all violations into ContractAuditResult

- `evaluateContractFromLedger(contract: BehavioralContract, ledgerEntries: Array<{event: string, stepId?: string, timestamp: string}>): ContractAuditResult`
  - Evaluate against session ledger entries (event-sourced path)
  - Build completed-step set from STEP_COMPLETE events
  - Same invariant checking logic as above

- `mergeContractAndGapAudits(contractResult: ContractAuditResult, gapResult: GapAuditResult): { gaps: ExecutionGap[], contractViolations: ContractViolation[], status: string }`
  - Merge contract violations into the gap audit pipeline
  - Hard violations become "fail" severity gaps
  - Soft violations (not recovered) become "warning" severity gaps

**Verification:** `bunx --bun tsc --noEmit` passes. Functions are pure (no side effects).

### Task 4: Integration with Enforcement Hooks and Gap Detection

**File:** `src/workflow/__helpers/gap-detector.ts` (extend existing)

Add contract-aware gap detection:

- Add optional `contracts?: BehavioralContract[]` parameter to `detectGaps()`
- When contracts provided, run `evaluateContract()` for each and merge violations into the gap audit result
- Contract violations appear as additional ExecutionGap entries with a new `source: "contract"` field

**File:** `src/workflow/__helpers/contract-hook-adapter.ts`

Create an adapter that bridges contracts into the pre-step enforcement system:

- `checkContractPreconditions(workflow: string, targetStep: string, contextPath: string): { allowed: boolean, violations: string[] }`
  - Reads the current orchestrator context file
  - Looks up the contract for this workflow from CONTRACT_REGISTRY
  - Checks if the target step's preconditions are met
  - Returns whether the step should be allowed

This function is designed to be called FROM hooks (T3) but lives in workflow (T1). The hook script imports it to make the check. No tier violation: T3 imports T1 (downward).

**Verification:** `bunx --bun tsc --noEmit` passes. Gap detector still works without contracts (backward compatible).

### Task 5: Drift Metrics for MuninnDB

**File:** `src/workflow/__helpers/contract-metrics.ts`

Create functions for reporting contract health:

- `formatContractMetrics(result: ContractAuditResult): { concept: string, content: string }`
  - Formats contract audit results as a MuninnDB-ready metric
  - Concept: `metric:contract-violations-{workflow}`
  - Content: JSON with violation_rate, recovery_success_rate, hard_vs_soft_breakdown

- `buildContractDriftReport(results: ContractAuditResult[]): string`
  - Aggregates across multiple workflow audits
  - Produces a markdown summary suitable for phase summaries
  - Includes: total violations, per-workflow breakdown, trend direction

Export via the workflow barrel in `src/workflow/index.ts`.

**Verification:** `bunx --bun tsc --noEmit` passes. Output format matches MuninnDB concept/content pattern.

## Success Criteria

- [ ] Contract schemas validate correctly with Zod safeParse
- [ ] 5 workflow contracts defined with correct state references
- [ ] Evaluation engine detects violations from both checkpoints and ledger entries
- [ ] Gap detector accepts optional contracts parameter (backward compatible)
- [ ] Contract hook adapter provides pre-step precondition checking
- [ ] Drift metrics formatted for MuninnDB storage
- [ ] All new code exported via src/workflow/index.ts barrel
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] No tier violations (all new code in T1 workflow domain)
