---
title: "Dual-inject HARD_CONSTRAINTS (primacy + recency) and add 'because' clauses"
area: prompt-engineering
created: 2026-04-13
priority: high
source: research
sprint: 1
---

## Task

Change HARD_CONSTRAINTS injection from append-only to prepend-AND-append (exploiting both primacy and recency attention peaks), and add "because" clauses to all three constraints to enable edge-case reasoning.

## Context

Currently HARD_CONSTRAINTS are only appended at the end of instructions via `getAgentConstraints()`. This exploits recency but misses the primacy peak. Research shows the first and last ~200 tokens receive almost equal attention. Additionally, "because" clauses transform opaque rules into teachable principles — when the model encounters an edge case, the reasoning clause enables correct inference.

Claude Code says: "Avoid git amend **because** it may overwrite others' commits." The "because" is what teaches the model to make correct decisions in scenarios not explicitly covered by the rule.

## Research References

- [05-attention-curves-and-structure.md](../../docs/research/prompt-architecture/05-attention-curves-and-structure.md) — U-shaped attention, primacy/recency exploitation
- [00-overview.md](../../docs/research/prompt-architecture/00-overview.md) — Section 3: "Because" clauses for edge-case reasoning
- [09-instruction-budget-and-prompt-economics.md](../../docs/research/prompt-architecture/09-instruction-budget-and-prompt-economics.md) — Section 8: Phrasing hierarchy
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 1, items 1.5 and 1.6

## Implementation

**File:** `packages/luca-mastracode/src/index.ts`

### Part A: Dual Injection

Change `getAgentConstraints()` (or equivalent assembly point) to return constraints for BOTH prepending and appending. Modify the instruction assembly so:

```
Final instructions = HARD_CONSTRAINTS + mode_instructions + HARD_CONSTRAINTS + ALWAYS_APPLY_RULES
```

### Part B: Add "Because" Clauses

Update HARD_CONSTRAINTS (lines ~160-163) from:

```markdown
- Never use temp files as an edit workaround. [...]
- Never shell out for file edits. [...]
- Respect mode boundaries. [...]
```

To:

```markdown
- **Never use temp files as an edit workaround** because it bypasses the harness's change tracking and makes modifications invisible to the review and verification pipeline.
- **Never shell out for file edits** because execute_command output is not tracked by edit tools, so changes cannot be verified, reviewed, or rolled back by the harness.
- **Respect mode boundaries** because mode restrictions separate concerns — a read-only mode that secretly writes files corrupts the verification guarantee of subsequent phases.
```

### Part C: Add 4th Constraint

Add a new constraint addressing the most common cross-mode failure (verbose inter-tool narration):

```markdown
- **Do NOT generate explanatory prose between consecutive tool calls** because text between tool calls wastes tokens and slows execution. If your next action is a tool call, invoke it directly.
```

## Constraints

- Total HARD_CONSTRAINTS should stay under 200 tokens to avoid excessive duplication cost
- The dual injection adds ~200 tokens per mode — acceptable given the ~510 tokens freed by template compression (Sprint 2)
