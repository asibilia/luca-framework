# Code Review — Wave 1

**Date**: 2026-05-07
**Complexity**: COMPLEX
**Review Iteration**: 1 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Schema additivity (BranchTypeRule, BaseRule, RegexSource, branchTypes[], fallback, confirmBaseBeforeCreate) | MET | project-preferences.ts (Wave 1, commit e62adcd93) |
| guardedBranches `.min(1)` | MET | project-preferences.ts schema |
| baseBranch?, prBase? in LucaWorkflowState | MET | luca-store.ts |
| renderTemplate allow-listed | MET | branch-template.ts; throws on unknown var |
| 4 new tool actions | MET | ensure-feature-branch.ts (Wave 2, commit 19d45e1d7) |
| resolve pure / apply mutates | MET | resolveBranching exported; apply git-first then state |
| Tool-manifest per-mode scoping | PARTIAL | architect/build/fast=full; execute/finalize=[status,assert-not-default]; **finalize.md uses consult action which is NOT in manifest** |
| architect.md Step 1 rewrite + G-DX-003 | MET | instructions/architect.md (Wave 3, commit 1faf7acc3) |
| executor pre-commit + finalize pre-push switch to assert-not-default | MET | subagents/executor.ts; instructions/finalize.md |
| PT-12458 regression test (both surfaces) | MET | ensure-feature-branch.test.ts + ensure-feature-branch-actions.test.ts (Wave 4, commit 9d792d0b4) |
| ≥18 new tests | MET | 22 new tests (143 → 165) |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.5s |
| bun-test | pass | 0.4s |
| rule gate | pass | <1s |

## Code Review Findings

### MUST-FIX (4)

- **[architecture]** ARCH-1: `finalize.md` calls `ensureFeatureBranch({ action: "consult" })` but `tool-manifest.ts` only grants finalize `['status', 'assert-not-default']`. The consult action will be rejected at runtime by mode scoping → finalize will fail when reading defaultBranch.
  - File: instructions/finalize.md:344, tool-manifest.ts:228-230
  - Fix: Either (a) add `'consult'` to finalize's manifest entry, or (b) rewrite finalize.md to read base from `state.prBase ?? state.baseBranch ?? 'main'` without consulting the tool. Option (b) is simpler and matches the lazy-fallback chain we want.

- **[security]** SEC-1: `apply` action accepts `resolution.branchName`, `confirmedBase`, `confirmedPrBase` as bare `z.string()` with no character restriction. All flow directly into `execFileSync` git args. Branch ref names like `-c`, `..`, `@{`, names with `\0` can abuse git's own parsing. LLM-controlled resolve→apply can supply `resolution.branchName="-C main"` causing git to execute unintended operations.
  - File: ensure-feature-branch.ts:440-444 (input schema), :685, :740, :752 (git invocations)
  - Fix: Add SAFE_REF_NAME validator (`z.string().min(1).max(128).regex(/^[a-zA-Z0-9._\-\/]+$/)` plus a leading-dash guard). Apply to `resolution.branchName`, `resolution.base`, `resolution.prBase`, `confirmedBase`, `confirmedPrBase` in the apply input schema.

- **[security]** SEC-2: `RegexSource` provides no ReDoS protection. `.max(128)` cap prevents disk consumption but not catastrophic backtracking. `match: "(a+)+"` (6 chars) is well within limits. resolveBranching iterates branchTypes[] in a loop calling `new RegExp(candidate.match).test(input.ticketId)` — crafted ticketId blocks Node event loop.
  - File: project-preferences.ts:40-43
  - Fix: Add a second `.refine()` rejecting nested quantifiers: `/(\+|\*|\{[0-9,]+\}){2,}/.test(v)` returns true → reject. Document constraint in JSDoc: "nested quantifiers prohibited (ReDoS guard)".

- **[simplification]** SIMP-1: `inferredType` ternary in resolveBranching is dead logic — all three branches return `'feat'`.
  - File: ensure-feature-branch.ts:318-319
  - Expression: `role === 'feature' ? 'feat' : role === 'release' || role === 'rc' ? 'feat' : 'feat'` returns `'feat'` unconditionally
  - Silent correctness hazard: caller writing `role: 'release'` expecting `release/...` branch prefix gets `feat/...` with no warning
  - Fix: Decide contract — either `const type = input.type ?? (role === 'release' ? 'release' : role === 'rc' ? 'rc' : 'feat')`, or simplify to `const type = input.type ?? 'feat'` (delete ternary)

### SHOULD-FIX (4)

- **[security]** SEC-3: `ticketId` (bare optional z.string()) flows unsanitized as `{issue}` into renderTemplate; output becomes branch name. Add `.max(64).regex(/^[A-Za-z0-9_\-./]+$/)` to the resolve action's ticketId field.
  - File: ensure-feature-branch.ts:424-429

- **[security]** SEC-5: `intent` field has no length cap. Add `.max(256)`.
  - File: ensure-feature-branch.ts:432-435

- **[simplification]** SIMP-2: `consult` action inlines manual defaults instead of using `DEFAULT_PREFERENCES.branching`. Drift hazard.
  - File: ensure-feature-branch.ts:599-613
  - Fix: `const merged = prefs?.branching ?? { ...DEFAULT_PREFERENCES.branching, defaultBranch: def }`

- **[simplification]** SIMP-3: `ResolvedBaseRule.kindUsed` is a 4-value discriminant used only as `=== 'ask'`. Replace with `isAsk: boolean`.
  - File: ensure-feature-branch.ts:169-171, 350

### NOTE (5)

- DX: needs-confirmation message could be more directive about what to pass next call.
- DX: no CONFIDENCE-JOURNAL.md was created during execution; ambiguities were logged to MuninnDB instead. Suggest improving confidence-journal hygiene.
- SIMP: `notes[]` in ResolveResult is populated but never consumed by callers (debug trace as first-class return).
- SIMP: two slugify implementations coexist (local + slugifySegment); acceptable until create/rename cutover.
- SEC: idempotent already-on-target path with `force=true` produces misleading collision error (minor UX).

## Verdict

ISSUES_FOUND — 4 MUST-FIX (1 ARCH, 2 SEC, 1 SIMP)

### Iteration plan for Wave 2 (re-execute)

1. Fix ARCH-1: rewrite finalize.md to use `state.prBase ?? state.baseBranch ?? 'main'` directly without calling `consult`. (No manifest change needed.)
2. Fix SEC-1: define `SafeRefName` Zod schema in ensure-feature-branch.ts; apply to apply action's branchName/base/prBase/confirmedBase/confirmedPrBase; add leading-dash guard. Add tests for rejection of `-c`, `..@{0}`, and `name with space`.
3. Fix SEC-2: extend RegexSource with nested-quantifier rejection refinement; add JSDoc; add test rejecting `(a+)+`.
4. Fix SIMP-1: collapse inferredType ternary OR add proper role→type mapping. Add test for resolved branchName matching role-derived type prefix (or, if simplified, test that role='release' still produces 'feat/...' and document why).
5. Optional folds: SEC-3 ticketId .max+regex, SEC-5 intent .max(256), SIMP-2 use DEFAULT_PREFERENCES, SIMP-3 isAsk rename — all advisory, low risk.
