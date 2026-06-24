# Code Review — Wave 1

**Date**: 2026-05-04
**Complexity**: SIMPLE
**Review Iteration**: 1 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| ac-01: tsc --noEmit passes clean | MET | tsc exit 0 confirmed by verifier + this review pass |
| ac-02: 72 tests pass | MET | bun test → 72 pass / 0 fail (verifier wave 1) |
| ac-03: install lines < createMastraCode line | MET | launch.ts:198-200 install calls, createMastraCode at :219 |
| ac-04: backward-compatible optional assetsRoot param | MET | install-bundled-assets.ts:35,61,90 — `assetsRoot?: string` with `?? defaultAssetsRoot()` fallback; launch.ts calls all pass 0 args |
| ac-05: smoke tests cover 3 fns + ordering invariant | MET | 7 tests in gitignored `__tests__/install-bundled-assets.test.ts`, 72/72 bun test pass |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.0s |
| eslint | skip | n/a |
| tests | pass (verifier) | 72/72 |

## Code Review Findings

### MUST-FIX (0)

None.

### SHOULD-FIX (3)

- **[architecture]** `installRules()` delete-then-recreate is non-atomic — crash between `rmSync` and `mkdirSync` leaves `.mastracode/rules/` absent
  - File: `packages/luca-mastracode/src/integration/install-bundled-assets.ts:99-102`
  - Fix: write to `<targetDir>.tmp-<pid>` then `renameSync`, or add a doc comment marking the known-acceptable single-caller race

- **[architecture]** I/O exceptions (cpSync/mkdirSync/rmSync) propagate unwrapped to `main()` — EACCES or similar gives a raw Node.js stack trace with no user-actionable message
  - File: `packages/luca-mastracode/src/integration/install-bundled-assets.ts:44-51, 70-77, 99-107`
  - Fix: wrap each function body in try/catch, emit `console.warn('[luca] Failed to install <type>: <err.message>. Check directory permissions.')` and return

- **[architecture]** Ordering invariant expressed only in a prose comment — future refactor could silently reintroduce #212
  - File: `packages/luca-mastracode/src/launch.ts:194-200`
  - Fix: extract three calls into `installBundledAssets()` in `install-bundled-assets.ts` and export; single call site makes invariant cohesive and searchable

### NOTE (9)

- **[architecture]** `loadAlwaysApplyRules()` bundledDir fallback in rules-loader.ts is now dead for the normal production path (installRules always runs first)
- **[architecture]** `defaultAssetsRoot()` called 3× per startup; module-level const would be cleaner
- **[dx]** No committed test file visible in diff (gitignored per repo convention) — reviewer cannot verify ac-05 from diff alone
- **[dx]** EACCES error path produces "Luca startup failed: …" without actionable guidance (same as arch finding, DX angle)
- **[security]** `console.warn` discloses absolute package path — benign for local CLI threat model
- **[security]** `assetsRoot` unsanitised against path traversal — mitigated by zero external input reaching it in production
- **[security]** `rmSync` blast radius bounded to `.mastracode/rules` (hardcoded path)
- **[security]** No TOCTOU guard — single-threaded startup, not exploitable
- **[simplification]** `force: true` inside `installRules` cpSync is logically dead (dir freshly cleared by rmSync); harmless, keeps symmetry with other fns

## Verdict

**CLEAN** — 0 MUST-FIX items.

3 SHOULD-FIX items are advisory (non-atomic rmSync, unwrapped I/O errors, no structural enforcement of ordering). None block correctness for the bug fix in scope. Issue #212 is resolved: install calls confirmed at launch.ts:198-200, before createMastraCode at :219. tsc clean, 72 tests pass.
