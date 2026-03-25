# Code Review — Phase 5

**Timestamp:** 2026-03-24
**Files reviewed:** 12 (src/eval/ domain + scripts/eval.ts)
**Reviewers:** code-architect, dx-advocate

## Severity Summary

| Severity | Count |
| -------- | ----- |
| CRITICAL | 0     |
| HIGH     | 3     |
| MEDIUM   | 5     |
| LOW      | 5     |

## HIGH Findings

### 1. Custom grader Map resolution broken (code-architect + dx-advocate)

**File:** src/eval/\_\_helpers/composite-grader.ts:143
**Issue:** `customFns?.values().next().value` always retrieves the first value in the Map regardless of key. Per-entry custom functions are non-functional.
**Fix:** Thread eval case ID into gradeWithComposite, or accept a single CustomGraderFn instead of a Map.

### 2. LlmAdapter / RunEvalOptions should be Zod schemas (code-architect)

**File:** src/eval/**helpers/llm-grader.ts:9, eval-runner.ts:22
**Issue:** Public contract types declared as TypeScript interfaces instead of Zod schemas with inferred types, violating schema-first parsing convention.
**Fix:** Move to **schemas/eval.schemas.ts as Zod object schemas.

### 3. node:crypto and node:fs imports instead of Bun equivalents (dx-advocate)

**File:** src/eval/\_\_helpers/eval-runner.ts:1, eval-reporter.ts:1
**Issue:** Uses `randomUUID` from `node:crypto` and `mkdir` from `node:fs/promises` instead of Bun built-ins.
**Fix:** Use `crypto.randomUUID()` (global) and `Bun.$\`mkdir -p ${dir}\`.quiet()`.

## MEDIUM Findings

### 4. Import grouping violations (dx-advocate)

**Files:** composite-grader.ts:1-10, eval-runner.ts:3-17
**Issue:** Type and value imports from same modules split across non-contiguous blocks.

### 5. snake_case in internal TypeScript params (dx-advocate)

**Files:** eval-reporter.ts:133 (`suite_cases`), eval-reporter.ts:401 (`run_id`), eval-runner.ts:22 (`RunEvalOptions` fields)
**Issue:** Internal TypeScript parameters/interfaces use snake_case; should be camelCase per convention (snake_case reserved for API payloads).

### 6. suites/ subdirectory undocumented in archetype (code-architect)

**File:** src/eval/index.ts:83
**Issue:** `suites/` directory functions as entity registry pattern but is undocumented in domain-architecture.md for Archetype B.

## LOW Findings

### 7. Biased shuffle in sampling (dx-advocate)

**File:** eval-runner.ts:196 — `sort(() => Math.random() - 0.5)` is not Fisher-Yates.

### 8. process.env vs Bun.env (dx-advocate)

**File:** anthropic-adapter.ts:32 — `process.env.ANTHROPIC_API_KEY` should be `Bun.env.ANTHROPIC_API_KEY`.

### 9. Missing @throws JSDoc (dx-advocate)

**File:** eval-reporter.ts:108 — `writeJsonReport` lacks failure scenario documentation.

### 10. Missing JSDoc on CaseAggregate (dx-advocate)

**File:** eval-reporter.ts:23 — Internal interface lacks documentation per mandatory-documentation rule.

### 11. Barrel import style in suites (dx-advocate)

**File:** lu-verifier.eval.ts:1 — Imports from `../__schemas/` instead of barrel `../index`. Acceptable but not preferred.
