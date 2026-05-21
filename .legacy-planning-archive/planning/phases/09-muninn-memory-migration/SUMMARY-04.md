# SUMMARY: Phase 09, Plan 04 -- Migrate Critical Skills to MuninnDB

## Objective

Update all skill files containing memory bridge CLI commands and BRAIN.md/MEMORY.md/WORKING.md file references, replacing them with MuninnDB MCP tool equivalents.

## Tasks Completed

### Task 1: Migrate phase-execute skill (229df0bd)

Replaced 6 bridge commands: read-working (x3), read-memory, append-working, find-replayable, record-replay-outcome. All converted to muninn_recall, muninn_remember, and muninn_evolve.

### Task 2: Migrate phase-plan skill (890cf6a1)

Replaced 3 bridge commands: read-brain -> muninn_recall_tree, read-procedures -> muninn_recall, read-working -> muninn_recall.

### Task 3: Migrate autopilot skill (e7b8593a)

Replaced 3 bridge commands in lu-cognition prompt: read-memory -> muninn_recall, clear-working -> muninn_forget, append-working (x2) -> muninn_remember.

### Task 4: Migrate lu skill (aa47ec3c)

Replaced 4 bridge commands in lu-cognition and lu-learner prompts: read-memory -> muninn_recall, clear-working (x2) -> muninn_forget, read-working -> muninn_recall.

### Task 5: Migrate debug skill (7d7e6763)

Replaced 2 bridge commands: read-memory -> muninn_recall (debugging patterns), read-working -> muninn_recall (session context).

### Task 6: Migrate remaining 5 skills (36ba178e)

- session-plan: read-working + read-memory -> muninn_recall
- milestone-complete: read-working -> muninn_recall, clear-working -> muninn_forget, MEMORY.md archival -> muninn_export_graph
- quick: read-working -> muninn_recall
- profile-import: read-global-memory + read-memory -> muninn_recall, write -> muninn_remember_batch
- profile-export: read-brain -> muninn_recall_tree, read-memory -> muninn_recall, export -> muninn_export_graph

### Task 7: Update textual memory references (e8941b39)

Updated 11 skill files replacing documentation-level references to BRAIN.md/MEMORY.md/WORKING.md with MuninnDB equivalents:

- phase-execute: context tiers, isolation modes, learner instructions
- phase-plan: memory recall, session initialization
- autopilot: working memory references, git add paths
- profile-export/import: anti-patterns, success criteria
- phase-discuss: BRAIN.md tech stack loading
- post-init-tour: merged BRAIN.md + MEMORY.md tour steps into single MuninnDB step
- workflow-save: data sources, edge cases
- project-new: cognitive initialization -> /seed-memory skill
- rule-lu-workflow: memory system docs, cognitive pre-flight
- help: directory listing

## Verification

- `grep -rn "src/memory/__helpers/bridge.ts" src/skills/` -- 0 matches
- `grep -rn "BRAIN.md\|MEMORY.md\|WORKING.md" src/skills/` -- 1 file (seed-memory.skill.ts, the migration tool -- expected)
- `bunx --bun tsc --noEmit` -- passes clean

## Deviations

- [Rule 2 - Missing Critical] Updated phase-discuss.skill.ts and post-init-tour.skill.ts which were not listed in the plan but contained BRAIN.md/MEMORY.md references that needed migration for consistency
- [Rule 1 - Bug] Fixed autopilot git add path that referenced .planning/WORKING.md (file no longer exists)

## Files Modified

- src/skills/general/phase-execute.skill.ts
- src/skills/general/phase-plan.skill.ts
- src/skills/general/autopilot.skill.ts
- src/skills/luca/lu.skill.ts
- src/skills/general/debug.skill.ts
- src/skills/general/session-plan.skill.ts
- src/skills/general/milestone-complete.skill.ts
- src/skills/general/quick.skill.ts
- src/skills/general/profile-import.skill.ts
- src/skills/general/profile-export.skill.ts
- src/skills/general/workflow-save.skill.ts
- src/skills/general/project-new.skill.ts
- src/skills/general/rule-lu-workflow.skill.ts
- src/skills/general/help.skill.ts
- src/skills/general/phase-discuss.skill.ts
- src/skills/general/post-init-tour.skill.ts

## Commits

| #   | Hash     | Description                 |
| --- | -------- | --------------------------- |
| 1   | 229df0bd | migrate phase-execute skill |
| 2   | 890cf6a1 | migrate phase-plan skill    |
| 3   | e7b8593a | migrate autopilot skill     |
| 4   | aa47ec3c | migrate lu skill            |
| 5   | 7d7e6763 | migrate debug skill         |
| 6   | 36ba178e | migrate remaining 5 skills  |
| 7   | e8941b39 | update textual references   |
