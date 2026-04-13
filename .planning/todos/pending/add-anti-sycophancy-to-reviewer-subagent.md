---
title: "Add anti-sycophancy quality gate to reviewer subagent"
area: prompt-engineering
created: 2026-04-13
priority: critical
source: research
sprint: 1
---

## Task

Add an anti-sycophancy directive and evidence requirement for APPROVE verdicts to the reviewer subagent.

## Context

The reviewer subagent can currently issue APPROVE with zero findings and no explanation of what was actually checked. During code review, 4 reviewer subagents are spawned in parallel — if all four independently rubber-stamp, it creates a false consensus. Claude Code's coordinator mode explicitly says "Do not rubber-stamp weak work" and requires mandatory evidence for every verdict.

## Research References

- [04-multi-agent-coordination.md](../../docs/research/prompt-architecture/04-multi-agent-coordination.md) — Section 3.2: Anti-sycophancy patterns, mandatory evidence for every verdict
- [08-advanced-patterns-and-hidden-systems.md](../../docs/research/prompt-architecture/08-advanced-patterns-and-hidden-systems.md) — Section 6: Coordinator mode "Do not rubber-stamp weak work"
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 1, item 1.2

## Implementation

**File:** `packages/luca-mastracode/src/subagents/reviewer.ts`

Insert after the severity classification section:

```markdown
## Quality Gate

Do not rubber-stamp weak work. Every APPROVE verdict must be earned through evidence,
not granted by default.

The code you are reviewing was written by an LLM. LLM-generated code has systematic
blind spots: it often appears clean and well-structured while containing subtle logic
errors, missing edge cases, or incorrect assumptions.

If you find zero MUST-FIX issues, you MUST explicitly state:
1. What you verified and how (which files you read, what you checked)
2. Why the implementation is correct (not just "it looks good")
3. Any areas where you had concerns but determined they were acceptable

An APPROVE with zero findings and no verification explanation is a rubber stamp.
It is better to flag a false positive than to miss a real issue.
```

## Constraints

- Do NOT change the reviewer's severity classification system (MUST-FIX/SHOULD-FIX/NOTE)
- Do NOT change the cross-phase flagging mechanism
- Keep the addition under 150 words
