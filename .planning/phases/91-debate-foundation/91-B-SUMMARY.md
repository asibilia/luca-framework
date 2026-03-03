# Plan 91-B Summary: Stall-vs-Retry Convergence Debate

## Status: COMPLETE

## What Was Built

### Stall Debate Schemas (`src/iteration/__schemas/stall-debate.schemas.ts`)

- `stallDebateStrategySchema`: enum of 4 strategies (halt, retry_with_context_promotion, retry_with_error_focus, retry_with_rollback)
- `stallDebateInputSchema`: convergence_result, current_errors, budget_remaining, loop_type, iteration_history, context_tier
- `stallDebateOutputSchema`: recommended_strategy, confidence (0-1), reasoning, strategy_params

### Stall Debate Evaluator (`src/iteration/__helpers/stall-debate.ts`)

- `shouldAttemptDebate(convergenceResult, budgetRemaining)`: Gate function (halt + budget >= 1)
- `evaluateStallDebate(input)`: Pure heuristic function with 4 prioritized rules:
  1. Budget exhausted -> halt (confidence 1.0)
  2. High fingerprint overlap + promotable tier -> retry_with_context_promotion (0.7)
  3. > 60% correctable errors -> retry_with_error_focus (0.6)
  4. Artifact changes but errors unchanged -> retry_with_rollback (0.5)
  5. Default -> halt (0.3)

### Convergence Integration (`src/iteration/__helpers/convergence.ts`)

- Added `ConvergenceDebateOptions` interface with `debate_enabled` and `debate_input`
- `assessConvergence` now accepts optional 4th parameter `debateOptions`
- When debate recommends non-halt strategy, `should_halt` is overridden to false
- Debate result attached to `ConvergenceResult.debate_result`

### Schema Extension (`src/iteration/__schemas/iteration.schemas.ts`)

- Added optional `debate_result` field to `convergenceResultSchema`
- Backward compatible (field is optional, defaults to undefined)

### Phase-Execute Awareness (`src/skills/general/phase-execute.skill.ts`)

- Added `STALL_DEBATE_ENABLED` config extraction from `iteration.stall_debate_enabled`
- Added Stall Debate section in convergence check flow (Step C)
- Documents strategy-specific actions for each debate outcome

### Tests (`__tests__/src/iteration/stall-debate.test.ts`)

- 4 gate function tests (shouldAttemptDebate)
- 8 evaluator tests (all 4 rules + priority + schema conformance)
- 4 integration tests (assessConvergence with debate options)
- **16/16 tests passing, 146/146 total iteration tests passing**

### Barrel Exports (`src/iteration/index.ts`)

- All stall debate schemas, types, and functions re-exported

## Files Changed

- `src/iteration/__schemas/stall-debate.schemas.ts` (new)
- `src/iteration/__helpers/stall-debate.ts` (new)
- `src/iteration/__schemas/iteration.schemas.ts` (modified -- debate_result field)
- `src/iteration/__helpers/convergence.ts` (modified -- debate integration)
- `src/iteration/index.ts` (modified -- barrel exports)
- `src/skills/general/phase-execute.skill.ts` (modified -- config + instructions)
- `__tests__/src/iteration/stall-debate.test.ts` (new)

## Design Decisions

- Pure heuristic function with NO LLM calls (Phase 91 scope)
- Opt-in via `config.iteration.stall_debate_enabled` (default: false)
- Rules evaluated in strict priority order (budget > context > error focus > rollback > default)
- Debate evaluation uses static import (no circular dependency with convergence.ts)
- Backward compatible: existing assessConvergence calls work unchanged
