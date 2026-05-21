---
phase: 1
plan: 2
type: improvement
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 1 Plan 2: Agent Team Prompt Audit Fixes

## Objective

Implement 8 prioritized agent team prompt improvements across 5 skill source files. These fixes align all team spawn points with best practices from the Claude Code Agent Team Prompts guide: own specific files, define output, name recipients, limit team size to 3-5.

Post-plan requirement: User must run `bun run build:all` outside the Claude Code session to compile updated skills into `.claude/` output. Run `bun run check:drift` before Phase 2.

## Context

@src/skills/general/phase-execute.skill.ts (fixes 2, 3, 4, 6, 8)
@src/skills/general/phase-research.skill.ts (fixes 1, 2)
@src/skills/general/phase-discuss.skill.ts (fix 5)
@src/skills/luca/lu.skill.ts (fix 7)
@src/skills/general/pr-address.skill.ts (fix 2)
@.planning/todos/pending/agent-team-prompt-audit-fixes.md

## Tasks

### 1. Rewrite phase-research v2 Task() prompts with XML blocks (Fix #1 -- HIGH)

**Type:** auto
**TDD:** false
**Depends on:** none

Rewrite the researcher Task() prompts in `phase-research.skill.ts` to use XML-block structure modeled after the codebase-map gold standard. Each researcher prompt should use:

```
<research_context> ... </research_context>
<analysis_targets> ... </analysis_targets>
<output_requirements> ... </output_requirements>
```

This replaces any unstructured or plain-text prompt formatting with explicit XML boundaries that constrain the agent's output and provide clear sections.

**Files to edit:**

- `src/skills/general/phase-research.skill.ts`

**Verification:**

- All researcher Task() prompts in phase-research contain `<research_context>`, `<analysis_targets>`, and `<output_requirements>` XML blocks
- `bunx --bun tsc --noEmit` passes

### 2. Add recipient declarations to all reviewer/researcher prompts (Fix #2 -- HIGH)

**Type:** auto
**TDD:** false
**Depends on:** none

Add a one-line recipient declaration to every reviewer and researcher prompt across all 5 files. The format is:

```
**Recipient:** lu-executor (or appropriate recipient agent name)
```

This tells the spawned agent who will consume its output, improving output quality by giving the agent audience awareness.

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts` (all reviewer prompts)
- `src/skills/general/phase-research.skill.ts` (all researcher prompts)
- `src/skills/general/phase-discuss.skill.ts` (researcher prompts)
- `src/skills/luca/lu.skill.ts` (swarm agent prompts)
- `src/skills/general/pr-address.skill.ts` (reviewer prompts, plus add any missing reviewer prompts)

**Verification:**

- Every Task() prompt that spawns a reviewer or researcher contains a `**Recipient:**` line
- `bunx --bun tsc --noEmit` passes

### 3. Add explicit output format to harness tribunal prompts (Fix #3 -- HIGH)

**Type:** auto
**TDD:** false
**Depends on:** none

Add structured output format requirements to the harness tribunal (error classification) prompts in phase-execute. The required format:

```
CATEGORY: [test-failure | type-error | lint-violation | build-error]
CONFIDENCE: [high | medium | low]
EVIDENCE: [specific line/error reference]
ACTION: [fix-description | skip-reason]
```

This replaces any freeform output from tribunal agents with a structured format that the executor can parse reliably.

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Tribunal prompts contain the CATEGORY/CONFIDENCE/EVIDENCE/ACTION output format specification
- `bunx --bun tsc --noEmit` passes

### 4. Reduce code review team to 3-4 reviewers (Fix #4 -- MEDIUM)

**Type:** auto
**TDD:** false
**Depends on:** none

Remove the `ui` reviewer from the code review team in phase-execute (irrelevant for this tooling monorepo -- there is no user-facing UI in the reviewed code). Merge any multi-lens reviewer overlap into the base reviewer set. Target team size: 3-4 reviewers.

Current reviewers to evaluate: code-architect, dx-advocate, code-simplifier, security-auditor, ui.
Target: Drop `ui`. Keep 3-4 of the remaining based on relevance to a developer tooling monorepo.

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Code review team size is 3-4 (no more than 4 reviewer spawns)
- `ui` reviewer is removed
- `bunx --bun tsc --noEmit` passes

### 5. Add Task() prompt for phase-discuss auto researchers + parallel spawning (Fix #5 -- MEDIUM)

**Type:** auto
**TDD:** false
**Depends on:** none

In `phase-discuss.skill.ts`, the auto-mode researchers are currently spawned serially with minimal prompts. Fix this by:

1. Adding explicit Task() prompts with XML-block structure for each auto researcher
2. Switching the spawning from serial to parallel (use Promise.all or equivalent pattern)

**Files to edit:**

- `src/skills/general/phase-discuss.skill.ts`

**Verification:**

- Auto researchers have explicit Task() prompts with XML blocks
- Researchers are spawned in parallel (not serially)
- `bunx --bun tsc --noEmit` passes

### 6. Cap wave executor team size to 5 with sub-wave splitting (Fix #6 -- MEDIUM)

**Type:** auto
**TDD:** false
**Depends on:** none

Add a cap of 5 concurrent executor agents per wave in phase-execute. When a wave has more than 5 tasks, split into sub-waves of 5 or fewer. This prevents the "10+ teammates" anti-pattern.

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Wave execution code enforces a maximum of 5 concurrent agents
- Waves with >5 tasks are split into sub-waves
- `bunx --bun tsc --noEmit` passes

### 7. Use named agent types in lu orchestrator swarm (Fix #7 -- MEDIUM)

**Type:** auto
**TDD:** false
**Depends on:** none

In `lu.skill.ts`, the parallel swarm currently uses `general-purpose` agent type for spawned agents. Switch to named agent types (`lu-planner`, `lu-executor`, etc.) so that each spawned agent gets its proper system prompt and specialization.

**Files to edit:**

- `src/skills/luca/lu.skill.ts`

**Verification:**

- Swarm agents use specific named types (e.g., `lu-planner`, `lu-executor`) instead of `general-purpose`
- `bunx --bun tsc --noEmit` passes

### 8. Add gap-fix return format and SUMMARY update instruction (Fix #8 -- LOW)

**Type:** auto
**TDD:** false
**Depends on:** none

Add explicit return format requirements and a SUMMARY.md update instruction to gap-fix executor prompts in phase-execute. The gap-fix agent should:

1. Return results in a structured format (files changed, verification status)
2. Include an instruction to update the phase SUMMARY with gap-fix results

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Gap-fix prompts specify a return format
- Gap-fix prompts include SUMMARY update instruction
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes after all 8 fixes
2. All Task() prompts follow XML-block structure where applicable
3. All reviewer/researcher prompts have `**Recipient:**` declarations
4. Code review team is 3-4 members (no `ui` reviewer)
5. Wave executor cap is 5 with sub-wave splitting
6. Harness tribunal prompts have structured output format
7. Lu swarm uses named agent types

## Success Criteria

- All 8 audit fixes applied to the 5 skill source files
- TypeScript compilation passes cleanly
- Prompt patterns align with Claude Code Agent Team Prompts best practices
- User instructed to run `bun run build:all` outside the session post-completion

## Output Specification

- Modified files: 5 skill source files in `src/skills/`
  - `src/skills/general/phase-execute.skill.ts`
  - `src/skills/general/phase-research.skill.ts`
  - `src/skills/general/phase-discuss.skill.ts`
  - `src/skills/luca/lu.skill.ts`
  - `src/skills/general/pr-address.skill.ts`
- Post-plan user action: `bun run build:all` (outside Claude Code session)
