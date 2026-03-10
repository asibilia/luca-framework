---
phase: 3
plan: 2
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 3 Plan 2: Pre-Mortem Agent

## Objective

Implement the pre-mortem risk analysis system (#100) — a new agent that generates domain-specific failure scenarios before planning begins. This plan creates the lu-premortem agent definition, registers it in model routing, enables the premortem gate in config, and wires the agent invocation into the phase-discuss skill.

## Context

Read these files for implementation context:

- @src/agents/luca/lu-planner.agent.ts — Existing agent definition pattern (createAgent, AgentConfig structure)
- @src/agents/luca/lu-executor.agent.ts — Agent with T2 cognition for comparison
- @src/agents/index.ts — Agent barrel file (no changes needed — registry auto-discovers)
- @src/complexity/\_\_helpers/model-routing.ts — Model routing table for DEEP_ANALYSIS preset registration
- @src/skills/general/phase-discuss.skill.ts — Skill to wire pre-mortem invocation into
- @.planning/config.json — Config file for premortem gate
- @.planning/phases/03-appetite-and-premortem/03-CONTEXT.md — Resolved gray areas and integration decisions

## Tasks

### 1. Create lu-premortem agent definition

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/agents/luca/lu-premortem.agent.ts` following the established agent definition pattern.

**Agent configuration:**

```typescript
const luPremortemConfig: AgentConfig = {
  frontmatter: {
    name: "lu-premortem",
    description:
      "Generates domain-specific failure scenarios and risk briefs before planning begins. Spawned by phase-discuss skill for MODERATE+ complexity tasks.",
    tools: ["Read", "Grep", "Glob"], // Read-only — generates analysis, no file edits
    color: "red",
    cognition: {
      default_tier: "T1",
      promotable_to: "T2",
      memory_tags: ["failures", "risks", "pitfalls", "decisions"],
    },
    context: {
      default_tier: "T1",
      promotable_to: "T2",
      isolation: "none",
    },
    background_spawnable: false,
    purpose: "risk-analysis",
    allowed_contexts: ["discussion", "planning", "risk-assessment"],
  },
  sections: [
    // ... sections defined below
  ],
};
```

**Agent sections to create:**

1. **role** (order: 1) — Identity and purpose:
   - You are a pre-mortem risk analyst for Luca
   - You generate domain-specific failure scenarios BEFORE planning begins
   - You surface risks early so the planner can build mitigations into the plan
   - Spawned by phase-discuss skill for MODERATE+ complexity tasks

2. **cognition_integration** (order: 2) — Memory recall integration:
   - T1 Memory-Reader tier
   - Recall past failures, pitfalls, and risks from MuninnDB
   - Use recalled failures as seeds for scenario generation
   - Do NOT write to MuninnDB (read-only)

3. **scenario_generation** (order: 3) — Core methodology:
   - Generate exactly 3 domain-specific failure scenarios
   - Novelty enforcement: exclude generic categories (no "hallucination might occur", "tests might fail", "dependencies might break" boilerplate)
   - Each scenario must include:
     - **Description**: What goes wrong, specifically for this task domain
     - **Root cause**: Why it would happen (technical, architectural, or process reason)
     - **Detection signal**: How you would notice it happening during execution
     - **Mitigation**: Concrete preventive action the planner can build into the plan
     - **Verification criteria**: How to confirm the mitigation worked
   - Seed generation with past failures from MuninnDB recall (if available)
   - If MuninnDB returns relevant past failures, use them as starting points but generate novel scenarios (not repeats)

4. **output_tiers** (order: 4) — Tiered artifact generation:
   - **Tier 1: Risk Brief** (<=500 words) — Primary output, always generated
     - 3 scenarios summarized concisely
     - Each with: risk title, severity (HIGH/MEDIUM/LOW), one-line mitigation
     - This is what the developer reads for approve/reject
   - **Tier 2: Full PREMORTEM.md** — Written to phase directory
     - Complete scenario details (all 5 fields per scenario)
     - Cross-references to past failures if seeded from MuninnDB
     - Planner reads this for plan constraint derivation
   - **Tier 3: Raw scenario data** — Structured output in response
     - JSON-formatted scenario objects
     - Machine-consumable for downstream agents
     - Never loaded into active context unless explicitly requested

5. **quality_standards** (order: 5) — Output quality rules:
   - Scenarios must be specific to the task domain (not generic software risks)
   - At least one scenario should address integration risk (how this work interacts with existing systems)
   - At least one scenario should address scope risk (how this work could expand beyond appetite)
   - Severity ratings must be justified by impact and likelihood
   - Mitigations must be actionable (something the planner can translate to a plan constraint)

**Files to create:**

- `src/agents/luca/lu-premortem.agent.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File follows the createAgent/AgentConfig pattern used by lu-planner.agent.ts
- Agent has read-only tools (Read, Grep, Glob — no Write, Edit, or Bash)
- Cognition tier is T1 (memory reader)
- All 5 sections are defined with correct order values

### 2. Register lu-premortem in model routing table

**Type:** auto
**TDD:** false
**Depends on:** none

Add `"lu-premortem"` to the `MODEL_ROUTING_TABLE` in `src/complexity/__helpers/model-routing.ts` with the `DEEP_ANALYSIS` preset.

Add the entry in the "Deep analysis" section (after the existing entries like `"lu-verifier"`, `"code-architect"`, etc.).

```typescript
// In the DEEP_ANALYSIS section:
"lu-premortem": DEEP_ANALYSIS,
```

This gives lu-premortem the following routing:

- TRIVIAL: fast
- SIMPLE: balanced
- MODERATE: capable
- COMPLEX: capable
- CRITICAL: capable

**Files to edit:**

- `src/complexity/__helpers/model-routing.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `MODEL_ROUTING_TABLE` contains `"lu-premortem": DEEP_ANALYSIS`
- Entry is in the correct section (Deep analysis comment block)

### 3. Enable premortem gate in config.json

**Type:** auto
**TDD:** false
**Depends on:** none

Add `"premortem": true` to the `gates` section in `.planning/config.json`.

The state machine's `shouldRunPremortem` guard (line 284 in guards.ts) checks `context.gates["premortem"] === true`. This gate must be enabled for the pre-mortem agent to run.

**Files to edit:**

- `.planning/config.json`

**Verification:**

- `.planning/config.json` is valid JSON after edit
- The `gates` object includes `"premortem": true`

### 4. Wire pre-mortem invocation into phase-discuss skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `src/skills/general/phase-discuss.skill.ts` to invoke lu-premortem after discussion completes but before emitting the state transition event.

**Integration logic to add (after CONTEXT.md write step, in both interactive and auto modes):**

1. Read complexity from bridge:

   ```bash
   COMPLEXITY=$(bun run packages/luca-framework/src/state/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")
   ```

2. Check premortem gate:

   ```bash
   PREMORTEM_GATE=$(bun run packages/luca-framework/src/state/bridge.ts gate-check --gate=premortem 2>/dev/null || echo '{"enabled":false}')
   ```

3. If complexity is MODERATE+ AND premortem gate is enabled:
   - Read CONTEXT.md, ROADMAP.md phase section, and relevant todo files
   - Spawn `lu-premortem` via Task() with:
     - Phase objective (from ROADMAP.md)
     - Todo descriptions (from pending todo files)
     - CONTEXT.md decisions (gray area resolutions)
     - Complexity level
   - Wait for lu-premortem response

4. Present Risk Brief to developer (Checkpoint):

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Luca > PRE-MORTEM RISK BRIEF
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   {Risk Brief content from lu-premortem}

   Options:
   1. Approve — Mitigations become plan constraints
   2. Reject — Skip pre-mortem, proceed to planning
   3. Modify — Adjust mitigations before proceeding
   ```

5. On approve:
   - Write PREMORTEM.md to phase directory
   - Emit `PREMORTEM_COMPLETE` event via bridge transition with risks/mitigations/confidence data:
     ```bash
     bun run packages/luca-framework/src/state/bridge.ts transition --event=PREMORTEM_COMPLETE --data='{"risks":[...],"mitigations":[...],"confidence":"HIGH"}' 2>/dev/null || true
     ```

6. On reject/skip:
   - Emit `DISCUSS_COMPLETE` event as normal (existing behavior)

7. If complexity is TRIVIAL/SIMPLE OR premortem gate is disabled:
   - Skip pre-mortem entirely
   - Emit `DISCUSS_COMPLETE` as normal (existing behavior)

**Important:** The pre-mortem checkpoint happens WITHIN the `discussing` state. The state machine only sees the final event (`PREMORTEM_COMPLETE` or `DISCUSS_COMPLETE`), keeping the machine clean.

**Note on task 5 from PLAN-01:** Both PLAN-01 Task 5 and this task modify phase-discuss.skill.ts. PLAN-01 adds appetite declaration; this task adds pre-mortem invocation. The executor should integrate both changes into the same file. The appetite declaration step comes FIRST (set appetite before pre-mortem analysis), then the pre-mortem step follows. If these plans execute in parallel, the second executor to touch the file must merge with the first executor's changes.

**Files to edit:**

- `src/skills/general/phase-discuss.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The skill checks complexity level AND premortem gate before spawning lu-premortem
- TRIVIAL/SIMPLE tasks skip pre-mortem entirely
- Developer gets approve/reject/modify checkpoint for Risk Brief
- `PREMORTEM_COMPLETE` event is emitted on approval (not `DISCUSS_COMPLETE`)
- PREMORTEM.md is written to the phase directory on approval

## Verification

1. `bunx --bun tsc --noEmit` passes across all modified and new files
2. `lu-premortem.agent.ts` follows the established agent definition pattern
3. Model routing table includes `lu-premortem` with DEEP_ANALYSIS preset
4. Config gates include `premortem: true`
5. Phase-discuss skill conditionally invokes lu-premortem for MODERATE+ tasks
6. State transition uses `PREMORTEM_COMPLETE` event (not `DISCUSS_COMPLETE`) when pre-mortem runs

## Success Criteria

- lu-premortem agent generates 3 domain-specific, novelty-enforced failure scenarios
- Risk Brief is presented as a developer checkpoint (~2-3 min review)
- Approved mitigations become plan constraints (via PREMORTEM.md)
- Complexity gating: $0 cost for TRIVIAL/SIMPLE (skipped entirely)
- Gate check: premortem can be disabled via config.json without code changes
- State machine transition: PREMORTEM_COMPLETE carries risk data to planning state

## Output Specification

- New file: `src/agents/luca/lu-premortem.agent.ts`
- Modified: `src/complexity/__helpers/model-routing.ts` (model routing entry)
- Modified: `.planning/config.json` (premortem gate)
- Modified: `src/skills/general/phase-discuss.skill.ts` (pre-mortem invocation)
