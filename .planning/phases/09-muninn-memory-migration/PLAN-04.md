---
phase: 09
plan: 04
type: improvement
autonomous: true
wave: 2
depends_on: ["PLAN-01", "PLAN-02"]
---

# Phase 09 Plan 04: Migrate Critical Skills to MuninnDB

## Objective

Update the 10 skill files that contain memory bridge CLI commands in their prompt text, replacing all `bun run src/memory/__helpers/bridge.ts <subcommand>` references with equivalent MuninnDB MCP tool calls. Also update 7 additional skill files with documentation-level memory references.

Like the agent migration (PLAN-03), these are prompt-level string replacements in TypeScript template literals. Skills contain embedded bash commands within their markdown instruction text.

## Context

@src/skills/luca/lu.skill.ts
@src/skills/general/phase-execute.skill.ts
@src/skills/general/phase-plan.skill.ts
@src/skills/general/autopilot.skill.ts
@src/skills/general/debug.skill.ts
@src/skills/general/session-plan.skill.ts
@src/skills/general/milestone-complete.skill.ts
@src/skills/general/quick.skill.ts
@src/skills/general/profile-import.skill.ts
@src/skills/general/profile-export.skill.ts
@.planning/phases/09-muninn-memory-migration/CONTEXT.md (integration patterns)
@.planning/phases/09-muninn-memory-migration/09-RESEARCH.md (line-level mapping)

## Tasks

### 1. Migrate phase-execute skill to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/skills/general/phase-execute.skill.ts` -- the most complex skill with 6 bridge commands across multiple locations.

**Replacements:**

| Old Pattern                                                                               | New Pattern                                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts read-working`                                     | `mcp__muninn__muninn_recall(vault: "default", context: "current session context and findings")`           |
| `bun run src/memory/__helpers/bridge.ts read-memory`                                      | `mcp__muninn__muninn_recall(vault: "default", context: "relevant patterns and past decisions")`           |
| `bun run src/memory/__helpers/bridge.ts append-working --section=<section> --content=...` | `mcp__muninn__muninn_remember(vault: "default", concept: "session:<section>", content: "...")`            |
| `bun run src/memory/__helpers/bridge.ts find-replayable --task=...`                       | `mcp__muninn__muninn_recall(vault: "default", context: "replayable procedures for <task>")`               |
| `bun run src/memory/__helpers/bridge.ts record-replay-outcome --id=... --success=...`     | `mcp__muninn__muninn_evolve(vault: "default", id: "procedure:<id>", content: "replay outcome: <result>")` |

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- Zero references to `bridge.ts` in file
- `bunx --bun tsc --noEmit` passes

### 2. Migrate phase-plan skill to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/skills/general/phase-plan.skill.ts` -- reads brain, procedures, and working memory during planning.

**Replacements:**

| Old Pattern                                              | New Pattern                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts read-brain`      | `mcp__muninn__muninn_recall_tree(vault: "default", id: "brain:project-identity")`            |
| `bun run src/memory/__helpers/bridge.ts read-procedures` | `mcp__muninn__muninn_recall(vault: "default", context: "reusable procedures and workflows")` |
| `bun run src/memory/__helpers/bridge.ts read-working`    | `mcp__muninn__muninn_recall(vault: "default", context: "current session context")`           |

**Files to create/edit:**

- `src/skills/general/phase-plan.skill.ts`

**Verification:**

- Zero references to `bridge.ts` in file
- `bunx --bun tsc --noEmit` passes

### 3. Migrate autopilot skill to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/skills/general/autopilot.skill.ts` -- uses read-memory, clear-working, and append-working.

**Replacements:**

| Old Pattern                                                                               | New Pattern                                                                                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts read-memory`                                      | `mcp__muninn__muninn_recall(vault: "default", context: "relevant patterns and decisions for current work")` |
| `bun run src/memory/__helpers/bridge.ts clear-working`                                    | `mcp__muninn__muninn_forget(vault: "default", id: "session:*")`                                             |
| `bun run src/memory/__helpers/bridge.ts append-working --section=<section> --content=...` | `mcp__muninn__muninn_remember(vault: "default", concept: "session:<section>", content: "...")`              |

**Files to create/edit:**

- `src/skills/general/autopilot.skill.ts`

**Verification:**

- Zero references to `bridge.ts` in file
- `bunx --bun tsc --noEmit` passes

### 4. Migrate lu skill to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/skills/luca/lu.skill.ts` -- the unified entry point with read-memory and clear-working.

**Replacements:**

| Old Pattern                                            | New Pattern                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts read-memory`   | `mcp__muninn__muninn_recall(vault: "default", context: "relevant patterns for routing")` |
| `bun run src/memory/__helpers/bridge.ts clear-working` | `mcp__muninn__muninn_forget(vault: "default", id: "session:*")`                          |

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts`

**Verification:**

- Zero references to `bridge.ts` in file
- `bunx --bun tsc --noEmit` passes

### 5. Migrate debug skill to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/skills/general/debug.skill.ts` -- reads memory and working during debugging.

**Replacements:**

| Old Pattern                                           | New Pattern                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts read-memory`  | `mcp__muninn__muninn_recall(vault: "default", context: "debugging patterns and past pitfalls")` |
| `bun run src/memory/__helpers/bridge.ts read-working` | `mcp__muninn__muninn_recall(vault: "default", context: "current session debugging context")`    |

**Files to create/edit:**

- `src/skills/general/debug.skill.ts`

**Verification:**

- Zero references to `bridge.ts` in file
- `bunx --bun tsc --noEmit` passes

### 6. Migrate remaining bridge-using skills to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update the remaining 5 skills with bridge CLI commands:

**session-plan.skill.ts:**

- `read-working` -> `muninn_recall` for session context
- `read-memory` -> `muninn_recall` for patterns

**milestone-complete.skill.ts:**

- `read-working` -> `muninn_recall` for session context
- `clear-working` -> `muninn_forget` for session cleanup

**quick.skill.ts:**

- `read-working` -> `muninn_recall` for session context

**profile-import.skill.ts:**

- `read-global-memory` -> `muninn_recall` for global patterns
- `read-memory` -> `muninn_recall` for project memory
- Update to use `mcp__muninn__muninn_remember_batch` for importing profiles

**profile-export.skill.ts:**

- `read-brain` -> `muninn_recall_tree` for brain data
- `read-memory` -> `muninn_recall` for memory data
- Update to use `mcp__muninn__muninn_export_graph` for exporting

**Files to create/edit:**

- `src/skills/general/session-plan.skill.ts`
- `src/skills/general/milestone-complete.skill.ts`
- `src/skills/general/quick.skill.ts`
- `src/skills/general/profile-import.skill.ts`
- `src/skills/general/profile-export.skill.ts`

**Verification:**

- Zero references to `bridge.ts` in all 5 files
- `bunx --bun tsc --noEmit` passes

### 7. Update skills with textual memory references

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5, 6

Update the 7 skills with documentation-level references to BRAIN.md/MEMORY.md/WORKING.md:

- `workflow-save.skill.ts` -- References BRAIN.md, MEMORY.md, WORKING.md in description text
- `project-new.skill.ts` -- Creates BRAIN.md, MEMORY.md, WORKING.md in setup instructions. **Critical:** Update project setup to reference `/seed-memory` skill instead of creating .md files
- `rule-lu-workflow.skill.ts` -- Memory system documentation in rule text
- `help.skill.ts` -- References memory files in directory listing
- `progress.skill.ts` -- May reference memory concepts
- `pr-address.skill.ts` -- Check and update if needed
- `workflow-start.skill.ts` -- Check and update if needed

The `project-new.skill.ts` change is particularly important: new projects should no longer create BRAIN.md/MEMORY.md/WORKING.md files but instead instruct users to run `/seed-memory` or directly use MuninnDB.

**Files to create/edit:**

- `src/skills/general/workflow-save.skill.ts`
- `src/skills/general/project-new.skill.ts`
- `src/skills/general/rule-lu-workflow.skill.ts`
- `src/skills/general/help.skill.ts`
- `src/skills/general/progress.skill.ts`
- `src/skills/general/pr-address.skill.ts` (if needed)
- `src/skills/general/workflow-start.skill.ts` (if needed)

**Verification:**

- `grep -rn "BRAIN.md\|MEMORY.md\|WORKING.md" src/skills/` returns zero matches for file-based operations (acceptable in historical documentation context)
- `bunx --bun tsc --noEmit` passes

## Verification

1. Zero references to `bridge.ts` in any skill file
2. Zero operational references to BRAIN.md/MEMORY.md/WORKING.md as files to read/write in skill prompts
3. All 10 bridge-using skills now reference MuninnDB MCP tools
4. project-new.skill.ts no longer creates .md memory files
5. `bunx --bun tsc --noEmit` passes
6. `bun run build:all` succeeds

## Success Criteria

- All 10 skills with bridge commands migrated to MuninnDB MCP references
- All 7 skills with textual references updated
- New project setup references MuninnDB + /seed-memory instead of .md file creation
- Profile import/export skills updated for MuninnDB graph operations

## Output Specification

**Files modified:**

- `src/skills/general/phase-execute.skill.ts`
- `src/skills/general/phase-plan.skill.ts`
- `src/skills/general/autopilot.skill.ts`
- `src/skills/luca/lu.skill.ts`
- `src/skills/general/debug.skill.ts`
- `src/skills/general/session-plan.skill.ts`
- `src/skills/general/milestone-complete.skill.ts`
- `src/skills/general/quick.skill.ts`
- `src/skills/general/profile-import.skill.ts`
- `src/skills/general/profile-export.skill.ts`
- `src/skills/general/workflow-save.skill.ts`
- `src/skills/general/project-new.skill.ts`
- `src/skills/general/rule-lu-workflow.skill.ts`
- `src/skills/general/help.skill.ts`
- `src/skills/general/progress.skill.ts`
- `src/skills/general/pr-address.skill.ts` (if applicable)
- `src/skills/general/workflow-start.skill.ts` (if applicable)
