# Phase 145 — Memory Feedback Completion & PR-Address Learning

## Objective

Close the remaining gaps in Luca's memory effectiveness system and add MuninnDB learning capture to the pr-address skill. Phase 140.1 shipped the core feedback loop (determineFeedback, computeMemoryPhaseMetrics, recall cache, confidence evolution, composite scoring, progress dashboard). This phase completes the missing pieces.

## Scope

Two workstreams that share MuninnDB infrastructure:

1. **Memory Feedback Completion** (Todo #111 gaps) — fill two hardcoded-0 metrics, add stale engram pruning at milestone boundaries
2. **PR-Address Learning Capture** (Todo #4) — spawn lu-learner after pr-address fix verification to capture review comment patterns

## Decisions

### PR-Address Learning Granularity

- **Capture all PR comments at low confidence** — no frequency gating. The existing confidence evolution system (3+ feedback heuristic in lu-learner) handles quality over time. Avoids adding pattern frequency tracking infrastructure.
- **Single category `pitfall:pr-review-*`** — no sub-categorization by type (style/architecture/correctness/performance). MuninnDB semantic recall handles differentiation by content similarity. Consistent with existing engram naming patterns.
- **Spawn lu-learner** after pr-address completes (not inline logic). Same pattern as phase-execute Step 8. Leverages lu-learner's extraction, confidence setting, `muninn_remember`, and `muninn_link` — no duplication of learning logic.
- **Hook in after fix verification** — the natural boundary where we know the outcome. Mirrors phase-execute's lu-learner spawn point (after harness/verification, before commit).

### Stale Engram Pruning

- **Flag for human review** at milestone boundaries — show stale engrams in milestone completion summary, developer decides what to prune. No fully automatic archival.
- **Stale threshold: BOTH conditions required** — (1) 5+ recalls with 0 positive feedback AND (2) 3+ milestones with no positive feedback. Conservative, minimizes false positives.
- **Run `muninn_consolidate()` alongside pruning** at every milestone boundary — merge near-duplicates to reduce recall noise.
- **Hard-delete via `muninn_forget`** after human approval — the review gate provides safety. No soft-delete; keeps vault lean.

### Metric Aggregation

- **Extend `memory-feedback.ts` helper** — add `stale_engram_pct` and `confidence_calibration` computation to the existing `computeMemoryPhaseMetrics()` function. The calling skill (phase-execute or milestone-complete) queries MuninnDB for historical data, passes it to the helper.
- **Persist as MuninnDB engrams** (`metric:memory-*`) — consistent with existing `metric:signal-rate-aggregate` pattern. Survives across milestones, semantically recallable.
- **Rolling window of last 10 phases** for aggregation — captures enough signal regardless of milestone boundaries without being polluted by stale historical data.

## Files to Modify

### PR-Address Learning (Workstream 1)

- `src/skills/general/pr-address.skill.ts` — add lu-learner spawn step after fix verification
- `src/agents/luca/lu-pr-reviewer.agent.ts` — ensure review comment context is passed through for learning extraction

### Stale Engram Pruning (Workstream 2)

- `src/skills/general/milestone-complete.skill.ts` — add stale detection, human review checkpoint, pruning step, and `muninn_consolidate()` call

### Metric Completion (Workstream 3)

- `src/shared/__helpers/memory-feedback.ts` — extend `computeMemoryPhaseMetrics()` with `stale_engram_pct` and `confidence_calibration` from historical data
- `src/shared/__schemas/memory-metrics.schemas.ts` — update schema if fields need additional context (historical data input shape)

## What Already Exists (Do Not Rebuild)

- `determineFeedback()` in `memory-feedback.ts` — verification → per-engram feedback
- `computeMemoryPhaseMetrics()` in `memory-feedback.ts` — recall_precision, hit_rate, memory_tokens_injected
- Recall cache in `recall-cache.ts` — session-scoped engram ID tracking
- `estimateTokens()` in `memory-context-builder.ts` — token cost estimation
- lu-learner confidence evolution — 3+ feedback promote/demote heuristic
- lu-cognition composite scoring — 7 signals including feedback_score (0.075 weight)
- Memory Health section in progress skill — dashboard with health status

## Complexity

MODERATE — closing gaps in an existing system across 5 files. No new infrastructure, no new agents.

## Constraints

- `bun run build:all` must be run manually after source changes (crashes Claude Code sessions)
- No test files per `.claude/rules/no-tests.md` — verify via `bunx --bun tsc --noEmit`
- All source edits in `src/` only — never edit generated `.claude/`, `.cursor/`, `.pi/` directly
