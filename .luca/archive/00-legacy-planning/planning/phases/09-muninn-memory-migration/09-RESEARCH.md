# Phase 9: MuninnDB Memory Migration - Research

**Researched:** 2026-03-07
**Domain:** Memory system migration (file-based to MuninnDB MCP)
**Confidence:** HIGH

## Summary

This research catalogs the complete blast radius of replacing the `src/memory/` domain with MuninnDB MCP calls. The migration affects **25 source files to delete**, **36+ agent files**, **17 skill files**, **4 hook scripts**, **1 Pi extension**, **3 rule files**, **2 build scripts**, **5+ state machine files**, and **2 context domain files** that reference memory concepts.

The dominant integration pattern is shell commands invoking `bun run src/memory/__helpers/bridge.ts <subcommand>` from within agent/skill markdown prompt text. These are string literals embedded in TypeScript template strings, not TypeScript imports. Only 1 file (`src/rules/general/module-boundary.rule.ts`) has an actual TypeScript import from `~/memory` (as an example code snippet, not a real import). The `src/memory/index.ts` barrel exports ~60 symbols that will be removed.

**Primary recommendation:** Delete `src/memory/` entirely. Update all consumer files to replace memory bridge CLI commands with MuninnDB MCP tool references. Update context schemas, rules, hooks, state machine, and build scripts to remove memory domain references.

## Files to DELETE (25 files in src/memory/)

### src/memory/\_\_schemas/ (1 file)

| File                | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory.schemas.ts` | All Zod schemas: brainSchema, memoryEntrySchema, compressionStrategySchema, compressionRecommendationSchema, tokenEstimateSchema, phaseQualityMetricsSchema, qualityTrendSchema, workingMemorySectionSchema, workingMemorySchema, contextUsageResultSchema, compressionTriggerSchema, procedureStepSchema, procedureEntrySchema, replayThresholdSchema, prePlanSchema, replayResultSchema, retentionPolicySchema, pruningConfigSchema, pruningEventSchema, pruningResultSchema, sectionScoreSchema, compactionConfigSchema, compactionResultSchema, and their type exports |

### src/memory/\_\_helpers/ (23 files)

| File                     | Purpose                          | Exports                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto-compaction.ts`     | Working memory auto-compaction   | shouldTriggerCompaction, scoreSections, compactSection, compactWorkingMemory                                                                                                                                                                        |
| `brain-parser.ts`        | Parse BRAIN.md to JSON           | parseBrainFile                                                                                                                                                                                                                                      |
| `brain-serializer.ts`    | Serialize brain JSON to BRAIN.md | serializeBrain                                                                                                                                                                                                                                      |
| `bridge.ts`              | Memory bridge CLI (11 commands)  | handleReadMemory, handleReadWorking, handleReadProcedures, handleCheckContext, handleCheckCompression, handleAppendWorking, handleClearWorking, handleUpdateProcedureStats, handleReadGlobalMemory, handleFindReplayable, handleRecordReplayOutcome |
| `cognitive-profile.ts`   | Cognitive profile import/export  | CognitiveProfileSchema, ImportResultSchema, ExportOptionsSchema, MergeResultSchema, exportCognitiveProfile, importCognitiveProfile, exportToGlobalMemory, loadGlobalMemory, mergeGlobalEntries                                                      |
| `compression.ts`         | Memory compression analysis      | analyzeMemoryEntries                                                                                                                                                                                                                                |
| `context-monitor.ts`     | Context usage monitoring         | createContextMonitor, getCurrentZone                                                                                                                                                                                                                |
| `context-pruning.ts`     | Context pruning logic            | digestStaleEnvelopes, applySectionRetention, preserveCriticalContext, logPruningEvents, pruneWorkingMemory                                                                                                                                          |
| `json-persistence.ts`    | JSON file read/write helpers     | readJsonFile, writeJsonFile                                                                                                                                                                                                                         |
| `memory-parser.ts`       | Parse MEMORY.md to entries       | parseMemoryFile                                                                                                                                                                                                                                     |
| `memory-serializer.ts`   | Serialize entries to MEMORY.md   | serializeMemoryEntries                                                                                                                                                                                                                              |
| `meta-cognition.ts`      | Meta-cognitive reflection        | ReflectionSchema, QualityAssessmentSchema, PastOutcomeSchema, assessPlanQuality, generateReflection                                                                                                                                                 |
| `milestone-recall.ts`    | Milestone-scored recall          | scoreMilestoneRecall, parseVersion, versionDistance, calculateMilestoneProximity, calculateTagOverlap                                                                                                                                               |
| `procedure-lifecycle.ts` | Procedure lifecycle management   | evaluateRetirement, applyRetirement, updateExecutionStats, recordReplayOutcome, shouldAutoRetireAfterReplay                                                                                                                                         |
| `procedure-parser.ts`    | Parse PROCEDURES.md              | parseProcedureFile, parseProcedureContent, serializeProcedures, generateProcedureId                                                                                                                                                                 |
| `procedure-recall.ts`    | Procedure recall with scoring    | recallProcedures                                                                                                                                                                                                                                    |
| `procedure-replay.ts`    | Procedure replay engine          | findReplayableProcedures, adaptProcedureToContext, replayProcedure, convertToPrePlan, selectReplayableProcedures, ProcedureReplayContextSchema, ProcedureReplayResultSchema                                                                         |
| `quality-scorer.ts`      | Phase quality scoring            | calculatePhaseQuality, scoreToZone                                                                                                                                                                                                                  |
| `quality-trend.ts`       | Quality trend tracking           | createQualityTrend, addPhaseMetrics, computeRollingAverage, detectRegression, serializeTrend, deserializeTrend                                                                                                                                      |
| `semantic-search.ts`     | TF-IDF semantic search           | tokenize, computeTfIdf, cosineSimilarity, semanticRecall                                                                                                                                                                                            |
| `suspend-checkpoint.ts`  | Suspend/resume checkpoint        | saveSuspendCheckpoint, loadSuspendCheckpoint                                                                                                                                                                                                        |
| `token-estimator.ts`     | Token estimation                 | estimateTokens, estimateTokensHeuristic, estimateFileTokens, estimateMemoryBudget, getEstimationMethod                                                                                                                                              |
| `working-memory.ts`      | Working memory management        | parseWorkingMemory, serializeWorkingMemory, addSection, summarizeSection, shouldAutoSummarize                                                                                                                                                       |

### src/memory/ root (1 file)

| File       | Purpose                               |
| ---------- | ------------------------------------- |
| `index.ts` | Barrel with ~60 exports (all removed) |

## Files to MODIFY - Agents (key files with memory bridge references)

These agent files contain memory bridge CLI commands and/or BRAIN.md/MEMORY.md/WORKING.md references in their prompt markdown. The references are **string literals in template strings**, not TypeScript imports.

### Critical Agents (deep memory integration)

| File                                                | Lines                            | What to Change                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/general/lu-cognition.agent.ts`          | 154, 157, 257-307, 376, 539      | Replace `bun run src/memory/__helpers/bridge.ts read-brain` with `mcp__muninn__muninn_recall_tree` call. Replace `read-memory` with `mcp__muninn__muninn_recall`. Replace `read-global-memory` with muninn recall. Update all memory_tags filtering instructions |
| `src/agents/general/lu-learner.agent.ts`            | 262-291, 435-454                 | Replace `read-working` with `mcp__muninn__muninn_recall`. Replace `read-memory` with `mcp__muninn__muninn_recall`. Replace `add-memory-entry` with `mcp__muninn__muninn_remember`. Replace `clear-working` with `mcp__muninn__muninn_forget` (session-scoped)    |
| `src/agents/luca/lu-executor.agent.ts`              | 104-105, 415, 471, 484, 505, 547 | Replace all `append-working` bridge calls with `mcp__muninn__muninn_remember` (session-scoped engrams)                                                                                                                                                           |
| `src/agents/general/lu-discuss-researcher.agent.ts` | 85, 88                           | Replace `read-brain` bridge call with `mcp__muninn__muninn_recall_tree` for brain data                                                                                                                                                                           |

### Agents with `memory_tags` field (field remains but semantics change)

All 36 agent files have `memory_tags` in their cognition config. This field is used by lu-cognition for recall filtering. The field itself can remain, but the JSDoc comment on `agent.schemas.ts:33-34` needs updating from "MEMORY.md recall filtering" to "MuninnDB recall context".

| File                                          | Current memory_tags Value                           |
| --------------------------------------------- | --------------------------------------------------- |
| `lu-cognition.agent.ts`                       | `["*"]`                                             |
| `lu-learner.agent.ts`                         | `["patterns", "decisions", "pitfalls"]`             |
| `lu-executor.agent.ts`                        | `["coding", "patterns", "pitfalls", "conventions"]` |
| `lu-planner.agent.ts`                         | `["architecture", "planning", "decisions"]`         |
| `lu-debugger.agent.ts`                        | `["debugging", "pitfalls", "testing"]`              |
| `lu-verifier.agent.ts`                        | `["verification", "pitfalls", "testing"]`           |
| (+ 30 more with various tags or empty arrays) | See grep output                                     |

### Agents with textual MEMORY.md/WORKING.md references (documentation only)

| File                                        | Lines       | Nature of Reference                                   |
| ------------------------------------------- | ----------- | ----------------------------------------------------- |
| `src/agents/general/lu-verifier.agent.ts`   | 63          | "Selective MEMORY.md entries (at T2+)"                |
| `src/agents/luca/lu-planner.agent.ts`       | (scattered) | References to memory concepts                         |
| `src/agents/general/lu-pm-planner.agent.ts` | (scattered) | References to memory concepts                         |
| (+ ~20 more from the 36 matched files)      |             | Textual references to "memory", "working memory" etc. |

## Files to MODIFY - Skills (17 files with memory references)

### Skills with memory bridge CLI commands (CRITICAL - must update)

| File                                             | Lines                                        | Bridge Commands Used                                                                        |
| ------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/skills/luca/lu.skill.ts`                    | 92, 185                                      | `read-memory`, `clear-working`                                                              |
| `src/skills/general/phase-execute.skill.ts`      | 101-106, 175-176, 283, 347-348, 908, 934-935 | `read-working`, `read-memory`, `append-working`, `find-replayable`, `record-replay-outcome` |
| `src/skills/general/phase-plan.skill.ts`         | 58, 75-76, 331-332                           | `read-brain`, `read-procedures`, `read-working`                                             |
| `src/skills/general/autopilot.skill.ts`          | 129, 798, 1324                               | `read-memory`, `clear-working`, `append-working`                                            |
| `src/skills/general/debug.skill.ts`              | 107-112                                      | `read-memory`, `read-working`                                                               |
| `src/skills/general/session-plan.skill.ts`       | 30-31, 58                                    | `read-working`, `read-memory`                                                               |
| `src/skills/general/milestone-complete.skill.ts` | 47-48, 78-79                                 | `read-working`, `clear-working`                                                             |
| `src/skills/general/quick.skill.ts`              | 174-175                                      | `read-working`                                                                              |
| `src/skills/general/profile-import.skill.ts`     | 34, 50                                       | `read-global-memory`, `read-memory`                                                         |
| `src/skills/general/profile-export.skill.ts`     | 34-35                                        | `read-brain`, `read-memory`                                                                 |

### Skills with textual memory references (documentation/description only)

| File                                           | Nature                                                         |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `src/skills/general/workflow-save.skill.ts`    | References BRAIN.md, MEMORY.md, WORKING.md in description text |
| `src/skills/general/project-new.skill.ts`      | Creates BRAIN.md, MEMORY.md, WORKING.md in setup instructions  |
| `src/skills/general/rule-lu-workflow.skill.ts` | Memory system documentation in rule text                       |
| `src/skills/general/help.skill.ts`             | References memory files in directory listing                   |
| `src/skills/general/progress.skill.ts`         | May reference memory concepts                                  |
| `src/skills/general/pr-address.skill.ts`       | Matched but no direct bridge references                        |
| `src/skills/general/workflow-start.skill.ts`   | Matched but no direct bridge references                        |

## Files to MODIFY - Hooks & Scripts

| File                                     | Lines                 | What to Change                                                                                                                                                                                             |
| ---------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/scripts/session-start.sh`     | 49-54, 91-94, 289-404 | Remove `run_memory_bridge()` function. Remove Step 6b (`run_memory_bridge ensure-init`). Remove BRAIN.md auto-detection (Step 6) or convert to MuninnDB seeding. Remove comments referencing memory bridge |
| `src/hooks/scripts/session-persist.sh`   | 22, 63, 87-120        | Remove WORKING.md existence checks and session-end footer appending. Session end should use `mcp__muninn__muninn_remember` or no-op                                                                        |
| `src/hooks/scripts/context-monitor.sh`   | 32-35, 209-222        | Remove WORKING.md size checks for context monitoring. Remove `append-working` bridge call at line 218. Memory bridge reference removed                                                                     |
| `src/hooks/pi-extensions/luca-memory.ts` | ENTIRE FILE           | Delete or completely rewrite. Currently provides Pi tools for reading BRAIN.md, MEMORY.md, WORKING.md, appending to WORKING.md. Must be replaced with MuninnDB MCP calls or removed entirely               |

## Files to MODIFY - Context Domain

| File                                       | Lines                         | What to Change                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/context/__schemas/context.schemas.ts` | 6, 108-119                    | Update comments from "BRAIN.md summary" to "Brain identity from MuninnDB". Update field comments for `memory_entries`, `working_content`, `brain_summary`, `brain_full`, `memory_full`. The schema fields themselves may remain (they describe context document slots) but their documentation changes |
| `src/context/__helpers/defaults.ts`        | 25-27, 36, 43, 60, 75, 78, 85 | Update comments referencing MEMORY.md/BRAIN.md. The tier-to-document mapping may change if memory data now comes from MuninnDB rather than files                                                                                                                                                       |

## Files to MODIFY - Agent Schemas

| File                                    | Lines | What to Change                                                                                                              |
| --------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/__schemas/agent.schemas.ts` | 33-34 | Update JSDoc: "Domain tags for selective MEMORY.md recall filtering" -> "Domain tags for selective MuninnDB recall context" |

## Files to MODIFY - Planner Domain

| File                                       | Lines             | What to Change                                                                                                                                              |
| ------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/planner/__schemas/planner.schemas.ts` | 163               | Update comment: "calibration over time via MEMORY.md entries" -> "calibration over time via MuninnDB entries"                                               |
| `src/planner/__helpers/cost-model.ts`      | 14, 170, 181, 188 | Update JSDoc: "formatCostTableForMemory" may be renamed or kept as-is. The function renders markdown for memory storage — still useful for MuninnDB engrams |
| `src/planner/__helpers/defaults.ts`        | 89                | Update comment: "calibrated over time via MEMORY.md entries"                                                                                                |
| `src/planner/index.ts`                     | 98                | Barrel exports `formatCostTableForMemory` — name update if needed                                                                                           |

## Files to MODIFY - Compiler Domain

| File                                 | Lines | What to Change                                                                                                                      |
| ------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/compilers/__helpers/compile.ts` | 69    | Uses `cognition.memory_tags` in frontmatter output. The field still exists, just the semantics change. May need comment update only |

## Files to MODIFY - Rules

| File                                            | Lines                 | What to Change                                                                                                         |
| ----------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/rules/general/module-boundary.rule.ts`     | 22, 38-39             | Remove `memory` from T1 Core tier list. Remove the example `import { compress } from "~/memory"`. Update tier map      |
| `src/rules/general/domain-architecture.rule.ts` | 49, 93                | Remove memory from Core Domains table and T1 tier list                                                                 |
| `src/rules/general/lu-workflow.rule.ts`         | 2, 11, 20, 28, 70-110 | Update memory system documentation from BRAIN.md/MEMORY.md/WORKING.md to MuninnDB. Update cognitive pre-flight section |

## Files to MODIFY - Build Scripts

| File                                 | Lines | What to Change                                                                                          |
| ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------- |
| `scripts/check-domain-boundaries.ts` | 31    | Remove `memory: 1` from tier map                                                                        |
| `scripts/build-shared.ts`            | 52    | Remove `"luca-memory.ts"` from PI_EXTENSION_FILES list (or keep if extension is rewritten for MuninnDB) |

## Files to MODIFY - State Machine

| File                                                      | Lines                   | What to Change                                                                                                                  |
| --------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/luca-framework/src/state/machine.ts`            | 10                      | Update comment: "BRAIN.md, MEMORY.md recall" -> "MuninnDB recall"                                                               |
| `packages/luca-framework/src/state/bridge.ts`             | 484, 962-978, 1128-1129 | `memory_tags` in allowlist (keep). WORKING.md snapshot for suspend/resume (line 962-978) — convert to MuninnDB session snapshot |
| `packages/luca-framework/src/state/snapshot.ts`           | 337-338                 | `memory_tags` rendering in STATE.md snapshot (keep, but update comment)                                                         |
| `packages/luca-framework/src/state/types.ts`              | 140, 177, 179           | `memory_tags` field definition (keep). Update comment                                                                           |
| `packages/luca-framework/src/state/suspend-checkpoint.ts` | 24, 33-34               | `working_memory_snapshot` field — convert from WORKING.md content to MuninnDB session snapshot                                  |

## Files to MODIFY - Shared Domain

| File                                | Lines | What to Change                                    |
| ----------------------------------- | ----- | ------------------------------------------------- |
| `src/shared/__helpers/cli-utils.ts` | 5     | Remove reference to `memory/bridge.ts` in comment |

## Files to MODIFY - Pi Extensions

| File                                                  | Lines                        | What to Change                                                                                                                    |
| ----------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/pi-extensions/__helpers/session-init.ts`   | 35, 47, 89, 277-278, 663-664 | Remove memory file creation from `ensurePlanningDir()`. Remove `memory_recall: true`, `working_memory: true` from session context |
| `src/hooks/pi-extensions/luca-state.ts`               | 36, 232-267                  | Remove MEMORY.md existence check. Remove memory segment from status bar display                                                   |
| `src/hooks/pi-extensions/__helpers/luca-constants.ts` | 59                           | `memory_tags` in allowed fields list (keep)                                                                                       |
| `src/hooks/pi-extensions/luca-commands.ts`            | 10, 91                       | Update status command description: remove "memory indicators"                                                                     |

## Files to MODIFY - Documentation

| File                                 | What to Change                                                     |
| ------------------------------------ | ------------------------------------------------------------------ |
| `docs/generation-system.md`          | Update directory listing to remove BRAIN.md, MEMORY.md, WORKING.md |
| `docs/getting-started.md`            | Update memory system references                                    |
| `docs/architecture-overview.md`      | Update memory architecture description                             |
| `docs/diagrams/cognition-flow.md`    | Update cognition flow from file-based to MuninnDB                  |
| `docs/diagrams/workflow-overview.md` | Update workflow diagram                                            |
| (+ 12 more docs files)               | Various textual references                                         |

## Files to CREATE

| File                                      | Purpose                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/skills/general/seed-memory.skill.ts` | New skill: `/seed-memory` reads existing .md files and creates MuninnDB entities. Idempotent. Reusable across projects |

## Exports to REMOVE (from src/memory/index.ts barrel)

Total: **~60 named exports** across these categories:

### Schemas (12)

brainSchema, memoryEntrySchema, compressionStrategySchema, compressionRecommendationSchema, tokenEstimateSchema, phaseQualityMetricsSchema, qualityTrendSchema, workingMemorySectionSchema, workingMemorySchema, workingMemorySectionNameSchema, contextUsageResultSchema, compressionTriggerSchema

### Types (12 matching)

Brain, MemoryEntry, CompressionStrategy, CompressionRecommendation, TokenEstimate, PhaseQualityMetrics, QualityTrend, WorkingMemorySection, WorkingMemory, ContextUsageResult, CompressionTrigger

### Constants (2)

COMPRESSION_STRATEGIES, WORKING_MEMORY_SECTIONS

### Functions - Token Estimation (5)

estimateTokens, estimateTokensHeuristic, estimateFileTokens, estimateMemoryBudget, getEstimationMethod

### Functions - Compression (1)

analyzeMemoryEntries

### Functions - Quality (8)

calculatePhaseQuality, scoreToZone, createQualityTrend, addPhaseMetrics, computeRollingAverage, detectRegression, serializeTrend, deserializeTrend

### Functions - Working Memory (5)

parseWorkingMemory, serializeWorkingMemory, addSection, summarizeSection, shouldAutoSummarize

### Functions - Context (2)

createContextMonitor, getCurrentZone

### Functions - Memory Parsing (1)

parseMemoryFile

### Procedure Schemas + Types (4+2)

procedureStepSchema, procedureEntrySchema, ProcedureStep, ProcedureEntry
replayThresholdSchema, prePlanSchema, replayResultSchema + types

### Functions - Procedures (12)

parseProcedureFile, parseProcedureContent, serializeProcedures, generateProcedureId, recallProcedures, findReplayableProcedures, adaptProcedureToContext, replayProcedure, convertToPrePlan, selectReplayableProcedures + schemas

### Functions - Procedure Lifecycle (5)

evaluateRetirement, applyRetirement, updateExecutionStats, recordReplayOutcome, shouldAutoRetireAfterReplay

### Functions - Milestone Recall (5+2 types)

scoreMilestoneRecall, parseVersion, versionDistance, calculateMilestoneProximity, calculateTagOverlap + types

### Functions - Pruning & Compaction (9+7 schemas/types)

digestStaleEnvelopes, applySectionRetention, preserveCriticalContext, logPruningEvents, pruneWorkingMemory, shouldTriggerCompaction, scoreSections, compactSection, compactWorkingMemory + schemas

### Functions - Semantic Search (4+1 type)

tokenize, computeTfIdf, cosineSimilarity, semanticRecall + SemanticRecallResult

### Functions - Bridge (11)

handleReadMemory, handleReadWorking, handleReadProcedures, handleCheckContext, handleCheckCompression, handleAppendWorking, handleClearWorking, handleUpdateProcedureStats, handleReadGlobalMemory, handleFindReplayable, handleRecordReplayOutcome

### Functions - Cognitive Profile (9+4 types)

CognitiveProfileSchema, ImportResultSchema, ExportOptionsSchema, MergeResultSchema, exportCognitiveProfile, importCognitiveProfile, exportToGlobalMemory, loadGlobalMemory, mergeGlobalEntries + types

### Functions - Meta-Cognition (5+3 types)

ReflectionSchema, QualityAssessmentSchema, PastOutcomeSchema, assessPlanQuality, generateReflection + types

## Cross-Domain Dependency Analysis

### Tier Violations

The only TypeScript `import` from `~/memory` outside the memory domain is in `src/rules/general/module-boundary.rule.ts` line 39 — but this is an **example code snippet** within rule text, not an actual import. There are **no actual cross-domain TypeScript imports from memory** in any other domain.

### How Memory Is Actually Consumed

Memory is consumed via two mechanisms:

1. **Shell CLI commands** (in agent/skill prompt markdown): `bun run src/memory/__helpers/bridge.ts <subcommand>`
2. **File I/O** (in hook shell scripts): Direct reads/writes of `.planning/BRAIN.md`, `.planning/MEMORY.md`, `.planning/WORKING.md`, `.planning/*.json`

Neither mechanism creates a TypeScript import dependency. This means:

- **No compilation errors** will occur when `src/memory/` is deleted (the barrel exports are unused by other domains)
- **Runtime breakage** will occur in shell scripts and agent prompts that reference the bridge.ts path
- The migration is primarily a **string replacement** exercise in agent/skill markdown content

### State Machine Bridge References

The state machine bridge (`packages/luca-framework/src/state/bridge.ts`) has:

- `memory_tags` in its context field allowlist (keep)
- WORKING.md snapshot for suspend/resume checkpoints (must convert to MuninnDB)
- `working_memory_snapshot` field in suspend checkpoint schema (must update)

## Architecture Patterns

### MuninnDB Integration Pattern (from CONTEXT.md decisions)

```
# Old pattern (bridge CLI):
bun run src/memory/__helpers/bridge.ts read-brain 2>/dev/null

# New pattern (MuninnDB MCP):
mcp__muninn__muninn_recall_tree(vault: "default", id: "brain:project-identity")

# Old pattern (read-memory with tags):
bun run src/memory/__helpers/bridge.ts read-memory --tags=coding,patterns --limit=10

# New pattern (MuninnDB semantic recall):
mcp__muninn__muninn_recall(vault: "default", context: "coding patterns for current task")

# Old pattern (append-working):
bun run src/memory/__helpers/bridge.ts append-working --section=findings --content="..."

# New pattern (session-scoped engram):
mcp__muninn__muninn_remember(vault: "default", concept: "session:finding", content: "...")

# Old pattern (clear-working):
bun run src/memory/__helpers/bridge.ts clear-working

# New pattern (forget session-scoped):
mcp__muninn__muninn_forget(vault: "default", id: "session:*")
```

### Entity Naming Convention

Type-prefixed with colon separator:

- `brain:project-identity` — root tree for BRAIN equivalent
- `brain:stack`, `brain:conventions` — child nodes
- `pattern:bun-over-node` — individual learning patterns
- `decision:no-tests` — architectural decisions
- `pitfall:orphaned-processes` — known pitfalls
- `preference:kebab-case` — user preferences
- `session:current-task` — session-scoped context
- `procedure:git-commit-flow` — procedure trees

## Don't Hand-Roll

| Problem                 | Don't Build                        | Use Instead                          | Why                                    |
| ----------------------- | ---------------------------------- | ------------------------------------ | -------------------------------------- |
| Semantic recall         | Custom TF-IDF (semantic-search.ts) | `mcp__muninn__muninn_recall`         | MuninnDB has native semantic scoring   |
| Entity relationships    | Custom linking logic               | `mcp__muninn__muninn_link`           | MuninnDB has native graph              |
| Temporal decay          | Custom compaction/pruning          | MuninnDB native lifecycle            | Built-in temporal decay, consolidation |
| Session tracking        | WORKING.md file I/O                | `mcp__muninn__muninn_session`        | Session-scoped engrams auto-managed    |
| Knowledge evolution     | Manual memory editing              | `mcp__muninn__muninn_evolve`         | Native engram evolution                |
| Contradiction detection | None existed                       | `mcp__muninn__muninn_contradictions` | New capability, free                   |

## Common Pitfalls

### Pitfall 1: Missing Shell Script References

**What goes wrong:** Delete src/memory/ but forget to update shell scripts in hooks. Bridge calls silently fail (they already have `2>/dev/null || true` fallbacks) but no data gets stored.
**How to avoid:** Search for every `src/memory/__helpers/bridge.ts` reference. All 40+ occurrences must be addressed.

### Pitfall 2: Agent Prompt Content vs TypeScript Imports

**What goes wrong:** Treating this as a TypeScript refactor when it's primarily a prompt/markdown text replacement.
**How to avoid:** Agent/skill files contain embedded bash commands in template strings. These are string literals, not imports. grep for `bridge.ts`, not for TypeScript import statements.

### Pitfall 3: Pi Extension Dead Code

**What goes wrong:** Deleting `luca-memory.ts` but not removing it from `PI_EXTENSION_FILES` in `build-shared.ts`, causing build failures.
**How to avoid:** Update `scripts/build-shared.ts` line 52 to remove `"luca-memory.ts"` from the extension list.

### Pitfall 4: State Machine Suspend/Resume

**What goes wrong:** The suspend/resume checkpoint reads WORKING.md content directly. If WORKING.md no longer exists, suspending a phase loses session context.
**How to avoid:** Update `packages/luca-framework/src/state/bridge.ts` lines 962-978 to snapshot from MuninnDB instead of WORKING.md.

### Pitfall 5: Context-Monitor Hook

**What goes wrong:** The context-monitor.sh checks WORKING.md file size as a proxy for context usage. With WORKING.md removed, the fallback signal disappears.
**How to avoid:** Either remove the WORKING.md size check entirely (transcript size is the primary signal) or query MuninnDB for session engram count.

### Pitfall 6: Domain Boundary Script

**What goes wrong:** `scripts/check-domain-boundaries.ts` has `memory: 1` in its tier map. After deletion, this causes a "domain directory not found" error.
**How to avoid:** Remove `memory: 1` from the tier map in the domain boundary checker.

### Pitfall 7: Session Persist Hook

**What goes wrong:** `session-persist.sh` appends session-end timestamps to WORKING.md. With no WORKING.md, it exits early (which is fine), but session-end events are no longer tracked.
**How to avoid:** Either: (a) emit a MuninnDB session-end engram instead, or (b) rely on `mcp__muninn__muninn_session` for session tracking.

## State of the Art

| Old Approach                          | Current Approach                | Impact                          |
| ------------------------------------- | ------------------------------- | ------------------------------- |
| Flat .md files (BRAIN/MEMORY/WORKING) | MuninnDB entity-based storage   | Structured, queryable, semantic |
| Custom TF-IDF semantic search         | MuninnDB native `muninn_recall` | Better recall, zero maintenance |
| JSON persistence + MD dual-write      | MuninnDB single source of truth | No dual-write complexity        |
| Memory bridge CLI (11 commands)       | Direct MCP tool calls           | No abstraction layer            |
| Manual compaction/pruning             | MuninnDB temporal decay         | Automatic lifecycle             |
| File-based context monitoring         | MuninnDB-native                 | No file size proxying           |

## Open Questions

1. **Quality scoring (`quality-scorer.ts`, `quality-trend.ts`)**
   - These modules score phase execution quality and track trends
   - They're exported from memory barrel but may not be consumed
   - Question: Should quality scoring move to `src/planner/` or `src/observability/`, or is it eliminated?
   - Recommendation: Check if any file imports these. If not consumed, delete. If consumed, relocate

2. **Meta-cognition (`meta-cognition.ts`)**
   - Provides `assessPlanQuality` and `generateReflection`
   - Question: Is this consumed by any other module?
   - Recommendation: Check imports. If consumed, relocate to `src/planner/` or `src/shared/`

3. **Cognitive Profile export/import**
   - `profile-import.skill.ts` and `profile-export.skill.ts` use bridge commands
   - Question: Should profile export/import work with MuninnDB directly?
   - Recommendation: Update skills to use `mcp__muninn__muninn_export_graph` and `mcp__muninn__muninn_remember_batch`

4. **BRAIN.md auto-detection in session-start**
   - Session-start hook auto-detects project info and creates BRAIN.md
   - Question: Should this seed MuninnDB directly instead?
   - Recommendation: Convert to MuninnDB tree seeding, or rely on `/seed-memory` skill

## Sources

### Primary (HIGH confidence)

- Codebase grep analysis of all files in `src/` (exhaustive)
- `src/memory/index.ts` barrel — complete export list
- CONTEXT.md — user decisions and constraints
- Agent/skill source files — direct inspection of memory bridge references

### Confidence Breakdown

- Files to delete: HIGH — complete file listing from `find` command
- Consumer files to modify: HIGH — exhaustive grep across codebase
- Export list: HIGH — read directly from barrel file
- Architecture patterns: HIGH — from CONTEXT.md user decisions
- Open questions: MEDIUM — need additional import analysis for quality/meta-cognition modules

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable domain, no external dependencies changing)

## Impact Summary

| Category                       | Count                                             |
| ------------------------------ | ------------------------------------------------- |
| Files to DELETE                | 25 (entire src/memory/ domain)                    |
| Agent files to MODIFY          | 4 critical + 32 documentation updates             |
| Skill files to MODIFY          | 10 with bridge commands + 7 documentation         |
| Hook scripts to MODIFY         | 3 shell scripts + 1 Pi extension (delete/rewrite) |
| Rule files to MODIFY           | 3                                                 |
| Context domain files to MODIFY | 2                                                 |
| Planner domain files to MODIFY | 4                                                 |
| Build scripts to MODIFY        | 2                                                 |
| State machine files to MODIFY  | 5                                                 |
| Shared domain files to MODIFY  | 1                                                 |
| Pi extension files to MODIFY   | 4                                                 |
| Documentation files to MODIFY  | 17+                                               |
| Files to CREATE                | 1 (seed-memory skill)                             |
| Exports to REMOVE              | ~60                                               |
| **Total files affected**       | **~80**                                           |
