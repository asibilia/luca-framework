# Phase 10 Context: v2 Plan/Executor Enhancement + Config Updates

## Phase Objective

Enhance the planner and executor with research refs, per-task MuninnDB recall, add config schema updates, and resolve remaining open questions. This completes the v2 research infrastructure by connecting graduated research engrams to the plan and execute steps.

## Decisions

### 1. research_refs Format in PLAN.md Tasks

**Decision:** Add `research_refs` as a comma-separated list in the task description body (not YAML frontmatter), using the existing markdown bold-key pattern.

Format:

```
**Research refs:** research:approach-ws-reconnect, research:api-bun-websocket
```

**Rationale:** PLAN.md tasks already use `**Checkpoint:**`, `**Verification:**` as bold-key patterns. Adding `**Research refs:**` follows the same convention. The executor parses this with a simple regex.

**Parsing:** `const refs = line.match(/\*\*Research refs:\*\*\s*(.+)/)?.[1].split(',').map(s => s.trim())`

### 2. Plan Review Loop Architecture

**Decision:** Create `phase-plan-review.skill.ts` that orchestrates cold-isolation review using existing agents: code-architect, dx-advocate, security-auditor.

**Severity levels:** BLOCKING / ADVISORY (not CRITICAL/IMPORTANT — different from research review to avoid confusion).

- BLOCKING: Plan cannot proceed without addressing
- ADVISORY: Noted for planner but not blocking

**Iteration budgets (from todo):**
| Complexity | Max Iterations |
|-----------|---------------|
| TRIVIAL | 1 |
| SIMPLE | 1 |
| MODERATE | 2 |
| COMPLEX | 2 |
| CRITICAL | 3 |

**Cold isolation:** Reviewers receive PLAN.md only — no access to planner's reasoning or intermediate drafts.

### 3. Per-Task MuninnDB Recall Protocol

**Decision:** When `research_refs` are present in a task, the executor recalls each concept from the repo vault and injects the content into working context before implementation.

**Protocol:**

1. Extract `research_refs` from the current task
2. For each ref: `muninn_recall(vault: REPO_VAULT, context: ref)`
3. Inject recalled content as a `## Research Context` section in the executor's working memory
4. Token budget: ~500 tokens per task (max 5 engrams per todo v2-phase-5)
5. Fallback: if recall returns no results, log warning and continue (no halt)
6. If `research_refs` absent: v1 behavior (no recall)

### 4. Config Schema Structure

**Decision:** Follow the v2 design doc exactly (docs/workflow-system/v2/06-implementation-plan/config-changes.md).

**New files:**

- `src/shared/__schemas/research-config.schemas.ts` — ResearchConfigSchema with camelCase keys
- Extend `src/shared/__schemas/lu-config.schemas.ts` — add `research` section import

**New config fields:**

- `workflow.version`: "v1" | "v2" (default "v1")
- `research.parallelResearchers`: 4
- `research.reviewLoop.maxIterations`: 3
- `research.planReviewLoop.maxIterations`: 2
- `research.graduation.confidenceThreshold`: "MEDIUM"
- `research.graduation.scoringThreshold`: 0.55
- `research.perTaskRecall.enabled`: true
- `research.perTaskRecall.maxEngramsPerTask`: 5

**Complexity matrix additions:**

- `researchReviewIterations`: per-level iteration budget for research review loop
- `planReviewIterations`: per-level iteration budget for plan review loop

### 5. Open Questions Resolution

**Q5 — Research files vs MuninnDB (when to read which?):**
Decision: Phase-dependent fallback chain as recommended. Steps 5-6 read files, Steps 7-8 read files + recall, Steps 9-10 recall only.

**Q6 — Cross-phase research reuse:**
Decision: Recall with staleness warning as recommended. Later phases recall prior `research:*` engrams. No staleness annotation needed now — MuninnDB timestamps provide this.

**Q8 — Reviewer freshness across iterations:**
Decision: Same agent with delta + prior summary. In review loop iteration 2+, give reviewers delta + prior findings summary.

**Q9 — Review scope on re-expansion:**
Decision: Delta review with integration check. After deep expand, re-review only new/changed files + lightweight integration check.

**Q11 — User experience during research:**
Decision: Respect existing oversight levels. Research steps use same progress reporting as existing steps.

**Q15-Q16 — Synthesizer isolation + researcher error handling:**
Decision: lu-research-synthesizer receives only file paths (cold isolation). Researcher failures are logged, remaining researchers continue (graceful degradation — same as roadmap revision swarm pattern).

### 6. Vault Routing for research:\* Prefix

**Decision:** Already implemented in Phase 9. The `research:*` prefix routes to repo vault for writes, repo vault only for recalls. Verify this is correctly reflected in:

- `.claude/rules/vault-routing.md` (project rule)
- `~/.claude/rules/vault-guard.md` (global guard)

No additional vault routing changes needed.

### 7. Scope Boundaries

**In scope:**

- lu-planner.agent.ts: add research_refs section
- lu-executor.agent.ts: add per-task recall protocol
- phase-plan.skill.ts: pass GRADUATION-REPORT.md refs to planner
- phase-execute.skill.ts: extract research_refs, pass to executor
- phase-plan-review.skill.ts: NEW skill for plan review loop
- build-skill-registry.ts: register phase-plan-review
- research-config.schemas.ts: NEW schema
- lu-config.schemas.ts: extend with research section
- complexity.schemas.ts: add researchReviewIterations, planReviewIterations
- CANONICAL-DECISIONS.md: record Q5/Q6/Q8/Q9/Q11/Q15-Q16 decisions

**Out of scope:**

- lu.skill.ts orchestrator integration (deferred to M2 per roadmap)
- Actual v2 pipeline execution (config defaults to v1)
- New IDE adapters (deferred to M2)
- Luca Studio (deferred to M2)

## Deferred Ideas

None — Phase 10 scope is well-defined by existing todos.

## Technical Notes

- All new schemas use Zod with safeParse (per schema-first-parsing rule)
- Config keys use camelCase (internal config, not API payload — per Decision 9)
- phase-plan-review reuses existing reviewer agents (code-architect, dx-advocate, security-auditor)
- No test files should be created (per no-tests rule)
- Verification: `bunx --bun tsc --noEmit` only
