---
title: "Add cross-tool coordination and tool usage priority sections to mode instructions"
area: prompt-engineering
created: 2026-04-13
priority: medium
source: research
sprint: 3
---

## Task

Add a `## Tool Usage Priority` section to each pipeline mode instruction file that lists tools in order of typical usage for that mode, with explicit cross-tool disambiguation.

## Context

Tool descriptions (enriched in the tool enrichment todo) address per-tool behavior, but modes need coordination guidance that spans tools. When should you use workflowState vs sessionLedger? When runChecks vs verificationResult? This cross-tool coordination lives in the mode instructions, not individual tool descriptions.

## Research References

- [03-tool-definition-engineering.md](../../docs/research/prompt-architecture/03-tool-definition-engineering.md) — Section 5: Cross-agent comparison, tool coordination patterns
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 3, item 3.3

## Implementation

### Execute Mode

**File:** `packages/luca-mastracode/src/instructions/execute.md`

```markdown
## Tool Usage Priority
1. workflowState("read") — Always first, to understand current phase/wave position
2. workflowState("start-phase") — Once per phase, before beginning work
3. runChecks — After each code change to validate
4. workflowState("record-iteration") — After each fix-check cycle
5. verificationResult("write") — After final check pass or stall
6. workflowState("complete-phase") — To finalize the phase

Do NOT use sessionLedger during execute — it is for finalize only.
Do NOT use manageTodos("add") during execute — capture new work in review notes instead.
```

### Review Mode

```markdown
## Tool Usage Priority
1. workflowState("read") — Check current state
2. runChecks — Verify current code status
3. verificationResult("read") — Get latest verification
4. writePlanningFile — Write capture files and review report
5. workflowState("save-review-results") — Persist the iteration plan

Do NOT use sessionLedger during review. Do NOT use repoCleanup("apply-fix").
```

### Similar sections for triage, research, architect, finalize modes.

## Files Changed

- `packages/luca-mastracode/src/instructions/execute.md`
- `packages/luca-mastracode/src/instructions/review.md`
- `packages/luca-mastracode/src/instructions/triage.md`
- `packages/luca-mastracode/src/instructions/architect.md`
- `packages/luca-mastracode/src/instructions/research.md`
- `packages/luca-mastracode/src/instructions/finalize.md`

## Constraints

- Each section should be under 100 words
- Tool names must match actual tool IDs from the tool registry
- This todo should be done AFTER the tool enrichment todo so descriptions and mode instructions are consistent
