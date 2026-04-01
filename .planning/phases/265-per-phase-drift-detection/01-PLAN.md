---
phase: 265
plan: 1
type: implementation
autonomous: true
wave: 1
---

# Phase 265: Per-Phase Drift Detection

## Objective

After every phase completes, mechanically check whether completed work invalidated, blocked, or made redundant any remaining phases. Spawn a reassessment agent only when actual drift is detected.

## Context

@src/skills/luca/lu.skill.ts
@src/skills/**helpers/agent-prompts.ts
@src/complexity/**helpers/model-routing.ts
@src/harness/\_\_schemas/harness.schemas.ts (pattern reference)
@src/harness/index.ts (barrel pattern reference)

## Tasks

### Task 1: Mechanical drift checker module (DRIFT-01, DRIFT-05)

Create `src/drift/__helpers/drift-checker.ts`:

- `checkDrift(completedPhaseDir: string, remainingPhases: PhaseInfo[]): DriftResult`
- Uses `git diff` (via `Bun.spawnSync`) to get changed files from the completed phase
- Compares changed file paths against `@`-references and file mentions in remaining phase plans
- Detects deleted/renamed modules via `git diff --diff-filter=DR`
- Infrastructure file ignore list: `tsconfig.json`, `package.json`, `bun.lock`, `bunfig.toml` unless structural changes (new path aliases, new workspaces)
- Returns typed `DriftResult` with `drifted: boolean`, affected phases, changed files, and drift reasons

Create `src/drift/__schemas/drift.schemas.ts`:

- `PhaseInfoSchema` — minimal phase metadata (id, description, filePaths)
- `DriftReasonSchema` — why a phase drifted (deleted, renamed, modified dependency)
- `AffectedPhaseSchema` — phase id + list of reasons
- `DriftResultSchema` — top-level result with `drifted`, `changedFiles`, `affectedPhases`

Create `src/drift/index.ts`:

- Barrel file exporting all public types, schemas, and functions

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes with new module
- [ ] DriftResultSchema validates correct shape
- [ ] Infrastructure files filtered by default

### Task 2: REASSESS_PROMPT template (DRIFT-02)

Add `REASSESS_PROMPT` to `src/skills/__helpers/agent-prompts.ts`:

- Template for `lu-reassessor` agent type (ROUTER preset)
- Accepts drift result JSON and remaining phase list
- Instructs agent to categorize each affected phase as VALID / NEEDS_UPDATE / REDUNDANT / BLOCKED
- Returns structured JSON with phase verdicts

Add `lu-reassessor` to the model routing table with ROUTER preset.

**Verification:**

- [ ] REASSESS_PROMPT is exported and callable
- [ ] `lu-reassessor` appears in MODEL_ROUTING_TABLE with ROUTER preset
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Orchestrator integration (DRIFT-03, DRIFT-04)

Edit `src/skills/luca/lu.skill.ts` Step 7o area to add a new Step 7o-drift:

- After PHASE_COMPLETE transition and routing history, run drift checker CLI
- If drift detected: spawn `lu-reassessor` agent with ROUTER_MODEL
- Apply drift response: mark REDUNDANT phases complete, park BLOCKED phases, queue NEEDS_UPDATE for re-planning
- Emit `DRIFT_DETECTED` bridge transition
- Append drift event to session-ledger.jsonl

**Verification:**

- [ ] Step 7o-drift appears between routing history and 7p gap closure
- [ ] DRIFT_DETECTED transition emitted only when drift found
- [ ] Session ledger append uses correct JSONL format
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

1. After each phase, mechanical drift check (zero LLM) compares git diff against file refs in remaining phases, detects deleted/renamed modules, infrastructure files ignored unless structural
2. When drift detected, reassessment agent categorizes remaining phases as VALID/NEEDS_UPDATE/REDUNDANT/BLOCKED, orchestrator applies actions
3. Drift events recorded in session-ledger.jsonl with DRIFT_DETECTED bridge transition

## Output

- `src/drift/__helpers/drift-checker.ts` (new)
- `src/drift/__schemas/drift.schemas.ts` (new)
- `src/drift/index.ts` (new)
- `src/skills/__helpers/agent-prompts.ts` (modified)
- `src/complexity/__helpers/model-routing.ts` (modified)
- `src/skills/luca/lu.skill.ts` (modified)
