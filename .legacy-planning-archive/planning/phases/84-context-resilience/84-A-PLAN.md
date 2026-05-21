# Plan 84-A: Context Pruning & WORKING.md Auto-Compaction

---

id: 84-A
title: Context pruning extensions and WORKING.md auto-compaction for session resilience
phase: 84
wave: 1
tdd: false
gap_closure: false

---

## Objective

Implement context pruning (stale ResultEnvelope digestion, section-level retention policies, critical context preservation, pruning event logging) and WORKING.md auto-compaction (quality-zone triggered, age/relevance scoring, summarization over deletion, session continuation) so sessions survive longer without quality degradation.

## Context

- Memory schemas: `src/memory/__schemas/memory.schemas.ts` -- WorkingMemory, ContextUsageResult, CompressionTrigger
- Working memory: `src/memory/__helpers/working-memory.ts` -- parse/serialize/addSection/summarizeSection
- Context monitor: `src/memory/__helpers/context-monitor.ts` -- createContextMonitor, getCurrentZone, shouldCompress
- Token estimator: `src/memory/__helpers/token-estimator.ts` -- estimateTokens, estimateFileTokens
- Compression: `src/memory/__helpers/compression.ts` -- analyzeMemoryEntries
- Result envelope: `src/context/__helpers/result-envelope.ts` -- ResultEnvelope, parseResultEnvelope
- Quality zones: `src/planner/__schemas/planner.schemas.ts` -- QUALITY_ZONES, qualityZoneSchema
- Memory barrel: `src/memory/index.ts` -- re-exports only

## Requirements

- R8: Context Pruning Extensions
  - R8.1: Stale ResultEnvelopes auto-digested at degrading zone
  - R8.2: Section-level pruning with configurable retention policies
  - R8.3: Pruning preserves critical context (active task, current plan)
  - R8.4: Pruning events logged to WORKING.md
- R9: WORKING.md Auto-Compaction
  - R9.1: Auto-compaction triggers at degrading quality zone
  - R9.2: Sections compacted by age/relevance scoring
  - R9.3: Compacted content summarized, not deleted
  - R9.4: Session continues after compaction (no hard stop)

## Tasks

### Task 1: Add context pruning schemas (R8)

**Goal:** Add Zod schemas for pruning configuration, retention policies, pruning events, and pruning results.

**File:** `src/memory/__schemas/memory.schemas.ts`

**Steps:**

1. Add `retentionPolicySchema` -- per-section retention config (max_age_ms, max_tokens, priority)
2. Add `pruningConfigSchema` -- global pruning config with per-section policies and critical section list
3. Add `pruningEventSchema` -- logged event (timestamp, section, action, tokens_freed, reason)
4. Add `pruningResultSchema` -- aggregate result (events, total_tokens_freed, sections_pruned, preserved_sections)
5. Export types and schemas

**Verification:** TypeScript compiles, schemas produce correct types

### Task 2: Implement context pruning engine (R8.1-R8.4)

**Goal:** Create the pruning engine that digests stale ResultEnvelopes, applies section-level retention, preserves critical context, and logs events.

**File:** `src/memory/__helpers/context-pruning.ts`

**Steps:**

1. `digestStaleEnvelopes()` -- identify and summarize old ResultEnvelopes in findings section (R8.1)
2. `applySectionRetention()` -- prune sections based on retention policies (R8.2)
3. `preserveCriticalContext()` -- guard active task and current plan from pruning (R8.3)
4. `logPruningEvent()` -- append pruning events to WORKING.md session_info section (R8.4)
5. `pruneWorkingMemory()` -- orchestrate all pruning steps, return PruningResult

**Verification:** Unit tests cover all four sub-requirements

### Task 3: Add auto-compaction schemas (R9)

**Goal:** Add Zod schemas for compaction configuration, section scores, and compaction results.

**File:** `src/memory/__schemas/memory.schemas.ts`

**Steps:**

1. Add `sectionScoreSchema` -- per-section relevance/age score
2. Add `compactionConfigSchema` -- trigger zone, min_section_age_ms, summary_max_tokens
3. Add `compactionResultSchema` -- sections_compacted, tokens_before, tokens_after, summaries, session_continued

**Verification:** TypeScript compiles, schemas produce correct types

### Task 4: Implement WORKING.md auto-compaction engine (R9.1-R9.4)

**Goal:** Create the compaction engine that triggers at degrading zone, scores sections, summarizes (not deletes), and allows session continuation.

**File:** `src/memory/__helpers/auto-compaction.ts`

**Steps:**

1. `scoreSections()` -- score each section by age and relevance (R9.2)
2. `compactSection()` -- summarize a section's content, preserving key information (R9.3)
3. `shouldTriggerCompaction()` -- check quality zone against compaction trigger threshold (R9.1)
4. `compactWorkingMemory()` -- orchestrate compaction with session continuation flag (R9.4)

**Verification:** Unit tests cover all four sub-requirements

### Task 5: Integrate into memory barrel

**Goal:** Update `src/memory/index.ts` with new exports.

**File:** `src/memory/index.ts`

**Steps:**

1. Add schema exports for pruning and compaction schemas
2. Add type exports
3. Add function exports for pruning and compaction engines

**Verification:** Barrel exports resolve, no circular dependencies

### Task 6: Write comprehensive tests

**Goal:** Full test coverage for pruning and compaction modules.

**Files:**

- `__tests__/src/memory/context-pruning.test.ts`
- `__tests__/src/memory/auto-compaction.test.ts`

**Coverage targets:**

- R8.1: Stale envelope digestion reduces token count
- R8.2: Section retention policies enforce max age and max tokens
- R8.3: Critical sections (session_info, planning_notes) are preserved
- R8.4: Pruning events appear in WORKING.md
- R9.1: Compaction triggers only at degrading/stop zones
- R9.2: Section scoring ranks older/less-relevant sections higher
- R9.3: Compacted sections contain summaries, not empty strings
- R9.4: Compaction result includes session_continued: true

### Task 7: Final verification

**Goal:** Run full test suite, verify no regressions.

**Steps:**

1. `bun test` -- all tests pass
2. Create 84-A-SUMMARY.md

## Success Criteria

- All R8 and R9 requirements implemented with tests
- No regressions in existing test suite
- Schemas follow snake_case convention
- Functional patterns (no classes)
- Proper barrel exports in index.ts
