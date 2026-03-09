# Phase 01 — Recall Scoring Optimization: Context

**Phase:** 01 — Recall Scoring Optimization (#89 + #91)
**Complexity:** SIMPLE
**Mode:** auto-discuss (full-auto autopilot)

---

## Decisions

### 1. Complexity-Gated Recall Depth (#89) [researched]

**Decision:** Add a complexity dimension to the tier-scaled entry limits in lu-cognition's `selective_recall` step.

**New entry limit matrix (tier x complexity):**

| Effective Tier | TRIVIAL/SIMPLE   | MODERATE | COMPLEX  | CRITICAL |
| -------------- | ---------------- | -------- | -------- | -------- |
| T0             | 0 (skip)         | 0 (skip) | 0 (skip) | 0 (skip) |
| T1             | skip (lite mode) | 3        | 3-5      | 3-5      |
| T2             | skip (lite mode) | 3        | 5-7      | 5-7      |
| T3             | skip (lite mode) | 3        | 7-10     | 7-10     |

**Rationale:** TRIVIAL/SIMPLE already skip recall via lite mode (lines 98-146). The only change is capping MODERATE at 3 entries regardless of tier. COMPLEX/CRITICAL keep existing limits.

**Implementation:** Update the `selective_recall` step text in `lu-cognition.agent.ts` to add a complexity check before the tier-scaled limits. Also add `recallDepth` to complexity matrix in `config.json`.

### 2. Milestone Decay Scoring (#91) [researched]

**Decision:** Strengthen milestone-scoped recall with explicit scoring multipliers.

**Scoring changes to `selective_recall` step:**

1. Current milestone tag match → 1.5x score boost
2. Previous milestone (N-1) → 1.0x (neutral)
3. Milestones N-2 or older → 0.25x score multiplier (aggressive decay)
4. No milestone tag (legacy entries) → 0.5x score (down from implicit 1.0x)

**Rationale:** Audit found ~30% noise from old milestone entries. Aggressive decay prioritizes recent, relevant learnings. Legacy entries (no milestone tag) are likely old and should be deprioritized but not excluded.

**Implementation:** Update the scoring pseudocode in `selective_recall` step to add milestone proximity scoring after the existing agent matching and keyword matching sections.

### 3. Config Schema Addition [researched]

**Decision:** Add `recallDepth` to the complexity matrix in `.planning/config.json`.

**Schema:**

```json
"recallDepth": {
  "TRIVIAL": 0,
  "SIMPLE": 0,
  "MODERATE": 3,
  "COMPLEX": null,
  "CRITICAL": null
}
```

Where `0` means "skip recall (lite mode)" and `null` means "use tier default". This makes the depth configurable without code changes.

---

## Scope

**Files to modify:**

- `src/agents/general/lu-cognition.agent.ts` — recall scoring logic in `selective_recall` step
- `.planning/config.json` — add `recallDepth` to complexity matrix

**Files NOT to modify:**

- No other agents, skills, or rules need changes
- No schema changes needed (this is agent prompt text, not TypeScript types)

## Deferred Ideas

- None identified. This is a tightly scoped config-level change.
