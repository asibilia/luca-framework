---
phase: 3
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 3 Plan 1: Agent Team Prompt Audit Fixes

## Objective

Implement 8 prioritized prompt quality improvements across 5 skill files to align all agent team spawn points with Claude Code best practices: XML block structure, recipient declarations, explicit output formats, right-sized teams, and named agent types.

These are prompt-only changes (modifying skill definition strings), not logic changes — except Fix #4 (reduce code review team) and Fix #7 (named agent types) which change runtime spawning behavior.

> Appetite: Medium (100000 tokens remaining of 100000 ceiling)

## Context

@src/skills/general/phase-execute.skill.ts — Largest file (~2649 lines), receives fixes 2, 3, 4, 6, 8
@src/skills/general/phase-research.skill.ts — 199 lines, receives fixes 1, 2
@src/skills/general/phase-discuss.skill.ts — 375 lines, receives fix 5
@src/skills/luca/lu.skill.ts — 1596 lines, receives fix 7
@src/skills/general/pr-address.skill.ts — 803 lines, receives fix 2
@src/skills/general/codebase-map.skill.ts — Gold standard XML block template
@.planning/todos/pending/agent-team-prompt-audit-fixes.md — Full audit details

## Tasks

### Wave 1: phase-execute.skill.ts (Fixes 2, 3, 4, 6, 8)

All phase-execute changes are batched in a single wave to avoid merge conflicts on the ~2649-line file.

### 1. Add recipient declarations to all reviewer/researcher prompts in phase-execute (Fix #2 partial)

**Type:** auto
**TDD:** false
**Depends on:** none

Add a one-line recipient declaration to every Task() prompt in phase-execute.skill.ts that spawns a reviewer or team agent. The declaration tells the sub-agent who it is reporting to.

Pattern to add at the start of each Task prompt (after the opening XML tag or as the first line):

```
**Recipient:** phase-execute orchestrator (report findings back to this orchestrator)
```

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Locations (line references approximate):**

- dx-advocate Task prompt (~line 1938)
- code-simplifier Task prompt (~line 1970)
- code-architect Task prompt (~line 2000)
- ui/Tailwind Task prompt (~line 2030)
- security-auditor Task prompt (~line 2062)
- Architecture lens Task prompt (~line 2094)
- Data lens Task prompt (~line 2134)
- Verification tribunal diagnostic prompts (~lines 1564, 1580, 1596)
- Gap-fix executor prompts (~line 1722)
- Wave executor prompts (~lines 635, 682)
- lu-verifier prompts (Step 7)
- lu-learner prompts (Step 9)

**Verification:**

- Every Task() prompt in phase-execute that spawns a sub-agent has a `**Recipient:**` line
- `bunx --bun tsc --noEmit` passes

### 2. Add explicit output format to harness tribunal diagnostic prompts (Fix #3)

**Type:** auto
**TDD:** false
**Depends on:** none

The verification tribunal (Step 7.25) spawns 3 diagnostic agents but the prompt says "Extract CATEGORY, CONFIDENCE, EVIDENCE, and ACTION" without defining the format in the prompt itself. Add an explicit `<output_format>` XML block to each diagnostic Task() prompt.

Add to each of the 3 diagnostic prompts (lu-test-writer, lu-verifier, lu-integration-checker at ~lines 1564-1612):

```
<output_format>
Return your analysis in this exact format:

CATEGORY: tests_incomplete | goal_over_specified | wiring_issue
CONFIDENCE: HIGH | MEDIUM | LOW
EVIDENCE: [1-3 sentence summary of evidence]
ACTION: [Recommended remediation step]
</output_format>
```

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Each of the 3 diagnostic Task() prompts contains an `<output_format>` XML block
- The format matches what Step 7.25.4 expects to parse (CATEGORY/CONFIDENCE/EVIDENCE/ACTION)
- `bunx --bun tsc --noEmit` passes

### 3. Reduce code review team from 5+ to 3-4 reviewers (Fix #4)

**Type:** auto
**TDD:** false
**Depends on:** none

The current standard review team is: dx-advocate, code-simplifier, code-architect, ui (Tailwind), security-auditor (conditional). For a developer tooling monorepo, the `ui` reviewer (Tailwind/styling) is irrelevant.

Changes:

1. **Remove the `ui` reviewer** Task() block entirely (~lines 2027-2055) — this repo has no UI/Tailwind
2. **Remove `ui` from the sub-agent list** in the delegation requirements header (~line 40)
3. **Update the reviewer routing table** (~lines 1901-1907) to remove the ui row
4. **Update "performance-auditor" in the routing table** — it appears in the table but has no corresponding Task() block. Either add the Task() or remove from table. Since audit says to reduce team, remove from table if no Task exists.

Result: Standard team becomes dx-advocate, code-simplifier, code-architect (3 always) + security-auditor (conditional) = 3-4 reviewers.

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- `ui` reviewer Task() block is removed
- `ui` is removed from sub-agent delegation requirements list
- Reviewer routing table shows only dx-advocate, code-simplifier, code-architect, security-auditor
- `performance-auditor` inconsistency resolved (either added or removed)
- Standard review team spawns 3 agents (+ security-auditor conditionally)
- `bunx --bun tsc --noEmit` passes

### 4. Cap wave executor team size to 5 with sub-wave splitting (Fix #6)

**Type:** auto
**TDD:** false
**Depends on:** none

Currently waves can have unlimited plans spawning unlimited parallel executors. Add a cap of 5 concurrent executors per wave, splitting large waves into sub-waves.

Add a sub-wave splitting instruction in Step 4 (Execute Waves, ~line 434-450) before the executor spawning:

```
#### 4.0.1. Sub-Wave Splitting (Team Size Cap)

If a wave contains more than 5 plans, split it into sub-waves of at most 5 plans each:

1. Sort plans within the wave by dependency order (plans with fewer deps first)
2. Create sub-waves of max 5 plans each
3. Execute sub-waves sequentially within the wave (each sub-wave's plans run in parallel)
4. Wait for all sub-wave executors to complete before starting the next sub-wave

This cap prevents context exhaustion from too many parallel agent outputs.
```

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Wave execution section includes sub-wave splitting logic with cap of 5
- Instructions are clear that sub-waves are sequential, plans within sub-waves are parallel
- `bunx --bun tsc --noEmit` passes

### 5. Add gap-fix return format and SUMMARY update instruction (Fix #8)

**Type:** auto
**TDD:** false
**Depends on:** none

The gap-fix executor prompt (Step 7.5.3, ~line 1722-1748) lacks an explicit return format and doesn't instruct the executor to update the plan's SUMMARY.md.

Add to the gap-fix executor Task() prompt:

1. An `<output_format>` block specifying the expected return:

```
<output_format>
When complete, return:
- status: success | partial | failed
- summary: What was fixed (1-2 sentences)
- artifacts: List of files modified
- remaining_gaps: Any gaps not addressed and why

Update the plan's SUMMARY.md to reflect gap-fix changes (append a "## Gap Fix Iteration {N}" section).
</output_format>
```

2. Add `**Recipient:** phase-execute orchestrator` (overlaps with Fix #2)

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Gap-fix executor prompt has `<output_format>` block
- Return format includes status, summary, artifacts, remaining_gaps
- SUMMARY update instruction is present
- `bunx --bun tsc --noEmit` passes

---

### Wave 2: Remaining Files (Fixes 1, 2 remainder, 5, 7)

### 6. Rewrite phase-research v2 Task() prompts with XML blocks (Fix #1)

**Type:** auto
**TDD:** false
**Depends on:** none

The v2 multi-agent research prompts (Step 3a, ~lines 94-113 in phase-research.skill.ts) use a minimal template:

```
Phase {N}: {phase_name}
Description: {phase_description}
Constraints: {context_md_decisions}
Output file: {output_file_path}

Research your focus area for this phase. Write your findings to the output file path.
```

Rewrite each of the 4 researcher Task() prompts to use XML block structure matching the codebase-map gold standard:

```python
Task(
  prompt="""
<research_context>

**Phase:** {N} - {phase_name}
**Description:** {phase_description}
**Constraints:** {context_md_decisions}
**Output file:** {output_file_path}
**Recipient:** phase-research orchestrator

</research_context>

<analysis_targets>
- {focus-area-specific targets}
</analysis_targets>

<output_requirements>
- Write findings to {output_file_path}
- Include confidence level (HIGH/MEDIUM/LOW) for each finding
- Include cited sources where applicable
- Return confirmation with document line count
</output_requirements>

Research {focus_area} for this phase. Write your findings to the output file.
""",
  subagent_type="{researcher_type}",
  description="{focus_area} research"
)
```

Apply this pattern to all 4 researchers:

1. lu-architecture-researcher (system design, patterns, structure)
2. lu-implementation-researcher (APIs, code patterns, configuration)
3. lu-ecosystem-researcher (libraries, community, state of art)
4. lu-risk-researcher (pitfalls, failures, security, perf)

Also add `**Recipient:** phase-research orchestrator` to the v1 researcher spawn if present.

**Files to edit:**

- `src/skills/general/phase-research.skill.ts`

**Verification:**

- All 4 v2 researcher prompts use `<research_context>`, `<analysis_targets>`, `<output_requirements>` XML blocks
- Each prompt has a `**Recipient:**` line
- Each prompt has focus-area-specific analysis targets (not generic)
- `bunx --bun tsc --noEmit` passes

### 7. Add recipient declarations to pr-address reviewer prompts (Fix #2 partial)

**Type:** auto
**TDD:** false
**Depends on:** none

The pr-address.skill.ts already uses XML blocks (`<validation_context>`, `<validation_task>`, `<output_format>`) which is good. But it lacks recipient declarations.

Add `**Recipient:** pr-address orchestrator` to each reviewer Task() prompt in Step 3 (~lines 170-300+):

- security-auditor
- code-architect
- dx-advocate
- performance-auditor
- accessibility-expert (ux)
- lu-pr-reviewer

**Files to edit:**

- `src/skills/general/pr-address.skill.ts`

**Verification:**

- Every reviewer Task() prompt in pr-address has a `**Recipient:**` line
- Existing XML block structure is preserved
- `bunx --bun tsc --noEmit` passes

### 8. Add explicit Task() prompt for phase-discuss auto researchers + parallel spawning (Fix #5)

**Type:** auto
**TDD:** false
**Depends on:** none

In phase-discuss.skill.ts, the auto mode (Step 7a, ~line 109-113) describes spawning lu-discuss-researcher per question but uses vague language without showing the actual Task() call pattern.

Replace the current description with an explicit Task() prompt template using XML blocks:

```python
# Spawn ALL researchers in PARALLEL (same message, multiple Task calls)
For each gray_area question:
  Task(
    prompt="""
<research_context>

**Phase:** {phase_number} - {phase_name}
**Question:** {gray_area_question}
**Tech stack:** {tech_stack_from_muninn}
**Project context:** {project_identity_summary}
**Recipient:** phase-discuss orchestrator

</research_context>

<analysis_targets>
- Research this specific question for the phase context
- Consider the project's tech stack when recommending solutions
- Look for community best practices and common patterns
</analysis_targets>

<output_requirements>
Return your findings in this format:
<research_result>
recommendation: [Your recommendation]
confidence: HIGH | MEDIUM | LOW
researchable: true | false
sources: [List of sources/references]
reasoning: [Why this recommendation]
</research_result>
</output_requirements>

Research this question and provide a recommendation.
""",
    subagent_type="lu-discuss-researcher",
    model="{researcher_model}",
    description="Research: {gray_area_topic}"
  )
```

Also update the instruction text to explicitly say "Spawn ALL researchers in PARALLEL (same message, multiple Task calls)" instead of the current serial-sounding "Spawn lu-discuss-researcher per question."

**Files to edit:**

- `src/skills/general/phase-discuss.skill.ts`

**Verification:**

- Auto mode has explicit Task() prompt template with XML blocks
- Prompt includes `**Recipient:**` declaration
- Instructions say PARALLEL spawning (not serial)
- `<output_requirements>` matches what Step 8a expects to parse (`<research_result>`)
- `bunx --bun tsc --noEmit` passes

### 9. Use named agent types in lu swarm instead of general-purpose (Fix #7)

**Type:** auto
**TDD:** false
**Depends on:** none

In lu.skill.ts, the parallel planning swarm (Step 4-swarm-c, ~line 1167-1193) and execution swarm (Step 4-swarm-f, ~line 1240-1263) use `subagent_type: "general-purpose"` instead of named agent types.

Changes:

1. **Planning swarm** (~line 1170): Change `subagent_type: "general-purpose"` to `subagent_type: "lu-planner"`
2. **Execution swarm** (~line 1243): Change `subagent_type: "general-purpose"` to `subagent_type: "lu-executor"`

This ensures the sub-agents load their proper system prompts (lu-planner.agent.md and lu-executor.agent.md) instead of running as generic agents.

**Files to edit:**

- `src/skills/luca/lu.skill.ts`

**Verification:**

- No remaining `subagent_type: "general-purpose"` in lu.skill.ts planning/execution swarm sections
- Planning swarm uses `subagent_type: "lu-planner"`
- Execution swarm uses `subagent_type: "lu-executor"`
- `bunx --bun tsc --noEmit` passes

## Verification

1. **Type check passes:** `bunx --bun tsc --noEmit` — no type errors introduced
2. **All prompts use XML blocks where applicable:** phase-research v2, phase-discuss auto, harness tribunal diagnostics, gap-fix executor
3. **Recipient declarations present:** Every Task() prompt that spawns a team sub-agent has a `**Recipient:**` line
4. **Code review team reduced:** Standard team is dx-advocate + code-simplifier + code-architect (3) + security-auditor (conditional) = 3-4
5. **Wave executor team capped:** Sub-wave splitting at 5 concurrent executors documented
6. **lu swarm uses named agent types:** lu-planner and lu-executor instead of general-purpose
7. **Gap-fix has return format:** Explicit output format and SUMMARY update instruction
8. **No logic regressions:** Skill files remain valid TypeScript string templates

## Success Criteria

- All 8 audit fixes implemented across 5 skill files
- `bunx --bun tsc --noEmit` passes clean
- Prompt quality aligns with codebase-map gold standard pattern
- No new files created (prompt-only changes to existing files)

## Output Specification

Modified files:

- `src/skills/general/phase-execute.skill.ts` (fixes 2, 3, 4, 6, 8)
- `src/skills/general/phase-research.skill.ts` (fixes 1, 2)
- `src/skills/general/phase-discuss.skill.ts` (fix 5)
- `src/skills/luca/lu.skill.ts` (fix 7)
- `src/skills/general/pr-address.skill.ts` (fix 2)
