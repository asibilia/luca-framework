# Roadmap

## Overview

**Current Milestone:** v9.2.0 — Platform Cleanup & Install Hygiene

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

- [x] completed-states-schema — Add `completed_states: z.array(z.string()).default([])` to all 4 `/tmp/*-context.json` orchestrator context schemas (lu uses computed pipeline position from `.planning/state.json` instead of `completed_states`)
- [x] completed-states-tracking — Auto-populate `completed_states` in context-helpers.ts write(), strip from incoming patches to prevent injection
- [x] edit-gate-hook — Create `pre-edit-workflow-gate.ts` with per-orchestrator gate config, source-dir blocklist, env var override, actionable block messages
- [x] stale-context-cleanup — Add stale context file cleanup to session-start hook for all 4 `/tmp/*-context.json` orchestrators
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

## v8.6.0 — Scout Article Intelligence

Automated article ingestion, research, and actionable todo generation from external agentic development research via `/scout` command.

### Phase 241: Scout Foundation — COMPLETE

**Goal:** Create the directory structure, state machine schema, document templates, orchestrator skill, deterministic index updater, and shared agent sections for the scouting pipeline.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** None

- [x] scout-directory-structure — Create `docs/scouting/` directory structure (inbox.md, digests/, integration/, deferred/, manual-review/, .scout-state/, INDEX.md)
- [x] scout-state-machine — Create `src/shared/__schemas/scout-state.schemas.ts` with state enum, transition table, state file schema, and transition validator
- [x] scout-document-templates — Create `src/skills/__helpers/scout-templates.ts` with digest, impact analysis, integration analysis, deferred, and manual review templates
- [x] scout-orchestrator — Create `src/skills/general/scout.skill.ts` deterministic state machine driver with per-article loop and cross-cutting batch
- [x] scout-index-updater — Create `src/skills/__helpers/scout-index.ts` deterministic INDEX.md auto-update from state files
- [x] scout-shared-sections — Create `src/agents/__helpers/scout-shared-sections.ts` extending researcher-shared-sections with scout-specific context

### Phase 242: Per-Article Pipeline — COMPLETE

**Goal:** Build all agents and skills for the per-article pipeline stages (ingest, relevance, research, analysis, implementation research).
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 241

- [x] scout-ingest-agent — Create `lu-scout-ingest.agent.ts` (WebFetch article, extract content, produce structured digest)
- [x] scout-ingest-skill — Create `scout-ingest.skill.ts` thin wrapper to spawn ingest agent and validate output
- [x] scout-relevance-agent — Create `lu-scout-relevance.agent.ts` (quick HIGH/MEDIUM/LOW relevance assessment)
- [x] scout-relevance-skill — Create `scout-relevance.skill.ts` wrapper with LOW-relevance routing to manual-review
- [x] scout-research-skill — Create `scout-research.skill.ts` spawning two parallel researcher agents for ecosystem + implementation details
- [x] scout-analyst-agent — Create `lu-scout-analyst.agent.ts` (framework impact analysis, gap identification, codebase scanning)
- [x] scout-analyze-skill — Create `scout-analyze.skill.ts` wrapper to spawn analyst and validate impact document
- [x] scout-impl-research-skill — Create `scout-impl-research.skill.ts` for concrete implementation approach research

### Phase 243: Cross-Cutting Batch — COMPLETE

**Goal:** Build agents and skills for the cross-cutting batch pipeline (integration analysis, todo planning, memory graduation).
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 242

- [x] scout-integrator-agent — Create `lu-scout-integrator.agent.ts` (cross-scout cohesion, framework fit, per-scout verdicts)
- [x] scout-integrate-skill — Create `scout-integrate.skill.ts` wrapper with verdict routing (integrate/defer/conflict)
- [x] scout-planner-agent — Create `lu-scout-planner.agent.ts` (atomic todo generation with conflict detection)
- [x] scout-plan-skill — Create `scout-plan.skill.ts` wrapper with conflict routing
- [x] scout-graduate-skill — Create `scout-graduate.skill.ts` MuninnDB engram capture following research-graduator pattern

### Phase 244: UX + Docs — COMPLETE

**Goal:** Add user-facing commands and comprehensive documentation for the scouting workflow.
**Complexity:** SIMPLE
**Verification:** Quick
**Depends on:** Phase 243

- [x] scout-review-command — Add `/scout --review` to list and re-process manual-review items
- [x] scout-deferred-command — Add `/scout --deferred` to list and re-evaluate deferred items
- [x] scout-workflow-documentation — Create user-facing README, agent JSDoc, and architecture documentation

### Phase 245: Fix deepFreeze Zod v4 Crash — COMPLETE

**Goal:** Fix `deepFreeze()` crashing on Zod v4 lazy getters, which breaks all 6 PreToolUse:Agent hooks on startup with TypeError.
**Complexity:** TRIVIAL
**Verification:** Quick
**Depends on:** None

- [x] fix-deep-freeze — Skip getter/setter properties in `deepFreeze()` via `Object.getOwnPropertyDescriptor()` so Zod v4's lazy shape getters don't crash on frozen objects

### Phase 246: Statusline Rework — Skill Identity, Step Progression & Status Bus — COMPLETE

**Goal:** Rework the statusline to show which skill/workflow is active, fix the wave/step counter that always shows `1/1`, add frequent persistence after each wave/step, create a lightweight status bus for non-`/lu` skill visibility, and propagate step-level granularity within EXECUTING.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 245

- [x] skill-identity-prefix — Added skill name prefix to statusline output via status bus (e.g., `lu > EXECUTING`)
- [x] fix-wave-step-counter — Added `SET_WAVE_COUNT` event to XState machine; fixed `|| 1` fallback to explicit `> 0` check
- [x] status-bus — Created `.planning/.statusline.json` status bus with Zod schema, atomic writer, staleness TTL, and renderer integration
- [x] step-granularity — Status bus `step` field enables sub-step display within EXECUTING; renderer shows step label when available
- [x] frequent-persistence — Wave count updates now persist via `SET_WAVE_COUNT` bridge transition; status bus provides out-of-band persistence for non-XState skills
- [x] bridge-integration — Added `write-status` and `clear-status` subcommands to luca-bridge; auto-update bus on every `transition` command so statusline stays fresh

---

## v8.6.1 — Audit Gap Closure

Fix all audit findings from v8.6.0 plus critical architectural fix: move orchestration side-effects from LLM-executed bash blocks to deterministic hooks.

### Phase 247: Bridge Status Bus Hardening — COMPLETE

**Goal:** Fix remaining bridge.ts audit findings after Phase 249 addressed H1, H2, M4, M5.
**Complexity:** SIMPLE
**Verification:** Quick
**Depends on:** Phase 246

- [x] dry-consolidate — (Addressed by Phase 249: STATUS_BUS_PATH + BusDataSchema) (H1, M4)
- [x] schema-validate — (Addressed by Phase 249: BusDataSchema.safeParse + NaN guards) (H2, M5)
- [x] bun-native-unlink — Static import of rename/unlink, removed 3 dynamic imports (M2)
- [x] root-anchor — Documented relative-to-cwd convention consistent with STATE_FILE_PATH (M6)
- [x] idle-bus-cleanup — Clear skill/step from bus when transition resolves to idle (L3)

### Phase 248: Shared + Renderer Cleanup — COMPLETE

**Goal:** Fix all 6 shared/renderer audit findings.
**Complexity:** SIMPLE
**Verification:** Quick
**Depends on:** Phase 247

- [x] bun-native-unlink — Static import of rename/unlink in status-bus.ts (M1)
- [x] snake-case-hud — Renamed all 7 WorkflowHudStateSchema fields to snake_case (M3)
- [x] export-bus-path — Exported STATUS_BUS_PATH from status-bus.ts, imported in statusline.ts (L1)
- [x] barrel-import — statusline.ts now imports from `../../shared` barrel (L2)
- [x] validate-existing-merge — Existing bus data runs through safeParse before merge (L4)
- [x] deep-freeze-jsdoc — Added getter/setter skip limitation to JSDoc (L5)

### Phase 249: Deterministic Skill Lifecycle Hooks — COMPLETE

**Goal:** Move orchestration side-effects (statusline writes) from LLM-executed bash blocks to deterministic PreToolUse/PostToolUse hooks that fire automatically on every Skill invocation. Fixes unreliable statusline updates and establishes the pattern for migrating all 140+ orchestration commands to the deterministic TS layer.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 248

- [x] skill-lifecycle-hooks — Created `skill-status-enter.ts` (PreToolUse) and `skill-status-exit.ts` (PostToolUse) hooks with nesting depth counter via `.planning/.skill-depth` file
- [x] sanitize-and-register — Skill name validated with `/^[a-z0-9-]+$/`, both hooks registered in hook-registry.ts
- [x] remove-template-writes — Removed all write-status/clear-status from 29 skill templates (~184 lines of LLM-dependent bash blocks)
- [x] build-time-lint — Created `scripts/check-template-side-effects.ts` that fails on residual write-status/clear-status in skill templates
- [x] bridge-schema-fix — Added inline BusDataSchema validation, NaN guards on parseInt, extracted STATUS_BUS_PATH module constant (addresses H1, H2, M4, M5)

### Phase 250: Redundant Side-Effect Removal — COMPLETE

**Goal:** Remove redundant `snapshot` and `ensure-init` calls from skill templates that are already handled by existing hooks (snapshot-sync, session-start). Parameterless transitions cannot move to hooks — they fire at pipeline-specific points, not lifecycle events — and are reclassified to Phase 251.
**Complexity:** SIMPLE
**Verification:** Quick
**Depends on:** Phase 249

- [x] remove-redundant-snapshots — Removed 8 `luca-bridge snapshot` calls from 7 skill templates + 1 prose reference updated (already handled by snapshot-sync hook)
- [x] remove-redundant-ensure-init — Removed 2 `luca-bridge ensure-init` calls from quick.skill.ts (already handled by session-start hook). Kept milestone-new `--force` and project-new init
- [x] lint-guard — Extended `check-template-side-effects.ts` to also flag `luca-bridge snapshot` calls in skill templates

### Phase 251: Deterministic Agent Transition Sync — COMPLETE

**Goal:** Move state transitions and context-cli writes from LLM-executed bash blocks to a deterministic PostToolUse hook on Agent. When an agent completes, the hook identifies which agent finished (from `tool_input.name`), looks up the per-orchestrator mapping, and fires the corresponding transitions + context writes.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 250

- [x] agent-transition-hook — Created `agent-transition-sync.ts` PostToolUse hook with priority-ordered orchestrator detection and prefix matching with exclusions
- [x] lu-mapping — cognition→START+PREFLIGHT_COMPLETE, discuss→DISCUSS_COMPLETE, plan→PLAN_COMPLETE, verify→VERIFY_PASSED, learn→LEARN_COMPLETE
- [x] sub-orchestrator-mappings — phase-execute (execute→"executed", verify→VERIFY_PASSED+"verified", learn→LEARN_COMPLETE+"learned"), pr-address (6 state writes), verify (3 state writes), milestone-complete (5 state writes)
- [x] remove-template-transitions — Removed 6 transitions from lu, 3 transitions + 3 context writes from phase-execute, 6 context writes from pr-address, 4 context writes from verify, 6 context writes from milestone-complete
- [x] intentional-keeps — 9 transitions + 8 context writes remain in templates: ROUTE_COMPLETE (needs data), SKIP/SKIP_REVIEW (conditional), REVIEW_COMPLETE (parallel agents), COMMIT_COMPLETE (after git), interactive test state, init/crash-recovery, git workflow data

### Phase 252: v8.6.1 Audit Cleanup — COMPLETE

**Goal:** Close all 9 findings from the v8.6.1 audit: wire lint guard into pipeline, add documentation comments, type-narrow effect unions, normalize prefix, remove .passthrough(), and add depth file cleanup.
**Complexity:** TRIVIAL
**Verification:** Quick
**Depends on:** Phase 251

- [x] wire-lint-guard — Added `check:side-effects` script to package.json (L1)
- [x] type-narrow-effects — Narrowed TransitionEffect.event to 6 literal values, ContextWriteEffect.orchestrator to 4 + state to 15 literal values (SEC-001)
- [x] normalize-learn-prefix — pr-address "learn" kept as-is (bare agent name, no suffix); added doc comment explaining why (A2)
- [x] remove-passthrough — Removed `.passthrough()` from BusDataSchema (SEC-006)
- [x] depth-cleanup — Added `.planning/.skill-depth` cleanup to session-start.ts (A5)
- [x] doc-comments — Added: verify- prefix invariant (A1), BusDataSchema divergence note (A3), T3→T2 coupling note (A4), /tmp CI risk note (SEC-002)

### Phase 253: Convention Alignment & Validation Hardening — COMPLETE

**Goal:** Fix barrel import bypasses, add missing input validation, align schema conventions, and close Bun-first gaps in hooks and scripts. Addresses 7 audit findings (ARCH-M1, SEC-M2, DX-M1, DX-M3, DX-L7, SEC-L5, DRY-L2).
**Complexity:** SIMPLE
**Verification:** Quick
**Depends on:** Phase 252

- [x] barrel-imports — Replace direct `__helpers/` imports with barrel imports in skill-status-enter.ts, agent-status-sync.ts, agent-prompts.ts (ARCH-M1)
- [x] agent-name-regex — Add `/^[a-z0-9-]+$/` regex validation for agent names in agent-status-sync.ts, matching SKILL_NAME_RE pattern (SEC-M2)
- [x] bun-first-check-drift — Replace `require('fs').readFileSync` with Bun.file API in check-drift.ts (DX-M1)
- [x] realpathsync-doc — Add exception comment documenting why node:fs realpathSync is used in statusline.ts (DX-M3)
- [x] stage-enum-casing — Normalize StatusBusSchema stage enum to consistent casing (DX-L7)
- [x] sanitize-stdin-json — Replace JSON.parse with sanitizeJsonParse in hook-io.ts readStdinJson (SEC-L5)
- [x] extract-tool-input-helper — Extract shared tool_input extraction pattern from 3 hook scripts into hooks/\_\_helpers/ (DRY-L2)

### Phase 254: Build Script DRY Consolidation — COMPLETE

**Goal:** Deduplicate build utilities, remove deprecated exports, and consolidate shared logic. Addresses 6 audit findings (DRY-M1, DRY-M3, DRY-L1, DRY-L3, DRY-L5, DX-L8).
**Complexity:** SIMPLE
**Verification:** Quick
**Depends on:** Phase 253

- [x] shared-branding-context — Extract shared loadBrandingContext() into scripts/branding.ts, used by both check-drift.ts and build-deploy.ts (DRY-M1)
- [x] vault-guard-import — Import VAULT_GUARD_PROMPT from canonicalHookRegistry instead of maintaining separate constant in build-utils.ts (DRY-M3)
- [x] reuse-entity-loops — Import generate\*Outputs() from build-shared.ts in targeted-recompile.ts instead of re-implementing (DRY-L1)
- [x] remove-deprecated-registry — Remove deprecated hookRegistry export, migrate 3 consumers to canonicalHookRegistry (DRY-L3)
- [x] top-level-imports — Move dynamic `await import('node:fs')` in build-all.ts and build-compile.ts to top-level imports (DX-L8)
- [x] plugin-count-helper — Use computeOutputCounts() for plugin output counting in build-all.ts (DRY-L5)

### Phase 255: Agent Status Bus — Skill Name Propagation — COMPLETE

**Goal:** Ensure the statusline shows the active skill name (e.g., "lu") throughout Agent() execution, not just at Skill entry. Currently agent-status-sync overwrites the bus without preserving the skill field set by skill-status-enter.
**Complexity:** SIMPLE
**Verification:** Quick
**Depends on:** Phase 254

- [x] preserve-skill-field — Update agent-status-sync.ts writeStatusBus call to read existing skill value from bus before writing, so it persists across agent transitions
- [x] fallback-skill-from-context — If bus has no skill field, infer it from /tmp/lu-skill.txt sidecar as a fallback

### Phase 256: Step Enforcement Phase 1 — XState Value Normalization — COMPLETE

**Goal:** Create `resolveStateValue()` and `resolveStatePath()` utilities and replace all 23 `String(snapshot.value)` call sites across 6 files. This normalizes both flat strings and compound XState objects, making the codebase forward-compatible with compound sub-states (Phase 257). Zero behavior change.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 255

- [x] create-resolve-utils — Create `resolve-state-value.ts` in `packages/luca-framework/src/state/__helpers/` with `resolveStateValue()` and `resolveStatePath()`. Export from barrel.
- [x] replace-bridge-callsites — Replace 16 `String(snapshot.value)` calls in `bridge.ts` with `resolveStateValue()` (15 planned + 1 caught by security review)
- [x] replace-machine-callsite — Replace `snapshot.value as string` in `machine.ts` `getAllowedEvents()` with `resolveStateValue()`
- [x] replace-hook-callsites — Replace `String(raw.value)` in `enforcement-hook-factory.ts`, `orchestrator-gate-config.ts`, and `statusline.ts` with `resolveStateValue()`
- [x] update-snapshot-docs — Update JSDoc example in `snapshot.ts` to use `resolveStateValue()`
- [x] extend-pipeline-position — Add `fullStatePath` optional param to `computePipelinePosition()`, extend `PipelinePosition` type with `executing.*` compound positions
- [x] wire-enforcement-factory — Pass `resolveStatePath(raw.value)` as second arg to `computePipelinePosition()` in enforcement hook factory

### Phase 257: Step Enforcement Phase 2 — XState Compound Sub-States — COMPLETE

**Goal:** Add compound sub-states to `executing` in the XState machine (discussing → planning → running → harnessing → verifying → reviewing → learning → committing). The machine structurally enforces step ordering — steps cannot be skipped. Pipeline step IS state, not data.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 256

- [x] add-compound-substates — Replace flat `executing` state in `machine.ts` with compound state containing 8 sub-states. Existing `phaseActor` invoke stays on parent (XState v5 supports invoke + states on same node).
- [x] add-substate-events — Add EXECUTION_COMPLETE, PHASE_VERIFY_PASSED, REVIEW_COMPLETE, PHASE_LEARN_COMPLETE to `workflowEventSchema` in `types.ts`
- [x] update-enforcement-validstates — Update `pre-step-lu.ts` validStates to use compound positions (e.g., `"executing.reviewing"` for review agents)
- [x] update-transition-sync — Update `agent-transition-sync.ts` lu orchestrator block to fire sub-state events on agent completion
- [x] verify-enforcement — Verified by lu-verifier (10/10 criteria) + 4 parallel code reviewers

---

## v9.0.0 — Workflow Pipeline Redesign

Redesign the `/lu` end-to-end pipeline to restore lost capabilities and apply GSD2 learnings. Makes the workflow complete, convergence-aware, and crash-resilient. Eliminates STATE.md, makes classification deterministic, adds lock file crash recovery, introduces token profiles, wires stuck detection into execution loops, adds per-phase drift detection, and implements cross-milestone state reset.

Spec: `docs/research/workflow-redesign/06-final-workflow.md`
Decision log: D1-D15 (binding, see REQUIREMENTS.md)

### Phase 258: Structured State & Deterministic Classification — COMPLETE

**Goal:** The pipeline tracks its own position in structured JSON and classifies task complexity without any LLM call, so every downstream phase can read machine-parseable state and every classification is deterministic and sub-millisecond.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** None
**Requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, CLASS-01, CLASS-02, CLASS-03, CLASS-04, CLASS-05

**Success Criteria:**

1. Running `luca-bridge read-status` returns a complete JSON summary of pipeline state including current step, phase, complexity, profile, and git workflow -- with no STATE.md file anywhere in the repository
2. Running `bun src/complexity/__helpers/classify.ts --description="refactor auth module"` returns a structured `{ complexity, route, score, signals }` JSON in under 100ms with no Agent() calls
3. The routing history file `.planning/routing-history.jsonl` accumulates one entry per completed phase and the adaptive adjuster shifts complexity by at most 1 level based on the last 20 entries
4. All skills and agents that previously read STATE.md now read from `luca-bridge` commands, verified by `grep -r "STATE.md" src/` returning zero matches outside of deletion/migration code

### Phase 259: Pipeline Lock File — COMPLETE

**Goal:** The pipeline prevents concurrent sessions and tracks its exact position at sub-step granularity, so crash recovery has a deterministic resume point instead of requiring LLM interpretation.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 258
**Requirements:** LOCK-01, LOCK-02, LOCK-03

**Success Criteria:**

1. Starting `/lu` creates `.planning/.pipeline-lock.json` containing PID, session ID, and current pipeline/phase step, and this file is updated at every step transition throughout the session
2. Starting a second `/lu` session while one is running prints a warning with the running PID and exits (unless `--force` is passed)
3. Starting `/lu` after a crash detects the stale lock (dead PID or 24-hour staleness), reports it, and allows recovery to proceed

### Phase 260: Token Profiles — COMPLETE

**Goal:** Users can control ceremony depth via a single `--profile` flag, with `balanced` matching current behavior exactly and `budget`/`quality` adjusting model tiers and loop budgets without touching protected steps (discussion, code review, learning).
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 258
**Requirements:** PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06

**Success Criteria:**

1. Running `/lu --profile=budget` demotes all non-protected agent model tiers by one level and halves loop iteration budgets (floor 1), while discussion, all 4 code reviewers, and learning capture continue to run at their standard tiers
2. Running `/lu --profile=quality` promotes all agent model tiers by one level and doubles loop iteration budgets, and v2 research runs the full 4-researcher pipeline with review loop and graduation
3. Running `/lu` without `--profile` uses `balanced` which matches current behavior exactly (zero regression), and the active profile is visible at session start and persisted in state.json

### Phase 261: Structured Verification — COMPLETE

**Goal:** Verification produces machine-readable JSON that the orchestrator and milestone validation can consume without prose parsing, and success criteria have stable IDs that enable convergence tracking across iterations.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 258
**Requirements:** VERIF-01, VERIF-02, VERIF-03, VERIF-04

**Success Criteria:**

1. After phase verification, a `verification-result.json` file exists with structured per-criterion results (criterion_id, met, evidence, gap, blocking) that the orchestrator reads mechanically for pass/fail verdict
2. PLAN.md files contain criterion IDs (SC-1, SC-2, ...) that persist through planning, execution, and verification, enabling the orchestrator to track which specific criteria keep failing across implementation iterations
3. At milestone boundary, running the deterministic milestone validator aggregates all `verification-result.json` files and produces a milestone-level verdict without any LLM call

### Phase 262: Convergence-Aware Stuck Detection — COMPLETE

**Goal:** The harness fix loop and outer implementation loop detect stall patterns (oscillation, permanent errors, semantic drift) and choose intelligent exit strategies instead of exhausting iteration budgets on unresolvable errors.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 261
**Requirements:** STUCK-01, STUCK-02, STUCK-03, STUCK-04, STUCK-05, STUCK-06

**Success Criteria:**

1. When the harness fix loop encounters the same error fingerprints for 2 consecutive iterations, it invokes the stall evaluator which returns one of 4 strategies (halt, context promotion, error focus, rollback) instead of blindly retrying
2. The fix prompt receives only correctable errors (permanent errors are excluded), and includes convergence context from previous iterations so the executor has diagnostic information about what was already tried
3. When the outer implementation loop detects the same verification criteria failing across 2 iterations (80%+ overlap), it invokes stuck detection with verification context and can park the phase with a diagnostic summary
4. Git checkpoint tags are created before each harness fix iteration, and the rollback strategy restores to the checkpoint when selected

### Phase 263: Ceremony Reduction & Per-Wave Execution — COMPLETE

**Goal:** Process data and configure run as mechanical TypeScript (zero LLM tokens), and execution shifts from 1 Agent() per plan to 1 Agent() per wave, ensuring each execution unit fits within one agent context window with overflow detection.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 261
**Requirements:** CEREM-01, CEREM-02, CEREM-03, CEREM-04

**Success Criteria:**

1. After a phase completes, `bun src/process-data/compute.ts` produces aggregated metrics (duration, error rates, convergence stats) in state.json without any Agent() call, and the configure step reads config.json inline with no Agent() call
2. Each wave in PLAN.md gets its own Agent() call with fresh context assembled immediately before dispatch, and the orchestrator reads no more than 2K tokens of context per dispatch preparation
3. If an executor agent detects context exhaustion mid-wave, it outputs OVERFLOW and the orchestrator spawns a fresh Agent() for the remaining tasks in that wave

### Phase 264: Fresh Context Assembly & Task Sizing — COMPLETE

**Goal:** Every agent receives a scoped, fresh context payload appropriate to its tier (Full/Scoped/Minimal), and plans include file count and scope metadata that enables overflow detection and sizing validation.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 263
**Requirements:** CTXT-01, CTXT-02, CTXT-03, SIZE-01, SIZE-02, SIZE-03, SIZE-04

**Success Criteria:**

1. Before each Agent() dispatch, the orchestrator assembles a `PhaseContextPayload` appropriate to the agent's context tier (Full for executor/planner, Scoped for verifier/reviewers, Minimal for harness checker) without exceeding 2K tokens of orchestrator-side reading
2. PLAN.md files contain per-task file count estimates and scope classifications (SMALL/MEDIUM/LARGE), and per-wave total file counts, which the plan reviewer validates against limits (BLOCKER if any task touches 10+ files, wave total must be < 10)
3. The plan review agent evaluates 7 dimensions (the existing 6 plus task sizing), and flags BLOCKERs that trigger plan revision before execution begins

### Phase 265: Per-Phase Drift Detection — COMPLETE

**Goal:** After every phase completes, the pipeline mechanically checks whether the completed work invalidated, blocked, or made redundant any remaining phases, and spawns a reassessment agent only when actual drift is detected.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 264
**Requirements:** DRIFT-01, DRIFT-02, DRIFT-03, DRIFT-04, DRIFT-05

**Success Criteria:**

1. After each phase completes, a mechanical drift check (zero LLM tokens) compares git diff output against file references in remaining phases, detects deleted/renamed modules, and checks dependency graph changes -- with infrastructure files (tsconfig.json, package.json) ignored unless structural changes occurred
2. When drift is detected, the reassessment agent categorizes each remaining phase as VALID, NEEDS_UPDATE, REDUNDANT, or BLOCKED, and the orchestrator applies the appropriate action (skip redundant, update per oversight mode, park blocked) with the execution order rebuilt if needed
3. Drift events are recorded in `session-ledger.jsonl` with affected phase metadata, and a DRIFT_DETECTED bridge transition is emitted

### Phase 266: Deterministic Crash Recovery — COMPLETE

**Goal:** When `/lu` starts after a crash, the recovery module deterministically determines the correct resume point from structured state (lock file, state.json, git status, filesystem) without any LLM interpretation, and the user receives a clear briefing about what happened and where execution resumes.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 259, Phase 262
**Requirements:** RECOV-01, RECOV-02, RECOV-03, RECOV-04

**Success Criteria:**

1. After a simulated crash mid-phase, running `/lu` detects the stale lock, runs `src/recovery/recover.ts`, and produces a RecoveryAction JSON specifying the exact resume point (fresh-start, restart-step, resume-phase, or advance-phase) with a human-readable briefing -- all without any LLM call
2. `luca-bridge recover` returns the structured RecoveryAction JSON, and `luca-bridge lock-status` returns the current lock file contents or "unlocked"
3. Convergence state (error ledger, stale count, checkpoint tags) is persisted so recovery can resume a mid-harness-loop crash without losing convergence context

### Phase 267: Cross-Milestone State Reset — COMPLETE

**Goal:** When a milestone completes and cross-milestone continuation is enabled, the pipeline performs a full state reset (lock, routing history, pipeline position, milestone archive) while preserving session identity, then bootstraps the next milestone from scratch.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 266
**Requirements:** CROSS-01, CROSS-02, CROSS-03

**Success Criteria:**

1. After a milestone completes with cross-milestone enabled, the pipeline releases and re-acquires the lock, clears routing history, resets pipeline position to init, and archives milestone data to `milestones/` -- while preserving session_id and git_workflow in state.json
2. The safety limit of 3 milestones per session is enforced, and the pipeline refuses to start a new milestone if the previous one did not complete cleanly (has parked or failed phases)

### Phase 268: Orchestrator Pipeline Integration — COMPLETE

**Goal:** The `lu.skill.ts` orchestrator is fully rewritten to incorporate all changes from this milestone into a single coherent pipeline, with the oversight gate matrix and budget matrix wired end-to-end.
**Complexity:** CRITICAL
**Verification:** Full
**Depends on:** Phase 260, Phase 263, Phase 264, Phase 265, Phase 266, Phase 267
**Requirements:** ORCH-01, ORCH-02, ORCH-03

**Success Criteria:**

1. Running `/lu` executes the complete redesigned pipeline: deterministic classification, lock file management, profile-aware model selection, per-wave execution with fresh context, structured verification reads, convergence-aware stuck detection, mechanical process data, per-phase drift detection, and deterministic crash recovery -- all matching the spec at `docs/research/workflow-redesign/06-final-workflow.md`
2. The oversight gate matrix correctly varies behavior by oversight mode (full-auto, flagged, milestone, phase) and token profile at each of the 8 decision points (milestone creation, WSJF revision, phase entry, phase gaps, critical review findings, drift detection, milestone boundary, cross-milestone)
3. The budget matrix applies base iteration limits by complexity and profile multipliers correctly, with convergence overrides able to extend loops making progress and shorten loops that are stalled, and task sizing limits enforced independent of profile

---

## Progress

| Phase | Name                                            | Status   | Requirements               |
| ----- | ----------------------------------------------- | -------- | -------------------------- |
| 258   | Structured State & Deterministic Classification | Complete | FOUND-01..05, CLASS-01..05 |
| 259   | Pipeline Lock File                              | Complete | LOCK-01..03                |
| 260   | Token Profiles                                  | Complete | PROF-01..06                |
| 261   | Structured Verification                         | Complete | VERIF-01..04               |
| 262   | Convergence-Aware Stuck Detection               | Complete | STUCK-01..06               |
| 263   | Ceremony Reduction & Per-Wave Execution         | Complete | CEREM-01..04               |
| 264   | Fresh Context Assembly & Task Sizing            | Complete | CTXT-01..03, SIZE-01..04   |
| 265   | Per-Phase Drift Detection                       | Complete | DRIFT-01..05               |
| 266   | Deterministic Crash Recovery                    | Complete | RECOV-01..04               |
| 267   | Cross-Milestone State Reset                     | Complete | CROSS-01..03               |
| 268   | Orchestrator Pipeline Integration               | Complete | ORCH-01..03                |
| 269   | Audit P0: Security & Integration Wiring         | Complete | SEC-001..002, Integration  |
| 270   | Audit P1: Structural & Type Safety Fixes        | Complete | ARCH-01..06, DRY-001..003  |
| 271   | Audit P2-P3: Tech Debt Cleanup                  | Complete | DRY-004+, DX-04+, ARCH-08+ |

---

### Phase 269: Audit P0 — Security & Integration Wiring

**Goal:** Fix the 3 P0 blockers identified in the v9.0.0 audit: shell injection vectors in lu.skill.ts, wire budget matrix CLI into orchestrator, and wire oversight gate evaluator into drift response.
**Complexity:** COMPLEX
**Verification:** Full
**Depends on:** Phase 268

**Fixes:**

- SEC-001: Pass $TASK_DESCRIPTION via env var or stdin, not shell interpolation
- SEC-002: Pass $HISTORY_JSON via env var, not inline bun -e string interpolation
- Integration: Add `bun .../budget-matrix.ts --complexity=$COMPLEXITY --profile=$TOKEN_PROFILE` CLI call to initialize loop budgets
- Integration: Replace drift `OVERSIGHT_LEVEL` raw check with `evaluateOversightGate("drift_detected", $OVERSIGHT_MODE, $TOKEN_PROFILE)`

### Phase 270: Audit P1 — Structural & Type Safety Fixes

**Goal:** Fix structural invariant violations, type name collisions, and consolidate duplicate enums identified in the audit.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 269

**Fixes:**

- ARCH-01: Rename drift `ReassessmentResult` → `DriftReassessmentResult`
- ARCH-02: Move `compute.ts` → `process-data/__helpers/compute.ts`
- ARCH-06: Move result-envelope schemas from `__helpers/` to `__schemas/`
- ARCH-05/DRY-003: Consolidate OversightLevel/OversightMode into single type
- DRY-001/002/006: Consolidate COMPLEXITY_LEVELS, TOKEN_PROFILES exports from package index
- DX-02/DX-11: Replace `.parse({})` with `.safeParse({})` in hot paths
- SEC-006/007: Replace bare `JSON.parse` with `sanitizeJsonParse` in ledger + lock
- ARCH-03: Register 5 new domains in domain-architecture.md tier table

### Phase 271: Audit P2-P3 — Tech Debt Cleanup

**Goal:** Address remaining P2-P3 audit findings: convention normalization, documentation, dead code removal, and DRY extraction.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 270

**Fixes:**

- DX-04: Normalize drift schemas to snake_case
- DX-07: Create .docs.md for process-data and verification domains
- DRY-004/009: Extract CLI boilerplate into runCliHelper() factory
- SEC-003: Lock TOCTOU fix (O_EXCL file creation)
- ARCH-08: Remove superseded lu-process-data agent from registry
- ARCH-09: Fix 5 barrel bypasses in skills/\_\_schemas/states/
- ARCH-11: Export validateMilestone from verification barrel
- DRY-011: Remove stubbed audit-findings no-ops
- DX-05/06/10: JSDoc completeness pass
- DX-01/12: Migrate node:fs to Bun.write where possible
- DRY-007/008: Consolidate meetsThreshold() and MODEL_TIER_TO_MODEL

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
- **v8.5.2** — Statusline HUD & Edit Gate: 5 phases, 13 commits, 60 files changed (+3,082/-1,368 LOC) ([View Archive](milestones/v8.5.2-ROADMAP.md))

---

## v9.1.0 — Studio UI Data Pipeline Fixes

Fix 6 studio UI bugs (S-01 through S-07) discovered during studio review. All bugs cluster around data fetch/display mismatches between MuninnDB data structures and React component field paths across Home, Sessions, and Memory pages.

### Phase 272: Home Page Fixes (S-01, S-02, S-03) — COMPLETE

**Goal:** Fix Home page data display — activity feed event labels, session card summaries, and status card metrics.
**Complexity:** MODERATE
**Verification:** Standard

- [x] fix-activity-event-labels — S-01: Fix field mapping in `use-home-data.ts` and `recent-activity.tsx` so activity items show correct event type labels instead of "Unknown". Verify `EVENT_TYPES` constant in `lib/constants.ts` covers all ledger event types. (@packages/luca-studio/hooks/use-home-data.ts, @packages/luca-studio/components/home/recent-activity.tsx, @packages/luca-studio/lib/constants.ts)
- [x] fix-blank-summaries — S-02: Fix `synthesizeSummary()` in `use-home-data.ts` to correctly extract summary text from ledger entries. Check field paths in `event_data` object against actual ledger JSONL structure. (@packages/luca-studio/hooks/use-home-data.ts, @packages/luca-studio/app/api/ledger/route.ts)
- [x] fix-status-card-dashes — S-03: Fix field paths in `status-card.tsx` to read from correct state structure. Verify paths like `context.current_phase`, `context.complexity`, `context.current_milestone` match actual `/api/state` response. (@packages/luca-studio/components/home/status-card.tsx, @packages/luca-studio/hooks/use-home-data.ts)

### Phase 273: Sessions Page Fixes (S-04, S-05) — COMPLETE

**Goal:** Fix Sessions page — make sessions appear and default to correct vault.
**Complexity:** SIMPLE
**Verification:** Standard
**Depends on:** None

- [x] fix-sessions-empty — S-04: Fix session query in `use-session-explorer.ts` so sessions page displays data. Debug the filter chain: API `type=session` param + client-side `concept.startsWith("session:")` filter. Check actual MuninnDB engram structure against expected format. (@packages/luca-studio/hooks/use-session-explorer.ts, @packages/luca-studio/app/api/muninn/engrams/route.ts)
- [x] fix-default-vault — S-05: Fix vault default in `stores/vault.ts` to read from project config (`.planning/config.json` muninn.vault field) instead of hardcoding "default". Add API route or config endpoint if needed. (@packages/luca-studio/stores/vault.ts, @packages/luca-studio/hooks/use-session-explorer.ts)

### Phase 274: Memory Page Fixes (S-06, S-07) — COMPLETE

**Goal:** Fix Memory page — populate recall metrics and show full timeline history.
**Complexity:** SIMPLE
**Verification:** Standard
**Depends on:** None

- [x] fix-recall-metrics — S-06: Fix recall metrics data pipeline in `use-observations.ts`. Debug metric extraction — check if metric engrams exist in MuninnDB with expected concept patterns ("recall-hit-rate", "recall-precision"). Fix API route and/or extraction logic. (@packages/luca-studio/hooks/use-observations.ts, @packages/luca-studio/app/api/muninn/metrics/route.ts, @packages/luca-studio/components/memory/recall-effectiveness.tsx)
- [x] fix-timeline-history — S-07: Fix timeline to show full history instead of just 1 event. Debug `useCheckpoint()` zone history fetch and `/api/muninn/zone-history` route to return complete history. Fix `buildTimeline()` merge logic if needed. (@packages/luca-studio/hooks/use-checkpoint.ts, @packages/luca-studio/app/api/muninn/zone-history/route.ts, @packages/luca-studio/components/memory/memory-timeline.tsx)

### Phase 275: DRY Consolidation — Zone Parser + Helper Extraction — COMPLETE

**Goal:** Eliminate cross-phase DRY violation by extracting duplicated zone-parsing logic and pure data helpers from "use client" hook into shared lib.
**Complexity:** SIMPLE
**Verification:** Standard
**Depends on:** Phase 274

- [x] extract-zone-parser — Consolidate `parseObservationZone()` from `hooks/use-observations.ts` and `parseZoneContent()` from `app/api/muninn/zone-history/route.ts` into a single shared helper in `lib/muninn-helpers.ts`. The route's version is the superset (zone + usage_percent + checked_at). Import from both sites. (@packages/luca-studio/lib/muninn-helpers.ts, @packages/luca-studio/hooks/use-observations.ts, @packages/luca-studio/app/api/muninn/zone-history/route.ts)
- [x] extract-observation-helpers — Move `deriveHitRateFromObservations()`, `derivePrecisionFromObservations()`, and the `GOOD_ZONES` constant from `hooks/use-observations.ts` to `lib/observation-helpers.ts`. These are pure data transforms with no React dependency. (@packages/luca-studio/lib/observation-helpers.ts, @packages/luca-studio/hooks/use-observations.ts)

### Phase 276: Convention + Hardening Cleanup — COMPLETE

**Goal:** Fix convention violations and low-severity issues found during milestone audit.
**Complexity:** TRIVIAL
**Verification:** Standard
**Depends on:** None

- [x] fix-event-types-casing — Add inline comment to `field_set` key in EVENT_TYPES explaining it mirrors the bridge event name verbatim. (@packages/luca-studio/lib/constants.ts)
- [x] fix-nav-items-deprecation — Check if NAV_ITEMS has consumers. If none, delete the export. If consumers remain, update deprecation target to v10.0.0. (@packages/luca-studio/lib/constants.ts)
- [x] fix-layout-imports — Reorder imports in `layout.tsx`: move `Inter` from next/font/google to external block, move `globals.css` to bottom as side-effect. (@packages/luca-studio/app/layout.tsx)
- [x] fix-enrich-fallback — Add else branch to `enrichWithBridge()` that creates the `context` sub-object when absent, so bridge fields are always merged. (@packages/luca-studio/app/api/state/route.ts)
- [x] fix-exec-to-execfile — Replace `exec("luca-bridge read-status")` with `execFile("luca-bridge", ["read-status"])` to avoid shell spawning. (@packages/luca-studio/app/api/state/route.ts)

---

## v9.2.0 — Platform Cleanup & Install Hygiene

Complete two incomplete migrations: Cursor platform removal (Phase 159 left adapter source code intact) and MuninnDB migration (legacy BRAIN.md/MEMORY.md/WORKING.md still created on every install). Also reduce repo pollution by moving framework reference docs out of the consuming user's project directory.

### Phase 277: Remove Cursor Adapter Remnants — COMPLETE

**Goal:** Delete all remaining Cursor-specific code and references from active source files and templates. Phase 159 removed the `.cursor/` build output but left the adapter source code, registry entries, and hook templates behind.
**Complexity:** SIMPLE
**Verification:** Standard

- [x] delete-cursor-adapter — Remove `src/adapters/cursor/` directory (cursor-adapter.ts, cursor-hook-map.ts, index.ts). (@src/adapters/cursor/)
- [x] clean-adapter-registry — Remove `{ path: ".cursor", adapterName: "cursor" }` from adapter-registry.ts and `cursor: ".cursor"` from adapter-report-cli.ts. Remove `createCursorAdapter` import from register-builtins.ts. (@src/adapters/**helpers/adapter-registry.ts, @src/adapters/**helpers/adapter-report-cli.ts, @src/adapters/\_\_helpers/register-builtins.ts)
- [x] clean-rule-reference — Remove `cursorAdapter` import/reference from module-boundary.rule.ts. (@src/rules/general/module-boundary.rule.ts)
- [x] delete-cursor-hooks-template — Remove `packages/luca-framework/templates/hooks/cursor-hooks.json`. (@packages/luca-framework/templates/hooks/cursor-hooks.json)
- [x] audit-compatibility-validator — Check if `validateCursorOutput` in adapter helpers can be removed. (@src/adapters/\_\_helpers/compatibility-validator.ts)
- [x] verify-clean — Run `grep -ri '\.cursor' src/ packages/luca-framework/templates/` and confirm zero results (excluding .planning/ history).

### Phase 278: Reduce Repo Pollution & Sunset Legacy Memory Files — COMPLETE

**Goal:** Move framework reference docs (references/, templates/, workflows/) from `.planning/` to user-level install path. Sunset BRAIN.md/MEMORY.md/WORKING.md in favor of MuninnDB.
**Complexity:** MODERATE
**Verification:** Standard
**Depends on:** Phase 277

- [x] route-framework-docs — Update `collectTemplateFiles()` in update.ts to route references/, templates/, workflows/ to `~/.claude/luca/` instead of `.planning/`. Update vault-init.ts and files.ts accordingly. (@packages/luca-framework/src/commands/update.ts, @packages/luca-framework/src/utils/files.ts, @packages/luca-framework/src/commands/vault-init.ts)
- [x] update-at-references — Update skill/agent/workflow `@` file references to point to new user-level location instead of `.planning/workflows/` etc. (@packages/luca-framework/templates/framework/)
- [x] stop-creating-legacy-memory — Remove BRAIN.md/MEMORY.md/WORKING.md creation from session-start.sh hook. Remove WORKING.md base template. (@packages/luca-framework/templates/hooks/scripts/session-start.sh, @packages/luca-framework/templates/base/.planning/WORKING.md)
- [x] update-context-monitor — Update context-monitor.sh to stop using WORKING.md/MEMORY.md file size as context proxy. (@packages/luca-framework/templates/hooks/scripts/context-monitor.sh)
- [x] update-session-persist — Update session-persist.sh to stop writing to WORKING.md. (@packages/luca-framework/templates/hooks/scripts/session-persist.sh)
- [x] update-cognitive-preflight — Update cognitive-preflight.md workflow to be MuninnDB-first with no file fallbacks. (@packages/luca-framework/templates/framework/workflows/cognitive-preflight.md)
- [x] update-planning-structure-rule — Remove BRAIN.md/MEMORY.md/WORKING.md from canonical allowlist in planning-structure rule and shadow-scanner schema. (@src/rules/general/planning-structure.rule.ts, @src/shared/\_\_schemas/shadow-scanner.schemas.ts)
- [x] update-manifest — Update manifest system to track new user-level install locations. (@packages/luca-framework/src/commands/update.ts)

### Phase 279: Fix Statusline Staleness During Long-Running Agents — COMPLETE

**Goal:** Fix the statusline HUD showing "idle" during long-running executor agents by increasing the read TTL and adding explicit bus clearing on session end.
**Complexity:** TRIVIAL
**Verification:** Standard

- [x] increase-read-ttl — In `src/shared/__helpers/status-bus.ts`, change `readStatusBus` default `maxAgeMs` from 300_000 (5 min) to 1_800_000 (30 min). Extract both TTL values as named constants (`WRITE_MERGE_TTL_MS`, `READ_STALENESS_TTL_MS`). Fix stale JSDoc that says `(default: 60000)`. (@src/shared/\_\_helpers/status-bus.ts)
- [x] clear-bus-on-session-end — In `src/hooks/scripts/session-persist.ts`, import and call `clearStatusBus()` before exit to prevent stale data bleeding into the next session. (@src/hooks/scripts/session-persist.ts)
- [x] update-comment — In `src/hooks/scripts/skill-status-exit.ts` line 11, change "5-minute" to "30-minute". (@src/hooks/scripts/skill-status-exit.ts)

---

_Roadmap created: 2026-03-16 — v5.0.0 milestone started_
