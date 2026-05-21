---
plan: 16-03
title: Context Assembly & Orchestrator Update
status: complete
---

# Plan 16-03 Summary: Context Assembly & Orchestrator Update

## Changes Made

### Created: `src/context/context-assembler.ts`

- `assembledContextSchema` -- Zod schema for assembled context output (documents, effective_tier, isolation_mode, budget, agent_name)
- `assembleContext()` -- Core assembly function that resolves agent profile, promotes context tier via complexity matrix, applies isolation overrides (cold/warm/none), and filters available documents to only allowed keys
- `getRequiredDocumentKeys()` -- Lightweight lookup that returns which document keys an agent will need at a given complexity, useful for pre-loading optimization
- Adapted plan to match actual `ISOLATION_OVERRIDES` shape (uses `include`/`exclude` properties, not `allowed_keys`)

### Created: `src/context/result-aggregator.ts`

- `aggregatedResultSchema` -- Zod schema for aggregated multi-agent results (overall_status, summary, artifacts with source_agent, deduplicated issues, agent_statuses, issue_counts, total_duration_ms)
- `aggregateResults()` -- Combines multiple `ResultEnvelope` objects into a single `AggregatedResult` with worst-status-wins logic, markdown summary concatenation, artifact merging with source attribution, issue deduplication by file:line:message key, severity counting, and duration summation
- Adapted to use `metadata.agent_name` (required field) instead of optional access

### Modified: `src/context/index.ts`

- Added Assembly section: exports `AssembledContext` type, `assembleContext`, `getRequiredDocumentKeys`, `assembledContextSchema`
- Added Aggregation section: exports `AggregatedResult` type, `aggregateResults`, `aggregatedResultSchema`

### Modified: `src/skills/general/lu-execute-phase.skill.ts`

- **4a**: Inserted "Context-Aware Sub-Agent Spawning (Phase 16+)" section after Sub-agent Delegation Requirements, documenting context tiers (T0-T3), isolation modes (none/cold/warm), and complexity promotion rules
- **4b**: Added warm isolation HTML comments above the verifier's Working Memory block, noting that WORKING.md should be empty/omitted under context-aware spawning
- **4c**: Inserted Step 5.1 "Parse Sub-Agent Results" after Step 5, documenting the result envelope JSON format and plain-text fallback wrapping
- **5a**: Added cold isolation documentation before reviewer spawn block, explaining that code reviewers receive only git diff + BRAIN.md summary
- **5b**: Added `source_agent` field to all 5 reviewer return format YAML templates (dx-advocate, code-simplifier, code-architect, tailwind-auditor, security-auditor)

## Deviations from Plan

1. **ISOLATION_OVERRIDES shape**: The plan referenced `allowed_keys` but the actual `defaults.ts` uses `{ include: string[], exclude: string[] }`. The `assembleContext` function uses `override.include` instead of `override.allowed_keys`.
2. **ResultEnvelope.metadata is required**: The plan treated `metadata` as optional (`r.metadata?.agent_name`). The actual schema makes `metadata` required, so the aggregator accesses `r.metadata.agent_name` directly without optional chaining.
3. **ResultIssue already has source_agent**: The `resultIssueSchema` already includes `source_agent` as a required field, so the aggregator's issue merging naturally preserves source attribution without needing to add it.

## Verification

TypeScript check (`bunx --bun tsc --noEmit`) completed with zero errors in any files created or modified by this plan. All 67 reported errors are pre-existing in test files, adapters, and scripts unrelated to this plan.
