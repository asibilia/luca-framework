---
phase: 04
plan: 3
type: improvement
autonomous: true
wave: 3
depends_on: [1, 2]
---

# Phase 04 Plan 3: Mechanical Vault Replacement in Remaining Skills and Agents

## Objective

Replace all remaining hardcoded `vault: "default"` references across 16 skill and agent files with config-driven vault routing. These are mechanical replacements where each `vault: "default"` is replaced with either `vault: REPO_VAULT` or `vault: DEFAULT_VAULT` based on the concept prefix of the MuninnDB operation, following the vault-routing rule established in Plan 1.

> These files do not implement dual-vault recall logic themselves -- they are consumers that simply need to target the correct vault for their specific operations.

## Context

@.planning/phases/04-skill-dual-vault-integration/CONTEXT.md
@src/rules/general/vault-routing.rule.ts (vault routing reference)
@.planning/config.json (muninn.vault: "luca-framework")

## Tasks

### 1. Add vault resolution preamble to all affected files

**Type:** auto
**TDD:** false
**Depends on:** none

Each file that contains `vault: "default"` needs a vault resolution instruction near the top of its prompt content (in the appropriate step or preamble section). The instruction tells Claude to:

1. Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT
2. Set DEFAULT_VAULT = "default"
3. Use the vault-routing rule to determine which vault for each operation

This is a consistent preamble pattern. For skills that already read config.json (like phase-execute), integrate into the existing config-reading step. For skills that don't, add a brief vault resolution note.

**Files to edit (all 15):**

- `src/agents/luca/lu-executor.agent.ts` (7 occurrences)
- `src/agents/general/lu-discuss-researcher.agent.ts` (1 occurrence)
- `src/skills/general/phase-execute.skill.ts` (11 occurrences)
- `src/skills/general/milestone-complete.skill.ts` (23 occurrences)
- `src/skills/general/seed-memory.skill.ts` (5 occurrences)
- `src/skills/general/outcome.skill.ts` (7 occurrences)
- `src/skills/general/session-plan.skill.ts` (5 occurrences)
- `src/skills/general/phase-plan.skill.ts` (4 occurrences)
- `src/skills/general/phase-discuss.skill.ts` (3 occurrences)
- `src/skills/general/autopilot.skill.ts` (2 occurrences)
- `src/skills/general/profile-import.skill.ts` (3 occurrences)
- `src/skills/general/profile-export.skill.ts` (3 occurrences)
- `src/skills/general/debug.skill.ts` (2 occurrences)
- `src/skills/general/progress.skill.ts` (1 occurrence)
- `src/skills/general/quick.skill.ts` (1 occurrence)

**Verification:**

- Each file has a vault resolution section or references config.json for vault name

### 2. Replace vault: "default" in lu-executor.agent.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

lu-executor (7 occurrences) writes session findings and context. All operations are `session:*` scoped.

**Routing:** All `vault: "default"` -> `vault: REPO_VAULT` (session operations are repo-scoped)

**Files to edit:**

- `src/agents/luca/lu-executor.agent.ts`

**Verification:**

- `grep -Ec "vault: [\"']default[\"']" src/agents/luca/lu-executor.agent.ts` returns 0

### 3. Replace vault: "default" in lu-discuss-researcher.agent.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

lu-discuss-researcher (1 occurrence) does a brain tree recall.

**Routing:** `vault: "default"` -> `vault: REPO_VAULT` (brain:project-identity is repo-scoped)

**Files to edit:**

- `src/agents/general/lu-discuss-researcher.agent.ts`

**Verification:**

- `grep -Ec "vault: [\"']default[\"']" src/agents/general/lu-discuss-researcher.agent.ts` returns 0

### 4. Replace vault: "default" in phase-execute.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

phase-execute (11 occurrences) manages session context, spawns agents with memory context, and tracks findings. Operations span session:\*, and memory injection.

**Routing:**

- session:\* operations -> `vault: REPO_VAULT`
- Memory recall for agent context -> follows dual-vault pattern (but phase-execute delegates this to lu-cognition, so its own recall calls are for session state and should use REPO_VAULT)
- Any pattern/decision recall references -> `vault: REPO_VAULT` for session-local, but note in instructions that lu-cognition handles the dual-vault recall

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- `grep -Ec "vault: [\"']default[\"']" src/skills/general/phase-execute.skill.ts` returns 0

### 5. Replace vault: "default" in milestone-complete.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

milestone-complete (23 occurrences -- the highest count) manages milestone summaries, archives, memory cleanup, and metric storage.

**Routing by operation type:**

- `milestone:*`, `version:*` writes -> `vault: REPO_VAULT` (release history is repo-scoped)
- `session:*` cleanup -> `vault: REPO_VAULT`
- `metric:*` operations -> `vault: REPO_VAULT`
- `brain:project-*` reads -> `vault: REPO_VAULT`
- `pattern:*`, `pitfall:*` reads (for milestone summary) -> dual-vault recall pattern or REPO_VAULT (milestone context is project-scoped)
- Any cross-cutting memory operations -> `vault: DEFAULT_VAULT`

**Files to edit:**

- `src/skills/general/milestone-complete.skill.ts`

**Verification:**

- `grep -Ec "vault: [\"']default[\"']" src/skills/general/milestone-complete.skill.ts` returns 0

### 6. Replace vault: "default" in seed-memory, outcome, session-plan skills

**Type:** auto
**TDD:** false
**Depends on:** 1

Three skills with moderate vault reference counts:

**seed-memory.skill.ts (5 occurrences):**

- brain:project-\* writes -> `vault: REPO_VAULT`
- brain:user-\* writes -> `vault: DEFAULT_VAULT`
- General memory seeding -> route by concept prefix per write heuristic

**outcome.skill.ts (7 occurrences):**

- outcome:\* writes -> `vault: REPO_VAULT` (outcomes are repo-scoped)
- metric:\* operations -> `vault: REPO_VAULT`
- session:\* operations -> `vault: REPO_VAULT`

**session-plan.skill.ts (5 occurrences):**

- session:\* operations -> `vault: REPO_VAULT`
- Brain tree reads -> `vault: REPO_VAULT`
- Pattern recall for planning context -> dual-vault awareness note (delegate to lu-cognition)

**Files to edit:**

- `src/skills/general/seed-memory.skill.ts`
- `src/skills/general/outcome.skill.ts`
- `src/skills/general/session-plan.skill.ts`

**Verification:**

- `grep -Ec "vault: [\"']default[\"']"` returns 0 for all three files

### 7. Replace vault: "default" in phase-plan, phase-discuss, autopilot skills

**Type:** auto
**TDD:** false
**Depends on:** 1

Three skills with lower vault reference counts:

**phase-plan.skill.ts (4 occurrences):**

- session:\* operations -> `vault: REPO_VAULT`
- Brain tree / context recall -> `vault: REPO_VAULT`

**phase-discuss.skill.ts (3 occurrences):**

- session:\* operations -> `vault: REPO_VAULT`
- Context recall -> `vault: REPO_VAULT`

**autopilot.skill.ts (2 occurrences):**

- session:\* operations -> `vault: REPO_VAULT`

**Files to edit:**

- `src/skills/general/phase-plan.skill.ts`
- `src/skills/general/phase-discuss.skill.ts`
- `src/skills/general/autopilot.skill.ts`

**Verification:**

- `grep -Ec "vault: [\"']default[\"']"` returns 0 for all three files

### 8. Replace vault: "default" in remaining skills (profile, debug, progress, quick, lu)

**Type:** auto
**TDD:** false
**Depends on:** 1

Six skills with 1-6 vault references each:

**profile-import.skill.ts (3 occurrences):**

- brain:user-\* operations -> `vault: DEFAULT_VAULT` (user identity is cross-cutting)
- brain:project-\* operations -> `vault: REPO_VAULT`

**profile-export.skill.ts (3 occurrences):**

- brain:user-\* reads -> `vault: DEFAULT_VAULT`
- brain:project-\* reads -> `vault: REPO_VAULT`

**debug.skill.ts (2 occurrences):**

- session:\* operations -> `vault: REPO_VAULT`

**progress.skill.ts (1 occurrence):**

- session:_ or metric:_ read -> `vault: REPO_VAULT`

**quick.skill.ts (1 occurrence):**

- session:\* or context recall -> `vault: REPO_VAULT`

**lu.skill.ts (6 occurrences, note: path is src/skills/luca/ not general/):**

- brain:project-identity recall -> `vault: REPO_VAULT`
- session:\* operations -> `vault: REPO_VAULT`
- Pattern recall delegated to lu-cognition (handles dual-vault internally)

**Files to edit:**

- `src/skills/general/profile-import.skill.ts`
- `src/skills/general/profile-export.skill.ts`
- `src/skills/general/debug.skill.ts`
- `src/skills/general/progress.skill.ts`
- `src/skills/general/quick.skill.ts`
- `src/skills/luca/lu.skill.ts`

**Verification:**

- `grep -Ec "vault: [\"']default[\"']"` returns 0 for all six files

## Verification

1. `bunx --bun tsc --noEmit` passes after all changes
2. Global check: `grep -rE "vault: [\"']default[\"']" src/agents/ src/skills/` returns zero matches across all source files
3. Every file that previously had `vault: "default"` now references either REPO_VAULT or DEFAULT_VAULT
4. Vault resolution (config.json read) is present in each modified file's prompt content
5. Routing decisions match the vault-routing rule (Plan 1)

## Success Criteria

- Zero hardcoded `vault: "default"` or `vault: 'default'` references remain in any agent or skill source file under `src/`
- All 16 files have vault resolution instructions
- Routing is consistent with the write heuristic (session/metric/brain:project -> repo, pattern/pitfall/preference/procedure/brain:user -> default)
- TypeScript compilation passes

## Output Specification

- 16 modified source files (2 agents + 14 skills) with config-driven vault references
- No new files created (all modifications to existing files)
