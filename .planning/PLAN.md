# Plan: Pipeline Phase Artifact Storage Refactor (#220)

## Objective
Move all session artifacts from `.planning/` root to `.planning/phases/<phaseSlug>/`. Triage derives slug, persists in `luca-state.json`, all 6 phases consume via shared helper. Finalize verifies cleanup. Migration helper for legacy repos.

## Context
Research found 42 files / 177 hardcoded `.planning/<file>` references with no shared helper. Strategy: introduce `util/phase-paths.ts` chokepoint, add `currentPhaseSlug` to state, migrate consumers in topological order. Backward compat via `phasePath(file, undefined) → root`. See CONTEXT.md for decisions.

## Phases

### Phase 1: Foundation — phase-paths helper + state schema

#### Wave 1.1: Helper module (tracer)
- [ ] **Task 1.1.1**: Create `packages/luca-mastracode/src/util/phase-paths.ts` exporting `planningRoot()`, `slugifySegment()`, `parseTicketId()`, `deriveSlug()`, `phaseDir()`, `phasePath()`, plus root constants `STATE_PATH`, `LOCK_PATH`, `ROADMAP_PATH`, `TODOS_ROOT`, `LEDGER_PATH`, `ROUTING_HISTORY_PATH`, `VERIFICATION_HISTORY_PATH`, `CONFIDENCE_JOURNAL_PATH`, `RUNS_ROOT`, `CONFIG_PATH`. Reuse `sanitizeVaultName` semantics inline. **AFK.**
  - Files: `packages/luca-mastracode/src/util/phase-paths.ts` (new)
  - Verification: `bun tsc --noEmit` passes.
- [ ] **Task 1.1.2**: Unit tests `phase-paths.test.ts`: slug derivation w/ ticket ID, w/o ticket ID, sanitization (path traversal `../`, null bytes, unicode), `phaseDir(undefined)` fallback, collision-suffix stability + `mkdir`-EEXIST race semantics, leading/trailing dash trim. ≥12 cases. **AFK.**
  - Files: `packages/luca-mastracode/src/util/phase-paths.test.ts` (new)
  - Verification: `bun test src/util/phase-paths.test.ts` green.

#### Wave 1.2: State schema + triage population
- [ ] **Task 1.2.1**: Add `currentPhaseSlug?: string` to `LucaWorkflowState` (`state/luca-store.ts:51-103`) with JSDoc immutability invariant. **AFK.**
  - Files: `packages/luca-mastracode/src/state/luca-store.ts`
  - Verification: types compile.
- [ ] **Task 1.2.2**: In `tools/workflow-state.ts` `save-triage-results` handler, derive slug via `deriveSlug(intent)`, check collision (suffix `-2/-3` if `phases/<slug>/` exists AND non-empty), persist. **Skip if `currentPhaseSlug` already set** (re-entry idempotency). Note: collision check runs under pipeline lock acquired by triage; use `mkdir`-EEXIST as belt-and-suspenders. **AFK.**
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts`
  - Verification: triage save populates slug; re-running preserves slug; collision creates `-2`.

### Phase 2: Tool & state-module migration to helper

#### Wave 2.1: writePlanningFile auto-routes (writer-layer tracer)
- [ ] **Task 2.1.1**: Update `tools/write-planning-file.ts`: read `currentPhaseSlug` from state at exec; resolve `planningDir = phaseDir(slug)`. Add `scope: "phase" | "root"` parameter (default `"phase"`). Containment check applies to resolved dir. Update tool description. **AFK.**
  - Files: `packages/luca-mastracode/src/tools/write-planning-file.ts`
  - Verification: writes to `phases/<slug>/` when slug present; root when `scope:"root"` or slug absent; `../` rejected.

#### Wave 2.2: State modules migrate (per-phase artifacts)
- [ ] **Task 2.2.1**: Migrate `state/luca-store.ts` (root: STATE_PATH), `state/todos.ts` (root: TODOS_ROOT). Drop hardcoded literals. **AFK.**
  - Files: 2 state files
  - Verification: `! grep -nE "= '\.planning/" packages/luca-mastracode/src/state/{luca-store,todos}.ts`
- [ ] **Task 2.2.2**: Migrate `state/verification-result.ts` (per-phase: `verification-result.json` → `phasePath`; root: `verification-history.jsonl` → `VERIFICATION_HISTORY_PATH`) and `state/confidence-journal.ts` (per-phase: `CONFIDENCE-JOURNAL.md`; root: `confidence-journal.jsonl` → `LEDGER_PATH`-style root constant). **AFK.**
  - Files: 2 state files
  - Verification: `! grep -nE "= '\.planning/"` on these files; lifecycle test (start-phase → wave → complete) writes `verification-result.json` to phase subdir, history JSONL to root.
- [ ] **Task 2.2.3**: Migrate `state/session-ledger.ts`: cross-run JSONL stay at root (`session-ledger.jsonl`, `routing-history.jsonl`). **`archivePriorRun(runId)` archives to `phases/<slug>/runs/<runId>/`** (read slug from state at call time; if slug absent, fallback to root `runs/<runId>/` for legacy). Move `verification-result.json` from `phases/<slug>/` source to archive target. JSDoc the rule. **AFK.**
  - Files: `packages/luca-mastracode/src/state/session-ledger.ts`
  - Verification: archive a run with slug present → files at `phases/<slug>/runs/<runId>/{session-ledger,routing-history,verification-history,confidence-journal}.jsonl + verification-result.json`; archive without slug → root `runs/<runId>/`.

#### Wave 2.3: save-plan-artifacts handler migration
- [ ] **Task 2.3.1**: In `tools/workflow-state.ts` `save-plan-artifacts` handler (line ~728), normalize bare filenames to `phaseDir(slug)` for PLAN.md/CONTEXT.md/RESEARCH.md, but root for ROADMAP.md. Drop hardcoded `.planning/` prefix. **AFK.**
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts`
  - Verification: `save-plan-artifacts` stores `planFile` as `.planning/phases/<slug>/PLAN.md`, `roadmapFile` as `.planning/ROADMAP.md`.

#### Wave 2.4: Per-phase tool migration
- [ ] **Task 2.4.1**: Migrate per-phase tools: `tools/check-convergence.ts`, `tools/confidence-journal.ts`, `tools/run-postmortem.ts`, `tools/run-rules.ts`, `tools/claim-verifier.ts`, `tools/verification-result.ts`. Each reads slug from state, writes via `phasePath()`. **AFK.**
  - Files: 6 tool files
  - Verification: `! grep -nE "= '\.planning/" packages/luca-mastracode/src/tools/{check-convergence,confidence-journal,run-postmortem,run-rules,claim-verifier,verification-result}.ts`.

#### Wave 2.5: Root-tool migration + cleanup recursion
- [ ] **Task 2.5.1**: Migrate root tools: `tools/pipeline-lock.ts` (LOCK_PATH), `tools/manage-todos.ts` (TODOS_ROOT), `tools/manage-roadmap.ts` (ROADMAP_PATH; **also fix node:fs bypass** by routing through writePlanningFile with `scope:"root"`). **AFK.**
  - Files: 3 tool files
  - Verification: `! grep -nE "= '\.planning/" packages/luca-mastracode/src/tools/{pipeline-lock,manage-todos,manage-roadmap}.ts`; manage-roadmap no longer imports `node:fs` write APIs.
- [ ] **Task 2.5.2**: Update `tools/repo-cleanup.ts` `cleanup-artifacts` action: scan `.planning/` AND recurse into `.planning/phases/*/` for capture-file pattern. Verify only — `subagents/shadow-scanner.ts` reads CONFIG_PATH, no path-write changes. **AFK.**
  - Files: `packages/luca-mastracode/src/tools/repo-cleanup.ts`, `packages/luca-mastracode/src/subagents/shadow-scanner.ts`
  - Verification: place capture file under `phases/<slug>/`, `cleanup-artifacts` finds and removes it.

### Phase 3: Finalize stragglers detector + archive-loose migration action

#### Wave 3.1: Stragglers detector
- [ ] **Task 3.1.1**: In `tools/workflow-state.ts`, add finalize-gate scan of `.planning/` root. **Strict whitelist (slug present):** `luca-state.json`, `.luca-lock.json`, `config.json`, `ROADMAP.md`, `todos/`, `phases/`, `*.jsonl`. **Lenient whitelist (slug absent → legacy):** add `runs/`, `CONFIDENCE-JOURNAL.md`, `verification-result.json`. Anything else → block lock release, return file list. **AFK.**
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts` + helper module
  - Verification: artificial `.planning/foo.md` straggler → finalize blocks; clean tree → finalize succeeds; legacy-mode tolerates pre-migration files.

#### Wave 3.2: archive-loose migration action
- [ ] **Task 3.2.1**: Add `workflowState(action: "archive-loose")` handler. Refuses if pipeline lock held by another session. Scans root for stragglers, derives retro-slug from latest state's `currentPhaseSlug` or `<YYYYMMDD-HHmm>-legacy`, creates `phases/<slug>/`, moves files. Returns moved-file list. **AFK.**
  - Files: `packages/luca-mastracode/src/tools/workflow-state.ts`
  - Verification: simulated legacy `.planning/` (loose PLAN/CONTEXT/REVIEW) → after `archive-loose`, files under `phases/<slug>/`; root contains only whitelist + new `phases/`; refuses with active lock.

### Phase 4: Instructions + docs + skills + dogfood

#### Wave 4.1: All instruction prompts
- [ ] **Task 4.1.1**: Update LLM prompts in **all 10 files** under `packages/luca-mastracode/src/instructions/` (`{architect,build,discuss,execute,fast,finalize,plan,research,review,triage}.md`). Replace literal `.planning/RESEARCH.md` etc. with phase-aware language ("your phase artifact directory" or `phases/<slug>/RESEARCH.md`). Cross-phase paths (luca-state.json, ROADMAP.md, config.json) keep root references. **AFK.**
  - Files: 10 instruction `.md` files
  - Verification: `grep -rnE "\.planning/(RESEARCH|PLAN|REVIEW|POSTMORTEM|CONTEXT|CONFIDENCE-JOURNAL|SESSION-ARCHIVE|SUGGESTED-RULES|PR-BODY|PR-DRAFT|verification-wave|shadow-scan-report|research-capture|review-capture|plan-review-capture)" packages/luca-mastracode/src/instructions/` returns zero.

#### Wave 4.2: Repo docs + skills
- [ ] **Task 4.2.1**: Update `AGENTS.md`, `CLAUDE.md`, `docs/getting-started.md`, `docs/troubleshooting.md`, `packages/luca-mastracode/README.md` describing the directory contract: top-level for cross-phase state, `phases/<slug>/` for session artifacts. Add migration note pointing to `archive-loose`. **AFK.**
  - Files: 5 doc files
  - Verification: docs render; references consistent with code.
- [ ] **Task 4.2.2**: Audit ALL skill files under `.mastracode/skills/` (especially `gh-prepare/SKILL.md`, `gh-issue-triage/SKILL.md`). Replace any session-artifact path literal with phase-aware reference; cross-phase paths stay root. **Unconditional pass — no skip.** **AFK.**
  - Files: skill `.md` files (1-5 files)
  - Verification: `grep -rnE "\.planning/(POSTMORTEM|PR-BODY|PR-DRAFT|REVIEW|PLAN|CONTEXT|RESEARCH)" .mastracode/skills/` returns zero.

#### Wave 4.3: Dogfood self-test
- [ ] **Task 4.3.1**: Run pipeline finalize gate against this branch's run. Assert: this PR's session artifacts (PLAN.md, CONTEXT.md, RESEARCH.md, REVIEW-*.md, POSTMORTEM.md) live at `.planning/phases/<slug>/`; root contains only strict whitelist. If layout wrong, fix forward. **AFK.**
  - Files: none — verification only
  - Verification: `ls .planning/` matches strict whitelist; `ls .planning/phases/<slug>/` contains the expected session artifacts; finalize releases lock.

## Verification Criteria
- `bun test` passes (existing + new unit tests)
- `bun tsc --noEmit` clean across all 3 packages
- `bun lint` clean
- Audit: `! grep -rnE "= '\\.planning/" packages/luca-mastracode/src/{tools,state}/` returns zero (no module-level path constants outside phase-paths.ts)
- Dogfood (Task 4.3.1) succeeds

## Risks & Mitigations
- **Diffusion miss** → audit grep in W2.4/2.5 + dogfood (W4.3) + finalize stragglers (W3.1) catch at runtime.
- **Legacy compat** → `phasePath(undefined) → root`; lenient finalize when slug absent.
- **Slug instability** → freeze at first persist (skip if already set); JSDoc invariant; mkdir-EEXIST.
- **Migration during active pipeline** → `archive-loose` checks pipeline lock.
- **Archive semantics** → W2.2.3 explicit: archive moves to `phases/<slug>/runs/<runId>/` when slug present, root `runs/<runId>/` otherwise.
