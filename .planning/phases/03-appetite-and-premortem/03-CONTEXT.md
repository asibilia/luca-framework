# Phase 3: Appetite & Pre-Mortem — Implementation Context

Phase goal: Implement the core v4 value proposition — appetite-constrained planning and pre-mortem risk analysis.

Todos: #99 (Appetite Declaration System), #100 (Pre-Mortem Agent)

---

## Gray Area 1: Appetite Guard Implementation Location

**Question:** The todo says to add guard logic to `phase-execute.skill.ts`, but skills are generated output (never edit directly per CLAUDE.md). Where should the appetite guard logic actually live?

**Decision: Add appetite guard instructions to `src/skills/general/phase-execute.skill.ts` (the source file in `src/`), not the generated output.**

### Rationale

The todo's reference to `src/skills/general/phase-execute.skill.ts` is correct — this IS the source file. The "never edit directly" rule applies to files in `.claude/`, `.cursor/`, and `.pi/` directories, which are the _generated_ output produced by `bun run build:all`. The `src/` directory contains the source of truth.

The appetite guard is an **orchestrator-level concern**, not a state machine guard. Here's why:

1. **The state machine already has `appetiteWithinBudget` guard** (line 269-275 in `guards.ts`). This is a pure boolean check comparing `appetite_context_percent` against `process_data.context_percent_used`. It is appropriate for gating state transitions (e.g., blocking a transition when budget is exceeded).

2. **The wave-boundary appetite check is different.** It needs to:
   - Read current token/context usage at each wave boundary
   - Log a warning at 80% (continue execution)
   - PAUSE at 100% and present three developer options (extend/scope-cut/halt)
   - Update `appetite_used_tokens` in the state machine via bridge `set-field`

   This is orchestration logic with user interaction — it belongs in the skill's execution instructions, not in a pure guard function.

3. **Existing precedent:** The phase-execute skill already has wave-boundary checks for context budget (lines 353-382 in the source). The appetite guard follows the same pattern — check before each wave, act on the result.

### Implementation Plan

- **In `src/skills/general/phase-execute.skill.ts`:** Add a new step section between wave grouping (Step 4) and wave execution (Step 5) that reads appetite state from the bridge and performs the 80%/100% checks. This follows the same pattern as the existing "Pre-wave context budget check" at line 353.

- **In `packages/luca-framework/src/state/guards.ts`:** The existing `appetiteWithinBudget` guard is sufficient for state machine transitions. No changes needed.

- **In `packages/luca-framework/src/state/bridge.ts`:** The `set-field` allowlist already includes `appetite_level`, `appetite_token_ceiling`, and `appetite_context_percent` (lines 454-456). The skill can update these via the bridge CLI. Add `appetite_used_tokens` to the allowlist so the skill can track consumption.

### Key Files

- `src/skills/general/phase-execute.skill.ts` — Add appetite guard instructions (source)
- `packages/luca-framework/src/state/guards.ts` — Existing `appetiteWithinBudget` (no changes)
- `packages/luca-framework/src/state/bridge.ts` — Add `appetite_used_tokens` to SETTABLE_FIELDS

---

## Gray Area 2: Pre-Mortem Agent Integration Point

**Question:** The todo says pre-mortem runs in the `discussing` state. The state machine already has `PREMORTEM_COMPLETE` event wired in Phase 2. How should the agent be invoked — directly from `phase-discuss` skill, or from a new orchestrator step?

**Decision: Invoke lu-premortem from within the `phase-discuss` skill, after discussion completes but before emitting the state transition.**

### Rationale

1. **The state machine is already wired.** The `discussing` state accepts both `DISCUSS_COMPLETE` and `PREMORTEM_COMPLETE` events (lines 373-387 in `machine.ts`). Either event transitions to `planning`. The `PREMORTEM_COMPLETE` event carries `risks`, `mitigations`, and `confidence` data and triggers `recordPremortemResult` action.

2. **The `shouldRunPremortem` guard exists** (line 284 in `guards.ts`) — it checks `context.gates["premortem"] === true`. This means the premortem gate must be enabled in `.planning/config.json` under the `gates` section.

3. **Phase-discuss is the natural home.** The spec says pre-mortem runs "within the existing `discussing` state — not a new pipeline stage." The phase-discuss skill already:
   - Reads complexity from the bridge
   - Spawns sub-agents (lu-discuss-researcher in auto mode)
   - Has complexity-gated behavior

4. **Two integration approaches considered:**

   **Option A: Inline in phase-discuss (CHOSEN)**
   - After discussion/auto-discuss completes, check complexity and premortem gate
   - If MODERATE+ and gate enabled: spawn lu-premortem via Task()
   - Present Risk Brief to developer for approve/reject
   - Emit `PREMORTEM_COMPLETE` event via bridge transition
   - If TRIVIAL/SIMPLE or gate disabled: emit `DISCUSS_COMPLETE` as normal

   **Option B: New skill (phase-premortem) (REJECTED)**
   - Would require a separate invocation step and new orchestration
   - Adds complexity: the user/autopilot would need to know to call it
   - The spec explicitly says "not a new pipeline stage"
   - Violates the principle of keeping the pipeline lean

### Implementation Plan

- **In `src/skills/general/phase-discuss.skill.ts`:** Add a section after the CONTEXT.md write step (both interactive and auto mode) that:
  1. Reads complexity from bridge
  2. Checks premortem gate via `bun run packages/luca-framework/src/state/bridge.ts gate-check --gate=premortem`
  3. If MODERATE+ and gate enabled: spawn `lu-premortem` via Task()
  4. Present the Risk Brief output to the developer (Checkpoint 1)
  5. On approve: emit `PREMORTEM_COMPLETE` with risks/mitigations/confidence
  6. On reject/skip: emit `DISCUSS_COMPLETE` as normal

- **In `src/agents/luca/lu-premortem.agent.ts`:** Create new agent definition following the existing agent pattern (`createAgent` from `~/agents/__helpers/create-agent`). Agent config:
  - `name`: "lu-premortem"
  - `tools`: ["Read", "Grep", "Glob"] (read-only — generates analysis, no file edits)
  - `cognition.default_tier`: "T1" (reads past failures from MuninnDB)
  - `cognition.memory_tags`: ["failures", "risks", "pitfalls", "decisions"]
  - `purpose`: "risk-analysis"

- **In `src/complexity/__helpers/model-routing.ts`:** Add `"lu-premortem": DEEP_ANALYSIS` to `MODEL_ROUTING_TABLE` (per spec: balanced@MODERATE, capable@COMPLEX, capable@CRITICAL).

- **In `.planning/config.json`:** Add `"premortem": true` to the `gates` section to enable the feature.

### State Transition Flow

```
discussing
  ├─ DISCUSS_COMPLETE → planning        (TRIVIAL/SIMPLE, or premortem gate off)
  ├─ PREMORTEM_COMPLETE → planning      (MODERATE+ with premortem gate on)
  └─ SKIP → planning                   (user skips discussion)
```

The developer checkpoint (Risk Brief review) happens within the `discussing` state, before the transition event is emitted. This keeps the state machine clean — it only sees "discussion phase done" or "discussion phase done with premortem data."

---

## Gray Area 3: Appetite Auto-Inference Mapping

**Question:** How to map complexity to appetite for TRIVIAL/SIMPLE tasks. Where does this mapping live — in the router, in a helper, or in the state machine?

**Decision: Create a pure mapping function in `packages/luca-framework/src/state/utils/` and invoke it from the router flow (after `ROUTE_COMPLETE` sets complexity).**

### Rationale

1. **The spec is explicit:** TRIVIAL maps to Micro, SIMPLE maps to Small. MODERATE+ requires developer declaration. This is a deterministic mapping — no LLM judgment needed.

2. **Three locations considered:**

   **Option A: In the state machine as an action on ROUTE_COMPLETE (REJECTED)**
   - Would couple appetite inference to the state machine's `setComplexity` action
   - But the state machine should be dumb — it stores data, it doesn't infer it
   - Also, MODERATE+ needs developer input, so the machine can't fully resolve appetite

   **Option B: In lu-router agent frontmatter (REJECTED)**
   - The router already does complexity classification
   - But appetite is conceptually separate from complexity — it's Phase 0 (Intake), not routing
   - Would bloat the router's responsibilities

   **Option C: In a state utility helper (CHOSEN)**
   - Create `packages/luca-framework/src/state/utils/appetite-utils.ts`
   - Export `inferAppetiteFromComplexity(complexity: ComplexityLevel): AppetiteLevel | null`
   - Returns `"Micro"` for TRIVIAL, `"Small"` for SIMPLE, `null` for MODERATE+ (signals developer must declare)
   - Export `getAppetiteTokenCeiling(level: AppetiteLevel): number` for token budget lookup
   - The skill layer (phase-discuss or lu-router flow) calls this and either auto-sets via bridge `set-field` or prompts the developer

### Appetite Level Definitions

Per the spec and existing state schema (`appetite_level` enum in `types.ts` line 197-199):

| Appetite Level | Auto-Inferred From | Token Ceiling | Context Budget |
| -------------- | ------------------ | ------------- | -------------- |
| Micro          | TRIVIAL            | 25,000        | 30%            |
| Small          | SIMPLE             | 50,000        | 40%            |
| Medium         | Developer declares | 100,000       | 50%            |
| Large          | Developer declares | 200,000       | 60%            |
| XL             | Developer declares | 400,000       | 70%            |

Token ceilings are weighted estimates based on the context usage quality curve documented in the workflow spec (30% = PEAK, 50% = GOOD, 70% = DEGRADING). Micro/Small stay in PEAK zone. Medium is the default (current behavior). Large/XL allow extended work at the cost of quality degradation risk.

### Implementation Plan

- **Create `packages/luca-framework/src/state/utils/appetite-utils.ts`:**
  - `inferAppetiteFromComplexity()` — Pure mapping, returns level or null
  - `getAppetiteTokenCeiling()` — Token budget lookup table
  - `getAppetiteContextPercent()` — Context budget percent lookup table
  - Zod schema for appetite level already exists in `types.ts`

- **In the intake flow (after routing):** The skill that handles intake (currently phase-discuss or the lu-router exit path) should:
  1. After complexity is set, call `inferAppetiteFromComplexity(complexity)`
  2. If returns a level (TRIVIAL/SIMPLE): auto-set via bridge `set-field --field=appetite_level --value=Micro`
  3. If returns null (MODERATE+): prompt developer to declare appetite level
  4. Set corresponding token ceiling and context percent via bridge

- **In `src/agents/luca/lu-planner.agent.ts`:** Add appetite-aware planning instructions:
  - Read appetite from bridge state
  - Shape scope to fit within declared budget
  - If appetite < complexity floor: flag conflict to developer

### Key Files

- `packages/luca-framework/src/state/utils/appetite-utils.ts` — New helper (T1 Core tier)
- `packages/luca-framework/src/state/types.ts` — Appetite level schema already exists (no changes)
- `src/skills/general/phase-discuss.skill.ts` — Add appetite declaration step after routing
- `src/agents/luca/lu-planner.agent.ts` — Add appetite constraint awareness

---

## Summary of Decisions

| Gray Area               | Decision                                             | Key Reason                                                         |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Appetite guard location | `src/skills/general/phase-execute.skill.ts` (source) | Orchestrator concern with user interaction; not a pure state guard |
| Pre-mortem integration  | Inline in `phase-discuss` skill, after discussion    | Spec says "not a new pipeline stage"; state machine already wired  |
| Appetite auto-inference | New `appetite-utils.ts` in state/utils/              | Pure deterministic mapping; keeps state machine dumb               |

## Locked Constraints (From Codebase Analysis)

- State machine already has all v4 appetite fields, PREMORTEM_COMPLETE event, and guards wired (Phase 2 work)
- Bridge CLI already supports reading/writing appetite_level, appetite_token_ceiling, appetite_context_percent
- `appetite_used_tokens` needs to be added to SETTABLE_FIELDS in bridge.ts
- Model routing table needs `lu-premortem: DEEP_ANALYSIS` entry
- `premortem` gate needs to be added to config.json gates section
- Skills in `src/` are the SOURCE — `.claude/`, `.cursor/`, `.pi/` are generated output
