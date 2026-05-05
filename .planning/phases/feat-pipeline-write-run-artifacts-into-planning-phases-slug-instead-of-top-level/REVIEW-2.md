# Code Review — Wave 2

**Date**: 2026-05-05
**Complexity**: CRITICAL
**Review Iteration**: 2 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| AC1: phaseSlug derived at triage | MET | workflow-state.ts save-triage-results uses deriveSlug |
| AC2: phaseSlug persisted in luca-state.json | MET | luca-store.ts:69-81 |
| AC3: All 6 pipeline phases use phaseSlug | MET | instructions/*.md updated; tools route via phasePath |
| AC4: Finalize validates cleanup | MET | complete-phase calls detectStragglers; archive-loose action |
| AC5: Migration helper exists | MET | repoCleanup archive-loose + workflowState archive-loose |
| AC6: Docs updated | MET | AGENTS.md, CLAUDE.md, getting-started.md, troubleshooting.md |
| AC7: Iter-1 MUST-FIX-1 (reset-pipeline slug) | MET | workflow-state.ts:966 |
| AC8: Iter-1 MUST-FIX-2 (claim-verifier traversal) | **PARTIAL — see MUST-FIX below** | claim-verifier.ts:49-56 |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.4s |
| eslint | skip | — |
| tests | not run | — |

## Code Review Findings

### MUST-FIX (2)

- **[security]** `resolveArtifactPath` traversal guard is bypassed when the resolved target exists on disk
  - File: `packages/luca-mastracode/src/tools/claim-verifier.ts:38-56`
  - Trace: `p='./../etc/passwd'` → `direct=join(repoRoot, p)` normalizes to `/etc/passwd` → `existsSync('/etc/passwd')=true` → returns BEFORE guard at line 50 → `verifyFile` reads `/etc/passwd`. Iter-1 manual test only verified the fallback branch (where existsSync=false).
  - Fix: Move the guard BEFORE the `existsSync(direct)` fast-path, OR add a post-join containment check: `if (!direct.startsWith(repoRoot + sep) && direct !== repoRoot) return p` (so verifyFile produces ENOENT). Simplest:
    ```ts
    function resolveArtifactPath(repoRoot: string, p: string): string {
        if (isAbsolute(p)) {
            const norm = repoRoot.endsWith(sep) ? repoRoot : repoRoot + sep
            if (!p.startsWith(norm)) return p  // out-of-repo absolute → let verifyFile fail
            return p
        }
        if (p.includes('/') || p.includes('\\') || p === '..') {
            return join(repoRoot, p)  // bypass phase fallback; let existsSync downstream decide
        }
        const direct = join(repoRoot, p)
        if (existsSync(direct)) return direct
        const slug = readLucaState().currentPhaseSlug
        if (slug) {
            const phaseScoped = join(phaseDir(slug), p)
            if (existsSync(phaseScoped)) return phaseScoped
        }
        const planning = join(planningRoot(), p)
        if (existsSync(planning)) return planning
        return direct
    }
    ```

- **[security]** Absolute-path inputs pass through unconstrained on line 39
  - File: `packages/luca-mastracode/src/tools/claim-verifier.ts:39`
  - `if (isAbsolute(p)) return p` — accepts `/etc/passwd`, `/proc/self/environ`, etc. `verifyFile` does raw `readFileSync` with no containment check. Schema is plain `z.string()`.
  - Fix: After `isAbsolute` is true, assert `p.startsWith(repoRoot + sep)`; return `p` regardless (so out-of-repo paths surface ENOENT downstream rather than reading host files).

### SHOULD-FIX (3)

- **[simplification]** claim-verifier guard: `segments` split+some is dead code
  - File: `packages/luca-mastracode/src/tools/claim-verifier.ts:49-56`
  - Collapse to: `if (p.includes('/') || p.includes('\\') || p === '..') return direct`
  - Proof: with no separator present, split returns `[p]` so `some(s => s === '..')` ≡ `p === '..'`. This change folds naturally into the MUST-FIX rewrite.

- **[simplification]** phasePath guard: line 180 `filename.split(...).some(...)` is dead given lines 178–179 + 181
  - File: `packages/luca-mastracode/src/util/phase-paths.ts:180`
  - Delete line 180; rely on `filename === '..'` (line 181) to catch the no-separator `..` case.

- **[dx]** `phasePath` error message inaccurate for `'.'` and `''` inputs
  - File: `packages/luca-mastracode/src/util/phase-paths.ts:185-187`
  - Update message to: `'phasePath filename must be a non-empty bare filename (no path separators, no "." or "..")'`

### NOTE (5)

- **[architecture]** Legacy HarnessSubagent stubs hardcode root paths (executor.ts:9, verifier.ts:20+45, planner.ts:18+27, discussion.ts:40). Pre-existing tech debt; out of #220 scope.
- **[dx]** Wave-1 SHOULD-FIX still unaddressed: archive-loose action enum lacks per-value description (repo-cleanup.ts:291). Was optional.
- **[dx]** Wave-1 SHOULD-FIX still unaddressed: finalize.md Step 2.5 lacks "why workflowState over repoCleanup" rationale. Was optional.
- **[dx]** claim-verifier silent fallthrough on guard trigger is intentional design (security fence). Documented in code comment. Not a regression.
- **[simplification]** All 3 chokepoint cleanup sites (branding.ts, shadow-scanner.ts, modes/triage.ts) have clean imports — no stranded `join`.

## Verdict

**ISSUES_FOUND** — 2 MUST-FIX security regressions in MUST-FIX-2's iter-1 implementation. The traversal guard is sequenced behind an `existsSync` short-circuit that bypasses it for any escape target that exists on disk; absolute-path inputs are also unconstrained.

### Iteration Plan (iter-3 → execute)

1. **Fix claim-verifier traversal guard ordering** (MUST-FIX-A):
   - Move guard above `existsSync(direct)` fast-path, OR add post-join containment check
   - Recommended: rewrite per snippet above (folds in SHOULD-FIX simplification)
2. **Constrain absolute-path passthrough** (MUST-FIX-B):
   - After `isAbsolute(p)`, return `p` regardless but only after asserting it starts with `repoRoot`; otherwise the path is allowed but verifyFile will surface ENOENT (preferred — surfaces the issue without throwing)
3. **Drop dead split logic** in `phase-paths.ts:180` (SHOULD-FIX simplification)
4. **Update phasePath error message** for empty/dot cases (SHOULD-FIX dx)
5. **Manual test matrix**:
   - `p = './../etc/passwd'` → must NOT return `/etc/passwd`
   - `p = '/etc/passwd'` → must NOT read host file
   - `p = '.planning/phases/<slug>/PLAN.md'` (legitimate full path, file exists) → returns direct
   - `p = 'PLAN.md'` (bare basename, file in phaseDir) → returns phase-scoped
   - `p = '..'` → returns join(repoRoot, '..') (no read escape; EISDIR downstream)
6. Run `runChecks(['tsc'])` and 101-test suite.
