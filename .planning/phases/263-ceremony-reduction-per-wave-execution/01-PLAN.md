---
phase: 263
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 263 Plan 1: Ceremony Reduction & Per-Wave Execution

## Objective

Eliminate two LLM-spending ceremony steps from the workflow pipeline:

1. Replace the `process-data-{NN}` Agent() call (Step 7m) with a deterministic Bun CLI invocation that computes phase metrics directly from state.json — zero LLM tokens consumed.
2. Confirm the configure step (Step 4) is already inline (it is, per the current lu.skill.ts — only needs wiring of the new process-data path).
3. Shift wave execution from one Agent() per full PLAN.md to one Agent() per wave, with context assembled fresh per wave and OVERFLOW protocol support.

All four requirements (CEREM-01 through CEREM-04) are addressed in this single wave because the changes are tightly sequential — the compute module must exist before the skill template can reference it, and the per-wave executor shape must be in place before the wave dispatch loop is updated.

## Context

- `@src/skills/luca/lu.skill.ts` — Step 4 (configure, already inline), Step 7h (execute-{NN}), Step 7m (process-data Agent call to replace)
- `@src/skills/__helpers/agent-prompts.ts` — EXECUTE_WAVES_PROMPT, PROCESS_DATA_PROMPT
- `@src/iteration/__helpers/` — reference for module shape conventions in this codebase

## Tasks

### 1. Create `src/process-data/compute.ts`

**Type:** auto
**TDD:** false
**Depends on:** none

Create a new TypeScript module at `src/process-data/compute.ts` that is invocable as a standalone CLI script via `bun src/process-data/compute.ts --context=<path>`. It must:

- Accept `--context=<path>` CLI arg (path to a JSON file — typically `.planning/state.json` or a harness-result JSON)
- Read the file from disk using `Bun.file()`
- Compute these aggregates from the state data:
  - `duration_ms` — difference between `started_at` and `updated_at` if present, else 0
  - `harness_pass_rate` — ratio of harness passes to total harness attempts (from `harness_runs` array if present, else 1.0)
  - `task_completion_rate` — count of tasks with `status === "complete"` divided by total tasks (from `tasks` array if present, else 1.0)
  - `deviation_count` — count of tasks where `deviated === true` (from `tasks` array if present, else 0)
  - `convergence_iterations` — total harness fix loop iterations across all runs (sum of `iterations` in `harness_runs` if present, else 0)
- Write result to stdout as JSON: `{ phase, duration_ms, harness_pass_rate, task_completion_rate, deviation_count, convergence_iterations }`
- Store metrics in `.planning/state.json` under a `process_data_metrics` field using `luca-bridge set-field --field=process_data_metrics --value='<json>'` (shell-out via `Bun.$`)
- Exit 0 on success, exit 1 with error message to stderr on failure
- No LLM calls, no MuninnDB writes — purely mechanical

Use functional style (no classes). Parse CLI args with a simple loop over `Bun.argv`. Use `Bun.file()` and `.json()` for reads. Use `Bun.$` for the bridge shell-out.

**Files to create/edit:**

- `src/process-data/compute.ts` (new file)

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors on the new file
- Running `bun src/process-data/compute.ts --context=.planning/state.json` exits 0 and emits valid JSON to stdout
- Output JSON contains all six required fields

### 2. Replace process-data Agent() call in `lu.skill.ts` with deterministic invocation

**Type:** auto
**TDD:** false
**Depends on:** 1

In `src/skills/luca/lu.skill.ts`, Step 7m (line ~757–763), replace:

```
Agent(name: "process-data-{NN}", subagent_type: "lu-process-data", model: FAST_PROMOTED_MODEL, prompt: PROCESS_DATA_PROMPT({phase: NN, ...}))
luca-bridge transition --event=PROCESS_DATA_COMPLETE 2>/dev/null || true
```

with:

```bash
# Deterministic process-data (zero LLM tokens)
PROCESS_DATA_OUTPUT=$(bun src/process-data/compute.ts --context=.planning/state.json 2>/dev/null || echo '{}')
echo "Process data: $PROCESS_DATA_OUTPUT"
luca-bridge transition --event=PROCESS_DATA_COMPLETE 2>/dev/null || true
```

The Agent() call, subagent_type mapping entry, and the `process-data-*` row in the Agent Type Mapping table should be preserved in comments with a note that this is now a deterministic CLI invocation (keep for documentation purposes — other tooling may reference the agent name pattern). The template `PROCESS_DATA_PROMPT` in `agent-prompts.ts` should be deprecated with a JSDoc `@deprecated` note but not deleted (backward compat).

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (edit Step 7m section)
- `src/skills/__helpers/agent-prompts.ts` (add `@deprecated` to PROCESS_DATA_PROMPT)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Step 7m section in lu.skill.ts no longer contains `Agent(name: "process-data-` as an active call
- `PROCESS_DATA_PROMPT` in agent-prompts.ts has `@deprecated` in JSDoc

### 3. Add `EXECUTE_WAVE_PROMPT` for per-wave single-wave dispatch

**Type:** auto
**TDD:** false
**Depends on:** 2

Add a new prompt template `EXECUTE_WAVE_PROMPT` (singular, not plural) in `src/skills/__helpers/agent-prompts.ts` designed for single-wave dispatch with fresh context assembly. Distinction from `EXECUTE_WAVES_PROMPT`:

- Takes a `wave` number parameter (`p.wave: number`) in addition to existing params — add `wave?: number` to `AgentPromptParams`
- Accepts pre-assembled context as a `waveContext?: string` field on `AgentPromptParams` — the orchestrator assembles this before dispatch
- Instructions scope the executor to **only the tasks in the specified wave** (not all waves in the PLAN.md)
- Includes OVERFLOW protocol instruction:
  - If the executor detects context exhaustion mid-wave (token budget approaching limit), it must output `OVERFLOW:{task-id}` where `task-id` is the first incomplete task
  - The orchestrator checks for this signal after each wave Agent() returns and spawns a fresh Agent() for remaining tasks if detected
- Context assembly note: the orchestrator reads only the relevant wave section from PLAN.md (max 2K tokens) plus phase goal before dispatching

The existing `EXECUTE_WAVES_PROMPT` is preserved unchanged for backward compatibility.

**Files to create/edit:**

- `src/skills/__helpers/agent-prompts.ts` (add `EXECUTE_WAVE_PROMPT`, extend `AgentPromptParams`)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `EXECUTE_WAVE_PROMPT` is exported from agent-prompts.ts
- `AgentPromptParams.wave` and `AgentPromptParams.waveContext` fields exist as optional
- Template body references wave-scoped context and OVERFLOW protocol

### 4. Update Step 7h in `lu.skill.ts` to per-wave dispatch loop

**Type:** auto
**TDD:** false
**Depends on:** 3

In `src/skills/luca/lu.skill.ts`, Step 7h (line ~497–504), replace the single `execute-{NN}` Agent() call with a per-wave dispatch loop:

```bash
# Parse waves from PLAN.md frontmatter
WAVES=$(bun -e "
const glob = new Bun.Glob('.planning/phases/{NN}-*/*-PLAN.md');
const waves = new Set();
for await (const f of glob.scan('.')) {
  const text = await Bun.file(f).text();
  const m = text.match(/^wave:\s*(\d+)/m);
  if (m) waves.add(parseInt(m[1]));
}
console.log(JSON.stringify([...waves].sort((a,b) => a-b)));
" 2>/dev/null || echo '[1]')

FOR each WAVE_NUM in $WAVES (serial):
  # Assemble wave context: read only the wave's task section from PLAN.md (cap 2K tokens ~1500 chars)
  WAVE_SECTION=$(bun -e "
  // Read relevant wave section from PLAN.md, trim to ~1500 chars
  ..." 2>/dev/null || echo "")

  WAVE_RESULT=$(Agent(
    name: "execute-{NN}-w{WAVE_NUM}",
    subagent_type: "lu-executor",
    model: ORCHESTRATOR_MODEL,
    prompt: EXECUTE_WAVE_PROMPT({ phase: NN, wave: WAVE_NUM, waveContext: WAVE_SECTION, ... })
  ))

  # OVERFLOW protocol: if agent output contains OVERFLOW:{task-id}, spawn fresh agent for remainder
  if echo "$WAVE_RESULT" | grep -q "OVERFLOW:"; then
    OVERFLOW_TASK=$(echo "$WAVE_RESULT" | grep -o "OVERFLOW:[^ ]*" | head -1 | cut -d: -f2)
    echo "INFO: Wave $WAVE_NUM overflow at task $OVERFLOW_TASK — spawning fresh agent for remainder"
    Agent(
      name: "execute-{NN}-w{WAVE_NUM}-overflow",
      subagent_type: "lu-executor",
      model: ORCHESTRATOR_MODEL,
      prompt: EXECUTE_WAVE_PROMPT({ phase: NN, wave: WAVE_NUM, startFromTask: OVERFLOW_TASK, ... })
    )
  fi
```

The existing single-call `Agent(name: "execute-{NN}", ...)` line is replaced. The harness fix loop (7i) and all downstream steps are unchanged — they still run once per phase after all waves complete.

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (edit Step 7h section)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Step 7h in lu.skill.ts contains `execute-{NN}-w{WAVE_NUM}` pattern
- Step 7h contains OVERFLOW protocol check
- Single `Agent(name: "execute-{NN}"` call without wave suffix no longer appears as the sole execution call
- Harness fix loop (7i) reference is intact and unchanged below Step 7h

## Verification

After all tasks complete, run the following checks:

```bash
bunx --bun tsc --noEmit
```

Must pass with zero errors.

Spot-check lu.skill.ts:

- Step 7m: `Agent(name: "process-data-{NN}"` does not appear as an active call
- Step 7h: `execute-{NN}-w{WAVE_NUM}` pattern present, OVERFLOW protocol present
- Step 7i harness loop intact below Step 7h

Spot-check agent-prompts.ts:

- `EXECUTE_WAVE_PROMPT` exported
- `PROCESS_DATA_PROMPT` has `@deprecated` JSDoc

Spot-check src/process-data/compute.ts:

- File exists
- `bun src/process-data/compute.ts --context=.planning/state.json` exits 0

## Success Criteria

1. `bun src/process-data/compute.ts --context=.planning/state.json` runs deterministically and outputs aggregated metrics JSON without any Agent() call
2. Step 7m in lu.skill.ts invokes the compute CLI via shell, not via Agent()
3. Step 7h dispatches one Agent() per wave, not one Agent() for all waves; orchestrator reads no more than 2K tokens of wave context per dispatch
4. OVERFLOW protocol is present: executor can signal `OVERFLOW:{task-id}` and orchestrator spawns a fresh Agent() for remaining tasks
5. Zero TypeScript compilation errors

## Output Specification

Artifacts produced by this plan:

- `src/process-data/compute.ts` — new deterministic CLI module
- `src/skills/luca/lu.skill.ts` — modified Step 7h (per-wave loop) and Step 7m (deterministic process-data)
- `src/skills/__helpers/agent-prompts.ts` — new `EXECUTE_WAVE_PROMPT` export, deprecated `PROCESS_DATA_PROMPT`
