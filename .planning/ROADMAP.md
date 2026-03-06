# Roadmap

## Overview

**Current Milestone:** v2.9.0 — Audit Gap Closure & Test Reliability

---

## v2.9.0 — Audit Gap Closure & Test Reliability

### Phase 122: SpacetimeDB Reducer Hardening (from v2.8.0 audit)

**Goal:** Add server-side input validation and index usage to SpacetimeDB audit finding reducers.

- [x] Add server-side enum validation for severity field in append_audit_finding reducer (audit #1)
- [x] Add server-side enum validation for status field in update_finding_status reducer (audit #2)
- [x] Replace full table scan with index lookup in bulk_dismiss_findings + document single-user authz assumption (audit #3)
- [x] Add defense-in-depth escaping for severity filter in SQL queries (audit LOW)
- [x] Add length cap on resolutionNotes parameter (audit LOW)

### Phase 123: v2.8.0 DRY & Convention Cleanup (from v2.8.0 audit)

**Goal:** Close DRY violations, fix barrel imports, and align conventions identified by milestone audit.

- [x] Extract shared SQL sanitization utility from audit-findings.ts + ledger.ts (audit #4)
- [x] Extract createEmptySummary factory — deduplicate emptySummary construction (audit #5)
- [x] Extract updateFindingStatus helper from twin markFindingResolved/markFindingDismissed (audit #6)
- [x] Derive severityOrder from FINDING_SEVERITIES instead of hardcoded map (audit #7)
- [x] Fix barrel-first imports in eval-skills.ts and skill-eval.test.ts (audit #8)
- [x] Replace Array.sort() with lodash orderBy in audit-findings.ts (audit #9)
- [x] Fix snake_case in internal EvalEntry/EvalSummary types to camelCase (audit #10)
- [x] Export SkillConfigSchema from src/skills/index.ts barrel (audit LOW)
- [x] Truncate echoed value in validateFilterString error message (audit LOW)

### Phase 124: Test Suite Isolation Fix (#37)

**Goal:** Root-cause and fix the 29-test full-suite module resolution failure so `bun test` passes reliably.

- [x] Root-cause module resolution issue causing 29 tests to fail in full suite
- [x] Fix the resolution so all tests pass in both individual and full-suite runs
- [x] Remove the known-issue caveat from CLAUDE.md once fixed
- [x] Add `bun run test:all` script that validates the full suite

### Phase 125: Complete node:fs to Bun Migration (#63) — CLOSED

**Result:** Audit found 9 files with `node:fs` imports, all using APIs with no Bun equivalent (`mkdir`, `rm`, `cp`, `chmod`, `readdir`, `copyFile`, `appendFile`, `unlink`). Migration is already complete where possible. Remaining imports are justified.

- [x] Identify all remaining `node:fs` and `node:fs/promises` imports (9 files, all justified)
- [x] Verify no readFile/writeFile remain (confirmed — already migrated to Bun.file/Bun.write)
- [x] Confirm `existsSync` is Bun-re-exported (no migration needed)
- [x] Document: `appendFile` in ledger.ts has explicit comment explaining no Bun equivalent

### Phase 126: Observer Dashboard Polish

**Goal:** Improve observer dashboard UI/UX and reliability

- [x] Replace inline loading states with LoadingSkeleton component (#40)
- [x] Add React error boundaries to observer dashboard pages (#41)
- [x] Add missing empty states to observer pages (#49)
- [x] Add todo tracking to observer dashboard (#64)
- [x] Accessibility pass on observer dashboard (#47)

### Phase 127: SpacetimeDB Data Integrity (NEW)

**Goal:** Fix data integrity issues in SpacetimeDB

- [x] Implement TTL cleanup for high-volume SpacetimeDB tables (#42)
- [x] Fix sequence number race condition in ledger (#43)
- [x] Add unique constraints to singleton SpacetimeDB tables (#48)

### Phase 128: Bridge & Build DX (NEW)

**Goal:** Fix documentation and build system issues

- [x] Fix bridge CLI documentation (14 vs 15 subcommands) (#45)
- [x] Deduplicate sanitizeJsonParse (3 copies in codebase) (#46)
- [x] Document observability domain in architecture docs (#50)
- [x] Add automatic stale session lock cleanup to build system (#51)
- [x] Align context pruning with domain architecture (#59)
- [x] Verify harness-aware update command template collection (#60)
- [x] Harden dual-write with divergence detection (#62)

### Phase 129: Agent System Improvements (NEW)

**Goal:** Improve agent reliability and orchestration

- [x] Define missing `shouldRunDiscussion` guard in XState machine (#34)
- [x] Add timeout/auto-transition to phase actor idle state (#35)
- [x] Enforce complexity gating matrix in XState guards (#44)
- [x] Add agent health check system (#52)
- [x] Add stall detection and retry limits to verification loop (#53)
- [ ] Implement skill dependency graph (#54)
- [ ] Enhance tribunal debate with consensus model (#55)

### Phase 130: Learning & Cross-Session Features (NEW)

**Goal:** Implement advanced learning and cross-project memory

- [x] Cross-session procedure replay engine (#12)
- [x] Adaptive complexity self-tuning (#13)
- [x] Portable cognitive profiles (cross-project memory) (#14)
- [x] Reflective meta-cognition for plan quality (#15)
- [x] Cross-agent interop scanner (#16)
- [x] Semantic memory embeddings with vector recall (#18)
- [x] Selective skill scaffolding (core vs extended) (#23)

### Phase 131: Ecosystem & Distribution (NEW)

**Goal:** Build out ecosystem features

- [x] Hook portability abstraction layer (#09)
- [x] Plugin marketplace with community registry (#17)
- [x] Post-init interactive tour (#20)

### Phase 132: Replace Complexity Gating with Model Routing (NEW)

**Goal:** Replace complexity-based step skipping with per-agent model routing

- [x] Audit all complexity reads for step-skipping behavior
- [x] Add modelTier field to agent definitions
- [x] Replace skip/run matrix with model-routing table
- [ ] Create granular sub-agents for different model tiers
- [ ] Remove or repurpose complexity matrix

### Phase 133: Additional v2.9.0 Audit Remediation (NEW)

**Goal:** Close remaining gaps identified in v2.8.0 done-todo audit

- [x] Rename SpacetimeDB memory fields from *Json to *Md (#65)
- [x] Evaluate normalizing JSON blob fields in SpacetimeDB schema (#56)

---

## Backlog (Future)

### Remaining Audit Remediation (from repo review audit, 2026-03-04)

_P1 — Agentic:_

- Define missing `shouldRunDiscussion` guard in XState machine (#34)
- Add timeout/auto-transition to phase actor idle state (#35)

_P1 — DX:_

- Document and fix test suite fragility — 29 tests fail in full run (#37)

_P2 — UI:_

- Standardize loading states with LoadingSkeleton component (#40)
- Add React error boundaries to observer dashboard pages (#41)
- Accessibility pass on observer dashboard (#47)
- Add missing empty states to observer pages (#49)
- Add todo tracking to observer dashboard (#64)

_P2 — Data:_

- Implement TTL cleanup for high-volume SpacetimeDB tables (#42)
- Fix sequence number race condition in ledger (#43)
- Add unique constraints to singleton SpacetimeDB tables (#48)

_P2 — DX:_

- Fix bridge CLI documentation — 14 vs 15 subcommands (#45)
- Deduplicate sanitizeJsonParse — 3 copies in codebase (#46)
- Document observability domain in architecture docs (#50)
- Add automatic stale session lock cleanup to build system (#51)
- Align context pruning domain placement (#59 — may close "by design")
- Verify harness-aware update template collection (#60 — verification only)
- Evaluate dual-write divergence detection (#62 — may close "by design")

_P2 — Agentic:_

- Enforce complexity gating matrix in XState guards (#44)
- Add agent health check system (#52)
- Add stall detection and retry limits to verification loop (#53)

_P3 — Agentic:_

- Implement skill dependency graph (#54)
- Enhance tribunal debate with consensus model (#55)
- Hook portability abstraction layer (#09)
- Replace complexity gating with per-agent model routing (architectural)

_P3 — Data:_

- Evaluate normalizing JSON blob fields in SpacetimeDB schema (#56)

_P3 — DX:_

- Post-init interactive tour (#20)

**Ecosystem & Learning:**

- Cross-session procedure replay engine (#12)
- Adaptive complexity self-tuning (#13)
- Reflective meta-cognition for plan quality (#15)
- Portable cognitive profiles / cross-project memory (#14)
- Cross-agent interop scanner (#16)
- Plugin marketplace with community registry (#17)
- Semantic memory embeddings with vector recall (#18)
- Selective skill scaffolding (#23)

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
- **v2.1.0** — Pi Library Integration: 7 phases, 22 plans, 2106 tests. Pi as first-class output target with 12 TypeScript extensions, 39 tools, 3-platform compilation, input sanitization, shared helpers ([View Archive](milestones/v2.1.0-ROADMAP.md))
- **v2.2.0** — Pi Platform Maturity: 4 phases, 10 plans, 2271 tests. DRY cleanup, E2E runtime validation, background subagent spawning, Pi API learnings — 15 extensions, 49 tools ([View Archive](milestones/v2.2.0-ROADMAP.md))
- **v2.3.0** — Distribution & Model Routing: 7 phases, 7 plans, 2315 tests. npm package distribution with multi-harness scaffolding, ModelTierSchema with per-agent model routing, 5-step resolve chain ([View Archive](milestones/v2.3.0-ROADMAP.md))
- **v2.4.0** — Pi Platform Completion: 3 phases, 3 plans, 2411 tests. Runtime model routing via pi.setModel(), interactive dialogs & keyboard shortcuts, AbortSignal tool resilience, session lifecycle handling, agent role content refresh ([View Archive](milestones/v2.4.0-ROADMAP.md))
- **v2.5.0** — Operational Intelligence & Distribution Hardening: 6 phases, 6 plans, 2694 tests. Real token accounting, context pruning, semantic convergence, role-based model routing, distribution blockers, CLI/DX foundation, observability scorecard, compiler plugin registry ([View Archive](milestones/v2.5.0-ROADMAP.md))
- **v2.5.1** — Code Health & Test Reliability: 2 phases, 4 plans, 52 files changed. State domain type safety, 5 barrels purified, 134 context tests added, security hardening ([View Archive](milestones/v2.5.1-ROADMAP.md))
- **v2.6.0** — Code Health, Context Intelligence & Debate Architecture: 6 phases, 17 plans, 60 commits, 250 files changed, 3109 tests. Test isolation fix, JSON-first memory bridge, directory-scoped rules, pre-flight hydration, 7 debate/tribunal patterns (Design Tribunal, Verification Tribunal, Root Cause Tribunal, milestone audit debate, PR split verdict, stall-vs-retry, ground truth metrics) ([View Archive](milestones/v2.6.0-ROADMAP.md))
- **v2.6.1** — Audit Gap Closure: 2 phases, 9 requirements, 95 files changed, 3146 tests. Tribunal architecture extraction to shared, entity isolation fix, DRY cleanup, Bun API migration, sanitizeForTemplate, lodash alignment, safeParse conversion ([View Archive](milestones/v2.6.1-ROADMAP.md))
- **v2.6.2** — Convention & DRY Cleanup: 2 phases, 6 plans, 85 files changed, 3150 tests. Barrel import fixes, convention alignment (orderBy, safeParse, sanitize hardening, node:crypto), DRY extraction (countResolutions, safeParseOrThrow, diagnostic prompt factory, groupBy migration) ([View Archive](milestones/v2.6.2-ROADMAP.md))
- **v2.7.0** — Observability & Verification Infrastructure: 21 phases, 54 plans, 205 commits, 210 files changed, 3477 tests. luca-observer web dashboard (10+ pages), SpacetimeDB real-time infrastructure (16 tables, 19 reducers), event ledger + verification pipeline, security hardening (SSRF, CSP, API auth, SQL injection), DRY consolidation (useFilteredTable, readWithFallback, safeJsonParse, EmptyState), hook portability (3-platform) ([View Archive](milestones/v2.7.0-ROADMAP.md))
- **v2.8.0** — Critical Remediation, Audit Persistence & Skill Eval: 3 phases, 5 commits, 27 files changed, 3514 tests. P0 triage & dual-write hardening, SpacetimeDB audit findings persistence (15-col table, 3 reducers, 6 helpers), skill eval framework (SkillEvalSchema, 9 evals, runner script) ([View Archive](milestones/v2.8.0-ROADMAP.md))

---

_Roadmap updated: 2026-03-05 (v2.9.0 milestone created, 9 unplanned todos integrated, #61 merged into #37)_
