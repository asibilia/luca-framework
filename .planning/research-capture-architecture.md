# Research Capture — Architecture

**Subagent**: researcher
**Perspective**: architecture
**Timestamp**: 2026-05-05

## Findings

### 1. Summary

Luca-mastracode pipeline has **no path helper module**. Every tool and state module computes `.planning/<file>` paths independently via `join(process.cwd(), '.planning', ...)` with module-level string constants. Diffusion: 42 files, 177 occurrences. Refactor mechanically feasible but requires disciplined rollout — paths used at every layer (state modules, tools, instruction markdown prompts, run-archival).

### 2. Artifact Flow Diagram

```
[luca:1-triage]    → reads/writes luca-state.json, .luca-lock.json, config.json (ALL stay at root)
[luca:2-research]  → writes RESEARCH.md, research-capture-*.md (→ phases/<slug>/)
[luca:3-architect] → ROADMAP.md (root), PLAN.md, CONTEXT.md, plan-review-capture-*.md (→ phases/<slug>/)
[luca:4-execute]   → verification-result.json, confidence-journal.jsonl, verification-history.jsonl, CONFIDENCE-JOURNAL.md, checks-convergence.json
[luca:5-review]    → REVIEW-{wave}.md, review-capture-*-{wave}.md (→ phases/<slug>/)
[luca:6-finalize]  → POSTMORTEM.md, SESSION-ARCHIVE.md, SUGGESTED-RULES.md, runs/<runId>/ (root)
```

**Cross-phase (must stay at root):** luca-state.json, .luca-lock.json, config.json, ROADMAP.md, todos/, session-ledger.jsonl, routing-history.jsonl, verification-history.jsonl, confidence-journal.jsonl, runs/<runId>/

### 3. luca-state.json Schema (luca-store.ts:51-103)

```typescript
interface LucaWorkflowState {
  intent?, complexity?, profile?, oversight?, affectedAreas?, skipResearch?
  pipelineStep?, nextMode?, currentPhase?, totalPhases?
  phaseResults?, currentPhaseName?  // human-readable, NOT a slug
  currentWave?, currentIteration?, milestoneCount?
  reviewIteration?, iterationPlan?
  planFile?, roadmapFile?  // already stored as path strings
  sessionId?, startedAt?, runId?
  currentPhaseStartSnapshot?, emptyPhaseJustifications?
  assignedTodos?, budgetExceeded?
  [key: string]: unknown  // extensible — phaseSlug add is non-breaking
}
```

**Key:** `phaseSlug` does NOT exist. Adding is non-breaking due to extensible index signature.

### 4. Tool Boundary Map

| Tool | FS Strategy | Path Pattern |
|---|---|---|
| workflowStateTool | via luca-store.ts, session-ledger.ts | luca-state.json, session-ledger.jsonl, runs/ |
| writePlanningFileTool | DIRECT node:fs + containment check (lines 61-64) | .planning/<userPath> |
| manageTodosTool | via state/todos.ts | .planning/todos/{pending,backlog,done}/ |
| manageRoadmapTool | DIRECT node:fs (BYPASSES writePlanningFile!) | .planning/ROADMAP.md |
| pipelineLockTool | DIRECT node:fs | .planning/.luca-lock.json |
| verificationResultTool | via state/verification-result.ts | verification-result.json, verification-history.jsonl |
| confidenceJournalTool | via state/confidence-journal.ts | confidence-journal.jsonl, CONFIDENCE-JOURNAL.md |
| sessionLedgerTool | via state/session-ledger.ts | session-ledger.jsonl, routing-history.jsonl, runs/ |
| repoCleanupTool | DIRECT node:fs (FLAT scan only — line 165-166) | regex `/-capture-/.test(file)` on root .planning/ |
| runPostmortemTool | via analysis/postmortem.ts | POSTMORTEM.md, reads JSONL |
| claimVerifierTool | DIRECT node:fs | repo root, fallback .planning/ |

**No shared path helper.** Every module: `join(process.cwd(), '.planning', ...)`.

### 5. Run vs Phase

| Concept | What | ID | Scope |
|---|---|---|---|
| Run | Full pipeline invocation | runId `run_<ts>_<rand>` | luca-state.json, JSONL stamping, runs/<runId>/ |
| Pipeline Mode | Stage of pipeline | `luca:N-name` | Once per run |
| Phase | ROADMAP delivery unit | currentPhaseName (string) | Multiple per run |
| Wave | execute→checks→verify subcycle | currentWave int | Multiple per phase |

**phaseSlug** would derive from ROADMAP phase name → `slugifyPhaseName("Phase 1: Setup")` → `"phase-1-setup"`. New concept. RunId orthogonal to phaseSlug.

### 6. Architectural Debt

1. **42 files hardcoded `.planning/` paths (177 occurrences)** — HIGH
2. **manageRoadmapTool bypasses writePlanningFile** (manage-roadmap.ts:95-97) — HIGH
3. **repoCleanup cleanup-artifacts uses flat regex** (repo-cleanup.ts:165-166) — MEDIUM, captures under phases/ won't be found
4. **ARTIFACT_FILES constant hardcodes JSONL** (session-ledger.ts:233-238) — LOW
5. **Instruction `.md` files have hardcoded paths** (research.md:70,87, review.md:82, architect.md:13, finalize.md:13) — MEDIUM, LLM prompts can't import constants
6. **planFile/roadmapFile already stored as state strings** — LOW, this is the pattern to generalize
7. **PIPELINE_ORDER manually mirrors PIPELINE_STEPS_ORDERED** (workflow-state.ts:39-54) — UNRELATED debt

### 7. Suggested Architecture: phase-paths.ts helper

Location: `packages/luca-mastracode/src/util/phase-paths.ts`

```typescript
export function planningRoot(): string
export function slugifyPhaseName(name: string): string  // "Phase 1: Setup & Auth" → "phase-1-setup-auth"
export function phaseDir(phaseSlug?: string): string    // undefined → planningRoot, defined → phases/<slug>/
export function phasePath(filename: string, phaseSlug?: string): string  // mkdir + join
export const STATE_PATH, LOCK_PATH, ROADMAP_PATH, TODOS_ROOT, LEDGER_PATH, RUNS_ROOT
```

### 8. Rollout Sequence

1. Create `util/phase-paths.ts`
2. Add `currentPhaseSlug` field to LucaWorkflowState; compute at start-phase time
3. Update writePlanningFileTool to inject phaseSlug from state, resolve to phaseDir(slug)
4. Update manageRoadmapTool to use ROADMAP_PATH() (stays at root); fix node:fs bypass
5. Update state/ modules (verification-result, check-convergence, confidence-journal) to use phasePath()
6. Update repoCleanup cleanup-artifacts — recurse into phases/
7. Update instruction `.md` files
8. Update save-plan-artifacts to write phase-scoped paths
9. Update finalize PR body POSTMORTEM.md ref

### 9. Open Questions

1. phaseSlug persists across review→finalize? Last phase's slug or session-<runId> slug?
2. Multi-phase sessions: each phase has own slug → REVIEW-1.md goes where?
3. JSONL files cross-run — keep all at root (recommended)
4. writePlanningFile path injection: from state (invisible) vs explicit param
5. Slug stability: freeze at start-phase, immutable
