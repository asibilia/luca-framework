# Roadmap

## Overview

**Current Milestone:** v8.5.2 — Statusline HUD

---

## v8.5.1 — Audit Gap Closure (reopened)

Close code quality, security, and enforcement findings. Phases 225-226 shipped DRY + hardening. Phases 227-228 address the orchestrator enforcement gap discovered during PR review. Phase 229 adds behavioral contracts for critical workflow invariant enforcement. Phase 232 migrates all 5 orchestrators from Skill() to Agent() sub-agents, fixing the nested skill return bug (#17351).

### Phase 225: DRY Consolidation — COMPLETE

### Phase 226: Security Hardening — COMPLETE

### Phase 227: Orchestrator State Tracking

**Goal:** Ensure all 5 decomposed orchestrators (lu, phase-execute, verify, milestone-complete, pr-address) write `current_state` to their context files after every state transition, so pre-step hooks can enforce ordering.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 226

- [x] enforce-state-writes — Audit all 5 orchestrator SKILL.md specs and verify `current_state` write instructions are present and explicit after every Skill() call. Fix any that are missing or ambiguous.
- [x] enforce-context-init — Ensure context file initialization uses `writePrContext({})` (typed helper) not manual `cat > /tmp/...` in all orchestrators. The typed helpers set `context_version: 1` and permissions.
- [x] enforce-no-inline — Add explicit "NEVER do work inline that a sub-skill handles" constraint to all 5 orchestrator specs, matching the pattern already in lu-phase-loop

### Phase 228: Post-Execution Gap Detection

**Goal:** Implement post-execution gap detection audits that verify all expected sub-skills were actually invoked, catching cases where the LLM bypasses enforcement by going ad-hoc.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 227

- [x] gap-audit-pr-address — Implement the Step 7 gap detection audit documented in pr-address.skill.ts: build DAGCheckpoint from execution trace, call detectGaps(), report coverage
- [x] gap-audit-all-orchestrators — Add equivalent post-execution gap audits to lu-phase-loop, phase-execute, verify, and milestone-complete orchestrators
- [x] gap-audit-hook — Create a SessionEnd or Stop hook that checks if any active orchestrator's context file has a non-terminal `current_state`, indicating the session ended mid-workflow with steps potentially skipped

### Phase 229: Agent Behavioral Contracts

**Goal:** Define and enforce hard/soft invariants for critical workflow paths. Behavioral contracts make illegal workflow state transitions detectable and recoverable at runtime, catching violations that state machines alone cannot express (cross-step temporal properties).
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 228

- [x] contract-schemas — Create `src/workflow/__schemas/contracts/` with Zod schemas for hard invariants (must hold at every step), soft invariants (allow transient violations with bounded recovery), and recovery mechanism definitions
- [x] contract-definitions — Define behavioral contracts for the 5 critical workflow paths: pr-address (no push without LEARNED), milestone-complete (no archive without shadow scan), lu (no phase-execute without configured), verify (no review without extract), phase-execute (no commit without harness pass)
- [x] contract-runtime — Implement contract evaluation engine that checks invariants against the session ledger event log, detects violations, and triggers recovery mechanisms for soft invariant breaches
- [x] contract-integration — Integrate contract checking into existing post-execution gap audits and pre-step enforcement hooks so contracts are evaluated at both pre-step and post-execution boundaries
- [x] drift-metrics — Add contract violation metrics to MuninnDB (violation rate, recovery success rate, drift detection) for process intelligence feedback loop

### Phase 232: Skill-to-Agent Orchestration Migration — COMPLETE

**Goal:** Migrate all 5 orchestrators from nested Skill() calls to flat Agent() sub-agent orchestration, fixing Claude Code bug #17351 where nested skills don't return control to the parent. Delete 22 sub-skills, create shared prompt templates, update enforcement hooks with prefix-based matching.
**Complexity:** CRITICAL
**Verification:** Full
**Depends on:** Phase 229

- [x] hook-infrastructure — Update enforcement-hook-factory.ts for Agent() support with prefix-based matching, update hook-registry.ts tool_filter to "Skill|Agent", update pre-step-enforcement.ts, Phase 0 empirical validation
- [x] shared-templates — Create agent-prompts.ts (~26 prompt template functions) and agent-output.schemas.ts (output contracts + parseAgentOutput parser)
- [x] migrate-pr-address — Rewrite pr-address.skill.ts (6 Skill() → 6 Agent()), update pre-step hook + DAG handlers, delete 6 sub-skill files
- [x] migrate-verify — Rewrite verify.skill.ts (verify-test stays INLINE for user interaction, 3 others → Agent()), update pre-step hook, delete 4 sub-skill files
- [x] migrate-milestone-complete — Rewrite milestone-complete.skill.ts (5 Skill() → 5 Agent() leaf workers), update pre-step hook, delete 5 sub-skill files
- [x] migrate-phase-execute — Rewrite phase-execute.skill.ts (hoisted harness fix loop, parallel reviewer Agent() calls, UAT inline), update pre-step hook with agentPrefixes, delete 3 sub-skill files
- [x] migrate-lu — Rewrite lu.skill.ts (full 11-step pipeline inline, routing branches, phase loop, gap closure, milestone inlining, 228-line compiled SKILL.md), update pre-step hook with full prefix set, delete 4 sub-skill files
- [x] infrastructure-cleanup — Verify contract-hook-adapter (no changes needed), audit skill registry (22 entries removed), verify template directories cleaned, final type-check + documentation

### Phase 230: v2 Enhanced Existing Agents

**Goal:** Enhance 4 existing agents with v2 capabilities (parallel research spawning, engram graduation, research-informed risk analysis, review loop convergence) while preserving v1 backward compatibility.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 229, v2 Phases 1-5 (shipped in v6.0.0)

- [x] researcher-orchestrator — Modify lu-phase-researcher to spawn 4 specialist researchers (lu-architecture-researcher, lu-implementation-researcher, lu-ecosystem-researcher, lu-risk-researcher) in parallel when v2 is enabled; preserve v1 single-researcher behavior
- [x] learner-graduation — Add `research:*` engram promotion pathway to lu-learner: promote high-value research engrams to permanent `pattern:*`/`pitfall:*`/`decision:*` in default vault, then clean up remaining `research:*` via `muninn_forget`
- [x] premortem-research — Modify lu-premortem to accept research files as input alongside the plan, enabling research-informed risk analysis
- [x] plan-checker-review-loop — Add review loop support with convergence detection to lu-plan-checker, replacing single-pass checking with multi-reviewer plan review loop

### Phase 231: v2 Orchestrator Integration

**Goal:** Wire the full v2 pipeline into `lu.skill.ts` with conditional execution based on `workflow.version: "v2"` config. Each v2 step is independently toggleable and gated fail-closed. Post-Phase 232, lu.skill.ts uses a flat Agent() orchestrator with an inline phase loop — v2 steps are inserted as additional Agent() calls inside the Step 7 loop body.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 230, Phase 232

- [x] research-config-schemas — Create `src/shared/__schemas/research-config.schemas.ts` (ResearchConfigSchema) and `src/shared/__schemas/workflow-version.schemas.ts` (WorkflowVersionSchema)
- [x] config-extensions — Extend `lu-config.schemas.ts` with `research` section and `workflow.version` field; extend `complexity.schemas.ts` with v2 fields (researchReviewIterations, planReviewIterations)
- [x] v2-pipeline-branch — Add v2 pipeline branch to lu.skill.ts Step 7 phase loop: insert Agent() calls for phase-research (multi-agent), phase-research-review, phase-graduate BEFORE the existing discuss/plan/execute steps (7e-7h). Gate each v2 step on `workflow.version: "v2"` config. Add v2 prompt templates to `agent-prompts.ts`. NOTE: phase-research-review must NOT call Skill() internally — it returns NEEDS_EXPANSION status and the orchestrator handles expansion as a separate Agent() call.
- [x] config-json-update — Add `workflow.version` and `research` section to `.planning/config.json` with all v2 feature flags
- [x] v2-graceful-degradation — Ensure v1 config runs v1 pipeline unchanged (Step 7 loop skips v2 Agent() calls when version != "v2"), v2 with features disabled skips those steps, `--v2` flag overrides config for single invocation, and failure in any v2 step degrades gracefully to v1 by falling through to the existing v1 discuss/plan/execute path

### Phase 233: Post-Audit Security & Schema Compliance

**Goal:** Fix security findings (prompt injection, input validation, path sanitization) and schema-first violations from the v8.5.1 audit.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 231

- [x] fix-harness-prompt-injection — Sanitize tsc error output in HARNESS_FIX_PROMPT by escaping XML tags before interpolation (SEC-001)
- [x] fix-context-write-validation — Validate merged context against Zod schema before writing in context-helpers.ts (SEC-002)
- [x] fix-hookname-sanitization — Apply safeTool regex to hookName in guard file paths in hook-io.ts (SEC-003)
- [x] fix-prompt-escaping — Escape single quotes in vault/recallContext in memoryProtocol, add allowlist for reviewer/route params (SEC-004, SEC-005)
- [x] fix-contextpath-validation — Validate contextPath prefix in contract-hook-adapter checkContractPreconditions (SEC-006)
- [x] fix-enforcement-schema-first — Replace type assertions in enforcement-hook-factory stdin parsing with Zod safeParse, replace JSON.parse in session-end-audit with schema validation (DX-001, DX-002)

### Phase 234: Post-Audit DRY & Integration Cleanup

**Goal:** Fix the CRITICAL DRY violation, dead code, duplicated schemas, and unregistered hook from the v8.5.1 audit.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 233

- [x] fix-violation-to-gap-dry — Extract shared violationToGap() helper, resolve optional field divergence between gap-detector and contract-evaluator (DRY-001 CRITICAL)
- [x] fix-register-session-end-audit — Register session-end-audit in hook-registry.ts so it actually fires on SessionEnd (INT-001)
- [x] fix-consolidate-context-schema — Consolidate duplicated EnforcementContextSchema/HookContextSchema into single shared schema in workflow (ARCH-001)
- [x] fix-dead-code — Fix unreachable recoverySucceeded path in contract-evaluator, fix dead hasFails branch in gap-detector, use Bun.file.json() in contract-hook-adapter (ARCH-002, ARCH-003, ARCH-006)
- [x] fix-contract-evaluator-schemas — Convert LedgerEntry/MergedAuditResult to Zod schemas with z.infer, constrain status to enum (DX-003, DX-005)

### Phase 235: Migration Review Gap Closure

**Goal:** Address the 3 MEDIUM gaps identified by the v8.5.1 migration review panel: build-time prompt safety check, recall depth gating in memory protocol, and atomic context file writes.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 234

- [x] prompt-safety-check — Create `scripts/check-prompt-safety.ts` that greps all compiled Agent() prompt templates for forbidden tool calls (Agent, Task, Skill) and fails with exit code 1 if found. Add to `check:drift` pipeline.
- [x] recall-depth-gating — Update `memoryProtocol()` in `agent-prompts.ts` to accept an optional `recallDepth` parameter. When provided, limit the number of recall steps (0 = skip all recalls, 1 = brain tree only, 3 = full). Wire complexity matrix `recallDepth` through `AgentPromptParams`.
- [x] atomic-context-writes — Replace `Bun.write(path, data)` in `context-helpers.ts` with atomic temp-file-rename pattern: write to `${path}.tmp`, then `rename()` to `path`. Prevents corruption from mid-write crashes.

---

## v8.5.2 — Statusline HUD & Edit Gate

Add workflow HUD to the statusline, close the anti-skip enforcement gap with a PreToolUse edit gate, add a fix-loop for code review findings, and unify the dual-state architecture.

### Phase 236: Statusline HUD Workflow Display — COMPLETE

**Goal:** Add a two-line HUD to the statusline showing workflow state (phase, state, wave progress, complexity, milestone) above the existing system line. Gracefully collapse to idle indicator when no workflow is active.
**Complexity:** SIMPLE
**Verification:** Quick
**Depends on:** None

- [x] statusline-hud — Add workflow HUD line to `src/hooks/scripts/statusline.ts`: Zod schema for display state, read `.planning/state.json`, render progress bar, emit two-line output with graceful fallback

### Phase 237: Pre-Edit Workflow Gate — COMPLETE

**Goal:** Close the anti-skip enforcement gap by adding a PreToolUse hook on Edit/Write that blocks source file edits when any workflow pipeline hasn't completed required prerequisite steps. Adds tamper-resistant `completed_states` tracking and stale context cleanup.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 236

- [x] completed-states-schema — Add `completed_states: z.array(z.string()).default([])` to all 5 orchestrator context schemas
- [x] completed-states-tracking — Auto-populate `completed_states` in context-helpers.ts write(), strip from incoming patches to prevent injection
- [x] edit-gate-hook — Create `pre-edit-workflow-gate.ts` with per-orchestrator gate config, source-dir blocklist, env var override, actionable block messages
- [x] stale-context-cleanup — Add stale context file cleanup to session-start hook for all 5 orchestrators
- [x] hook-registration — Register pre-edit-workflow-gate in hook-registry.ts

### Phase 238: Code Review Fix Loop — COMPLETE

**Goal:** Add a backward transition and fix-loop mechanism for code review findings in the phase-execute pipeline. Currently, when parallel reviewers discover issues, the system continues to learning/commit with no path to fix them — unlike the harness fix loop which correctly loops until passing.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 237

- [x] review-backward-transition — Hoisted review fix loop in phase-execute Step 3 (stays in "verified" state, no backward transition needed)
- [x] review-fix-loop — Review → fix → review loop with REVIEW_FIX_PROMPT, no-progress guard, bridge transitions
- [x] bridge-sync-review-state — Verified no bridge sync changes needed (loop stays in "verified", exits via REVIEW_COMPLETE/SKIP_REVIEW)

### Phase 239: Unify State Architecture — COMPLETE

**Goal:** Eliminate the dual-state architecture (`/tmp/lu-context.json` + `.planning/state.json`) by making `pipeline_position` a computed property derived from XState `value` at read time. Delete `syncBridgeState()` and ~700 lines of dead code. Single source of truth, zero sync bridges.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 238
**Plan:** `~/.claude/plans/lucky-chasing-quiche.md`

- [x] wave-1-computed-function — Add `computePipelinePosition()` pure function with exhaustive switch, wire into luca-bridge as virtual `read-field`, ensure lu skill fires XState transitions directly at each step boundary, update crash recovery to read from luca-bridge
- [x] wave-2-hook-migration — Migrate enforcement hooks (pre-step-lu, enforcement-hook-factory, orchestrator-gate-config, pre-edit-workflow-gate, session-end-audit) to read computed pipeline position from state.json instead of lu-context.json
- [x] wave-3-cleanup — Delete `syncBridgeState()`, `LU_STATE_TO_BRIDGE_EVENTS`, `current_state`/`completed_states` from lu schema, dead CLI file (`cli.ts`), 5 dead bridge commands, dead `reset` command, update session-start stale detection, update `context-cli init lu`

### Phase 240: v8.5.2 Audit Gap Closure — COMPLETE

**Goal:** Fix all CRITICAL, HIGH, and MEDIUM findings from the v8.5.2 milestone audit. Addresses terminal state divergence, barrel bypass imports, schema duplication, Bun-first gaps, and sanitizeJsonParse inconsistency.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 239

- [x] wave-1-critical-high — Fix C1 (ORCHESTRATOR_TERMINALS divergence), H1-H5 (barrel bypass imports), H6 (HookContextSchema dedup), H7-H8 (bare fs imports), H9 (interface-to-Zod)
- [x] wave-2-medium-security — Fix M5 (dynamic imports), M6 (AuditContextSchema dedup), M9-M11 (sanitizeJsonParse), M8 (JSDoc), M1 (pipeline position helper extraction)
- [x] wave-3-cleanup — Fix M7 (camelCase schema), L1 (deprecated exports), L4 (checkDualWriteDivergence gating), remaining LOW items that are safe mechanical fixes

---

## Next: v8.6.0 — Scout Article Intelligence

Automated article ingestion, research, and actionable todo generation from external agentic development research via `/scout` command.

**Prerequisite:** v8.5.0 complete (scout-02 borrows createSkillStateMachine; scout-04 requires progressive disclosure)

### Planned Phases

- **Phase 1: Scout Foundation** (6 todos) — Directory structure, state machine, templates, orchestrator, index updater, shared sections
- **Phase 2: Per-Article Pipeline** (8 todos) — Ingest, relevance, research, analyst, analyze, impl-research agents + skills
- **Phase 3: Cross-Cutting Batch** (5 todos) — Integrator, integrate, planner, plan, graduate agents + skills
- **Phase 4: UX + Docs** (3 todos) — Review command, deferred command, workflow documentation

---

## Deferred to Future Milestones

Items below are tracked as todo files in `.planning/todos/deferred/` and will only be reviewed when the user explicitly requests it.

| Todo Group                | Target   | Scope                          | Reason                                         | File                                     |
| ------------------------- | -------- | ------------------------------ | ---------------------------------------------- | ---------------------------------------- |
| agent-cross-talk-protocol | v10.0.0+ | Inter-agent messaging protocol | Needs design spike, no existing infrastructure | `deferred/agent-cross-talk-protocol.md`  |
| agent-collaboration-ui    | v10.0.0+ | Agent collaboration UI         | Depends on cross-talk + adapters + Studio      | `deferred/agent-collaboration-ui.md`     |
| test-suite-fragility      | TBD      | Fix 29-test full-suite failure | Blocked by no-tests rule                       | `deferred/37-p1-test-suite-fragility.md` |

## Closed (Reference / Not Actionable)

| Todo                          | Reason                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| v2-external-research-patterns | Reference document, not an implementation task. Moved to docs/. |
| runtime-d01–d11               | Superseded by studio-w\* todos in v8.0.0 (scope revised)        |

## Closed (v8.0.0 Backlog Cleanup)

| Todo                          | Reason                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| studio-w1 (1 todo)            | Package rename (luca-observer → luca-studio) shipped in v8.0.0                                            |
| studio-w2 (4 todos)           | Foundation (compilation sidecar, Jotai atoms, new deps, TS round-trip) shipped in v8.0.0                  |
| studio-w3 (5 todos)           | API layer (read routes, compile routes, config write, entity CRUD, validation pipeline) shipped in v8.0.0 |
| studio-w4 (2 todos)           | UI layout (layout components, navigation restructure) shipped in v8.0.0                                   |
| studio-w5 (3 todos)           | Editor components (editor, feedback, visualization) shipped in v8.0.0                                     |
| studio-w6 (2 todos)           | Core pages (agents page, pipeline page) shipped in v8.0.0                                                 |
| runtime-e04                   | Adapter compatibility report (schema + validator + CLI) shipped in v7.x/v8.0.0                            |
| v2-external-research-patterns | Reference document, not implementation task (already in Closed section above)                             |

## Backlog (Blocked)

| Todo | Title                | Blocker          | Reason                                                                  |
| ---- | -------------------- | ---------------- | ----------------------------------------------------------------------- |
| #37  | Test suite fragility | no-tests.md rule | Testing reintroduction per dedicated effort. v8.0.0 Studio may unblock. |

---

## Closed (v5.0.0 Completed)

| Todo | Reason                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #17  | Global NPM Package: 9 phases, 86 commits, 102 files changed. CLI installer, MuninnDB binary management, artifact deployment, vault setup, doctor/update/reinit |

## Closed (v4.5.0 Completed)

| Todo | Reason                                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #77  | Platform Simplification & Proactive Intelligence: 14 phases, 93 commits, 793 files (+16,465/-157,273 LOC). Removed non-Claude platforms, migrated hooks to TypeScript, shadow debt scanner, proactive context management, observer memory redesign, security hardening, DRY cleanup |

## Closed (v4.4.0 Completed)

| Todo | Reason                                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #75  | Smart Context Management: 7 phases, 23 commits, 74 files (+6,756 LOC). Hook schema expansion (18 events), PreCompact checkpoint, context metrics, session restore, /context-restore skill, observer context window bar |

## Closed (v4.3.0 Completed)

| Todo | Reason                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #73  | Observer Workflow Editor: 7 phases, 35 commits, 79 files (+7,963 LOC). React Flow v12, stage-group containers, custom nodes, complexity filter, grouped column layout, Zod safeParse, ARIA accessibility |

---

## Closed (v8.5.0 Completed)

| Todo                               | Reason                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| anti-skip-layer0-4, pilot, rollout | 3 phases, 10 plans, 79 commits, 113 files (+18,033/-6,800 LOC). 5-layer anti-skip architecture, 5 skills decomposed into 23 sub-skills, state machines + hooks + gap detection |

## Closed (v8.4.1 Completed)

| Todo        | Reason                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Audit #1-17 | 16/17 code quality findings from v8.4.0 audit resolved: shell injection eliminated, DRY consolidation, barrel exports, UI fixes |

## Closed (v6.1.0 Completed)

| Todo        | Reason                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audit #1-24 | All 24 code quality findings from v6.0.0 audit resolved: 1 CRITICAL bug fix, 3 HIGH import violations, 5 DRY extractions, 2 schema placements, naming collisions, import style fixes |

## Closed (v6.0.0 Completed)

| Todo              | Reason                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| runtime-a01–a11   | Workflow domain: DAG engine with builder, sorter, validator, executor, serializer, visualizer, pipeline, registration                     |
| runtime-b01–b10   | Adapter architecture: schemas, registry, Claude agent/skill emitters, API executor, compiler refactoring, DAG integration                 |
| runtime-c01–c10   | Eval domain: graders (code/LLM/composite), runner, reporter, comparator, seed eval suites, CLI integration                                |
| runtime-x01–x08   | Cross-cutting: architecture docs, boundary script, integration audit, recompilation script, behavioral equivalence, state/iteration plans |
| v2-phase-1–5      | v2 research infrastructure: 4 parallel researchers, convergence review loop, MuninnDB graduation, plan/executor enhancement               |
| v2-config         | Config & schema updates: WorkflowVersionSchema, ResearchConfigSchema, complexity matrix extensions                                        |
| v2-open-questions | 7 open questions resolved (Q5, Q6, Q8, Q9, Q11, Q15, Q16) in CANONICAL-DECISIONS.md                                                       |

## Closed (By Design)

| Todo | Reason                                                                                  |
| ---- | --------------------------------------------------------------------------------------- |
| #59  | Context pruning works correctly in memory/ (T1). Domain placement question, not a bug.  |
| #60  | Harness-aware update command works. Verification gap, not functionality gap.            |
| #61  | Duplicate of #37. Tests intentionally removed per MEMORY.md.                            |
| #62  | Dual-write atomicity — current JSON backup is pragmatic. Over-engineering for dev tool. |

## Closed (Backlog Audit 2026-03-08)

| Todo   | Reason                                                        |
| ------ | ------------------------------------------------------------- |
| #15    | Absorbed into #95 (learning loop Phase A)                     |
| #40    | Superseded — observer pages deleted by #78                    |
| #41    | Absorbed into #78/#80 (error boundaries built into new views) |
| #42    | Obsolete — SpacetimeDB tables being deleted                   |
| #43    | Obsolete — SpacetimeDB ledger race, moot after removal        |
| #47    | Deferred — apply to new MuninnDB views post-rebuild           |
| #48    | Obsolete — SpacetimeDB schema being deleted                   |
| #49    | Superseded — new views include empty states natively          |
| #56    | Obsolete — SpacetimeDB schema being deleted                   |
| #64    | Re-scoped as #96 (MuninnDB-native)                            |
| #65    | Obsolete — SpacetimeDB package being deleted                  |
| #66-74 | Absorbed into observer design requirements doc                |

## Closed (v3.2.0 Completed)

| Todo | Reason                                                              |
| ---- | ------------------------------------------------------------------- |
| #77  | MuninnDB emission layer built (fire-and-forget + circuit breaker)   |
| #78  | SpacetimeDB stripped from observer (30+ bindings, 17 hooks deleted) |
| #79  | MuninnDB API layer with 7+ routes and filtering                     |
| #80  | Session Explorer view with design system established                |
| #81  | Decision Trail view with filtering and search                       |
| #82  | Learning Evolution view with CSS charting patterns                  |
| #87  | Vault Health Dashboard with stats and metrics                       |

## Closed (v3.3.0 Completed)

| Todo | Reason                                                                    |
| ---- | ------------------------------------------------------------------------- |
| #95  | Close learning loop: Apply-Measure-Refine (calibration engrams)           |
| #13  | Adaptive complexity self-tuning (reassessment at 4 checkpoints)           |
| #94  | Deferred/lazy recall (session-scoped cache, eager_recall flag)            |
| #83  | Knowledge Graph Explorer (force-directed graph, cluster supernodes, zoom) |
| #84  | Semantic Search (on-demand search, advanced options, explain breakdown)   |
| #85  | Contradiction view (side-by-side cards, forget, cross-view navigation)    |
| #86  | Entity Deep Dive (4-tab interface, 6 components, dynamic routing)         |

## Closed (v4.0.0 Completed)

| Todo | Reason                                                                                  |
| ---- | --------------------------------------------------------------------------------------- |
| #97  | Fix MuninnDB orphan ratio (memory linking in lu-learner and workflow-save)              |
| #98  | Compaction-resilient orchestrators (wave progress journaling + context budget checks)   |
| #106 | State machine context extensions (appetite, cooldown, bridge updates)                   |
| #99  | Appetite declaration system (levels, budgets, wave-boundary guard, planner awareness)   |
| #100 | Pre-mortem agent lu-premortem (failure scenarios, risk brief, developer checkpoint)     |
| #101 | Process data agent lu-process-data (5 per-phase + 4 aggregate metrics)                  |
| #102 | Outcome tracking (/outcome skill + lu-cognition outcome_check)                          |
| #103 | Self-tuning governance (graduation criteria, auto-skip, gate checks)                    |
| #104 | Process retrospective (dashboard + developer question at milestone boundaries)          |
| #105 | Divergent mode advisory (nudge after 8+ consecutive milestones)                         |
| #108 | PREMORTEM_COMPLETE bridge fix (emit-event to transition)                                |
| #109 | Metric key alignment (outcome-completion-rate to outcome-completion)                    |
| #110 | Mechanical cleanup (duplicate imports, memory tags, section ordering, bracket notation) |

## Closed (v4.2.0 Completed)

| Todo | Reason                                                                           |
| ---- | -------------------------------------------------------------------------------- |
| #38  | Complexity gating reworked: model-tier-only, all steps always run at every level |
| #39  | Multi-vault MuninnDB: default vault cross-cutting, repo vault project-specific   |

## Closed (v3.1.0 Completed)

| Todo | Reason                                                               |
| ---- | -------------------------------------------------------------------- |
| #45  | Bridge CLI docs fixed (13 subcommands)                               |
| #46  | sanitizeJsonParse deduplicated (2 copies across isolated boundaries) |
| #50  | Observability domain documented in architecture docs                 |
| #51  | Stale session lock auto-cleanup added                                |
| #52  | Agent health check system implemented                                |
| #53  | Stall detection & retry limits added                                 |
| #63  | node:fs to Bun migration completed                                   |
| #75  | SpacetimeDB removed from framework                                   |
| #76  | luca-spacetime package deleted                                       |
| #88  | SpacetimeDB docs/planning cleaned up                                 |
| #89  | Complexity-gated recall depth implemented                            |
| #90  | Session context digest reuse implemented                             |
| #91  | Milestone-scoped recall scoring implemented                          |
| #92  | Memory injection into sub-agent prompts                              |
| #93  | Automatic session memory cleanup                                     |

---

## History

- **v1.0.0** — Core CLI, Integrations, Enterprise Readiness ([View Archive](milestones/v1.0.0-ROADMAP.md))
- **v1.0.1** — Code Hardening: 6 phases, 433 tests, all passed ([View Archive](milestones/v1.0.1-ROADMAP.md))
- **v1.1.0** — Workflow Foundation: 4 phases, 11 plans, 27 requirements, 579 tests ([View Archive](milestones/v1.1.0-ROADMAP.md))
- **v1.2.0** — Intelligent Agent Engine: 5 phases, 25 plans, 29 requirements, 845 tests ([View Archive](milestones/v1.2.0-ROADMAP.md))
- **v1.3.0** — Claude Code Plugin Distribution: 5 phases, 19 plans, 25 requirements, 928 tests ([View Archive](milestones/v1.3.0-ROADMAP.md))
- **v1.3.1** — Post-Audit Cleanup & Plugin Autocomplete: 171 files, 938 tests ([View Archive](milestones/v1.3.1-ROADMAP.md))
- **v1.3.2** — Audit Tech Debt Cleanup: 4 phases, 8 plans, 17 requirements, 992 tests ([View Archive](milestones/v1.3.2-ROADMAP.md))
- **v1.3.3** — Final Audit Sweep: 2 phases, 4 plans, 10 requirements, 992 tests ([View Archive](milestones/v1.3.3-ROADMAP.md))
- **v1.4.0** — Developer Experience & Verification: 4 phases, 8 plans, 21 requirements, 1042 tests ([View Archive](milestones/v1.4.0-ROADMAP.md))
- **v1.5.0** — Cognitive Architecture & State Machine: 6 phases, 14 plans, 35 requirements, 1654 tests ([View Archive](milestones/v1.5.0-ROADMAP.md))
- **v1.6.0** — Package & Publish: 4 phases, 9 plans, 18 requirements, 1755 tests ([View Archive](milestones/v1.6.0-ROADMAP.md))
- **v1.7.0** — Codebase Health & Build Stability: 8 phases, 13 plans, 1763 tests ([View Archive](milestones/v1.7.0-ROADMAP.md))
- **v1.8.0** — Functional Architecture & Bridge Unification: 3 phases, 8 plans, 8 requirements, 1763 tests ([View Archive](milestones/v1.8.0-ROADMAP.md))
- **v1.9.0** — Repo Consistency Cleanup: 1 phase, 3 plans, 1763 tests ([View Archive](milestones/v1.9.0-ROADMAP.md))
- **v2.0.0** — Unified Package & Intelligent Routing: 5 phases, 14 plans, 1808 tests ([View Archive](milestones/v2.0.0-ROADMAP.md))
- **v2.1.0** — Pi Library Integration: 7 phases, 22 plans, 2106 tests ([View Archive](milestones/v2.1.0-ROADMAP.md))
- **v2.2.0** — Pi Platform Maturity: 4 phases, 10 plans, 2271 tests ([View Archive](milestones/v2.2.0-ROADMAP.md))
- **v2.3.0** — Distribution & Model Routing: 7 phases, 7 plans, 2315 tests ([View Archive](milestones/v2.3.0-ROADMAP.md))
- **v2.4.0** — Pi Platform Completion: 3 phases, 3 plans, 2411 tests ([View Archive](milestones/v2.4.0-ROADMAP.md))
- **v2.5.0** — Operational Intelligence & Distribution Hardening: 6 phases, 6 plans, 2694 tests ([View Archive](milestones/v2.5.0-ROADMAP.md))
- **v2.5.1** — Code Health & Test Reliability: 2 phases, 4 plans, 52 files changed ([View Archive](milestones/v2.5.1-ROADMAP.md))
- **v2.6.0** — Code Health, Context Intelligence & Debate Architecture: 6 phases, 17 plans, 60 commits, 250 files changed, 3109 tests ([View Archive](milestones/v2.6.0-ROADMAP.md))
- **v2.6.1** — Audit Gap Closure: 2 phases, 9 requirements, 95 files changed, 3146 tests ([View Archive](milestones/v2.6.1-ROADMAP.md))
- **v2.6.2** — Convention & DRY Cleanup: 2 phases, 6 plans, 85 files changed, 3150 tests ([View Archive](milestones/v2.6.2-ROADMAP.md))
- **v2.7.0** — Observability & Verification Infrastructure: 21 phases, 54 plans, 205 commits, 210 files changed, 3477 tests ([View Archive](milestones/v2.7.0-ROADMAP.md))
- **v2.8.0** — Critical Remediation, Audit Persistence & Skill Eval: 3 phases, 5 commits, 27 files changed, 3514 tests ([View Archive](milestones/v2.8.0-ROADMAP.md))
- **v2.9.0** — Audit Gap Closure & Test Reliability: 14 phases, 52 commits, 572 files changed ([View Archive](milestones/v2.9.0-ROADMAP.md))
- **v3.0.0** — Data Integrity, Agentic Reliability & Model Routing Redesign: 14 phases, 42 plans, 151 commits, 810 files changed ([View Archive](milestones/v3.0.0-ROADMAP.md))
- **v3.1.0** — Memory Intelligence & Platform Cleanup: 7 phases, 10 commits, 151 files changed ([View Archive](milestones/v3.1.0-ROADMAP.md))
- **v3.2.0** — Observer Rebirth: 8 phases, 20 plans, 48 commits, 193 files changed ([View Archive](milestones/v3.2.0-ROADMAP.md))
- **v3.3.0** — Cognitive Maturity & Observer Depth: 6 phases, 12 plans, 78 commits, 94 files changed ([View Archive](milestones/v3.3.0-ROADMAP.md))
- **v4.0.0** — Process Intelligence & Self-Tuning Workflow: 6 phases, 12 plans, 48 commits, 255 files changed ([View Archive](milestones/v4.0.0-ROADMAP.md))
- **v4.1.0** — Agentic Intelligence & Platform Maturity: 10 phases, 17 plans, 77 commits, 229 files changed ([View Archive](milestones/v4.1.0-ROADMAP.md))
- **v4.2.0** — Workflow Unification & Memory Architecture: 5 phases, 8 plans, 15 commits, 312 files changed ([View Archive](milestones/v4.2.0-ROADMAP.md))
- **v4.3.0** — Observer Workflow Editor: 7 phases, 35 commits, 79 files changed ([View Archive](milestones/v4.3.0-ROADMAP.md))
- **v4.4.0** — Smart Context Management: 7 phases, 23 commits, 74 files changed ([View Archive](milestones/v4.4.0-ROADMAP.md))
- **v4.5.0** — Platform Simplification & Proactive Intelligence: 14 phases, 93 commits, 793 files changed ([View Archive](milestones/v4.5.0-ROADMAP.md))
- **v5.1.0** — Workflow Quality & Skill Simplification: 2 phases, 13 commits, 33 files changed ([View Archive](milestones/v5.1.0-ROADMAP.md))
- **v5.0.0** — Global NPM Package: 9 phases, 86 commits, 102 files changed ([View Archive](milestones/v5.0.0-ROADMAP.md))
- **v5.2.0** — Distribution & Install Quality: 8 phases, 43 commits, 201 files changed ([View Archive](milestones/v5.2.0-ROADMAP.md))
- **v5.3.0** — Dogfood via Global Install: 9 phases, 32 commits, 69 files changed ([View Archive](milestones/v5.3.0-ROADMAP.md))
- **v5.4.0** — Branding & Personalization: 3 phases, 3 commits, 37 files changed ([View Archive](milestones/v5.4.0-ROADMAP.md))
- **v6.0.0** — Runtime Foundation & Adapter Layer: 10 phases, 129 commits, 205 files changed (+25,371 LOC) ([View Archive](milestones/v6.0.0-ROADMAP.md))
- **v6.1.0** — Audit Gap Closure: 3 phases, 20 commits, 30 files changed ([View Archive](milestones/v6.1.0-ROADMAP.md))
- **v7.0.0** — IDE Adapter Layer: 2 phases, 6 plans, 27 commits, 15 files changed (+2,378 LOC) ([View Archive](milestones/v7.0.0-ROADMAP.md))
- **v7.1.0** — Multi-IDE Adapter Completion: 3 phases, 3 plans, 10 commits, 22 files changed (+1,780 LOC) ([View Archive](milestones/v7.1.0-ROADMAP.md))
- **v7.2.0** — Audit Gap Closure: 1 phase, 1 plan, 3 commits, 8 files changed (-140 LOC) ([View Archive](milestones/v7.2.0-ROADMAP.md))
- **v8.0.0** — Luca Studio MVP: 12 phases, 23 plans, 45 commits, 365 files changed (+17,647 LOC) ([View Archive](milestones/v8.0.0-ROADMAP.md))
- **v8.1.0** — Studio Polish & Prompt Quality: 4 phases, 10 plans, 58 commits, 123 files changed (+12,956 LOC) ([View Archive](milestones/v8.1.0-ROADMAP.md))
- **v8.2.0** — Audit Gap Closure: 4 phases, 10 plans, 106 commits, 170 files changed (+18,960 LOC) ([View Archive](milestones/v8.2.0-ROADMAP.md))
- **v8.3.0** — Studio Feature Suite: 6 phases, 4 plans, 35 commits, 99 files changed (+2,969 LOC) ([View Archive](milestones/v8.3.0-ROADMAP.md))
- **v8.4.1** — Audit Gap Closure: 3 phases, 3 plans, 18 commits, 56 files changed (+3,597 LOC) ([View Archive](milestones/v8.4.1-ROADMAP.md))
- **v8.4.0** — Studio Quality & Bug Fixes: 5 phases, 7 plans, 29 commits, 92 files changed (+2,489 LOC) ([View Archive](milestones/v8.4.0-ROADMAP.md))
- **v8.5.0** — Anti-Skip Enforcement Layer: 3 phases, 10 plans, 79 commits, 113 files changed (+18,033/-6,800 LOC) ([View Archive](milestones/v8.5.0-ROADMAP.md))
- **v8.5.1** — Audit Gap Closure: 11 phases, 135 commits, 56 files changed (+8,526/-5,498 LOC) ([View Archive](milestones/v8.5.1-ROADMAP.md))

---

_Roadmap created: 2026-03-16 — v5.0.0 milestone started_
