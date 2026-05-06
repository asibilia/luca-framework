# Code Review — Wave 1

**Date**: 2026-05-05
**Complexity**: CRITICAL
**Review Iteration**: 0 / 2
**Branch**: feat/220-pipeline-phase-artifact-storage (15 commits)
**Verdict**: **ISSUES_FOUND** (2 MUST-FIX, all blocking)

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| AC-1: phaseSlug derived at triage, persisted in luca-state.json | MET | save-triage-results handler (workflow-state.ts:774); deriveSlug + resolveAvailableSlug from phase-paths.ts |
| AC-2: All 6 pipeline phases use phaseSlug | MET | instruction prompts (triage/research/architect/execute/review/finalize.md) updated; tool & state-module code routed via phasePath/phaseDir |
| AC-3: Per-phase artifacts under phases/<slug>/ | MET | dogfood test 12/12 pass — RESEARCH.md, PLAN.md, CONTEXT.md, POSTMORTEM.md, REVIEW-{n}, verification-result.json, CONFIDENCE-JOURNAL.md, SUGGESTED-RULES.md all phase-scoped |
| AC-4: Cross-phase files stay at root | MET | luca-state.json, ROADMAP.md, todos/, JSONL audit logs, .luca-lock.json all root-resolved via phase-paths constants |
| AC-5: Finalize validates cleanup (stragglers gate) | MET | complete-phase emits stragglerWarning (workflow-state.ts ~728); finalize.md step 2.5 documents response |
| AC-6: Migration helper (archive-loose) | MET | workflowState({action:"archive-loose"}) + repoCleanup({action:"archive-loose"}) both delegate to archiveLoose() with lock+slug guards |
| AC-7: Docs updated | MET | AGENTS.md, CLAUDE.md, docs/getting-started.md, docs/troubleshooting.md all describe phase-scoped layout; archive-loose migration documented |
| AC-8: Backward-compat for legacy state | PARTIAL | phaseDir(undefined) falls back to root; lenient detectStragglers when no slug. **Reset-pipeline preserves stale slug — see MUST-FIX-1.** |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 6.3s |
| eslint | skip | n/a |
| bun test | pass (101/101, 251 expects) | 0.1s |

## Code Review Findings

### MUST-FIX (2)

- **[architecture] reset-pipeline silently preserves currentPhaseSlug, breaking session-boundary invariant.** **(RECURRING per MuninnDB `pitfall:reset-must-clear-all-derived-state`)**
  - File: `packages/luca-mastracode/src/tools/workflow-state.ts` ~lines 916-958 (reset-pipeline freshState construction)
  - Why MUST-FIX: After `reset-pipeline`, `currentPhaseSlug` survives. The next `save-triage-results` checks `if (!current.currentPhaseSlug && triage.intent)` — guard short-circuits because the stale slug is still present. New session inherits prior session's `phases/<old-slug>/` dir → silent collision corrupts both runs' artifacts. Same pattern Copilot flagged in `emptyPhaseJustifications` previously (per Muninn).
  - Fix: Add `currentPhaseSlug: undefined` to the explicit-clear list inside the `reset-pipeline` handler's freshState object. Place AFTER `archivePriorRun` runs (so archival can still read the slug) but BEFORE writeLucaState.

- **[security] resolveArtifactPath in claim-verifier passes user-supplied path to `join(phaseDir(slug), p)` without sep/`..` rejection — file-read traversal escapes the phase dir.**
  - File: `packages/luca-mastracode/src/tools/claim-verifier.ts:44`
  - Why MUST-FIX: `phasePath()` rejects `/`, `\`, and `..` in filenames, but `resolveArtifactPath` bypasses `phasePath` and does a raw `join(phaseDir(slug), p)`. A claim-text input like `p = "../../../etc/hosts"` resolves outside the phase dir and `existsSync` can find it — the verifier then reads arbitrary files. Introduced by #220's phase-aware fallback (the pre-#220 code only checked repo root + `planningRoot()` which had narrower attack surface, though still imperfect).
  - Fix: Before falling through to `phaseDir(slug)` and `planningRoot()` lookups, reject path inputs that contain `/`, `\\`, or split into a `..` segment. Mirror `phasePath`'s guard from `phase-paths.ts:177-186`. Concrete patch:
    ```ts
    const segments = p.split(/[\\/]/)
    if (p.includes('/') || p.includes('\\') || segments.some(s => s === '..')) {
      // bail out — only repo-root resolution is safe for path-bearing inputs
      return join(repoRoot, p)
    }
    ```

### SHOULD-FIX (10)

- **[architecture] Three modules hardcode `.planning/` path construction bypassing phase-paths chokepoint.**
  - Files: `packages/luca-mastracode/src/integration/branding.ts:17`, `packages/luca-mastracode/src/state/shadow-scanner.ts:156`, `packages/luca-mastracode/src/modes/triage.ts:38`
  - Fix: Replace `join(process.cwd(), '.planning', 'config.json')` with `CONFIG_PATH()` (or `LOCK_PATH()` for the triage.ts case).

- **[architecture] completePhase doesn't clear currentPhaseSlug — multi-phase ROADMAP intent is ambiguous in JSDoc.**
  - File: `packages/luca-mastracode/src/state/luca-store.ts:67-79`
  - Fix: Add JSDoc clarification: "One slug per triage session; all ROADMAP phases within a single session share this slug."

- **[architecture] phasePath() traversal guard misses `'.'` filename (resolves to dir itself).**
  - File: `packages/luca-mastracode/src/util/phase-paths.ts:176-190`
  - Fix: Add `|| filename === '.'` to rejection condition.

- **[security] deriveSlug concatenates raw regex-matched ticket verbatim — weak coupling between regex contract and phaseDir's safety.**
  - File: `packages/luca-mastracode/src/util/phase-paths.ts:112`
  - Fix: Apply `slugifySegment(ticket.toLowerCase())` to ticket portion OR add post-construction assertion `if (!/^[a-z0-9-]+$/.test(slug)) throw`.

- **[security] currentPhaseSlug read from luca-state.json without re-validation — tampered state file injects arbitrary slug into phaseDir().**
  - File: `packages/luca-mastracode/src/state/luca-store.ts:128-151` (and consumers)
  - Fix: In `readLucaState()` (or a wrapper), re-run `slugifySegment` and clear the field if mismatch. Defense-in-depth.

- **[dx] repoCleanupTool action enum has zero per-value documentation for `archive-loose`.**
  - File: `packages/luca-mastracode/src/tools/repo-cleanup.ts:291`
  - Fix: Expand `.describe()` to explain `archive-loose` preconditions + when to prefer `workflowState` over `repoCleanup`.

- **[dx] phasePath JSDoc documents wrong invariant — claims "ensures parent dir" but example doesn't show side effect.**
  - File: `packages/luca-mastracode/src/util/phase-paths.ts:169-174`
  - Fix: Add side-effect note + cross-reference to `phaseDir`.

- **[dx] repoCleanupTool's `archive-loose` returns `{error}` while workflowStateTool returns `{success:false, error}` — shape mismatch.**
  - File: `packages/luca-mastracode/src/tools/repo-cleanup.ts:473-477`
  - Fix: Normalize `repoCleanupTool` to return `{success: false, error: message}` shape.

- **[dx] Artifact-paths callouts inconsistent across 6 instruction files (triage lists RESEARCH.md prematurely; review omits review-capture-*.md; finalize omits SUGGESTED-RULES.md).**
  - Files: `packages/luca-mastracode/src/instructions/{triage,review,finalize}.md` line 9
  - Fix: Audit each callout against PHASE_WHITELIST_STRICT.

- **[simplification] `ensurePhaseDir` is exported with zero external callers — dead API surface; `PHASE_WHITELIST_LENIENT_EXTRA` is identical to LENIENT branch's effective set.**
  - Files: `packages/luca-mastracode/src/util/phase-paths.ts:155`; `repo-cleanup.ts:89-93`
  - Fix: Unexport `ensurePhaseDir`; delete `PHASE_WHITELIST_LENIENT_EXTRA` and use `PHASE_WHITELIST_STRICT` directly in lenient branch (logic identical).

### NOTE (5)

- **[security] cleanup-fixes.ts apply-fix has pre-existing path-traversal vulnerability** — `applyDelete`/`applyMove` accept arbitrary `filePath`/`targetPath` without containment check. NOT introduced by #220 (file unmodified by this PR), but flagged for follow-up issue. (cleanup-fixes.ts:29-53)

- **[security] confidence-journal.jsonl + session-ledger.jsonl record user intent verbatim** — privacy concern if `.planning/` ever git-committed. Add `.planning/*.jsonl` to default workspace .gitignore template.

- **[architecture] PHASE_WHITELIST_STRICT does not include REVIEW-{n}.md patterns** — instruction prompts reference them as per-phase artifacts; whitelist contract drift is misleading.

- **[dx] Test gap (gitignored `*.test.ts`) is undocumented** — future contributors won't understand why tests disappear from repo on commit.

- **[simplification] archiveLoose + archivePriorRun share ~20 lines of duplicated rename loop** — extract `moveSafely()` helper. Defer.

## MuninnDB Cross-Reference

Recall hits:
- `pitfall:reset-must-clear-all-derived-state` (01KQD9WASNWXBNAFMGZKB3Y0XN) — **direct match** to MUST-FIX-1. Severity elevated.
- `pitfall:archived-run-artifacts-mixed-with-live` (01KQD9WASNSR4ZWKTKJDP6R408) — related; resolved correctly by `resolveRunArtifactDir` reader extension in Wave 2.4.

## Verdict

**ISSUES_FOUND** — 2 MUST-FIX must be resolved before finalize:
1. Clear `currentPhaseSlug` in reset-pipeline freshState.
2. Add path-traversal guard to claim-verifier `resolveArtifactPath`.

Iteration plan:
- Address both MUST-FIX in a single execute iteration (small, surgical changes).
- Optionally address top-3 SHOULD-FIX while there: branding/shadow-scanner/triage hardcoded paths, repoCleanup return-shape normalization, phasePath traversal-guard `'.'` case (5-line fixes each).
- All other SHOULD-FIX + NOTE items can be deferred to follow-up issues.
