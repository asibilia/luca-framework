---
title: "Compress procedural templates to principles in pipeline instruction files"
area: prompt-engineering
created: 2026-04-13
priority: high
source: research
sprint: 2
---

## Task

Replace verbose procedural templates (ROADMAP structure, PLAN structure, MuninnDB code blocks, capture file templates) with concise principle-based descriptions across all pipeline instruction files. Target: ~510 tokens freed.

## Context

Research shows principles generalize to unanticipated scenarios while procedures fail when the situation doesn't match the script. Multiple instruction files contain full markdown templates and MuninnDB code blocks that consume attention-trough tokens. The model can generate markdown structure from principles — it doesn't need pre-formatted examples.

Comprehension drops ~12% per 100 words beyond 500 words (research finding). Several pipeline files exceed 500 words significantly: architect.md (~1,350 tokens), execute.md (~1,500 tokens), finalize.md (~1,200 tokens).

## Research References

- [09-instruction-budget-and-prompt-economics.md](../../docs/research/prompt-architecture/09-instruction-budget-and-prompt-economics.md) — Sections 1-2: Shared instruction budget, dilution effect
- [00-overview.md](../../docs/research/prompt-architecture/00-overview.md) — Section 3: "Principles Over Procedures"
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 2, item 2.3

## Implementation

### Compression Targets

| File | Section | Current | Compressed To | Token Savings |
|------|---------|---------|--------------|---------------|
| `architect.md` | ROADMAP template (lines ~119-138) | 20 lines | 3 lines + principles | ~80 tokens |
| `architect.md` | PLAN template (lines ~163-203) | 40 lines | 8 lines + principles | ~120 tokens |
| `architect.md` | Step 1 Git Setup (lines ~26-35) | 10 lines | 3 lines | ~40 tokens |
| `execute.md` | Review capture template (lines ~260-284) | 25 lines | 4 lines | ~60 tokens |
| `execute.md` | Review dimensions (lines ~226-258) | 32 lines | 6 lines | ~80 tokens |
| `research.md` | MuninnDB storage blocks (lines ~216-257) | 30 lines | 6 lines | ~80 tokens |
| `finalize.md` | Session Archive template (lines ~89-107) | 19 lines | 2 lines | ~50 tokens |
| **Total** | | | | **~510 tokens** |

### Example Compression

**architect.md ROADMAP template — before** (20 lines):
Full markdown template with headers, phases, WSJF table

**After** (3 lines):
```markdown
ROADMAP.md must contain: overview, phases ordered by WSJF score (highest first), each with
objective, dependencies, estimated scope (S/M/L/XL), and task count. Use WSJF =
(Business Value + Time Criticality + Risk Reduction) / Job Size, each factor 1-5.
```

### Procedural-to-Principle Conversions

**architect.md Step 1 — before:**
```
1. Create GitHub issue describing the work
2. Create feature branch from default branch using naming convention...
3. Store issue number and branch name in workflow_state
```

**After:**
```
Unless `--skip-branch` is set, create a GitHub issue and feature branch before planning.
Branch: `<type>/<issue-number>-<short-description>` where type is feat|fix|refactor.
Store issue number and branch in workflow state.
```

## Files Changed

- `packages/luca-mastracode/src/instructions/architect.md`
- `packages/luca-mastracode/src/instructions/execute.md`
- `packages/luca-mastracode/src/instructions/research.md`
- `packages/luca-mastracode/src/instructions/finalize.md`

## Constraints

- Do NOT remove information — compress it. Every piece of behavioral guidance must survive.
- Do NOT compress the execution loop pseudo-code in execute.md — its structured format is valuable
- The 510-token savings offsets the ~200-token cost of dual HARD_CONSTRAINTS injection
