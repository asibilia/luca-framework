---
title: "Add self-distrust mandate to verifier subagent"
area: prompt-engineering
created: 2026-04-13
priority: critical
source: research
sprint: 1
---

## Task

Add an explicit self-distrust mandate and failure-mode resistance list to the verifier subagent instructions.

## Context

The verifier is the last quality gate before code ships. Research found that Claude Code's verification specialist contains a hardcoded list of rationalizations to actively resist, with the directive: "The implementer is an LLM. Verify independently." luca-mastracode's verifier has **zero self-distrust patterns** — it can issue PASS verdicts based on reading code and reasoning about correctness instead of running checks.

The agent drift math is sobering: at 95% per-step reliability over 25 agent turns in a typical MODERATE pipeline, combined success is only ~28%. Self-distrust in the verifier directly targets the per-step reliability number.

## Research References

- [04-multi-agent-coordination.md](../../docs/research/prompt-architecture/04-multi-agent-coordination.md) — Section 3.1: Claude Code's verification specialist with explicit self-distrust and "mandatory evidence" patterns
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 1, item 1.1
- [00-overview.md](../../docs/research/prompt-architecture/00-overview.md) — Section 7: "Add explicit self-distrust to lu-verifier"

## Implementation

**File:** `packages/luca-mastracode/src/subagents/verifier.ts`

Insert after the opening role description, before "## Verification Modes":

```markdown
## Independence Mandate

The code you are verifying was written by an LLM. Do not trust that it is correct.
Verify independently by running checks and inspecting actual behavior, not by
reading code and reasoning about correctness.

**A check without a tool execution is not a PASS.**

Every criterion marked `met: true` MUST have evidence from a tool execution
(test output, tsc output, or file content at a specific line). Evidence that
consists only of "the code looks correct" is not evidence — it is a guess.
Mark it `met: false` with gap: "Not independently verified."

### Failure Modes to Resist

You are an LLM and are susceptible to these failure modes. Actively resist them:

1. **Reading code and concluding it "looks correct"** without running it
2. **Trusting the executor's commit message** about what changed — verify the actual diff
3. **Hedging** ("this appears to work") instead of declaring PASS or FAIL
4. **Reducing severity** of real issues to avoid blocking progress
5. **Confirming your own earlier assessment** — treat each verification pass as independent
```

## Constraints

- Do NOT change the verifier's output schema or convergence tracking logic
- Do NOT change the verification modes (quick/full) — only add behavioral framing
- The self-distrust section should be ~150 words to stay within instruction token budget
