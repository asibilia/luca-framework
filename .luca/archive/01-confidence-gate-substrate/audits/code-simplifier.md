# Audit — simplification

## Verdict
APPROVE

## Summary
The bucketing logic is clean, single-pass, and total over its input; the one arguable redundancy (`counts` field) is a real ergonomic win for shell consumers and is explicitly justified in the code comment.

## Verified locations

- `packages/luca-core/src/confidence/gate.ts:46-58` — single `for` loop, five branches, no double-traversal, correct total-branch (every entry lands in exactly one bucket)
- `packages/luca-core/src/confidence/gate.ts:62-67` — `counts` sub-object is `auto.length` / `research.length` / `ask.length`; verified it is purely derived from the three arrays, so it adds no information but does provide real ergonomic value for `jq '.counts.ask'` in shell consumers
- `packages/luca-core/src/confidence/confidence-journal.ts:104-120` — `getConfidenceSummary` counts by `high`/`medium`/`low`; confirmed the gate's bucketing is NOT the same computation (gate applies `resolution` override and `researchable` split, summary does not), so no DRY violation exists between the two
- `packages/luca-cli/src/commands/write-surface/confidence.ts:43-55` — `resolveSlug` correctly factored out and reused by all four reader subcommands (read, summary, render, gate)
- `packages/luca-cli/src/commands/write-surface/confidence.ts:244-265` — `gateCommand` body is minimal (3 lines in `run`), consistent with peer subcommands

## Findings

- **[NOTE]** Two adjacent branches both push to `auto` (`confidence === 'high'` and `confidence === 'medium'`), which could be collapsed to `entry.confidence !== 'low'`.
  - File: `packages/luca-core/src/confidence/gate.ts:51-54`
  - Not a real bug — the current form documents the exhaustive case list clearly. Collapsing would save one `else if` at the cost of explicit enumeration. Leave as-is unless the enum gains a fourth level.

- **[NOTE]** `counts` in `ConfidenceGateActions` is fully derived (`auto.length`, `research.length`, `ask.length`). Any caller could compute it.
  - File: `packages/luca-core/src/confidence/gate.ts:31,66`
  - Justification is sound: shell consumers using `jq '.counts.ask'` instead of `| jq '.ask | length'` is a real ergonomic win. Keep, but note it's a convenience field, not authoritative state.

- **[NOTE]** The `else ask.push(entry)` in the `entry.resolution` branch (line 49) silently handles the `'ask'` literal. Since the Zod schema constrains `resolution` to `'auto' | 'research' | 'ask'`, the else is always the `'ask'` case. A comment (`// resolution === 'ask'`) would make this self-documenting at zero cost.
  - File: `packages/luca-core/src/confidence/gate.ts:49`

## Counts
- MUST_FIX: 0
- SHOULD_FIX: 0
- NOTE: 3
- CROSS_PHASE: 0
