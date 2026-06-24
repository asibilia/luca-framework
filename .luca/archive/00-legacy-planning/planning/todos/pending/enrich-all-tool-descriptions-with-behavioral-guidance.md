---
title: "Enrich all 10 tool descriptions with behavioral guidance, priority ordering, and examples"
area: prompt-engineering
created: 2026-04-13
priority: high
source: research
sprint: 3
---

## Task

Rewrite all 10 custom tool descriptions from minimal action schemas (~379 tokens total) to rich behavioral guidance with when/when-not rules, priority ordering, cross-tool coordination, and examples (~2,384 tokens total). Implementation in 3 phases by tool traffic priority.

## Context

Claude Code allocates ~79% of its prompt token budget (~18,000 tokens) to tool definitions. luca-mastracode's 10 tools average ~38 tokens each — a **16-33x deficit** in description depth. The tool reviewer produced complete rewrite proposals for every tool. Total cost: +2,005 tokens (1.2% of context window). This is the highest-ROI single investment identified by the research.

Each tool description should follow Claude Code's five-part anatomy: purpose, usage guidance (when/how), behavioral constraints (what NOT to do), priority ordering (vs alternatives), and examples.

## Research References

- [03-tool-definition-engineering.md](../../docs/research/prompt-architecture/03-tool-definition-engineering.md) — Full analysis of Claude Code's tool definition patterns, five-part anatomy, ~79% budget allocation
- [09-instruction-budget-and-prompt-economics.md](../../docs/research/prompt-architecture/09-instruction-budget-and-prompt-economics.md) — MCP token overhead, tool definition budget math
- [10-final-actionable-review.md](../../docs/research/prompt-architecture/10-final-actionable-review.md) — Sprint 3, item 3.1

## Implementation

### Phase 1: Highest-Traffic Tools (do first)

1. **workflowState** — 12 actions, most complex. Add per-action guidance, pipeline ordering constraints, cross-tool disambiguation with sessionLedger. (+380 tokens)
2. **runChecks** — Fix-loop efficiency. Add convergence interpretation, failFast guidance, relationship to verificationResult. (+205 tokens)
3. **verificationResult** — Sequential dependency on runChecks. Add the runChecks→verificationResult→workflowState flow, evidence requirements. (+225 tokens)

### Phase 2: Cross-Tool Disambiguation

4. **sessionLedger** — Add READ-ONLY emphasis, "Do NOT use for execution tracking" disambiguation vs workflowState. (+185 tokens)
5. **manageTodos** — Add lifecycle flow, action guidance, "Do NOT use for research artifacts" disambiguation vs writePlanningFile. (+185 tokens)
6. **pipelineLock** — Add infrastructure-level framing, "Do NOT use for state reads" disambiguation vs workflowState. (+175 tokens)

### Phase 3: Remaining Tools

7. **manageRoadmap** — Add WSJF guidance, create-overwrites warning, disambiguation vs workflowState. (+165 tokens)
8. **writePlanningFile** — Add security boundary explanation, "Do NOT use for todos/roadmap/state". (+155 tokens)
9. **repoCleanup** — Add multi-step orchestration workflow, apply-fix destructiveness warning. (+210 tokens)
10. **classifyComplexity** — Add early-pipeline-only guidance, over-estimate heuristic. (+120 tokens)

### Token Budget Summary

| Tool | Current | Proposed | Delta |
|------|---------|----------|-------|
| workflowState | ~44 | ~424 | +380 |
| runChecks | ~33 | ~238 | +205 |
| verificationResult | ~32 | ~257 | +225 |
| sessionLedger | ~26 | ~211 | +185 |
| manageTodos | ~50 | ~235 | +185 |
| pipelineLock | ~27 | ~202 | +175 |
| manageRoadmap | ~34 | ~199 | +165 |
| writePlanningFile | ~44 | ~199 | +155 |
| repoCleanup | ~41 | ~251 | +210 |
| classifyComplexity | ~48 | ~168 | +120 |
| **TOTAL** | **~379** | **~2,384** | **+2,005** |

Full rewrite proposals for every tool are in the tool reviewer's output (summarized in the final review doc).

## Files Changed

Tool description strings in:
- `packages/luca-mastracode/src/tools/classify-complexity.ts`
- `packages/luca-mastracode/src/tools/workflow-state.ts`
- `packages/luca-mastracode/src/tools/build-mode-tools.ts` (or wherever descriptions are defined for each tool)
- All other tool definition files in `packages/luca-mastracode/src/tools/`

## Constraints

- Total enriched tool descriptions should stay under 2,500 tokens
- Do NOT duplicate information already in tool schemas (parameter names, types) — focus on behavioral guidance
- Each tool must have: purpose, when to use, when NOT to use, and cross-tool coordination note
