# Roadmap

## Overview

**Current Milestone:** v4.5.0 — Platform Simplification & Proactive Intelligence

---

## v4.5.0 — Platform Simplification & Proactive Intelligence

14 phases (158-171), 6 todos. Foundation hardening, platform cleanup, hook modernization, and proactive memory intelligence.

### Phase 158: Remove Complexity Step Skipping

**Goal:** Fix code/rule divergence — ALL workflow steps run at every complexity level. Complexity controls model tier + loop budgets only.

**Depends on:** None

- [x] Remove `"skip"` activation values from complexity matrices in `defaults.ts`
- [x] Simplify guard functions in `guards.ts` to not gate on complexity
- [x] Remove complexity check from pre-mortem gating in `phase-discuss.skill.ts`
- [x] Remove `"skip"` type variant from activation type definition
- [x] Verify with `bunx --bun tsc --noEmit`

**Note:** Exclude `src/hooks/pi-extensions/luca-complexity.ts` — Phase 159 deletes the entire `pi-extensions/` directory.

### Phase 159: Remove Non-Claude Platform Compilation

**Goal:** Remove all Cursor, Pi, and Qwen platform compilation, output directories, adapters, and references. Claude Code becomes the sole target platform.

**Depends on:** Phase 158

- [x] Wave A: Delete `.cursor/`, `.pi/`, `.qwen/` output directories
- [x] Wave A: Delete `src/hooks/adapters/cursor.adapter.ts`, `pi.adapter.ts`, `src/hooks/pi-extensions/`
- [x] Wave B: Remove `toCursorFormat()`/`toPiFormat()` from T2 entity factories (`create-agent.ts`, `create-skill.ts`, `create-rule.ts`)
- [x] Wave C: Remove `toCursorFormat()` from `src/shared/__helpers/format.ts` and `src/shared/index.ts` barrel
- [x] Wave C: Update `src/compilers/__helpers/compile.ts`, `plugin-registry.ts`, `parity.ts`
- [x] Wave D: Update `scripts/build-all.ts`, `scripts/check-drift.ts`
- [x] Wave D: Update adapter-registry, adapter.schemas, hooks barrel
- [x] Wave E: Content grep sweep — update all `src/rules/`, docs, CLAUDE.md, config references to `.cursor/`/`.pi/`
- [x] Verify with `bunx --bun tsc --noEmit` and `bun run check:drift`

### Phase 160: Migrate Hook Implementations to TypeScript

**Goal:** Move all 12 hook script implementations from shell to TypeScript. Shell scripts become thin shims calling `bun <ts-file>`.

**Depends on:** Phase 159

- [x] Create `src/hooks/impl/_lib/` shared utilities (hook-io, bridge, vault, muninn)
- [x] Migrate simple hooks: `post-edit-format`, `post-edit-typecheck`, `snapshot-sync`, `statusline`
- [x] Migrate medium hooks: `pre-commit-gate`, `pre-commit-drift-check`, `context-monitor`, `session-persist`, `session-compact-restore`
- [x] Migrate complex hooks: `session-start`, `context-check-throttled`, `pre-compact-checkpoint`
- [x] Remove `_lib/common.sh` after all hooks migrated
- [x] Manual end-to-end validation of each hook's stdin/stdout contract

### Phase 161: Shadow Tech Debt Cleanup System

**Goal:** Build automated detection of AI-session debris with new scanner agent, cleanup skill, and workflow integration.

**Depends on:** Phase 159

- [x] Create schemas in `src/shared/__schemas/shadow-scanner.schemas.ts` + barrel exports
- [x] Create agent `src/agents/general/lu-shadow-scanner.agent.ts` + registry + model routing
- [x] Create skill `src/skills/general/shadow-cleanup.skill.ts` + registry
- [x] Add `shadow_debt` config section to `.planning/config.json`
- [x] Integrate into `phase-execute.skill.ts` (Step 10.6) and `milestone-complete.skill.ts` (Step 0.7)
- [x] Verify with `bunx --bun tsc --noEmit`

### Phase 162: Proactive Context Management

**Goal:** Implement Mastra-inspired observational memory: continuous session observer, proactive `/clear` prompting, enhanced restore, dynamic compact instructions, and new hook events.

**Depends on:** Phases 160, 161

- [x] Research spike: answer 4 critical questions (can LLM invoke /clear, does PreCompact fire on /clear, systemMessage→MuninnDB reliability, CLAUDE.md re-read on compaction)
- [x] Component 1: Continuous session observer (hybrid hook + prompt layers)
- [x] Component 2: Proactive clear prompting at configurable threshold
- [x] Component 3: Enhanced restore after clear (rich MuninnDB working context)
- [x] Component 4: Dynamic compact instructions (`.planning/.compact-context.md`)
- [x] Component 5: Wire 3 hook events (`user_prompt_submit`, `subagent_stop`, `post_tool_use_failure`; `task_completed` + `teammate_idle` deferred)

### Phase 163: Observer Memory Observability Upgrade

**Goal:** Full `/memory` page redesign surfacing all available MuninnDB data, hook checkpoint data, and memory health metrics. Enhanced compact header bar.

**Depends on:** Phase 162

- [x] Design comprehensive `/memory` page layout (6 sections)
- [x] Add new API routes for phase metrics, memory feedback, health summary, confidence calibration
- [x] Add new API routes for checkpoint data and zone transitions
- [x] Build session status hero section with real-time context gauge
- [x] Build memory health dashboard with coherence subscores
- [x] Build recall effectiveness charts and memory timeline
- [x] Enhance compact header bar with health indicator and checkpoint age

### Phase 164: Audit Gap Closure — Security Hardening & Architecture Cleanup

**Goal:** Fix all findings from v4.5.0 milestone audit: 3 HIGH security (path validation), 4 MEDIUM security (env quoting, schema-first parsing, URL validation, content sanitization), 2 MEDIUM architecture (dead code, naming convention), 3 LOW (Zod parsing, engram ID, symlink), 2 tech debt (stale config, hardcoded vault).

**Depends on:** Phase 163

- [x] Add project-dir boundary validation to `post-edit-format.ts`, `post-edit-typecheck.ts`, `statusline.ts` (3 HIGH)
- [x] Quote env file values in `session-start.ts` + parse session-end marker with Zod (MEDIUM + LOW)
- [x] Replace `readStdinJson()` with Zod `parseHookInput()` in hooks that read specific fields (MEDIUM)
- [x] Validate `MUNINN_DB_URL` is loopback before use in `muninn.ts` (MEDIUM)
- [x] Sanitize note content before systemMessage injection in `context-check-throttled.ts` (MEDIUM)
- [x] Remove dead Cursor fallback branches from `hook-io.ts` (MEDIUM arch)
- [x] Rename `impl/_lib/` to `impl/__helpers/` + update all imports (MEDIUM arch)
- [x] Validate engram ID format before URL interpolation in `muninn-config.ts` (LOW)
- [x] Use `realpathSync` for symlink-safe path validation in `context-monitor.ts` (LOW)
- [x] Remove stale `.cursor`/`.pi` from `SAFE_CLEAN_ROOTS` in `build-utils.ts` (tech debt)
- [x] Replace hardcoded vault name with `resolveVault()` in `context-check-throttled.ts` prompt (tech debt)
- [x] Verify with `bunx --bun tsc --noEmit`

### Phase 165: Hook Contract Validation — End-to-End Verification

**Goal:** Validate all 16 hook implementations end-to-end by feeding mock stdin JSON and verifying stdout JSON + exit codes match the Claude Code hook contract.

**Depends on:** Phase 164

- [x] Create validation script that tests each hook's stdin→stdout contract
- [x] Validate 4 simple hooks: post-edit-format, post-edit-typecheck, snapshot-sync, statusline
- [x] Validate 5 medium hooks: pre-commit-gate, pre-commit-drift-check, context-monitor, session-persist, session-compact-restore
- [x] Validate 3 complex hooks: session-start, context-check-throttled, pre-compact-checkpoint
- [x] Validate 3 new hooks: user-prompt-submit, subagent-stop, post-tool-use-failure
- [x] Verify exit code semantics: exit 0 (allow) and exit 2 (block) for PreToolUse hooks
- [x] Document validated contracts in phase SUMMARY.md

### Phase 166: Fix Observer Memory Page Data Gaps

**Goal:** Fix 3 issues preventing data from displaying on the observer /memory page: path resolution bugs in 2 API routes, checkpoint route reading wrong file, and missing observation/metric MuninnDB writers.

**Depends on:** Phase 165

- [x] Fix path resolution in `/api/muninn/checkpoint` and `/api/muninn/zone-history` routes (apply `findProjectRoot()` pattern)
- [x] Fix checkpoint route to read `.context-metrics.json` for live session data instead of `.context-checkpoint.json`
- [x] Wire observation writes from `context-check-throttled.ts` to produce `session:observation-*` MuninnDB engrams that the observations route expects
- [x] Improve recall effectiveness empty state messaging
- [x] Verify with `bunx --bun tsc --noEmit`

### Phase 167: Hooks Directory Consolidation

**Goal:** Consolidate the layered hooks directory structure (impl/, adapters/, thin shims) into a single source of truth with auto-generated shell wrappers following domain architecture conventions.

**Depends on:** Phase 166

- [x] Move 15 TS implementations from `impl/` to `scripts/` (alongside their current .sh shims)
- [x] Move runtime helpers from `impl/__helpers/` to `hooks/__helpers/` (bridge.ts, vault.ts, muninn.ts, hook-io.ts)
- [x] Move adapter schemas to `__schemas/adapter.schemas.ts`, runtime logic to `__helpers/`
- [x] Create `generate-shell-wrappers.ts` build helper that auto-generates `.sh` wrappers from registry
- [x] Update `build-shared.ts` to use new generator instead of copying .sh files
- [x] Delete all manual `.sh` shims, `impl/`, and `adapters/` directories
- [x] Deduplicate `CLAUDE_EVENT_MAP` (exists in both platform-adapters.ts and claude.adapter.ts)
- [x] Update barrel (`hooks/index.ts`) and all internal imports
- [x] Update hook-registry.ts script fields from .sh to .ts
- [x] Verify with `bunx --bun tsc --noEmit`

### Phase 168: Hook I/O & Security Fixes

**Goal:** Fix the emitResult correctness bug, add missing security validations, fix import ordering, and replace require() with ESM imports. Addresses HOOK-001, HOOK-002, HOOK-005, SEC-01 through SEC-08.

**Depends on:** Phase 167

- [x] Fix emitResult: emit followupMessage as distinct key, not overwriting systemMessage (HOOK-001/SEC-05, CRITICAL)
- [x] Fix import ordering: move imports above const/schema declarations in session-start, pre-compact-checkpoint, subagent-stop (HOOK-002, CRITICAL)
- [x] Replace require("fs") with ESM imports in hook-io.ts guardDedup + session-start.ts (HOOK-005/SEC-04, HIGH)
- [x] Add MUNINN_DB_URL loopback validation to observer muninn-config.ts (SEC-01, HIGH)
- [x] Escape single-quotes in LUCA_PLANNING_DIR env export in session-start.ts (SEC-03, MEDIUM)
- [x] Return parsed.data instead of raw data in muninn-route-helper.ts on schema failure (SEC-02, MEDIUM)
- [x] Add Zod input schema to post-tool-use-failure.ts (SEC-08, LOW)
- [x] Apply ContextMetricsSchema.safeParse in zone-history route before field access (SEC-06, LOW)
- [x] Extend note sanitizer regex to include ESC (0x1B) in context-check-throttled.ts (SEC-07, LOW)
- [x] Fix PlatformHookConfig barrel export: re-export from \_\_schemas/ directly in index.ts (ARCH-003, LOW)
- [x] Verify with `bunx --bun tsc --noEmit`

### Phase 169: Hook DRY & Consistency Cleanup

**Goal:** Extract duplicated utilities, fix consistency patterns across all 15 hook implementations. Addresses HOOK-003, HOOK-004, HOOK-006 through HOOK-009, SCHEMA-001.

**Depends on:** Phase 168

- [x] Extract isCommitCommand() to \_\_helpers/commit-utils.ts, import in pre-commit-gate + pre-commit-drift-check (HOOK-003, HIGH)
- [x] Extract collectGitContext() helper from context-check-throttled.ts (HOOK-004, HIGH)
- [x] Extract checkThrottle/recordThrottle helpers to hook-io.ts (HOOK-008, MEDIUM)
- [x] Extract buildRestoreMessage() from session-start.ts main() (HOOK-006, MEDIUM)
- [x] Add guardDedup to subagent-stop.ts; document throttle strategy for post-tool-use-failure + user-prompt-submit (HOOK-007, MEDIUM)
- [x] Remove manual stdout.write workarounds now that emitResult is fixed (HOOK-009, MEDIUM)
- [x] Add defaults to ShadowScanReportSchema scanned_at + categories_scanned (SCHEMA-001, MEDIUM)
- [x] Rename skill-dependencies.ts → skill-dependencies.schemas.ts (ARCH-002, LOW)
- [x] Verify with `bunx --bun tsc --noEmit`

### Phase 170: Observer Component DRY Cleanup

**Goal:** Extract duplicated utility functions and fix component pattern inconsistencies across the 6 memory page sections. Addresses OBS-001 through OBS-005.

**Depends on:** Phase 168

- [x] Extract zoneColor() to lib/format.ts, import in session-status-hero + memory-timeline (OBS-001, HIGH)
- [x] Extract formatAge() to lib/format.ts with consistent null handling, import in session-status-hero + memory-health-indicator (OBS-002, HIGH)
- [x] Extract coherenceColor/scoreColor() to lib/format.ts, import in health-dashboard + context-usage-bar + recall-effectiveness (OBS-003, HIGH)
- [x] Export BrainEngram from brain-panel.tsx, import in enhanced-brain-tree.tsx (OBS-004, MEDIUM)
- [x] Refactor KnowledgeGraphMini to accept props like other 5 sections, lift fetch to page level (OBS-005, MEDIUM)
- [x] Verify with `bunx --bun tsc --noEmit`

### Phase 171: Hook Path Fix & MuninnDB Context Recall

**Goal:** Fix shell wrapper path resolution (broken in global deploy), fix context-monitor JSON validation error, add generated-file protection rule, and introduce MuninnDB context recall hook that injects relevant memories into conversation context on every prompt.

**Depends on:** Phase 170

- [x] Fix `generate-shell-wrappers.ts` to use `$CLAUDE_PROJECT_DIR` instead of `$(dirname "$0")/../../` — fixes Module not found in `~/.claude/hooks/`
- [x] Fix `context-monitor.ts` to remove invalid `hookSpecificOutput` for Stop hooks — fixes JSON validation error
- [x] Add `generated-file-guard.rule.ts` — rule preventing direct edits to generated `.sh` files
- [x] Create `muninn-context-recall.ts` UserPromptSubmit hook — recalls relevant MuninnDB memories and injects as `additionalContext`
- [x] Register new hook in `hook-registry.ts` and `deploy-global.ts`
- [x] Verify with `bunx --bun tsc --noEmit`

---

## Closed (v4.4.0 Completed)

| Todo | Reason                                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #75  | Smart Context Management: 7 phases, 23 commits, 74 files (+6,756 LOC). Hook schema expansion (18 events), PreCompact checkpoint, context metrics, session restore, /context-restore skill, observer context window bar |

## Closed (v4.3.0 Completed)

| Todo | Reason                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #73  | Observer Workflow Editor: 7 phases, 35 commits, 79 files (+7,963 LOC). React Flow v12, stage-group containers, custom nodes, complexity filter, grouped column layout, Zod safeParse, ARIA accessibility |

---

## v5.0.0 — Plugin Ecosystem

| Items | Title                                      | Effort            |
| ----- | ------------------------------------------ | ----------------- |
| #17   | Plugin Marketplace with Community Registry | CRITICAL (40-60h) |

Deferred by design. Intelligence moat and process maturity must exist before ecosystem makes sense.

---

## Backlog (Unassigned)

| Todo | Title                | Target           | Reason                                                              |
| ---- | -------------------- | ---------------- | ------------------------------------------------------------------- |
| #37  | Test suite fragility | Dedicated effort | Testing reintroduction per `.planning/notes/0-reintroduce-tests.md` |

---

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

---

_Roadmap updated: 2026-03-14 (v4.4.0 milestone archived)_
