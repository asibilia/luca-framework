# Phase 10: v2 Plan/Executor Enhancement + Config Updates - Research

**Researched:** 2026-03-24
**Domain:** Luca v2 pipeline — planner/executor agents, config schemas, skill registration
**Confidence:** HIGH

---

## Summary

Phase 10 connects graduated research engrams to the plan and execute steps. Six files need
modification and two need to be created. All modifications follow well-established patterns in
the codebase — no new patterns need to be invented.

The planner gets a new `research_refs` section added to its `plan_structure` section describing
the `**Research refs:**` bold-key format. The executor gets a new `per_task_recall` section
describing the extract → recall → inject protocol. The `phase-plan` skill needs to thread
`GRADUATION-REPORT.md` content from the phase research directory into the planner's prompt
context. The `phase-execute` orchestrator needs to parse `**Research refs:**` lines from each
task before spawning `lu-executor`, then pass a `<research_context>` block in the executor
prompt. The config schema requires two new files (`research-config.schemas.ts`,
`workflow-version.schemas.ts`) and one file extension (`lu-config.schemas.ts`). The complexity
schema extension adds two optional fields to `ComplexityGateSchema`. Finally a new
`phase-plan-review.skill.ts` must be created, modelled closely on `phase-research-review.skill.ts`
but using BLOCKING/ADVISORY severity and the existing code-architect/dx-advocate/security-auditor
reviewer agents.

**Primary recommendation:** Follow the design doc specs precisely. All schema shapes, regex
patterns, and severity terms are locked in CONTEXT.md. The main implementation work is
threading values through existing prompt templates.

---

## Component Analysis

### 1. lu-planner.agent.ts

**File:** `src/agents/luca/lu-planner.agent.ts`

**Current structure:**

The agent is built from an `AgentConfig` object with a `sections` array. Each section has a
`title` string and a `content` string. Sections render in `order` sequence. The current sections
are (in order):

| order | title                  | purpose                                                     |
| ----- | ---------------------- | ----------------------------------------------------------- |
| 1     | `role`                 | Role identity + cognition_integration block                 |
| 2     | `cognitive_pre_flight` | Memory recall triggers                                      |
| 3     | `planning_methodology` | Goal-backward analysis steps                                |
| 4     | `plan_structure`       | PLAN.md template with frontmatter, Tasks, Verification etc. |
| 5     | `context_integration`  | Where context comes from                                    |
| 6     | `checkpoint_strategy`  | Auto vs checkpoint task types                               |
| 7     | `quality_guidelines`   | Granularity, verification coverage                          |
| 8     | `appetite_awareness`   | Budget-aware planning                                       |

**Where to add `research_refs`:**

The `plan_structure` section (order 4) contains the canonical PLAN.md template. The
`**Research refs:**` line belongs inside the Task block template, alongside the existing
`**Type:**`, `**TDD:**`, `**Depends on:**`, `**Verification:**` lines.

Current task template (inside `plan_structure` content):

```markdown
### 1. [Task Name]

**Type:** auto | checkpoint:human-verify | checkpoint:decision | checkpoint:human-action
**TDD:** true | false
**Depends on:** [task numbers if any]

[Detailed description of what needs to be done]

**Files to create/edit:**

- [file paths]

**Verification:**

- [How to verify this task is complete]
```

Updated task template (add `**Research refs:**` line):

```markdown
### 1. [Task Name]

**Type:** auto | checkpoint:human-verify | checkpoint:decision | checkpoint:human-action
**TDD:** true | false
**Depends on:** [task numbers if any]
**Research refs:** research:concept-name-1, research:concept-name-2

[Detailed description of what needs to be done]

**Files to create/edit:**

- [file paths]

**Verification:**

- [How to verify this task is complete]
```

A new section `research_refs_guidance` should be added (order 4.5, or appended after
`plan_structure` as order 5, shifting subsequent orders up) to explain when and how to populate
research refs. The guidance must cover:

- Only include refs if `GRADUATION-REPORT.md` is present in the phase directory
- Read the report to discover available `research:*` concept names
- Match refs to task scope — 2-4 per task, never all refs on every task
- Pitfall refs (`research:pitfall-*`) should always accompany the task most likely to trigger the pitfall
- If no graduated research exists, omit the `**Research refs:**` line entirely (graceful degradation)

**Confidence:** HIGH — pattern is clear from existing bold-key fields in `plan_structure`.

---

### 2. lu-executor.agent.ts

**File:** `src/agents/luca/lu-executor.agent.ts`

**Current structure:**

Sections (in order):

| order | title                      | purpose                                                                                          |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| 1     | `role`                     | Role identity + cognition_integration block (T2)                                                 |
| 2     | `working_memory`           | Session logging, summary memory application                                                      |
| 3     | `execution_flow`           | load_project_state → load_plan → record_start_time → determine_execution_pattern → execute_tasks |
| 4     | `task_implementation_loop` | Self-review cycle                                                                                |
| 5     | `deviation_rules`          | Rules 1-4 for unexpected work                                                                    |
| 6     | `tdd_execution_flow`       | TDD RED/GREEN cycle                                                                              |
| 6     | `tdd_retry_loop`           | TDD retry loop (same order 6 as above)                                                           |

**Where to add per-task recall:**

The `execute_tasks` step (inside `execution_flow`, order 3) is where the executor starts each
task. The per-task recall protocol belongs as a new named step inside `execute_tasks`, inserted
before the self-review cycle begins.

The recall protocol should be added either:

(a) As a new section `per_task_recall` at order 3.5, OR
(b) Inline within the `execute_tasks` step in `execution_flow`

Option (a) is cleaner — keeps `execution_flow` focused on flow control and puts the recall
logic in its own section. The existing pattern of named sections for distinct behaviours
supports this.

**Protocol content (from CONTEXT.md Decision 3 and per-task-recall.md):**

```
Before implementing each task:

1. Extract research refs from the current task:
   refs = task_content.match(/\*\*Research refs:\*\*\s*(.+)/)?.[1].split(',').map(s => s.trim())

2. If refs present:
   For each ref in refs:
     result = muninn_recall(vault: REPO_VAULT, context: ref)
     if result returns engrams:
       append to research_context[]
     else:
       log: "RESEARCH GAP: {ref} not found in MuninnDB. Proceeding without this context."

3. Inject as <research_context> block before implementation:
   ## {ref}
   {engram content}

4. Cap: max 5 engrams per task (from config perTaskRecall.maxEngramsPerTask)
5. If refs absent: skip recall entirely (v1 behavior)
6. Include research gaps in SUMMARY.md under "Research gaps encountered"
```

**Confidence:** HIGH — the protocol is fully specified in the design doc and CONTEXT.md.

---

### 3. phase-plan.skill.ts

**File:** `src/skills/general/phase-plan.skill.ts`

**Current structure (Step 8 — Spawn lu-planner):**

The planner receives:

- `{state_content}` — STATE.md
- `{roadmap_content}` — ROADMAP.md
- `{requirements_content}` — REQUIREMENTS.md
- `{research_content}` — `${PHASE_DIR}/RESEARCH.md` (already threaded)
- `{verification_content}` — for gaps mode
- `{working_content}` — memory context from cache

**What to add:**

Thread `GRADUATION-REPORT.md` into the planner's prompt context. The report lists all graduated
engrams as concept names — this is what the planner uses to populate `**Research refs:**` lines.

In Step 7 (Read Context Files), add:

```bash
GRADUATION_REPORT_CONTENT=$(cat "${PHASE_DIR}/research/GRADUATION-REPORT.md" 2>/dev/null || echo "No graduation report — omit research refs from tasks.")
```

In Step 8 (Spawn lu-planner), add `{graduation_report_content}` to the `<planning_context>` block:

```markdown
**Graduated Research Engrams (for research_refs):**
{graduation_report_content}
```

This appears after `{research_content}` in the planning context. The planner uses this to map
task scope to available concept names.

**Confidence:** HIGH — the existing pattern for reading and threading file contents is well
established throughout the skill.

---

### 4. phase-execute.skill.ts

**File:** `src/skills/general/phase-execute.skill.ts`

**Current executor spawn pattern (Step 4, Wave execution):**

The orchestrator:

1. Reads plan file contents with `cat "{plan_path}"`
2. Passes `{plan_N_content}` verbatim into executor prompt
3. The executor receives the full plan content and executes tasks from it

**Where to add research_refs extraction:**

Between reading plan content and spawning executors. After reading plan files, the orchestrator
must:

1. Parse `**Research refs:**` lines from each task in each plan
2. For each unique ref, call `muninn_recall`
3. Build a `<research_context>` block per plan (aggregating all refs for all tasks)
4. Pass the research_context to each executor

OR (preferred per per-task-recall.md design): pass the raw refs as a structured list and
let the executor do per-task recall just-in-time. This is cleaner for parallel execution
because each executor only recalls its own tasks' refs.

**Decision from per-task-recall.md (orchestrator vs executor):**

The per-task-recall.md spec shows the orchestrator doing the recall and assembling the executor
prompt. However, CONTEXT.md Decision 3 says "the executor recalls each concept". Reading both
carefully: the **orchestrator parses refs** from the plan, **calls recall**, and **passes the
result** to the executor. The executor does not call MuninnDB directly for research refs — the
orchestrator does it on its behalf.

**Implementation pattern for phase-execute:**

After reading plan content and before spawning executor:

```bash
# Parse research refs from all tasks in this plan
RESEARCH_REFS=$(echo "$PLAN_N_CONTENT" | grep -oP '(?<=\*\*Research refs:\*\*\s).*' | tr ',' '\n' | tr -d ' ' | sort -u)

# For each ref, recall from MuninnDB and build context block
RESEARCH_CONTEXT=""
RESEARCH_GAPS=""
for REF in $RESEARCH_REFS; do
  # muninn_recall(vault: REPO_VAULT, context: REF) via MCP
  # Append result to RESEARCH_CONTEXT or RESEARCH_GAPS
done
```

Then in the executor Task() prompt, add:

```
<research_context>
{research_context_block}
</research_context>

<research_gaps>
{research_gaps — refs with no engrams found}
</research_gaps>
```

**Confidence:** HIGH for the overall pattern. MEDIUM for the exact orchestrator-vs-executor
responsibility boundary — the per-task-recall.md pseudocode shows orchestrator doing the recall,
but CONTEXT.md says executor does it. Both are consistent if orchestrator parses refs and
executes recalls, then passes the assembled context to executor.

---

### 5. phase-plan-review.skill.ts (NEW)

**File:** `src/skills/general/phase-plan-review.skill.ts`

**Template:** `src/skills/general/phase-research-review.skill.ts`

**Key differences from phase-research-review:**

| Dimension           | phase-research-review                                                     | phase-plan-review                             |
| ------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| Input corpus        | Research files in `research/` dir                                         | PLAN.md files in phase dir                    |
| Reviewer agents     | lu-completeness-reviewer, lu-accuracy-reviewer, lu-actionability-reviewer | code-architect, dx-advocate, security-auditor |
| Severity labels     | CRITICAL / IMPORTANT / MINOR                                              | BLOCKING / ADVISORY                           |
| Gap ID prefix       | G-COMP-, G-ACC-, G-ACT-                                                   | G-ARCH-, G-DX-, G-SEC-                        |
| Output file         | `research/REVIEW-LOG.md`                                                  | `PLAN-REVIEW-LOG.md` (in phase dir)           |
| Convergence trigger | B(n) = CRITICAL count                                                     | B(n) = BLOCKING count                         |
| On convergence      | APPROVED → phase-graduate                                                 | APPROVED → execute plans                      |
| On escalation       | User reviews research gaps                                                | User reviews plan issues                      |

**Structure (mirroring phase-research-review step numbers):**

Step 1: Load Plan Corpus

```
PADDED_PHASE=$(printf "%02d" $PHASE)
PHASE_DIR=$(ls -d .planning/phases/$PADDED_PHASE-* ... | head -1)
Read all files matching: $PHASE_DIR/*-PLAN.md
Read $PHASE_DIR/*-CONTEXT.md for phase intent
```

Step 2: Read Review Config

```
MAX_ITERATIONS from --max-iterations flag or complexity.matrix.{LEVEL}.planReviewIterations
Default: 2 (MODERATE/COMPLEX), 3 (CRITICAL), 1 (TRIVIAL/SIMPLE)
```

Step 3: Initialize Review Loop

Step 4: Spawn 3 Reviewers in Parallel (Cold Isolation)

```
Task(agent: "code-architect", prompt: "Review plan corpus for architectural coherence.
Phase intent: {phase_description}
Plan files: {list of PLAN.md files}
Iteration: {N} of {MAX}
{if iteration > 1: Prior BLOCKING findings not yet resolved: {prior_blocking}}")

Task(agent: "dx-advocate", prompt: "Review plan corpus for developer experience and executability.
Phase intent: {phase_description}
Plan files: {list of PLAN.md files}
Iteration: {N} of {MAX}
{if iteration > 1: Prior BLOCKING findings not yet resolved: {prior_blocking}}")

Task(agent: "security-auditor", prompt: "Review plan corpus for security and safety gaps.
Phase intent: {phase_description}
Plan files: {list of PLAN.md files}
Iteration: {N} of {MAX}
{if iteration > 1: Prior BLOCKING findings not yet resolved: {prior_blocking}}")
```

Step 5: Collect and Parse Reviews

```
Parse lines matching: G-{PREFIX}-NNN: [severity: LEVEL] Description
Where PREFIX is ARCH, DX, or SEC
Where LEVEL is BLOCKING or ADVISORY
```

Step 6: Check Convergence (gap-severity model, parallel to research-review)

```
B(n) = total BLOCKING gaps across all reviewers
if B(n) == 0 OR iteration >= MAX_ITERATIONS:
    status = "CONVERGED" -> APPROVED
elif B(n) > 0 AND iteration < MAX_ITERATIONS:
    if iteration > 1 AND B(n) < B(n-1): status = "IMPROVING"
    elif iteration > 1 AND B(n) == B(n-1): status = "STALLED"
    else: status = "REVIEWING"
```

Step 7: If NEEDS_REVISION

- Extract BLOCKING findings as revision targets
- Spawn lu-planner with revision context (delta + prior findings)
- Increment iteration, loop to Step 4

Step 8: Write PLAN-REVIEW-LOG.md (parallel structure to REVIEW-LOG.md)

Step 9: Return structured result

**Key integration point with phase-plan.skill.ts:**

`phase-plan-review` is NOT currently wired into `phase-plan.skill.ts`. Per CONTEXT.md Decision 7,
the orchestrator (`lu.skill.ts`) integration is deferred to M2. For Phase 10, `phase-plan-review`
is created as a standalone skill that can be invoked directly. No changes to phase-plan.skill.ts
are needed to wire up the review loop — that's deferred.

**Confidence:** HIGH for structure (it's a close adaptation of phase-research-review). HIGH for
gap ID prefixes and severity labels (specified in CONTEXT.md Decision 2).

---

### 6. build-skill-registry.ts

**File:** `src/skills/__helpers/build-skill-registry.ts`

**Current pattern (observed):**

1. Import at top: `import { phaseResearchReviewSkill } from "../general/phase-research-review.skill";`
2. Register in `skillRegistry` object: `"phase-research-review": () => phaseResearchReviewSkill,`

**What to add for phase-plan-review:**

Line to add near line 30 (with other phase-\* imports):

```typescript
import { phasePlanReviewSkill } from "../general/phase-plan-review.skill";
```

Line to add near line 99 (with other phase-\* registrations):

```typescript
"phase-plan-review": () => phasePlanReviewSkill,
```

**Naming convention:** `phase-plan-review` (kebab-case, matches file name pattern).

**Confidence:** HIGH — the pattern is mechanical and consistent across all 56 registered skills.

---

### 7. lu-config.schemas.ts Extension

**File:** `src/shared/__schemas/lu-config.schemas.ts`

**Current state:** Only exports `LuConfigSchema` for the `lu` orchestration section.
No `workflow.version` or `research` section parsing.

**What to add:**

The `LuConfigSchema` covers the `lu` config key (formerly `autopilot`). The overall config
shape (the top-level JSON object) is not currently validated by a single schema — components
read specific keys directly. Phase 10 needs schemas for the `research` and `workflow.version`
keys, which are independent of `LuConfigSchema`.

Per the design doc (Section 7 of config-changes.md): modify `lu-config.schemas.ts` to import
and compose the new schemas. The simplest approach:

```typescript
import { ResearchConfigSchema } from "./research-config.schemas";
import { WorkflowVersionSchema } from "./workflow-version.schemas";

// These can be exported directly for consumers to use
export { ResearchConfigSchema } from "./research-config.schemas";
export type { ResearchConfig } from "./research-config.schemas";
export { WorkflowVersionSchema } from "./workflow-version.schemas";
export type { WorkflowVersion } from "./workflow-version.schemas";
```

The `lu-config.schemas.ts` file becomes the aggregation point for all config schemas. The
shared barrel (`src/shared/index.ts`) then needs corresponding exports.

**Alternative:** Create a new `top-level-config.schemas.ts` that composes all sections. The
design doc does not specify a top-level composite schema, so this is out of scope.

**Confidence:** HIGH for new file locations. MEDIUM for whether lu-config.schemas.ts or a
new composite file is the right aggregation point — the design doc says "modify lu-config.schemas.ts"
so follow that exactly.

---

### 8. research-config.schemas.ts (NEW)

**File:** `src/shared/__schemas/research-config.schemas.ts`

The schema is fully specified in config-changes.md Section 2. Key details:

- Uses **camelCase** keys (config-changes.md explicitly notes this — internal config, not API payload)
- Nested objects use `.default({})` to make nesting optional
- Includes a `.refine()` cross-field validation guard
- Confidence/scoring threshold fields: `"HIGH" | "MEDIUM"` enum

```typescript
import { z } from "zod";

export const ResearchConfigSchema = z.object({
  parallelResearchers: z.number().int().positive().default(4),
  reviewLoop: z
    .object({
      maxIterations: z.number().int().positive().default(3),
      continueForImportant: z.boolean().default(true),
    })
    .default({}),
  planReviewLoop: z
    .object({
      maxIterations: z.number().int().positive().default(2),
    })
    .default({}),
  graduation: z
    .object({
      confidenceThreshold: z.enum(["HIGH", "MEDIUM"]).default("MEDIUM"),
      scoringThreshold: z.number().min(0).max(1).default(0.55),
      autoCleanupAfterMilestone: z.boolean().default(false),
    })
    .default({}),
  perTaskRecall: z
    .object({
      enabled: z.boolean().default(true),
      maxEngramsPerTask: z.number().int().positive().default(5),
    })
    .default({}),
});

export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;
```

With refined validation:

```typescript
export const ResearchConfigRefinedSchema = ResearchConfigSchema.refine(
  (config) => {
    if (
      config.perTaskRecall.enabled &&
      config.graduation.scoringThreshold > 0.95
    ) {
      return false;
    }
    return true;
  },
  {
    message:
      "perTaskRecall requires graduation to produce engrams (scoringThreshold too high)",
  },
);
```

**Confidence:** HIGH — spec is complete in config-changes.md.

---

### 9. workflow-version.schemas.ts (NEW)

**File:** `src/shared/__schemas/workflow-version.schemas.ts`

```typescript
import { z } from "zod";

export const WorkflowVersionSchema = z.enum(["v1", "v2"]).default("v1");
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;
```

This is a two-line schema. It lives in `src/shared/__schemas/` per the design doc.

**Confidence:** HIGH.

---

### 10. complexity.schemas.ts Extension

**File:** `src/complexity/__schemas/complexity.schemas.ts`

**Current `ComplexityGateSchema`** (lines 116-159): Does not include `researchReviewIterations`
or `planReviewIterations`.

**What to add:**

Two optional fields with integer defaults to `ComplexityGateSchema`:

```typescript
/** Max iterations for research review loop per Decision 14 */
researchReviewIterations: z.number().int().nonnegative().default(1),
/** Max iterations for plan review loop per Decision 14 */
planReviewIterations: z.number().int().nonnegative().default(1),
```

These go inside `ComplexityGateSchema` after the existing `default_model` optional field
(current line ~158). Using `.default(1)` makes them backward-compatible: existing config files
that omit these fields will parse with value `1`.

**Note on field type:** The design doc uses `.nonnegative()` instead of `.positive()` because
`0` is a valid value (means "never run review loop — skip it"). This is different from
`planVerificationIterations` which uses `.positive()`. Follow the design doc exactly.

**Impact on ComplexityMatrix type:** No change needed — `ComplexityGate` is re-derived via
`z.infer<typeof ComplexityGateSchema>`. The new fields appear automatically.

**Confidence:** HIGH — exact schema extension is specified in config-changes.md Section 3.

---

## Architecture Patterns

### Pattern 1: Agent Section Addition

New content in lu-planner and lu-executor is added as additional `sections` entries in the
`AgentConfig` object. The sections array is ordered by the `order` field. New sections
can be inserted at fractional order values or by shifting subsequent sections.

```typescript
// In lu-planner.agent.ts, add to sections array:
{
  title: "research_refs_guidance",
  content: `## Research Refs in Plans\n\n...`,
  order: 4.5,  // Between plan_structure (4) and context_integration (5)
},
```

### Pattern 2: Skill Content Threading

Skills read files with bash, store in variables, and pass variable values into Task() prompt
template strings using `{variable_name}` interpolation. Phase-plan already does this for
`RESEARCH_CONTENT`. The same pattern applies for `GRADUATION_REPORT_CONTENT`.

### Pattern 3: Bold-Key Task Fields

PLAN.md tasks use markdown bold-key format for structured metadata:

```
**Type:** auto
**TDD:** false
**Depends on:** 1
**Research refs:** research:api-bun-websocket, research:approach-ws-reconnect
**Verification:**
- how to verify
```

These fields are parsed by downstream consumers using line-level regex matching. The canonical
regex for research refs (from CONTEXT.md Decision 1):

```typescript
const refs = line
  .match(/\*\*Research refs:\*\*\s*(.+)/)?.[1]
  .split(",")
  .map((s) => s.trim());
```

### Pattern 4: Skill Registration (mechanical)

Every new skill follows the identical two-step pattern:

1. Add import in `build-skill-registry.ts`
2. Add entry to `skillRegistry` object

### Pattern 5: Schema Extension in T0 Domain

New schemas in `src/shared/__schemas/` are T0 Foundation — they can be imported by any tier.
Each new schema file exports the Zod schema and its inferred TypeScript type. The shared barrel
(`src/shared/index.ts`) is updated to re-export new schemas.

---

## Don't Hand-Roll

| Problem                    | Don't Build              | Use Instead                                   | Why                                    |
| -------------------------- | ------------------------ | --------------------------------------------- | -------------------------------------- |
| Research refs regex        | Custom parser            | Single canonical regex from CONTEXT.md        | Duplication risk per PREMORTEM risk #1 |
| Per-task context injection | Inline template building | Follow per-task-recall.md pseudocode pattern  | Protocol is fully specified            |
| Plan review convergence    | Custom state machine     | Reuse phase-research-review convergence model | Same logic, different severity labels  |
| Config validation          | ad-hoc checks            | Zod safeParse per schema-first-parsing rule   | Runtime safety guarantee               |
| Skill registration         | Skip registry            | Two-step import + register                    | Build pipeline requires registry entry |

**Key insight:** All six existing research/graduate skills establish a pattern. Phase-plan-review
is the seventh, and follows the same cold-isolation reviewer pattern. Deviation from the pattern
creates inconsistency in how the orchestrator spawns reviewers.

---

## Common Pitfalls

### Pitfall 1: Duplicated Research Refs Regex

**What goes wrong:** Regex is defined separately in the planner agent doc, the executor section,
and the phase-execute skill. When the format changes, only one location is updated.

**How to avoid:** The premortem explicitly flags this. Define the canonical regex in a comment in
one place (e.g., the `per_task_recall` executor section) and reference it by description elsewhere.
The regex is:

```typescript
line
  .match(/\*\*Research refs:\*\*\s*(.+)/)?.[1]
  .split(",")
  .map((s) => s.trim());
```

**Warning signs:** Multiple files containing inline regex for research refs parsing.

### Pitfall 2: Forgetting `workflow-version.schemas.ts` in Shared Barrel

**What goes wrong:** New schema file is created but not added to `src/shared/index.ts`. TypeScript
compiles fine (direct imports work) but consumers using `~/shared` can't access it.

**How to avoid:** Always update the barrel after creating a new `__schemas/` file.

### Pitfall 3: `planReviewIterations` vs `planVerificationIterations` Confusion

**What goes wrong:** The new field `planReviewIterations` (plan REVIEW loop — new in Phase 10)
is confused with the existing `planVerificationIterations` (lu-plan-checker iterations — Phase 9).
These are distinct and both exist in `ComplexityGateSchema`.

**How to avoid:** Keep the naming precise. Review = BLOCKING/ADVISORY severity reviewers.
Verification = lu-plan-checker correctness check.

### Pitfall 4: Wrong Vault for research:\* Recall

**What goes wrong:** Per-task recall calls `muninn_recall` with `"default"` vault instead of
`REPO_VAULT`. Recall returns zero results (research engrams are in repo vault only).

**How to avoid:** CONTEXT.md Decision 6 confirms `research:*` prefix routes to repo vault only.
All recall calls must use `REPO_VAULT` (from `.planning/config.json` → `muninn.vault`).

### Pitfall 5: BLOCKING/ADVISORY vs CRITICAL/IMPORTANT Confusion

**What goes wrong:** Plan review skill reuses the research review severity labels (CRITICAL/IMPORTANT)
instead of the specified plan review labels (BLOCKING/ADVISORY). Phase-execute orchestrator
then parses CRITICAL gaps from plan-review output (which don't exist), sees zero blocking gaps,
and approves a plan with real issues.

**How to avoid:** Clearly distinguish at the top of `phase-plan-review.skill.ts`. Gap ID prefixes
differ too: G-ARCH-, G-DX-, G-SEC- (not G-COMP-, G-ACC-, G-ACT-).

### Pitfall 6: camelCase in Research Config Schema

**What goes wrong:** Developer applies `api-snake-case` rule to `ResearchConfigSchema` and writes
`parallel_researchers`, `review_loop`, etc. These don't match the config JSON keys specified in
the design doc (`parallelResearchers`, `reviewLoop`).

**How to avoid:** Config-changes.md explicitly notes: "internal config, not API payload — api-snake-case
rule does not apply." Research config schema uses camelCase throughout.

---

## Code Examples

### Research Refs Parsing (canonical)

```typescript
// Source: CONTEXT.md Decision 1
// Parse a single task's research refs line
const refs =
  line
    .match(/\*\*Research refs:\*\*\s*(.+)/)?.[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
```

### Per-Task Recall Protocol (executor section)

```
// Source: docs/workflow-system/v2/03-muninndb-integration/per-task-recall.md
Before implementing each task:
1. refs = parse research refs from task content
2. For each ref: result = muninn_recall(vault: REPO_VAULT, context: ref)
3. Build <research_context> block from results
4. Log gaps for refs with no results
5. Cap total engrams at config.perTaskRecall.maxEngramsPerTask (default 5)
```

### ComplexityGateSchema Extension

```typescript
// Source: docs/workflow-system/v2/06-implementation-plan/config-changes.md Section 3
// Add to ComplexityGateSchema in src/complexity/__schemas/complexity.schemas.ts:
researchReviewIterations: z.number().int().nonnegative().default(1),
planReviewIterations: z.number().int().nonnegative().default(1),
```

### Plan Review Gap ID Format

```
// Source: CONTEXT.md Decision 2
G-ARCH-001: [severity: BLOCKING] Description of architectural issue
G-DX-002: [severity: ADVISORY] Description of executability concern
G-SEC-003: [severity: BLOCKING] Description of security gap
```

### Graduation Report Threading (phase-plan.skill.ts)

```bash
# Source: phase-plan.skill.ts Step 7 pattern extended
GRADUATION_REPORT_CONTENT=$(cat "${PHASE_DIR}/research/GRADUATION-REPORT.md" 2>/dev/null || echo "No graduation report — omit research refs from tasks.")
```

---

## State of the Art

| Old Approach                                 | Current Approach                                                              | When Changed | Impact                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- |
| Full research corpus in executor context     | Targeted per-task recall via research refs                                    | Phase 10     | ~87% context reduction per executor                     |
| Plan verification only (lu-plan-checker)     | Plan verification + plan review (code-architect/dx-advocate/security-auditor) | Phase 10     | Architecture/DX/security issues caught before execution |
| Manual config field addition without schemas | Zod schemas for all new config sections                                       | Phase 10     | Runtime validation, type safety                         |
| Research engrams not referenced in plans     | research_refs field in PLAN.md tasks                                          | Phase 10     | Executor gets specific context for each task            |

**Deprecated/outdated:**

- None for this phase. All changes are additive. The `research_refs` field is optional in PLAN.md
  tasks — tasks without it continue to use v1 behavior.

---

## Open Questions

1. **Orchestrator vs Executor responsibility for recall**
   - What we know: per-task-recall.md shows the orchestrator doing the recall. CONTEXT.md
     Decision 3 says "the executor recalls each concept."
   - What's unclear: Whether the recall MCP call happens in phase-execute (orchestrator) before
     spawning, or in lu-executor during task execution.
   - Recommendation: Follow per-task-recall.md's pseudocode (orchestrator recalls, passes context
     to executor). This is cleaner for parallel execution and consistent with how memory context
     is assembled. The CONTEXT.md phrasing "executor recalls" describes the logical actor, not
     the literal agent making the call.

2. **Where in phase-plan.skill.ts to wire plan review**
   - What we know: CONTEXT.md Decision 7 says orchestrator integration is deferred to M2.
   - What's unclear: Whether the standalone `phase-plan-review` skill is invoked from within
     `phase-plan.skill.ts` (as a new step 10.5) or remains entirely standalone.
   - Recommendation: Do not modify phase-plan.skill.ts to invoke phase-plan-review. Create the
     skill as standalone only. Phase 10 scope is creating the skill, not wiring it.

---

## Sources

### Primary (HIGH confidence)

- `src/agents/luca/lu-planner.agent.ts` — Current planner sections structure, task template
- `src/agents/luca/lu-executor.agent.ts` — Current executor sections, execution_flow steps
- `src/skills/general/phase-plan.skill.ts` — Context threading pattern into planner prompt
- `src/skills/general/phase-execute.skill.ts` — Executor spawn pattern, memory context threading
- `src/skills/general/phase-research-review.skill.ts` — Template for phase-plan-review skill
- `src/skills/general/phase-graduate.skill.ts` — GRADUATION-REPORT.md output location
- `src/skills/__helpers/build-skill-registry.ts` — Skill registration pattern
- `src/shared/__schemas/lu-config.schemas.ts` — Config schema extension point
- `src/complexity/__schemas/complexity.schemas.ts` — ComplexityGateSchema exact shape
- `docs/workflow-system/v2/06-implementation-plan/config-changes.md` — Full schema spec
- `docs/workflow-system/v2/03-muninndb-integration/per-task-recall.md` — Recall protocol
- `.planning/phases/10-v2-plan-executor-config/CONTEXT.md` — All locked decisions

### Secondary (MEDIUM confidence)

- `src/shared/index.ts` — Barrel export pattern (to know what needs updating)
- `.planning/phases/10-v2-plan-executor-config/PREMORTEM.md` — Risk mitigations as constraints

---

## Metadata

**Confidence breakdown:**

- lu-planner section structure: HIGH — read directly
- lu-executor section structure: HIGH — read directly
- phase-plan context threading: HIGH — existing pattern followed
- phase-execute research_refs extraction: HIGH (pattern), MEDIUM (orchestrator vs executor boundary)
- phase-plan-review skill: HIGH — close adaptation of phase-research-review
- build-skill-registry registration: HIGH — mechanical pattern
- lu-config.schemas.ts extension: HIGH — design doc specifies exact files
- research-config.schemas.ts: HIGH — schema fully specified in design doc
- complexity.schemas.ts extension: HIGH — two fields with types and defaults specified

**Research date:** 2026-03-24
**Valid until:** 2026-04-23 (30 days — stable domain, no fast-moving dependencies)
