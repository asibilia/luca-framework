---
phase: 5
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 5 Plan 1: Self-Tuning Governance (#103)

## Objective

Add graduation criteria and auto-skip logic so that expensive workflow components (pre-mortem, retro question, outcome trigger, divergent nudge) can self-disable when they stop providing value. lu-process-data computes and stores aggregate metrics; phase-discuss reads the aggregate to decide whether to skip pre-mortem. This is the safety net ensuring v4 additions do not become dead weight.

## Context

@src/agents/luca/lu-process-data.agent.ts (agent to extend with aggregate metric computation)
@src/skills/general/phase-discuss.skill.ts (skill to extend with auto-skip check)
@.planning/phases/05-governance-and-ux/05-CONTEXT.md (Gray Areas 1 and 4 decisions)
@.planning/todos/pending/103-v4-self-tuning-governance.md (todo spec)

## Tasks

### 1. Add Aggregate Metric Computation to lu-process-data

**Type:** auto
**TDD:** false
**Depends on:** none

Extend `src/agents/luca/lu-process-data.agent.ts` to compute and store running aggregate metrics alongside the existing per-phase metrics. Per 05-CONTEXT.md Gray Area 1, this is a natural extension of the agent's existing computation role.

**Changes to the agent definition:**

1. **Add a new section (order 5) titled `aggregate_metrics`** that instructs the agent to compute 4 running aggregates after the per-phase metrics are computed:
   - **signal_rate_aggregate**: Running average of `signal_rate` over last 20 MODERATE+ runs. Recall `metric:signal-rate-aggregate` from MuninnDB (provided in prompt context by orchestrator). If prior aggregate exists, compute weighted running average: `new_aggregate = (prior_aggregate * prior_count + current_signal_rate) / (prior_count + 1)`. If no prior exists, set aggregate = current signal_rate with sample_count = 1. Storage key: `metric:signal-rate-aggregate`.

   - **retro_response_rate**: Running average of milestone retro developer responses. Recall `metric:retro-response-rate` from prompt context. Same weighted average formula. Storage key: `metric:retro-response-rate`.

   - **divergent_optin_rate**: Running average of divergent mode opt-ins at milestone boundaries. Recall `metric:divergent-optin-rate` from prompt context. Same weighted average formula. Storage key: `metric:divergent-optin-rate`.

   - **outcome_completion_rate**: Running average of outcome tracking completion. Recall `metric:outcome-completion-rate` from prompt context. Same weighted average formula. Storage key: `metric:outcome-completion-rate`.

   Each aggregate metric stores: `{ rate: number, sample_count: number, last_updated: ISO8601 }`.

   Instruct the agent: Only compute an aggregate if the corresponding per-phase metric is non-null. If the per-phase metric is null (e.g., pre-mortem did not run), do not update the aggregate — return the prior aggregate value unchanged.

2. **Update the `output_format` section (order 4)** to include the aggregate metrics in the JSON output:

   Add to the JSON schema after the `storage_keys` object:

   ```json
   "aggregate_metrics": {
     "signal_rate_aggregate": { "rate": "<number 0-1 | null>", "sample_count": "<integer>", "last_updated": "<ISO 8601>" },
     "retro_response_rate": { "rate": "<number 0-1 | null>", "sample_count": "<integer>", "last_updated": "<ISO 8601>" },
     "divergent_optin_rate": { "rate": "<number 0-1 | null>", "sample_count": "<integer>", "last_updated": "<ISO 8601>" },
     "outcome_completion_rate": { "rate": "<number 0-1 | null>", "sample_count": "<integer>", "last_updated": "<ISO 8601>" }
   },
   "aggregate_storage_keys": {
     "signal_rate_aggregate": "metric:signal-rate-aggregate",
     "retro_response_rate": "metric:retro-response-rate",
     "divergent_optin_rate": "metric:divergent-optin-rate",
     "outcome_completion_rate": "metric:outcome-completion-rate"
   }
   ```

   Update the rules to note: Always include all 4 aggregate metric keys. Set to null when there is no prior aggregate AND the per-phase metric is also null.

3. **Update the `metric_computation` section (order 2)** to add a note after the signal_rate formula: "After computing the per-phase signal rate, this value will also feed the aggregate computation in the aggregate_metrics section."

**Files to create/edit:**

- `src/agents/luca/lu-process-data.agent.ts` (EDIT)

**Verification:**

- Agent now has 5 sections (role, metric_computation, dora_metrics, output_format, aggregate_metrics)
- The aggregate_metrics section defines 4 aggregate metrics with weighted running average formula
- The output_format section includes aggregate_metrics and aggregate_storage_keys in the JSON schema
- `bunx --bun tsc --noEmit` passes

### 2. Add Auto-Skip Logic to phase-discuss Pre-Mortem Gate

**Type:** auto
**TDD:** false
**Depends on:** none

Extend `src/skills/general/phase-discuss.skill.ts` to add a second gate check after the existing premortem config gate. Per 05-CONTEXT.md Gray Area 1, this adds a MuninnDB-based auto-skip that supplements (not replaces) the config gate.

**Changes to the skill's main section content:**

1. **Locate the Pre-Mortem Risk Analysis section** (currently starting at the "## Pre-Mortem Risk Analysis" heading, around the gate check and skip conditions).

2. **Add a new subsection after the existing "### Skip Conditions" block** (after the line "When skipping, emit DISCUSS_COMPLETE as normal and proceed to next steps."), titled "### Self-Tuning Auto-Skip":

   ```markdown
   ### Self-Tuning Auto-Skip

   If the config gate passes (premortem IS enabled), check whether signal rate data suggests pre-mortem is not providing value:

   1. Recall `metric:signal-rate-aggregate` from MuninnDB:
   ```

   mcp**muninn**muninn_recall(vault: "default", context: "metric:signal-rate-aggregate")

   ````

   2. Parse the recalled engram. If the aggregate exists AND meets BOTH conditions:
   - `sample_count >= 20` (sufficient data from 20+ MODERATE+ runs)
   - `rate < 0.10` (less than 10% of pre-mortem risks resulted in useful mitigations)

   Then AUTO-SKIP pre-mortem:
   - Do NOT spawn lu-premortem
   - Store auto-skip decision as MuninnDB engram:
     ```
     mcp__muninn__muninn_remember(
       vault: "default",
       concept: "process:auto-skip",
       content: "Pre-mortem auto-skipped: signal rate {rate} over {sample_count} runs. Threshold: <10% over 20+ runs."
     )
     ```
   - Log: "Pre-mortem auto-skipped (signal rate {rate} below threshold over {sample_count} runs)"
   - Proceed to next steps (emit DISCUSS_COMPLETE as normal)

   3. If the aggregate does NOT exist or conditions are NOT met: proceed with pre-mortem as normal.

   **Important:** The config gate (`gates.premortem`) takes precedence. If config says disabled, pre-mortem never runs regardless of signal rate. Self-tuning only applies when config says enabled but data suggests low value.
   ````

3. **Update the Success Criteria section** to add a new checkbox:
   - `[ ] Self-tuning auto-skip checked signal rate aggregate before pre-mortem (MODERATE+)`

**Files to create/edit:**

- `src/skills/general/phase-discuss.skill.ts` (EDIT)

**Verification:**

- The Pre-Mortem Risk Analysis section now has a "Self-Tuning Auto-Skip" subsection
- The auto-skip logic recalls `metric:signal-rate-aggregate` from MuninnDB
- The threshold is: sample_count >= 20 AND rate < 0.10
- Auto-skip stores a `process:auto-skip` engram for transparency
- The config gate still takes precedence (disabled = no pre-mortem regardless)
- Success criteria updated with the new checkbox
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. lu-process-data agent has 5 sections with aggregate metric computation
3. lu-process-data output format includes aggregate_metrics and aggregate_storage_keys
4. phase-discuss has self-tuning auto-skip logic in the pre-mortem gate section
5. Auto-skip threshold matches the spec: <10% signal rate over 20+ MODERATE+ runs
6. Config gate precedence preserved (gates.premortem = false still disables pre-mortem)
7. Auto-skip decision is stored as a `process:auto-skip` engram for audit trail

## Success Criteria

- lu-process-data computes 4 running aggregate metrics (signal rate, retro response, divergent opt-in, outcome completion) with weighted running averages
- Aggregate metrics stored with sample_count for graduation threshold evaluation
- phase-discuss auto-skips pre-mortem when signal rate aggregate < 10% over 20+ runs
- Config gate still provides manual override (developer can force enable/disable)
- Auto-skip decisions logged as MuninnDB engrams for transparency
- Pattern is uniform: lu-process-data computes, consuming skills read and decide

## Output Specification

- `src/agents/luca/lu-process-data.agent.ts` -- Updated with aggregate_metrics section and expanded output format
- `src/skills/general/phase-discuss.skill.ts` -- Updated with self-tuning auto-skip logic in pre-mortem gate
