---
phase: 4
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 4 Plan 1: Process Data Agent (lu-process-data)

## Objective

Create the lu-process-data agent that auto-computes workflow health metrics (appetite accuracy, rework ratio, pre-mortem signal rate) after lu-learner runs in the phase-execute pipeline. Wire it into the orchestrator so it emits PROCESS_DATA_COMPLETE to transition from `learning` to `committing`. This closes the measurement loop for process intelligence.

## Context

@src/agents/luca/lu-premortem.agent.ts (agent creation pattern reference)
@src/agents/**helpers/build-agent-registry.ts (agent registry pattern)
@src/complexity/**helpers/model-routing.ts (model routing table)
@src/skills/general/phase-execute.skill.ts (orchestrator — learning capture section)
@.planning/phases/04-process-intelligence/04-CONTEXT.md (Gray Areas 1 and 2 decisions)
@.planning/todos/pending/101-v4-process-data-agent.md (todo spec)

## Tasks

### 1. Create lu-process-data Agent Definition

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/agents/luca/lu-process-data.agent.ts` — a pure-compute agent with no tools. It receives all raw data as prompt context from the orchestrator and computes metrics, then stores them as MuninnDB engrams.

**Agent config:**

- `name`: "lu-process-data"
- `tools`: [] (no tools — pure compute from prompt context)
- `color`: "cyan"
- `cognition.default_tier`: "T1" (memory-reader — reads recalled patterns for baseline comparison)
- `cognition.promotable_to`: "T1" (never promotes — lightweight agent)
- `cognition.memory_tags`: ["metrics", "process"]
- `background_spawnable`: false
- `purpose`: "auditor"
- `allowed_contexts`: ["learning", "process-data"]

**Agent sections:**

Section 1 — `role`: Describe the agent's purpose as a process metrics computer. It receives pre-assembled data from the orchestrator and computes 3 core metrics + 2 DORA metrics (COMPLEX+ only). Include cognition integration note for T1 memory-reader tier.

Section 2 — `metric_computation`: Define the 3 core metrics with formulas:

1. **Appetite accuracy**: `1 - abs(actual_tokens - ceiling) / ceiling` where actual_tokens = appetite_used_tokens, ceiling = appetite_token_ceiling. Result clamped to [0, 1]. Store as `metric:appetite-accuracy-{milestone}-phase-{phase}`.

2. **Rework ratio**: `harness_fix_iterations / max_harness_iterations`. A ratio of 0 = no rework needed. Store as `metric:rework-ratio-{milestone}-phase-{phase}`.

3. **Pre-mortem signal rate**: `mitigations_that_prevented_failures / total_risks_identified`. Use heuristic: if a risk category matches a verification gap that was NOT found, count as successful signal. If pre-mortem did not run, omit this metric. Store as `metric:signal-rate-{milestone}-phase-{phase}`.

Section 3 — `dora_metrics`: Define 2 DORA metrics (only computed when DORA gate is true, i.e., COMPLEX+ complexity):

1. **Lead time**: `commit_timestamp - phase_start_timestamp` in minutes. Store as `metric:lead-time-{milestone}-phase-{phase}`.
2. **Change failure rate**: `verification_failures / 1` (per-run binary). Store as `metric:change-failure-rate-{milestone}-phase-{phase}`.

Section 4 — `output_format`: Define the structured output the agent must return — a JSON object with all computed metrics that the orchestrator passes to the bridge PROCESS_DATA_COMPLETE event.

**Files to create/edit:**

- `src/agents/luca/lu-process-data.agent.ts` (CREATE)

**Verification:**

- File exists at `src/agents/luca/lu-process-data.agent.ts`
- Exports `luProcessDataAgent` via `createAgent()`
- Agent has no tools (empty array)
- Agent has 4 sections (role, metric_computation, dora_metrics, output_format)
- `bunx --bun tsc --noEmit` passes

### 2. Register lu-process-data in Agent Registry

**Type:** auto
**TDD:** false
**Depends on:** 1

Add the lu-process-data agent to the agent registry so the build pipeline can generate its compiled .md file.

**Changes:**

1. Add import: `import { luProcessDataAgent } from "../luca/lu-process-data.agent";`
2. Add registry entry: `"lu-process-data": () => luProcessDataAgent,`

**Files to create/edit:**

- `src/agents/__helpers/build-agent-registry.ts` (EDIT)

**Verification:**

- Import added in the Luca-specific agents import block
- Registry entry added in alphabetical position within the Luca section
- `bunx --bun tsc --noEmit` passes

### 3. Register lu-process-data in Model Routing Table

**Type:** auto
**TDD:** false
**Depends on:** 1

Add `"lu-process-data": FAST_PROMOTED` to the MODEL_ROUTING_TABLE in the Fast-promoted section (alongside lu-learner, lu-router-fast, lu-verifier-fast).

**Files to create/edit:**

- `src/complexity/__helpers/model-routing.ts` (EDIT)

**Verification:**

- `"lu-process-data": FAST_PROMOTED` entry exists in MODEL_ROUTING_TABLE
- Entry is in the "Fast-promoted" comment section
- `bunx --bun tsc --noEmit` passes

### 4. Enable process_data Gate in Config

**Type:** auto
**TDD:** false
**Depends on:** none

Add `"process_data": true` to the `gates` section of `.planning/config.json`. This enables the `shouldRunProcessData` guard that was wired in Phase 2.

**Files to create/edit:**

- `.planning/config.json` (EDIT)

**Verification:**

- `gates.process_data` is `true` in config.json
- JSON is valid (no syntax errors)

### 5. Wire lu-process-data Invocation into phase-execute

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Modify `src/skills/general/phase-execute.skill.ts` to spawn lu-process-data after lu-learner returns, following the sequencing pattern from 04-CONTEXT.md Gray Area 1.

**Changes to the learning capture section:**

1. **After the lu-learner Task returns**, do NOT emit `LEARN_COMPLETE` via bridge.

2. **Check the process_data gate:**

   ```bash
   PROCESS_DATA_ENABLED=$(echo "$CONFIG" | bun -e "
     const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
     console.log(c.gates?.process_data ?? false);
   ")
   ```

3. **If gate enabled, collect raw data from orchestrator context:**
   - `appetite_used_tokens` and `appetite_token_ceiling` from bridge read-status
   - `loop_a_iterations` and `max_iterations` from Loop A results
   - Pre-mortem result from state context
   - Verification status from Step 7 result
   - Phase start timestamp and current time for wall_clock_ms
   - DORA gate: true if complexity is COMPLEX or CRITICAL

4. **Spawn lu-process-data via Task()** with the assembled prompt context (using the exact prompt template from 04-CONTEXT.md).

5. **After lu-process-data returns**, emit `PROCESS_DATA_COMPLETE` via bridge with the returned metrics.

6. **If gate is disabled** (or `--skip-memory` is active), emit `LEARN_COMPLETE` as before (backward-compatible fallback).

7. **Add `lu-process-data` to the sub-agent list** in the skill's "Required sub-agents" section.

8. **Add lu-process-data to the model routing documentation table** in the learning capture section (similar to the lu-learner table).

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts` (EDIT)

**Verification:**

- phase-execute references lu-process-data in sub-agent list
- The learning capture section spawns lu-process-data after lu-learner
- PROCESS_DATA_COMPLETE is emitted after lu-process-data returns
- LEARN_COMPLETE is emitted as fallback when process_data gate is disabled
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. All 4 new/modified source files are syntactically valid TypeScript
3. lu-process-data agent exists with correct structure (no tools, 4 sections, FAST_PROMOTED routing)
4. Agent registry includes lu-process-data entry
5. Model routing table includes lu-process-data with FAST_PROMOTED preset
6. config.json has `process_data: true` gate
7. phase-execute orchestrator correctly sequences: lu-learner -> lu-process-data -> PROCESS_DATA_COMPLETE

## Success Criteria

- lu-process-data agent definition compiles and is registered
- Model routing resolves lu-process-data to FAST_PROMOTED preset (fast at all levels, balanced at CRITICAL)
- phase-execute spawns lu-process-data after lu-learner with all required metrics data passed as prompt context
- State machine transition fires PROCESS_DATA_COMPLETE after process data collection
- Backward compatibility maintained: when process_data gate is disabled, LEARN_COMPLETE fires as before

## Output Specification

- `src/agents/luca/lu-process-data.agent.ts` — New agent definition
- `src/agents/__helpers/build-agent-registry.ts` — Updated with lu-process-data import and registry entry
- `src/complexity/__helpers/model-routing.ts` — Updated with lu-process-data routing entry
- `.planning/config.json` — Updated with process_data gate
- `src/skills/general/phase-execute.skill.ts` — Updated learning capture section with lu-process-data spawn
