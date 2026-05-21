---
title: "Anthropic model ID normalization + latest version audit — fix dot-vs-dash drift and pin every subagent to current Anthropic models"
area: telemetry-config
created: 2026-05-15
priority: low
source: run-mp706uzq-analysis
muninn_id: 01KRP99A1GW91WNQPVY8JYMMJW
---

## Task

Two related fixes:
1. Normalize model strings in the aggregator skill (`claude-sonnet-4.5` and `claude-sonnet-4-5` should merge)
2. Audit every subagent config and pin to the current latest Anthropic model alias for its tier

---
confidence: high
externalResearch: true
priority: 3
---

## Problem 1: format drift

Observed in `run_mp706uzq_udb346w7` (5/15): discussion subagent reported `model:"claude-sonnet-4.5"` (dot form) while every other subagent reported `claude-sonnet-4-5` (dash form). The aggregator skill splits these into two separate buckets, polluting cost-per-model tables.

## Problem 2: stale pins

Some subagents may be pinned to legacy model IDs. Audit needed across `packages/luca-mastracode/src/subagents/*.ts`.

## Fix sketch

### Aggregator normalization
In `skills/luca-telemetry-report/SKILL.md`, before bucketing by model, normalize:

```ts
function normalizeModel(m: string | null): string | null {
  if (!m) return null;
  // claude-sonnet-4.5 → claude-sonnet-4-5
  return m.replace(/-(\d+)\.(\d+)/g, "-$1-$2");
}
```

### Subagent audit
For each subagent file in `packages/luca-mastracode/src/subagents/`:
- Researcher → latest sonnet
- Executor → latest sonnet
- Plan-reviewer → latest sonnet
- Verifier → latest sonnet
- Reviewer-arch → latest opus
- Reviewer-sec → latest sonnet
- Reviewer-dx → latest sonnet
- Reviewer-simpl → latest opus
- Learner → latest opus
- Discussion → latest sonnet

Verify against `https://docs.anthropic.com/en/docs/about-claude/models` for current aliases.

## Acceptance criteria

1. Aggregator merges `claude-sonnet-4.5` + `claude-sonnet-4-5` into one row
2. All subagents pinned to current Anthropic model alias
3. New test scans `packages/luca-mastracode/src/subagents/*.ts` for legacy IDs (`claude-3-*`, `claude-2-*`) and fails if any found
4. Changeset documents model upgrades

## Risks

- Behavior drift if an unverified model alias is wrong — verify each pin actually resolves before merging
- Cost change — newer Opus may cost more; document in changeset

## Out of scope

- Changing the tier assignment per subagent (opus vs sonnet) — that's a separate optimization
- Dynamic model selection at runtime — keep static pins
