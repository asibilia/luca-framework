---
phase: 09
plan: 03
type: improvement
autonomous: true
wave: 2
depends_on: ["PLAN-01"]
---

# Phase 09 Plan 03: Migrate Critical Agents to MuninnDB

## Objective

Update the 4 critical agent files that contain memory bridge CLI commands in their prompt text, replacing all `bun run src/memory/__helpers/bridge.ts <subcommand>` references with equivalent MuninnDB MCP tool calls. Also update the `memory_tags` JSDoc in the agent schema to reflect the new MuninnDB semantics.

These are prompt-level string replacements in TypeScript template literals, not import refactors. The bridge CLI commands are embedded bash strings within agent markdown content.

## Context

@src/agents/general/lu-cognition.agent.ts
@src/agents/general/lu-learner.agent.ts
@src/agents/luca/lu-executor.agent.ts
@src/agents/general/lu-discuss-researcher.agent.ts
@src/agents/\_\_schemas/agent.schemas.ts
@.planning/phases/09-muninn-memory-migration/CONTEXT.md (integration patterns)
@.planning/phases/09-muninn-memory-migration/09-RESEARCH.md (line-level mapping)

## Tasks

### 1. Migrate lu-cognition agent to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/agents/general/lu-cognition.agent.ts` prompt content. This is the most critical agent -- it performs cognitive pre-flight for all major operations.

**Replacements (in prompt markdown text, not TypeScript imports):**

| Old Pattern (bridge CLI in prompt text)                            | New Pattern (MuninnDB MCP in prompt text)                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts read-brain`                | `mcp__muninn__muninn_recall_tree(vault: "default", id: "brain:project-identity")`                  |
| `bun run src/memory/__helpers/bridge.ts read-memory --tags=<tags>` | `mcp__muninn__muninn_recall(vault: "default", context: "<relevant context from tags>")`            |
| `bun run src/memory/__helpers/bridge.ts read-global-memory`        | `mcp__muninn__muninn_recall(vault: "default", context: "global project patterns and preferences")` |
| References to "BRAIN.md" as data source                            | "MuninnDB brain tree" or "project identity from MuninnDB"                                          |
| References to "MEMORY.md" as data source                           | "MuninnDB engrams" or "recalled patterns from MuninnDB"                                            |
| References to "WORKING.md" initialization                          | "MuninnDB session context" using `mcp__muninn__muninn_session`                                     |

Also update the agent description from "Loads BRAIN.md, recalls from MEMORY.md, initializes WORKING.md" to reference MuninnDB equivalents.

**Files to create/edit:**

- `src/agents/general/lu-cognition.agent.ts`

**Verification:**

- No references to `bridge.ts`, `BRAIN.md`, `MEMORY.md`, or `WORKING.md` as file operations remain
- All memory operations reference MuninnDB MCP tools
- `bunx --bun tsc --noEmit` passes

### 2. Migrate lu-learner agent to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/agents/general/lu-learner.agent.ts` prompt content. This agent captures learnings from sessions.

**Replacements:**

| Old Pattern                                                                           | New Pattern                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts read-working`                                 | `mcp__muninn__muninn_recall(vault: "default", context: "current session findings and context")`                  |
| `bun run src/memory/__helpers/bridge.ts read-memory`                                  | `mcp__muninn__muninn_recall(vault: "default", context: "existing patterns and decisions")`                       |
| `bun run src/memory/__helpers/bridge.ts add-memory-entry --type=<type> --content=...` | `mcp__muninn__muninn_remember(vault: "default", concept: "<type>:<name>", content: "...")`                       |
| `bun run src/memory/__helpers/bridge.ts clear-working`                                | `mcp__muninn__muninn_forget(vault: "default", id: "session:*")` -- or note that session engrams expire naturally |

Update all textual references from file-based memory terminology to MuninnDB terminology.

**Files to create/edit:**

- `src/agents/general/lu-learner.agent.ts`

**Verification:**

- No references to `bridge.ts` remain in prompt text
- Learning capture uses `mcp__muninn__muninn_remember`
- `bunx --bun tsc --noEmit` passes

### 3. Migrate lu-executor agent to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/agents/luca/lu-executor.agent.ts` prompt content. This agent records session context during execution.

**Replacements:**

| Old Pattern                                                                               | New Pattern                                                                                    |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts append-working --section=<section> --content=...` | `mcp__muninn__muninn_remember(vault: "default", concept: "session:<section>", content: "...")` |
| References to "WORKING.md"                                                                | "MuninnDB session context"                                                                     |

All `append-working` calls become `muninn_remember` calls with `session:` prefixed concepts.

**Files to create/edit:**

- `src/agents/luca/lu-executor.agent.ts`

**Verification:**

- No references to `bridge.ts` or `append-working` remain
- Session context uses `mcp__muninn__muninn_remember` with `session:` prefix
- `bunx --bun tsc --noEmit` passes

### 4. Migrate lu-discuss-researcher agent to MuninnDB

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/agents/general/lu-discuss-researcher.agent.ts` prompt content. This agent reads brain data for discussion context.

**Replacements:**

| Old Pattern                                         | New Pattern                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `bun run src/memory/__helpers/bridge.ts read-brain` | `mcp__muninn__muninn_recall_tree(vault: "default", id: "brain:project-identity")` |

**Files to create/edit:**

- `src/agents/general/lu-discuss-researcher.agent.ts`

**Verification:**

- No references to `bridge.ts` or `read-brain` remain
- Brain access uses `mcp__muninn__muninn_recall_tree`
- `bunx --bun tsc --noEmit` passes

### 5. Update memory_tags JSDoc in agent schema

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/agents/__schemas/agent.schemas.ts` line 33-34 JSDoc for the `memory_tags` field.

**Change:**

- Old: "Domain tags for selective MEMORY.md recall filtering"
- New: "Domain tags for selective MuninnDB recall context. Used by lu-cognition to scope semantic recall queries."

The field itself (`memory_tags: z.array(z.string())`) remains unchanged -- only the documentation.

**Files to create/edit:**

- `src/agents/__schemas/agent.schemas.ts`

**Verification:**

- JSDoc references MuninnDB, not MEMORY.md
- Schema structure unchanged
- `bunx --bun tsc --noEmit` passes

### 6. Update remaining agents with textual memory references

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4

Scan all remaining agent files for textual references to "BRAIN.md", "MEMORY.md", "WORKING.md" in their description or prompt text. Update these documentation-level references to reflect MuninnDB. Key files from research:

- `src/agents/general/lu-verifier.agent.ts` -- "Selective MEMORY.md entries (at T2+)" text
- `src/agents/luca/lu-planner.agent.ts` -- memory concept references
- `src/agents/general/lu-pm-planner.agent.ts` -- memory concept references
- Other agents with scattered textual references

Use grep to find all remaining `.md` file references and update them.

**Files to create/edit:**

- Multiple agent files (grep-driven, ~5-10 files)

**Verification:**

- `grep -rn "BRAIN.md\|MEMORY.md\|WORKING.md" src/agents/` returns zero matches (or only appropriate references to MuninnDB documentation)
- `bunx --bun tsc --noEmit` passes

## Verification

1. Zero references to `bridge.ts` in any agent file prompt text
2. Zero references to `BRAIN.md`, `MEMORY.md`, `WORKING.md` as operational data sources in agent prompts
3. All 4 critical agents use MuninnDB MCP tool names in their instructions
4. `memory_tags` JSDoc updated to reference MuninnDB
5. `bunx --bun tsc --noEmit` passes
6. `bun run build:all` succeeds

## Success Criteria

- lu-cognition pre-flight instructions reference MuninnDB recall/recall_tree instead of bridge CLI
- lu-learner capture instructions use MuninnDB remember instead of bridge add-memory-entry
- lu-executor session tracking uses MuninnDB session engrams instead of bridge append-working
- lu-discuss-researcher brain access uses MuninnDB recall_tree instead of bridge read-brain
- All agent documentation reflects MuninnDB as the memory backend

## Output Specification

**Files modified:**

- `src/agents/general/lu-cognition.agent.ts`
- `src/agents/general/lu-learner.agent.ts`
- `src/agents/luca/lu-executor.agent.ts`
- `src/agents/general/lu-discuss-researcher.agent.ts`
- `src/agents/__schemas/agent.schemas.ts`
- `src/agents/general/lu-verifier.agent.ts`
- `src/agents/luca/lu-planner.agent.ts`
- `src/agents/general/lu-pm-planner.agent.ts`
- Additional agent files found via grep (~5-10)
