---
title: "Add self-compression, citation discipline, and skeptical recall to subagent instructions"
area: prompt-engineering
created: 2026-04-13
priority: medium
source: research
sprint: 3
---

## Task

Enrich subagent instructions with self-compression directives, citation discipline (file:line evidence), skeptical MuninnDB recall, and planner distrust. Covers 7 of 9 subagents (verifier and reviewer handled in Sprint 1).

## Context

Claude Code's coordinator requires "workers compress their own results before returning." Currently, subagent output dumps into the parent's context uncompressed. When 5 researcher subagents each return 2000 words, the orchestrator's context fills with 10K words before synthesis begins.

Devin's mandatory `<cite>` tag innovation forces file-level citations with line numbers, making hallucination immediately detectable. luca-mastracode's researcher says "reference specific files/lines" but doesn't enforce a format.

## Research References

- [04-multi-agent-coordination.md](../../docs/research/prompt-architecture/04-multi-agent-coordination.md) — Sections 4 (worker self-compression), 3 (self-distrust)
- [06-comparative-agent-analysis.md](../../docs/research/prompt-architecture/06-comparative-agent-analysis.md) — Devin's citation discipline
- [07-context-compaction-and-memory.md](../../docs/research/prompt-architecture/07-context-compaction-and-memory.md) — Memory as hints requiring verification
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 3, items 3.2-3.4

## Implementation

### Executor Subagent

**File:** `packages/luca-mastracode/src/subagents/executor.ts`

Add:
```markdown
## Verification Awareness
A separate verifier subagent will independently check your work. Focus on making
changes correct, not on proving they are correct.

## Output Compression
Before returning results, compress to: tasks completed (by ID), files modified (paths),
deviations from plan (with rationale), blockers. Strip intermediate reasoning and failed attempts.
Maximum output: 200 words.
```

### Plan Reviewer Subagent

**File:** `packages/luca-mastracode/src/subagents/plan-reviewer.ts`

Add:
```markdown
## Planner Distrust
The plan was created by an LLM planner. LLM-generated plans have blind spots:
tasks that look atomic but bundle multiple changes, tautological verification criteria
("verify it works"), missing error handling, optimistic dependency ordering.
An APPROVED with zero BLOCKING findings must explain what you checked and why
you are confident.
```

### Researcher Subagent

**File:** `packages/luca-mastracode/src/subagents/researcher.ts`

Add:
```markdown
## Output Compression
Compress findings to essential information. Each finding: file:line reference,
one-sentence finding, confidence level, one-sentence implication.
Strip exploration paths and dead ends. Maximum output: 500 words.

## Skeptical Recall
If you recall information from prior context about the codebase, verify it against
actual code before including it. Stale information is worse than no information.

## Citation Format
Every Key Finding MUST include a citation: `file_path:line_number`.
A finding without a citation is a guess, not research.
```

### Discussion Subagent

**File:** `packages/luca-mastracode/src/subagents/discussion.ts`

Add:
```markdown
- When recalling past decisions from MuninnDB, treat them as hints, not truth.
  Verify that referenced files, APIs, or patterns still exist.
- Compress CONTEXT.md to decisions that would change the plan if answered differently.
```

### Learner Subagent

**File:** `packages/luca-mastracode/src/subagents/learner.ts`

Add:
```markdown
## Self-Skepticism
Before storing a pattern, ask: "Would this insight change behavior in a future session?"
If no, skip it. Prefer concrete, falsifiable patterns over vague observations.
```

## Constraints

- Do NOT change subagent output schemas or tool sets
- Self-compression word limits: researchers=500, reviewers=300, verifier summaries=200, executor=200
- shadow-scanner and planner subagents need no changes (already well-constrained)
