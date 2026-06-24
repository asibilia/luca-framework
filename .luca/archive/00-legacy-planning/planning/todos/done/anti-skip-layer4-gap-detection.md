---
title: "Layer 4: Event-sourced gap detection (catch-all safety net)"
area: workflow
created: 2026-03-28
source: conversation
---

## Context

Even with layers 0-3, edge cases may slip through. An event-sourced gap detector audits the session ledger against the DAG after execution completes. 57% of microservices organizations use event sourcing + CQRS. Luca already has `session-ledger.jsonl` and `DAGCheckpointSchema` — this adds the missing gap detection.

## Task

### Part A: Gap Detector

Create `src/workflow/__helpers/gap-detector.ts`:

```typescript
function detectGaps(dag: WorkflowDAG, ledger: LedgerEntry[]): string[] {
  const requiredSteps = dag.steps.filter((s) => !s.optional).map((s) => s.id);
  const completedSteps = ledger
    .filter((e) => e.event === "STEP_COMPLETE")
    .map((e) => e.stepId);
  return requiredSteps.filter((s) => !completedSteps.includes(s));
}
```

### Part B: Post-Execution Audit

After any multi-step skill completes:

1. Read the skill's DAG definition
2. Read `session-ledger.jsonl` entries for this execution
3. Compute `expected_steps - completed_steps = gaps`
4. If gaps found:
   - Report gaps with severity (CRITICAL if mandatory step, WARNING if optional)
   - Optionally trigger re-execution of missed steps
   - Log gap metric to MuninnDB

### Part C: Session Ledger Enhancement

Ensure every step completion writes to the session ledger with:

- `step_id`: Which step completed
- `skill_name`: Which skill it belongs to
- `evidence`: Summary of what the step produced
- `timestamp`: When it completed

### Part D: Bridge Integration

New subcommand or flag: `luca-bridge audit-gaps --skill=NAME`

- Reads DAG + ledger
- Reports gaps
- Returns JSON with `{ gaps: string[], complete: boolean }`

## Notes

- Research: `docs/research/anti-step-skipping/04-novel-approaches.md` (Section 6)
- Luca already has `session-ledger.jsonl` and `DAGCheckpointSchema`
- This is the reactive safety net — it catches what layers 0-3 miss
- Can also be used for process metrics (gap rate over time)
- Estimated effort: 1 day
