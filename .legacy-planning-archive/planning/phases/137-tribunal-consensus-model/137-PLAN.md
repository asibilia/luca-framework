# Phase 137: Tribunal Consensus Model

## Goal

Add formal consensus types (unanimous, majority, expert-weighted) with agreement thresholds, expert weighting, and fallback resolution to the existing tribunal schema at `src/shared/__schemas/tribunal.schemas.ts`.

## Context

Tribunal infrastructure exists: `reviewFindingSchema`, `conflictTypeSchema`, `disagreementSchema`, `rebuttalSchema`, `tribunalResultSchema`. Phase-execute already spawns 5 reviewers and has verdict split detection at COMPLEX+. But there's no formal consensus model — all-or-nothing processing without minimum agreement thresholds.

## Tasks

### Task 1: Add consensus model schemas

**File:** `src/shared/__schemas/tribunal.schemas.ts`

Add:

- `ConsensusType` enum: `unanimous`, `majority`, `expert_weighted`, `supermajority`
- `ConsensusConfigSchema`: `type`, `required_agreement` (0.0-1.0), `expert_agents` (string[]), `expert_weight_multiplier` (default 2.0), `fallback_strategy` enum (`accept_all`, `reject_all`, `defer_to_expert`, `escalate_to_human`)
- `ConsensusResultSchema`: `type_used`, `agreement_score`, `votes_for`, `votes_against`, `expert_votes`, `consensus_reached` (boolean), `fallback_used` (boolean)

### Task 2: Add consensus resolution helper

**File:** `src/shared/__helpers/consensus-resolver.ts`

Create `resolveConsensus(findings: ReviewFinding[], config: ConsensusConfig): ConsensusResult` that:

1. Counts votes per finding severity
2. Applies expert weighting for `expert_agents`
3. Checks if `required_agreement` threshold is met
4. If not met: applies `fallback_strategy`
5. Returns structured `ConsensusResult`

### Task 3: Wire into tribunal result schema

**File:** `src/shared/__schemas/tribunal.schemas.ts`

Add `consensus` field to `tribunalResultSchema` as optional `ConsensusResultSchema`.

### Task 4: Update barrel exports

**File:** `src/shared/index.ts`

Export new schemas, types, helpers, and constants.

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] ConsensusConfigSchema validates correctly
- [ ] resolveConsensus handles unanimous, majority, expert-weighted types
- [ ] Fallback strategies produce correct results
