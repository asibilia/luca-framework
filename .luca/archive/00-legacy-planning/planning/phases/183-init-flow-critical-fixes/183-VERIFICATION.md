---
phase: 183-init-flow-critical-fixes
verified: 2026-03-17T20:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 183: Init Flow Critical Fixes Verification Report

**Phase Goal:** Fix the two P0 bugs: MuninnDB download URL 404 and vault:init deploying harness to wrong directory in global mode.
**Verified:** 2026-03-17
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                  | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MuninnDB download URL resolves to a valid GitHub release URL (not 404) | VERIFIED | `resolveLatestReleaseTag()` added (lines 78-115 of muninndb-download.ts) queries GitHub API for real tag. `downloadMuninndbBinary()` calls it when version is "latest" (line 371), uses resolved tag to build valid URL via `buildDownloadUrl()`. Redirect fallback at line 383-397 uses `/releases/latest/download/` pattern if API fails.                                                                                                                                                        |
| 2   | Downloaded MuninnDB binary is verified (exists, non-empty, executable) | VERIFIED | File-size > 0 check at lines 439-455 of muninndb-download.ts. Empty binary (0 bytes) triggers cleanup via `unlinkSync()` and returns failure result. Executable permissions set via `chmod 755` at line 436. Checksum verification via SHA-256 sidecar at lines 458-503.                                                                                                                                                                                                                           |
| 3   | MuninnDB health endpoint is checked before prompting for API key       | VERIFIED | `runVaultWizard()` in vault-setup.ts (lines 153-163) calls `checkMuninndbService()` before any prompts. Returns null with warning if unhealthy. `init.ts` (lines 642-648) uses `muninndbHealthy` variable to skip vault:init entirely when MuninnDB is not running. Post-init readout at lines 717-719 distinguishes health-gated skip.                                                                                                                                                            |
| 4   | vault:init detects global vs dev mode and skips harness in global mode | VERIFIED | vault-init.ts imports `detectRuntimeContext` (line 7), calls it at line 133, derives `isGlobalMode` at line 134. Passes `planningOnly: isGlobalMode` to `generateFiles()` at line 209. `generateFiles()` in files.ts accepts `planningOnly` option (line 149), skips harness directory creation (line 181), filters base templates to `.planning/` only (lines 221-225), and returns early at line 267 with planning-only stats. Info log at lines 204-207 tells user about global mode detection. |

**Score:** 4/4 truths verified

### Specification Anchoring

**Plan-Objective <-> Must-Have Traceability:**

| Plan | Objective                                                                   | Traced Must-Haves | Status  |
| ---- | --------------------------------------------------------------------------- | ----------------- | ------- |
| 01   | Fix MuninnDB download URL 404 (REQ-01) and add binary verification (REQ-02) | Truth 1, Truth 2  | Covered |
| 02   | Detect global mode in vault:init and skip harness generation (REQ-04)       | Truth 4           | Covered |
| 03   | Add health gate before vault setup (REQ-03)                                 | Truth 3           | Covered |

**Untraced Must-Haves:** None
**Uncovered Objectives:** None

### Required Artifacts

| Artifact                                                 | Expected                                          | Status   | Details                                                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/luca-framework/src/utils/muninndb-download.ts` | resolveLatestReleaseTag + binary verification     | VERIFIED | 524 lines. Function at lines 78-115 with module cache, GitHub API call with timeout, error handling. Binary size check at lines 439-455. Redirect fallback at 383-397.                                      |
| `packages/luca-framework/src/commands/vault-init.ts`     | Global mode detection + planningOnly pass-through | VERIFIED | 325 lines. Imports detectRuntimeContext, checks mode at line 134, passes planningOnly at line 209, logs global mode info at 204-207.                                                                        |
| `packages/luca-framework/src/utils/vault-setup.ts`       | Health pre-check in runVaultWizard                | VERIFIED | 401 lines. Health gate at lines 153-163 via checkMuninndbService(). Returns null with warning messages if unhealthy.                                                                                        |
| `packages/luca-framework/src/commands/init.ts`           | Health gate using muninndbHealthy variable        | VERIFIED | 756 lines. muninndbHealthy tracked at line 518, set true at line 592. Condition at line 642 skips vault:init when MuninnDB not healthy. Post-init readout distinguishes health-gated skip at lines 717-719. |
| `packages/luca-framework/src/utils/files.ts`             | planningOnly option with early return             | VERIFIED | Function signature at line 149. Directory creation gated at line 181. Template filter at lines 221-225. Early return at line 267.                                                                           |

### Key Link Verification

| From                  | To                              | Via                              | Status | Details                                                                   |
| --------------------- | ------------------------------- | -------------------------------- | ------ | ------------------------------------------------------------------------- |
| vault-init.ts         | detectRuntimeContext()          | import + call at line 133        | WIRED  | Import at line 7, result used to derive isGlobalMode at line 134          |
| vault-init.ts         | generateFiles({ planningOnly }) | function call at line 209        | WIRED  | isGlobalMode passed as planningOnly, result checked at line 211           |
| files.ts planningOnly | directory creation skip         | conditional at line 181          | WIRED  | `if (!options.planningOnly)` gates all harness directory creation         |
| files.ts planningOnly | template filter                 | filter function at lines 221-225 | WIRED  | Only `.planning/` prefixed files are copied                               |
| files.ts planningOnly | early return                    | return at line 267               | WIRED  | Skips all harness steps (stack templates, agents, skills, rules, hooks)   |
| muninndb-download.ts  | resolveLatestReleaseTag         | call at line 371                 | WIRED  | Called within downloadMuninndbBinary when version is "latest"             |
| muninndb-download.ts  | binary size check               | Bun.file().size at line 440      | WIRED  | After write + chmod, checks fileSize === 0, cleans up and returns failure |
| vault-setup.ts        | checkMuninndbService()          | call at line 154                 | WIRED  | Import at line 35, result checked at line 155, returns null if unhealthy  |
| init.ts               | muninndbHealthy gate            | conditional at line 642          | WIRED  | Variable set at line 592 after startMuninndb(), checked before vault:init |

### Requirements Coverage

| Requirement                                                                    | Status    | Evidence                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-01: MuninnDB download URL must use correct GitHub release URL pattern      | SATISFIED | resolveLatestReleaseTag() resolves "latest" to concrete tag via GitHub API. buildDownloadUrl() JSDoc updated to warn against passing "latest" directly. Redirect fallback handles API failure gracefully. |
| REQ-02: MuninnDB binary must be verified (exists, executable) after download   | SATISFIED | File-size > 0 check at lines 439-455. Cleanup on empty binary. chmod 755 at line 436. SHA-256 checksum verification at lines 458-503.                                                                     |
| REQ-03: MuninnDB health endpoint must respond before prompting for API key     | SATISFIED | Health gate in runVaultWizard() at lines 153-163. Health gate in init.ts at line 642 using muninndbHealthy state.                                                                                         |
| REQ-04: vault:init must detect global vs dev mode; skip harness in global mode | SATISFIED | detectRuntimeContext() called in vault-init.ts line 133. planningOnly passed to generateFiles() at line 209. files.ts implements full planningOnly early-return path.                                     |

### Automated Checks (Harness)

| Check     | Status | Errors | Duration |
| --------- | ------ | ------ | -------- |
| typecheck | passed | 0      | ~15s     |

**T1 Signal (PARTIAL):** Typecheck passed. No TDD-generated tests (testable: false in plan frontmatter, tests intentionally removed per no-tests.md rule). Goal-backward analysis (T3) is co-primary.

**Overall:** passed

### Non-Testable Items (T3 Verification)

All items in this phase are code changes verified via T3 (goal-backward analysis). No TDD tests were generated per the `no-tests.md` rule. T3 verification confirms all four requirements are structurally satisfied.

### Anti-Patterns Found

| File         | Line | Pattern | Severity | Impact |
| ------------ | ---- | ------- | -------- | ------ |
| (none found) | --   | --      | --       | --     |

No TODO/FIXME/placeholder/stub patterns detected in any modified file. The `placeholder` at vault-setup.ts:173 is a @clack/prompts input field parameter, not a code stub.

### Human Verification Required

### 1. MuninnDB Download URL Resolution

**Test:** Run `luca init` from a global install with no MuninnDB binary present. Observe the download step.
**Expected:** The download URL should resolve to a valid release asset (not 404). Binary should be written to `~/.luca/bin/muninndb` with non-zero file size.
**Why human:** Network-dependent behavior (GitHub API rate limits, actual binary download) cannot be verified structurally.

### 2. Global Mode Harness Skip

**Test:** Install luca globally (`bun install -g`), then run `luca vault:init` in a fresh project directory.
**Expected:** Only `.planning/` directory should be created. No `.claude/`, `.cursor/`, or `.pi/` directories should appear in the project.
**Why human:** Requires actual global install context which cannot be simulated via structural analysis.

### 3. Health Gate UX Flow

**Test:** Stop MuninnDB, then run `luca vault:init` interactively.
**Expected:** Should show "MuninnDB is not running" warning and skip the API key prompt entirely. Running `luca init` should show "MuninnDB is not running -- skipping vault setup" and suggest running `luca vault:init` later.
**Why human:** Interactive CLI UX flow requires real terminal interaction.

### Goal-Backward Objective Check

| Plan | Objective                                       | Status | Evidence                                                                                                                                                                |
| ---- | ----------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01   | Fix download URL 404 + binary verification      | PASS   | resolveLatestReleaseTag() resolves "latest" to concrete tag. Redirect fallback for API failure. File-size > 0 verification post-download. JSDoc updated.                |
| 02   | Detect global mode, skip harness in global mode | PASS   | detectRuntimeContext() imported and used. planningOnly option added to generateFiles() with full early-return path. Info log for user awareness.                        |
| 03   | Health gate before vault setup                  | PASS   | Health pre-check in runVaultWizard() before any prompts. Health gate in init.ts using tracked muninndbHealthy state. Post-init readout distinguishes health-gated skip. |

**Specification Gaps:** None. All three plan objectives are fully met by the implementation.

**Objective Score:** 3/3 objectives achieved (PASS)

### Gaps Summary

No gaps found. All four requirements (REQ-01 through REQ-04) are satisfied. All three plan objectives pass goal-backward verification. All five key artifacts exist, are substantive, and are properly wired into the init flow. Typecheck passes with zero errors. No anti-patterns detected.

Three human verification items are flagged for runtime confirmation of network-dependent download behavior, global install mode, and interactive CLI UX flow.

---

_Verified: 2026-03-17_
_Verifier: Claude (lu-verifier)_
