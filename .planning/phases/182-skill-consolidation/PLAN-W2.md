---
phase: 182
plan: 2
type: improvement
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 182 Plan 2: Reference Cleanup -- Delete Autopilot and Update All References

## Objective

Delete the now-redundant autopilot.skill.ts file and update all remaining references to autopilot across the codebase: skill registry, scaffolding, phase-discuss, 4 roadmap agent docstrings, and the lu-workflow.md rule.

## Context

@src/skills/general/autopilot.skill.ts -- File to delete
@src/skills/**helpers/build-skill-registry.ts -- Remove autopilot import + registry entry
@src/skills/**helpers/scaffolding.ts -- Remove autopilot from CORE_SKILL_NAMES
@src/skills/general/phase-discuss.skill.ts -- Update /autopilot reference
@src/agents/general/lu-roadmap-architect.agent.ts -- Update docstring
@src/agents/general/lu-roadmap-prioritizer.agent.ts -- Update docstring
@src/agents/general/lu-roadmap-qa.agent.ts -- Update docstring
@src/agents/general/lu-roadmap-synthesizer.agent.ts -- Update docstring (6 refs)
@.planning/phases/182-skill-consolidation/182-CONTEXT.md -- Phase context

## Tasks

### 1. Delete autopilot.skill.ts

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 1 must be complete -- enforced by wave dependency)

Delete the file `src/skills/general/autopilot.skill.ts`. All its content has been absorbed into lu.skill.ts in Wave 1.

```bash
rm src/skills/general/autopilot.skill.ts
```

**Files to delete:**

- src/skills/general/autopilot.skill.ts

**Verification:**

- File no longer exists
- `ls src/skills/general/autopilot.skill.ts` returns "No such file"

### 2. Remove autopilot from skill registry

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `src/skills/__helpers/build-skill-registry.ts`:

a) Remove the import line:

```typescript
import { autopilotSkill } from "../general/autopilot.skill";
```

b) Remove the registry entry:

```typescript
autopilot: () => autopilotSkill,
```

**Files to edit:**

- src/skills/\_\_helpers/build-skill-registry.ts

**Verification:**

- No import of autopilotSkill exists in the file
- No "autopilot" key exists in the skillRegistry object
- `bunx --bun tsc --noEmit` passes

### 3. Remove autopilot from scaffolding.ts

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `src/skills/__helpers/scaffolding.ts`:

a) Remove `"autopilot"` from the `CORE_SKILL_NAMES` Set (line 59)

b) Update the JSDoc comment above the Set that lists core skills (line 51):

- Remove `- autopilot: Autonomous execution`
- The remaining core skills are: git-commit, phase-execute, phase-plan, progress, lu

**Files to edit:**

- src/skills/\_\_helpers/scaffolding.ts

**Verification:**

- "autopilot" does not appear anywhere in scaffolding.ts
- CORE_SKILL_NAMES contains exactly: git-commit, phase-execute, phase-plan, progress, lu
- `bunx --bun tsc --noEmit` passes

### 4. Update phase-discuss.skill.ts autopilot reference

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/skills/general/phase-discuss.skill.ts`, line 57 contains:

```
Auto mode is useful when running via `/autopilot` or when the user wants AI-researched decisions instead of manual discussion.
```

Change to:

```
Auto mode is useful when running via `/lu` in autonomous mode or when the user wants AI-researched decisions instead of manual discussion.
```

**Files to edit:**

- src/skills/general/phase-discuss.skill.ts

**Verification:**

- No "autopilot" references remain in phase-discuss.skill.ts
- The sentence reads naturally with the updated reference

### 5. Update lu-roadmap-architect.agent.ts docstring

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/agents/general/lu-roadmap-architect.agent.ts`, line 35 contains:

```
You are spawned by the autopilot skill's roadmap revision step as part of a specialist swarm.
```

Change to:

```
You are spawned by the lu skill's roadmap revision step as part of a specialist swarm.
```

**Files to edit:**

- src/agents/general/lu-roadmap-architect.agent.ts

**Verification:**

- No "autopilot" references remain in the file
- `bunx --bun tsc --noEmit` passes

### 6. Update lu-roadmap-prioritizer.agent.ts docstring

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/agents/general/lu-roadmap-prioritizer.agent.ts`, line 35 contains:

```
You are spawned by the autopilot skill's roadmap revision step as part of a specialist swarm.
```

Change to:

```
You are spawned by the lu skill's roadmap revision step as part of a specialist swarm.
```

**Files to edit:**

- src/agents/general/lu-roadmap-prioritizer.agent.ts

**Verification:**

- No "autopilot" references remain in the file
- `bunx --bun tsc --noEmit` passes

### 7. Update lu-roadmap-qa.agent.ts docstring

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/agents/general/lu-roadmap-qa.agent.ts`, line 35 contains:

```
You are spawned by the autopilot skill's roadmap revision step as part of a specialist swarm.
```

Change to:

```
You are spawned by the lu skill's roadmap revision step as part of a specialist swarm.
```

**Files to edit:**

- src/agents/general/lu-roadmap-qa.agent.ts

**Verification:**

- No "autopilot" references remain in the file
- `bunx --bun tsc --noEmit` passes

### 8. Update lu-roadmap-synthesizer.agent.ts docstrings (6 refs)

**Type:** auto
**TDD:** false
**Depends on:** none

In `src/agents/general/lu-roadmap-synthesizer.agent.ts`, update all 6 autopilot references:

1. Line 4 JSDoc: "for the autopilot orchestrator" -> "for the lu orchestrator"
2. Line 14 description: "format the autopilot orchestrator expects" -> "format the lu orchestrator expects"
3. Line 36 role content: "spawned by the autopilot skill's roadmap revision step" -> "spawned by the lu skill's roadmap revision step"
4. Line 57 read-only contract: "consumed by the autopilot orchestrator" -> "consumed by the lu orchestrator"
5. Line 149 output format: "format Step 2b expects" -- check if it mentions "autopilot" and update
6. Line 161 output format: "format the autopilot Step 2b expects" -> "format the lu Step 2b expects"

Replace all occurrences of "autopilot" in this file with the appropriate "lu" equivalent.

**Files to edit:**

- src/agents/general/lu-roadmap-synthesizer.agent.ts

**Verification:**

- Zero occurrences of "autopilot" remain in the file
- `bunx --bun tsc --noEmit` passes
- All docstrings read naturally with "lu" references

### 9. Verify lu-workflow.md rule has no autopilot references

**Type:** auto
**TDD:** false
**Depends on:** none

Check that `.claude/rules/lu-workflow.md` has no autopilot references. Based on pre-flight analysis, it is already clean. If any references exist, update them.

Also check the source rule file at `src/rules/` for any autopilot references and update if found.

**Files to verify:**

- .claude/rules/lu-workflow.md
- src/rules/ (any files with autopilot references)

**Verification:**

- `grep -r 'autopilot' .claude/rules/lu-workflow.md` returns no results
- `grep -r 'autopilot' src/rules/` returns no results

## Verification

After all tasks complete:

1. `bunx --bun tsc --noEmit` passes with zero errors
2. `src/skills/general/autopilot.skill.ts` does not exist
3. The skill registry has no autopilot entry
4. The scaffolding has no autopilot in CORE_SKILL_NAMES
5. All 4 roadmap agents reference "lu skill" not "autopilot skill"
6. phase-discuss references "/lu" not "/autopilot"

## Success Criteria

- autopilot.skill.ts is deleted
- All 8 remaining files with autopilot references are updated
- TypeScript compilation passes
- No import or runtime references to autopilot remain in the updated files

## Output Specification

- Deleted file: `src/skills/general/autopilot.skill.ts`
- Modified files:
  - `src/skills/__helpers/build-skill-registry.ts`
  - `src/skills/__helpers/scaffolding.ts`
  - `src/skills/general/phase-discuss.skill.ts`
  - `src/agents/general/lu-roadmap-architect.agent.ts`
  - `src/agents/general/lu-roadmap-prioritizer.agent.ts`
  - `src/agents/general/lu-roadmap-qa.agent.ts`
  - `src/agents/general/lu-roadmap-synthesizer.agent.ts`
