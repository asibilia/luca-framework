# v1.3.2 Requirements — Audit Tech Debt Cleanup

**Milestone:** v1.3.2
**Source:** v1.3.0 Milestone Audit Report (`.planning/milestones/v1.3.0-AUDIT.md`)
**Scope:** All remaining HIGH, MEDIUM, and LOW findings
**Requirements:** 17

---

## Build Pipeline Consolidation

- [x] **DEDUP-01**: Extract `generateAllOutputs(): Map<string, string>` to `build-shared.ts` — single compilation pipeline shared by `build-all.ts`, `check-drift.ts`, and `check-drift.test.ts`. Eliminates triple enumeration of registries and compilers. (H-02)
- [x] **DEDUP-02**: Extract `generateMarketplaceManifest(version): object` to `build-shared.ts` — marketplace manifest currently hardcoded in 3 files with identical 17-line object. (H-03)
- [x] **DEDUP-03**: Remove unused `tempDir` parameter from `check-drift.ts` `generateToTemp()` function. Parameter is declared but never referenced. (MEDIUM)
- [x] **DEDUP-04**: Deduplicate `generatePluginHooksConfig()` (build-shared.ts) and `generateHooksConfig()` (src/hooks/index.ts) into a single parameterized function. ~90% identical logic, only difference is command path construction and return wrapping. (MEDIUM)

## Test Quality

- [x] **TEST-01**: Extract shared test utilities (`VALID_CLAUDE_CODE_EVENTS` Set, `extractFrontmatter()` function) from `plugin-spec-e2e.test.ts` and `plugin-spec-hooks-format.test.ts` into a shared test helpers module. (H-04)
- [x] **TEST-02**: Remove unused test variables, replace sync `require('fs')` calls in test files with appropriate Bun or explicit node:fs imports. (LOW)

## Bun API Migration

- [x] **BUN-01**: Migrate `scripts/build-utils.ts` from `node:fs` (`readdir`, `unlink`, `rm`, `lstat`, `mkdir`) to Bun-native file APIs (`Bun.file`, `Bun.write`, etc.) per CLAUDE.md and bun-preference rule. (H-05)
- [x] **BUN-02**: Migrate `check-drift.test.ts` from `require('fs').readFileSync` and `readdirSync` to Bun-native file APIs. (H-05)

## Compiler Architecture

- [x] **ARCH-01**: Refactor `BaseCompiler` abstract class hierarchy (`src/compilers/base.compiler.ts`, `claude.compiler.ts`, `cursor.compiler.ts`, `plugin.compiler.ts`) from class inheritance to factory-function pattern per no-classes rule. Maintain identical compilation output (verify via drift check). (H-06)

## Security Hardening

- [x] **SEC-01**: Validate `transcript_path` in `context-monitor.sh` — currently trusts the path from stdin without checking it exists or is within the project directory. (LOW)
- [x] **SEC-02**: Sanitize `END_REASON` in `session-persist.sh` against markdown injection — raw value interpolated into WORKING.md without escaping. (LOW)
- [x] **SEC-03**: Add root path guard to `cleanDirectory()` in `build-utils.ts` — prevent accidental deletion of files outside the expected output directories. (LOW)
- [x] **SEC-04**: Add description length constraint and keywords array size limit to plugin manifest validation in `plugin.types.ts`. (LOW)
- [x] **SEC-05**: Document `COMMAND` variable extraction logic in `pre-commit-gate.sh` — currently safe but logic is undocumented and could be misunderstood in future modifications. (LOW)

## Code Hygiene

- [x] **CLEAN-01**: Fix unused loop variable naming — use consistent `_name` convention for intentionally unused destructured variables across build scripts. (MEDIUM)
- [x] **CLEAN-02**: Remove unused `format` parameter from PluginCompiler methods (always passes "CLAUDE"). Or document why "CLAUDE" is always used. (MEDIUM)
- [x] **CLEAN-03**: Add try/catch consistency for Luca-specific entity compilation (lu-executor, lu-planner, lu-skill, lu-workflow) in `build-all.ts` — currently no error handling unlike registry loop entities. (MEDIUM)
- [x] **CLEAN-04**: Replace magic string sentinels (e.g., `"__no_matcher__"` in hook config generators) with named constants. (LOW)

---

## Traceability

| Requirement | Audit Finding              | Severity | Phase |
| ----------- | -------------------------- | -------- | ----- |
| DEDUP-01    | H-02                       | HIGH     | 24    |
| DEDUP-02    | H-03                       | HIGH     | 24    |
| DEDUP-03    | MEDIUM (unused param)      | MEDIUM   | 24    |
| DEDUP-04    | MEDIUM (hook config dup)   | MEDIUM   | 24    |
| TEST-01     | H-04                       | HIGH     | 25    |
| TEST-02     | LOW (test hygiene)         | LOW      | 25    |
| BUN-01      | H-05                       | HIGH     | 25    |
| BUN-02      | H-05                       | HIGH     | 25    |
| ARCH-01     | H-06                       | HIGH     | 26    |
| SEC-01      | LOW (path validation)      | LOW      | 27    |
| SEC-02      | LOW (markdown injection)   | LOW      | 27    |
| SEC-03      | LOW (root path guard)      | LOW      | 27    |
| SEC-04      | LOW (manifest constraints) | LOW      | 27    |
| SEC-05      | LOW (documentation)        | LOW      | 27    |
| CLEAN-01    | MEDIUM (naming)            | MEDIUM   | 25    |
| CLEAN-02    | MEDIUM (unused param)      | MEDIUM   | 26    |
| CLEAN-03    | MEDIUM (error handling)    | MEDIUM   | 24    |
| CLEAN-04    | LOW (magic strings)        | LOW      | 24    |

---

_Requirements created: 2026-02-12_
_Source: v1.3.0 Milestone Audit Report_
