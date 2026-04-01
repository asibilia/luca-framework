---
phase: 264
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 264 Plan 1: Fresh Context Assembly & Task Sizing

## Objective

Wire the existing `src/context/` assembly layer into orchestrator Agent() dispatches so each sub-agent receives a scoped, fresh context payload appropriate to its role tier (Full/Scoped/Minimal, capped at ~2K tokens). Extend planner prompts and the lu-plan-checker verification with per-task file count estimates and scope labels so plan review can detect oversized tasks before execution begins.

Requirements addressed: CTXT-01, CTXT-02, CTXT-03, SIZE-01, SIZE-02, SIZE-03. SIZE-04 (OVERFLOW detection) was already implemented in Phase 263 and requires only verification.

## Context

- `src/context/__schemas/context.schemas.ts` — existing `ContextDocumentSet`, `contextTierSchema`, `assembledContextSchema`
- `src/context/__helpers/context-assembler.ts` — `assembleContext()` and `getRequiredDocumentKeys()`
- `src/context/__helpers/defaults.ts` — `DEFAULT_AGENT_CONTEXT_PROFILES`, `TIER_DOCUMENTS`
- `src/context/index.ts` — public barrel (all exports)
- `src/skills/__helpers/agent-prompts.ts` — all prompt template functions; `AgentPromptParams` interface; `EXECUTE_WAVE_PROMPT`, `PLAN_REVIEW_PROMPT`, `HARNESS_CHECK_PROMPT`
- `src/skills/luca/lu.skill.ts` — orchestrator Agent() dispatch loop; per-wave context assembly
- `packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-plan-checker.md` — 6-dimension verification spec; scope_sanity dimension thresholds

## Tasks

### 1. Add PhaseContextPayload schema to context domain

**Type:** auto
**TDD:** false
**Depends on:** none

Add a `PhaseContextPayload` Zod schema and type to `src/context/__schemas/context.schemas.ts`. This schema represents the assembled, token-capped context delivered to an agent before dispatch. It wraps an `AssembledContext` with the serialized payload string and token estimate.

**Files to create/edit:**

- `src/context/__schemas/context.schemas.ts`
- `src/context/index.ts`

**Implementation:**
Add these exports after the existing `assembledContextSchema` section:

```typescript
/**
 * Serialized context payload delivered to a sub-agent before dispatch.
 *
 * The `payload` field is the fully rendered string that gets injected
 * into the agent prompt via the `inlinedContext` parameter. The
 * `estimated_tokens` field is advisory — orchestrators use it to
 * enforce the <= 2K token cap before dispatch.
 *
 * Uses snake_case for API compatibility.
 */
export const phaseContextPayloadSchema = z.object({
  /** The agent this payload was assembled for */
  agent_name: z.string(),
  /** Context tier that was resolved */
  tier: contextTierSchema,
  /** Serialized context string, ready for prompt injection */
  payload: z.string(),
  /** Estimated token count (advisory) */
  estimated_tokens: z.number().int().nonnegative(),
  /** Whether the payload was capped at the token ceiling */
  was_capped: z.boolean().default(false),
});

export type PhaseContextPayload = z.infer<typeof phaseContextPayloadSchema>;
```

Export `phaseContextPayloadSchema` and `PhaseContextPayload` from `src/context/index.ts`.

**Verification:**

- Run `bunx --bun tsc --noEmit` — zero errors
- `PhaseContextPayload` and `phaseContextPayloadSchema` importable from `~/context`

---

### 2. Add context serialization helper (assembleAndSerialize)

**Type:** auto
**TDD:** false
**Depends on:** 1

Add `assembleAndSerialize()` to `src/context/__helpers/context-assembler.ts`. This function takes the existing `AssembledContext` result, renders the documents into a single string, estimates tokens (4 chars ≈ 1 token heuristic), and caps at the ceiling to produce a `PhaseContextPayload`.

**Files to create/edit:**

- `src/context/__helpers/context-assembler.ts`
- `src/context/index.ts`

**Implementation:**

```typescript
/** Default token ceiling for context payloads (~2K tokens) */
const CONTEXT_TOKEN_CEILING = 2000;

/**
 * Assemble, serialize, and cap context for sub-agent dispatch.
 *
 * Calls assembleContext() then renders the filtered document set
 * into a single string. Estimates token count using the 4-chars-per-token
 * heuristic. Caps the string at `tokenCeiling * 4` characters if needed.
 *
 * @param agentName - Target agent name
 * @param complexityLevel - Current task complexity
 * @param availableDocuments - Full document set to filter from
 * @param tokenCeiling - Max tokens for payload (default 2000)
 * @param overrideProfile - Optional context config override
 * @returns PhaseContextPayload ready for prompt injection
 */
export function assembleAndSerialize(
  agentName: string,
  complexityLevel: ComplexityLevel,
  availableDocuments: ContextDocumentSet,
  tokenCeiling: number = CONTEXT_TOKEN_CEILING,
  overrideProfile?: ContextConfig,
): PhaseContextPayload {
  const assembled = assembleContext(
    agentName,
    complexityLevel,
    availableDocuments,
    overrideProfile,
  );

  // Render documents into a single string
  const parts: string[] = [];
  for (const [key, value] of Object.entries(assembled.documents)) {
    if (value !== undefined) {
      parts.push(`<!-- ${key} -->\n${value}`);
    }
  }
  const raw = parts.join("\n\n");

  // Cap at ceiling (4 chars ≈ 1 token)
  const charCeiling = tokenCeiling * 4;
  const wasCapped = raw.length > charCeiling;
  const payload = wasCapped ? raw.slice(0, charCeiling) : raw;

  return phaseContextPayloadSchema.parse({
    agent_name: agentName,
    tier: assembled.effective_tier,
    payload,
    estimated_tokens: Math.ceil(payload.length / 4),
    was_capped: wasCapped,
  });
}
```

Export `assembleAndSerialize` and `CONTEXT_TOKEN_CEILING` from `src/context/index.ts`.

**Verification:**

- `bunx --bun tsc --noEmit` — zero errors
- `assembleAndSerialize` importable from `~/context`
- Called with a 10000-char document and ceiling=2000 returns `was_capped: true` and `payload.length <= 8000`

---

### 3. Add inlinedContext parameter to AgentPromptParams and update key prompts

**Type:** auto
**TDD:** false
**Depends on:** 2

Extend `AgentPromptParams` in `src/skills/__helpers/agent-prompts.ts` with an optional `inlinedContext` field. Update `EXECUTE_WAVE_PROMPT` and `HARNESS_CHECK_PROMPT` to inject the assembled context payload when provided. The planner prompts (`plan-{NN}`, `plan-revise-{NN}`) are dispatched as inline Agent() calls in lu.skill.ts and do not use typed prompt functions — document the intent in a comment rather than creating a new prompt function.

**Files to create/edit:**

- `src/skills/__helpers/agent-prompts.ts`

**Implementation:**

Add `inlinedContext` to `AgentPromptParams`:

```typescript
/** Pre-assembled context payload from assembleAndSerialize() — injected into prompt */
inlinedContext?: string;
```

In `EXECUTE_WAVE_PROMPT`, inject the context after the `<wave_context>` block:

```typescript
const ctxBlock = p.inlinedContext
  ? `\n<inlined_context>\n${sanitizeForTemplate(p.inlinedContext)}\n</inlined_context>`
  : "";
```

Append `ctxBlock` after the `</wave_context>` close tag in the returned template string.

In `HARNESS_CHECK_PROMPT`, inject after the `<task>` open tag when `inlinedContext` is present:

```typescript
${p.inlinedContext ? `<inlined_context>\n${sanitizeForTemplate(p.inlinedContext)}\n</inlined_context>\n` : ''}
```

**Verification:**

- `bunx --bun tsc --noEmit` — zero errors
- `EXECUTE_WAVE_PROMPT({ ..., inlinedContext: 'test' })` contains `<inlined_context>test</inlined_context>`
- `EXECUTE_WAVE_PROMPT({ ... })` (no inlinedContext) output unchanged from before

---

### 4. Wire assembleAndSerialize into lu.skill.ts per-wave dispatch loop

**Type:** auto
**TDD:** false
**Depends on:** 3

Update `src/skills/luca/lu.skill.ts` to document that before each Agent() dispatch in the per-wave loop, the orchestrator must call `assembleAndSerialize()` to produce a `PhaseContextPayload` and pass it as `inlinedContext` in the prompt params. Also document the tier mapping:

- `lu-executor`: Full tier (T2/T3 at COMPLEX)
- `lu-verifier`, code reviewers: Scoped tier (warm isolation)
- harness checker: Minimal tier (T0, cold isolation, no memory injection)
- `lu-discuss-researcher`, `lu-learner`: Keep current approach (no change)

This task updates the skill's markdown documentation section describing the per-wave loop — it does NOT change executable TypeScript (lu.skill.ts is a .ts file containing markdown strings that describe orchestrator behavior).

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts`

**Implementation:**
Locate the `FOR each WAVE_NUM in $WAVES (serial):` section (around line 519). Before the `WAVE_RESULT=$(Agent(...))` call, add the context assembly documentation block:

```
  # CTXT-01/02: Assemble fresh context payload for this agent tier
  # Orchestrator calls assembleAndSerialize(agentName, COMPLEXITY, availableDocs, 2000)
  # Tier mapping: lu-executor=Full(T2/T3), lu-verifier/reviewers=Scoped(warm),
  #               harness-checker=Minimal(T0/cold), lu-discuss-researcher/lu-learner=unchanged
  # Cap enforced at <= 2K tokens. Pass payload as inlinedContext in prompt params.
  INLINED_CONTEXT=$(assembleAndSerialize("lu-executor", COMPLEXITY, AVAILABLE_DOCS, 2000).payload)
```

Also update the harness check Agent() dispatch (step 7i) with a similar comment noting Minimal tier.

**Verification:**

- `bunx --bun tsc --noEmit` — zero errors
- The per-wave loop section now contains `assembleAndSerialize` reference
- The harness check section now contains the Minimal tier comment

---

### 5. Add per-task sizing metadata to planner prompt template

**Type:** auto
**TDD:** false
**Depends on:** 3

Add a `PLAN_SIZING_GUIDANCE` constant to `src/skills/__helpers/agent-prompts.ts` and inject it into the planner creation prompt instructions used by lu.skill.ts (lines referencing `plan-{NN}` and `plan-revise-{NN}`). Because those dispatches use inline prompt strings in lu.skill.ts rather than exported template functions, the guidance block should be added as an exported constant that lu.skill.ts can reference by name in its inline prompt text, plus injected into any existing `PLAN_REVIEW_PROMPT` sizing note.

**Files to create/edit:**

- `src/skills/__helpers/agent-prompts.ts`
- `src/skills/luca/lu.skill.ts`

**Implementation in agent-prompts.ts:**

```typescript
/**
 * Per-task and per-wave sizing guidance block for lu-planner.
 *
 * Injected into planner prompts to require SIZE-01/02 metadata on each task.
 */
export const PLAN_SIZING_GUIDANCE = `
<sizing_requirements>
For EVERY task in the plan, add these metadata fields after the task type line:
- **File count estimate:** {N} (integer, required)
- **Scope:** SMALL (1-3 files) | MEDIUM (4-7 files) | LARGE (8-10 files)

For EVERY wave in the plan frontmatter or wave header, add:
- Total file count across all tasks in the wave (must be < 10)
- Dependencies list

Example task header:
### 1. Task Name
**Type:** auto
**File count estimate:** 3
**Scope:** SMALL
**Depends on:** none
</sizing_requirements>
`;
```

In `lu.skill.ts`, update the planner Agent() dispatch documentation for `plan-{NN}` and `plan-revise-{NN}` to note that the prompt must include `PLAN_SIZING_GUIDANCE`.

**Verification:**

- `bunx --bun tsc --noEmit` — zero errors
- `PLAN_SIZING_GUIDANCE` importable from `~/skills/__helpers/agent-prompts`
- Contains `File count estimate` and `Scope` keywords

---

### 6. Extend lu-plan-checker with 7th dimension: task-sizing validation

**Type:** auto
**TDD:** false
**Depends on:** 5

Add a 7th verification dimension to `packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-plan-checker.md`. The dimension validates per-task file count estimates and wave totals (SIZE-03).

**Files to create/edit:**

- `packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-plan-checker.md`

**Implementation:**
Add a new `## Dimension 7: Task Sizing Validation` section inside `<verification_dimensions>` after Dimension 6. Insert a corresponding step `## Step 10b: Validate Task Sizing` before Step 10 (Overall Status). Update the Scope Sanity thresholds table in Dimension 5 to cross-reference Dimension 7.

Dimension 7 content:

````markdown
## Dimension 7: Task Sizing Validation

**Question:** Does every task have file count estimate and scope label? Are per-wave file totals under 10?

**Process:**

1. For each task, check for `**File count estimate:**` and `**Scope:**` metadata fields
2. Compute per-wave total by summing `file_count_estimate` across all tasks in the wave
3. Check task-level: flag if file_count_estimate >= 10 (BLOCKER) or if metadata is missing (WARNING)
4. Check wave-level: flag if wave total >= 10 (BLOCKER)

**Severity rules:**

- BLOCKER: Any single task with file_count_estimate >= 10
- BLOCKER: Wave total file count >= 10
- WARNING: Task missing `**File count estimate:**` field
- WARNING: Task missing `**Scope:**` field
- INFO: Scope label inconsistent with estimate (e.g., MEDIUM but 1 file)

**Example issue:**

```yaml
issue:
  dimension: task_sizing
  severity: blocker
  description: "Task 3 file_count_estimate=12 exceeds per-task limit of 9"
  plan: "01"
  task: 3
  metrics:
    file_count_estimate: 12
  fix_hint: "Split task 3 into 2 tasks of < 10 files each"
```
````

```

Also update `PLAN_REVIEW_PROMPT` in `agent-prompts.ts` to reference 7 dimensions instead of 6 in the task instructions.

**Verification:**
- `bunx --bun tsc --noEmit` — zero errors
- Plan-checker template contains `Dimension 7` heading
- `PLAN_REVIEW_PROMPT` task step now says "all 7 dimensions"

---

### 7. Verify SIZE-04 OVERFLOW implementation and document tier wiring
**Type:** auto
**TDD:** false
**Depends on:** 4

Confirm the Phase 263 OVERFLOW protocol is present and complete in `src/skills/luca/lu.skill.ts`. Verify: (a) `OVERFLOW:{task-id}` detection exists in the wave loop, (b) fresh agent spawn on overflow exists, (c) `startFromTask` parameter is threaded through `EXECUTE_WAVE_PROMPT`. Add a `<!-- SIZE-04: verified Phase 263 -->` comment at the overflow detection block. Also add a brief comment block at the top of the per-wave dispatch loop summarizing all four CTXT/SIZE requirements satisfied by Phase 264.

**Files to create/edit:**
- `src/skills/luca/lu.skill.ts`

**Verification:**
- `bunx --bun tsc --noEmit` — zero errors
- `SIZE-04: verified` comment present in file
- Phase 264 summary comment present at wave loop

## Verification

1. Run `bunx --bun tsc --noEmit` — must report zero errors
2. Confirm `PhaseContextPayload` and `assembleAndSerialize` are exported from `src/context/index.ts`
3. Confirm `PLAN_SIZING_GUIDANCE` is exported from `src/skills/__helpers/agent-prompts.ts`
4. Confirm `EXECUTE_WAVE_PROMPT` accepts `inlinedContext` without type error
5. Confirm plan-checker template contains Dimension 7 heading and step 10b
6. Confirm `PLAN_REVIEW_PROMPT` references 7 dimensions
7. Confirm lu.skill.ts per-wave loop contains `assembleAndSerialize` reference and tier mapping comment

## Success Criteria

1. `PhaseContextPayload` schema exists and is exported — orchestrators can type-check context payloads before dispatch
2. `assembleAndSerialize()` produces a capped payload respecting the 2K token ceiling
3. `AgentPromptParams.inlinedContext` allows prompt injection in `EXECUTE_WAVE_PROMPT`
4. `lu.skill.ts` per-wave dispatch loop documents the Full/Scoped/Minimal tier mapping
5. `PLAN_SIZING_GUIDANCE` constant exists with `File count estimate` and `Scope` fields
6. Plan-checker template has Dimension 7 validating BLOCKER on task >= 10 files and wave total >= 10
7. SIZE-04 OVERFLOW detection confirmed and annotated

## Output Specification

- `src/context/__schemas/context.schemas.ts` — `phaseContextPayloadSchema`, `PhaseContextPayload` added
- `src/context/__helpers/context-assembler.ts` — `assembleAndSerialize()`, `CONTEXT_TOKEN_CEILING` added
- `src/context/index.ts` — new exports added
- `src/skills/__helpers/agent-prompts.ts` — `inlinedContext` in `AgentPromptParams`; `PLAN_SIZING_GUIDANCE` constant; 7-dimension reference in `PLAN_REVIEW_PROMPT`; `inlinedContext` injection in `EXECUTE_WAVE_PROMPT` and `HARNESS_CHECK_PROMPT`
- `src/skills/luca/lu.skill.ts` — context assembly documentation; tier mapping; SIZE-04 annotation
- `packages/luca-framework/templates/harness/claude/agents/__branding.commandPrefix__-plan-checker.md` — Dimension 7, Step 10b
```
