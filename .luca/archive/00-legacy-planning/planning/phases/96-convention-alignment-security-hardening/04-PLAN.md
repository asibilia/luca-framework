---
id: 96-D
title: "Convert .parse() to .safeParse() with error handling across tribunal result builders and metrics-collector"
phase: 96
wave: 2
complexity: MODERATE
todo: 96-D
---

# 96-D: Convert `.parse()` to `.safeParse()` with Error Handling

## Objective

Replace all `.parse()` calls with `.safeParse()` plus proper error handling across tribunal result builders, debate evaluators, and the metrics collector. This aligns with the project convention documented in `.claude/rules/schema-first-parsing.md` to use `safeParse()` for runtime safety. The metrics collector is the highest-risk target because it parses external JSON from disk.

**Scope:** ~25 `.parse()` call sites across 7 files.

## Context

@.claude/rules/schema-first-parsing.md — "Use safeParse() over parse() to prevent runtime crashes"
@src/agents/**helpers/verification-tribunal.ts — 1 call site: line 306 `verificationTribunalResultSchema.parse()`
@src/agents/**helpers/root-cause-tribunal.ts — 1 call site: line 302 `rootCauseTribunalResultSchema.parse()`
@src/shared/**helpers/tribunal-rebuttals.ts — 1 call site: line 303 `tribunalResultSchema.parse()` (resolveRebuttals already uses safeParse)
@src/iteration/**helpers/stall-debate.ts — 5 call sites: lines 78, 92, 126, 139, 151 `stallDebateOutputSchema.parse()`
@src/iteration/**helpers/metrics-collector.ts — 11 call sites: lines 64, 105, 166, 201, 236, 265, 268, 271, 274, 279 `*.parse()` (highest risk: line 236 parses external JSON from disk)
@src/skills/**helpers/pr-verdict-debate.ts — 1 call site: line 278 `splitVerdictResultSchema.parse()`
@src/skills/**helpers/milestone-debate.ts — 1 call site: line 208 `milestoneDebateResultSchema.parse()`
@src/iteration/**helpers/convergence.ts — 2 call sites: lines 327, 330 `classifiedErrorSchema.array().parse()` (CLI entry point, parsing user-provided JSON)

## Error Handling Strategy

Each call site needs a context-appropriate error handling strategy:

| Context                                | Strategy                      | Rationale                                      |
| -------------------------------------- | ----------------------------- | ---------------------------------------------- |
| **Result builders** (tribunal, debate) | Return null + log error       | Callers can detect null and degrade gracefully |
| **Metrics builder functions**          | Return null + log error       | Missing metrics entry is non-fatal             |
| **Metrics appendMetrics**              | Throw with context            | Write failure should propagate to caller       |
| **Metrics readMetricsFile**            | Return empty file + log error | Corrupt file should not crash the system       |
| **CLI entry points**                   | Log error + exit(1)           | User sees the error message                    |
| **stall-debate evaluator**             | Return halt strategy          | Parse failure = safest default is halt         |

## Tasks

### Task 1: Convert `verification-tribunal.ts` result builder

**Goal:** Convert 1 `.parse()` to `.safeParse()` in `resolveVerificationTribunal`.

**Files:** `src/agents/__helpers/verification-tribunal.ts`

**Steps:**

1. In `resolveVerificationTribunal` (line 306), replace:

   ```typescript
   // Before:
   const result = verificationTribunalResultSchema.parse({...});
   return result;

   // After:
   const parsed = verificationTribunalResultSchema.safeParse({...});
   if (!parsed.success) {
     console.error(
       "[verification-tribunal] Failed to build tribunal result:",
       parsed.error.message,
     );
     return null;
   }
   return parsed.data;
   ```

2. Update the return type of `resolveVerificationTribunal` from `VerificationTribunalResult` to `VerificationTribunalResult | null`.

3. Run `bunx --bun tsc --noEmit` — check if any callers need updating for the nullable return type.

**Call sites:** 1

**Verification:**

- [ ] `.parse()` replaced with `.safeParse()` + error handling
- [ ] Return type updated to `VerificationTribunalResult | null`
- [ ] Error logged with domain context prefix
- [ ] `bunx --bun tsc --noEmit` passes

### Task 2: Convert `root-cause-tribunal.ts` result builder

**Goal:** Convert 1 `.parse()` to `.safeParse()` in `resolveRootCauseTribunal`.

**Files:** `src/agents/__helpers/root-cause-tribunal.ts`

**Steps:**

1. In `resolveRootCauseTribunal` (line 302), replace:

   ```typescript
   // Before:
   const result = rootCauseTribunalResultSchema.parse({...});
   return result;

   // After:
   const parsed = rootCauseTribunalResultSchema.safeParse({...});
   if (!parsed.success) {
     console.error(
       "[root-cause-tribunal] Failed to build tribunal result:",
       parsed.error.message,
     );
     return null;
   }
   return parsed.data;
   ```

2. Update the return type from `RootCauseTribunalResult` to `RootCauseTribunalResult | null`.

3. Run `bunx --bun tsc --noEmit`.

**Call sites:** 1

**Verification:**

- [ ] `.parse()` replaced with `.safeParse()` + error handling
- [ ] Return type updated to `RootCauseTribunalResult | null`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Convert `tribunal-rebuttals.ts` result builder

**Goal:** Convert 1 `.parse()` to `.safeParse()` in `buildTribunalResult`.

**Files:** `src/shared/__helpers/tribunal-rebuttals.ts`

**Steps:**

1. In `buildTribunalResult` (line 303), replace:

   ```typescript
   // Before:
   return tribunalResultSchema.parse({...});

   // After:
   const parsed = tribunalResultSchema.safeParse({...});
   if (!parsed.success) {
     console.error(
       "[tribunal-rebuttals] Failed to build tribunal result:",
       parsed.error.message,
     );
     return null;
   }
   return parsed.data;
   ```

2. Update the return type from `TribunalResult` to `TribunalResult | null`.

3. Run `bunx --bun tsc --noEmit` — `milestone-debate.ts` calls `buildTribunalResult`, check if it needs updating for nullable return.

**Call sites:** 1

**Verification:**

- [ ] `.parse()` replaced with `.safeParse()` + error handling
- [ ] Return type updated to `TribunalResult | null`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 4: Convert `stall-debate.ts` evaluator

**Goal:** Convert 5 `.parse()` calls to `.safeParse()` in `evaluateStallDebate`.

**Files:** `src/iteration/__helpers/stall-debate.ts`

**Steps:**

1. For all 5 `stallDebateOutputSchema.parse({...})` calls (lines 78, 92, 126, 139, 151), replace with a consistent pattern. Create a helper at the top of the function or file:

   ```typescript
   /**
    * Safely parse stall debate output, falling back to halt on parse failure.
    */
   function safeParseStallOutput(
     data: Record<string, unknown>,
   ): StallDebateOutput {
     const parsed = stallDebateOutputSchema.safeParse(data);
     if (parsed.success) return parsed.data;

     console.error(
       "[stall-debate] Failed to parse debate output, defaulting to halt:",
       parsed.error.message,
     );
     // Fallback: halt with error context
     const fallback = stallDebateOutputSchema.safeParse({
       recommended_strategy: "halt",
       confidence: 0.0,
       reasoning: `Parse error: ${parsed.error.message}. Defaulting to halt.`,
       strategy_params: {},
     });
     return fallback.success
       ? fallback.data
       : ({
           recommended_strategy: "halt",
           confidence: 0.0,
           reasoning: "Critical parse failure. Halting.",
           strategy_params: {},
         } as StallDebateOutput);
   }
   ```

2. Replace each of the 5 `.parse()` calls:
   - Line 78: `return safeParseStallOutput({ recommended_strategy: "halt", ... });`
   - Line 92: `return safeParseStallOutput({ recommended_strategy: "retry_with_context_promotion", ... });`
   - Line 126: `return safeParseStallOutput({ recommended_strategy: "retry_with_error_focus", ... });`
   - Line 139: `return safeParseStallOutput({ recommended_strategy: "retry_with_rollback", ... });`
   - Line 151: `return safeParseStallOutput({ recommended_strategy: "halt", ... });`

3. Run `bunx --bun tsc --noEmit`.

**Call sites:** 5

**Verification:**

- [ ] All 5 `.parse()` calls replaced with `safeParseStallOutput()`
- [ ] Helper function provides safe halt fallback on parse failure
- [ ] No runtime crash possible from schema validation
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Convert `metrics-collector.ts` (highest risk — 11 call sites)

**Goal:** Convert all 11 `.parse()` calls to `.safeParse()` with appropriate error handling per context.

**Files:** `src/iteration/__helpers/metrics-collector.ts`

**Steps:**

1. **`readMetricsFile` (line 236) — Parse external JSON from disk (HIGHEST RISK):**

   ```typescript
   // Before:
   return metricsFileSchema.parse(parsed);

   // After:
   const result = metricsFileSchema.safeParse(parsed);
   if (!result.success) {
     console.error(
       "[metrics-collector] Corrupt metrics file, returning empty:",
       result.error.message,
     );
     return {
       version: "1.0",
       iteration_metrics: [],
       plan_quality_metrics: [],
       review_metrics: [],
       convergence_metrics: [],
     };
   }
   return result.data;
   ```

2. **Builder functions — `buildIterationMetrics` (line 64), `buildPlanQualityMetrics` (line 105), `buildReviewMetrics` (line 166), `buildConvergenceMetrics` (line 201):**

   For each, replace `.parse()` with `.safeParse()` and return `null` on failure:

   ```typescript
   // Before (e.g., buildIterationMetrics):
   return iterationMetricsSchema.parse({...});

   // After:
   const parsed = iterationMetricsSchema.safeParse({...});
   if (!parsed.success) {
     console.error(
       "[metrics-collector] Failed to build iteration metrics:",
       parsed.error.message,
     );
     return null;
   }
   return parsed.data;
   ```

   Update return types:
   - `buildIterationMetrics`: `IterationMetrics` → `IterationMetrics | null`
   - `buildPlanQualityMetrics`: `PlanQualityMetrics` → `PlanQualityMetrics | null`
   - `buildReviewMetrics`: `ReviewMetrics` → `ReviewMetrics | null`
   - `buildConvergenceMetrics`: `ConvergenceMetrics` → `ConvergenceMetrics | null`

3. **`appendMetrics` switch cases (lines 265, 268, 271, 274) — Individual entry validation:**

   For each case in the switch, replace `.parse()` with `.safeParse()`:

   ```typescript
   // Before:
   case "iteration_metrics":
     file.iteration_metrics.push(iterationMetricsSchema.parse(entry));
     break;

   // After:
   case "iteration_metrics": {
     const parsed = iterationMetricsSchema.safeParse(entry);
     if (!parsed.success) {
       throw new Error(`Invalid iteration_metrics entry: ${parsed.error.message}`);
     }
     file.iteration_metrics.push(parsed.data);
     break;
   }
   ```

   Apply the same pattern to all 4 cases (iteration_metrics, plan_quality_metrics, review_metrics, convergence_metrics).

4. **`appendMetrics` final validation (line 279):**

   ```typescript
   // Before:
   metricsFileSchema.parse(file);

   // After:
   const validated = metricsFileSchema.safeParse(file);
   if (!validated.success) {
     throw new Error(
       `Metrics file validation failed after append: ${validated.error.message}`,
     );
   }
   ```

5. Run `bunx --bun tsc --noEmit`.

**Call sites:** 11 (1 readMetricsFile + 4 builder functions + 4 appendMetrics switch cases + 1 appendMetrics final validation + 1 readMetricsFile disk read)

**Verification:**

- [ ] All 11 `.parse()` calls converted to `.safeParse()` with error handling
- [ ] `readMetricsFile` returns empty file on corrupt data (non-fatal)
- [ ] Builder functions return `null` on failure (non-fatal)
- [ ] `appendMetrics` throws on invalid entry (caller has try/catch)
- [ ] Return types updated for nullable builders
- [ ] `bunx --bun tsc --noEmit` passes

### Task 6: Convert `pr-verdict-debate.ts` result builder

**Goal:** Convert 1 `.parse()` to `.safeParse()` in `buildSplitVerdictResult`.

**Files:** `src/skills/__helpers/pr-verdict-debate.ts`

**Steps:**

1. In `buildSplitVerdictResult` (line 278), replace:

   ```typescript
   // Before:
   return splitVerdictResultSchema.parse({...});

   // After:
   const parsed = splitVerdictResultSchema.safeParse({...});
   if (!parsed.success) {
     console.error(
       "[pr-verdict-debate] Failed to build split verdict result:",
       parsed.error.message,
     );
     return null;
   }
   return parsed.data;
   ```

2. Update return type from `SplitVerdictResult` to `SplitVerdictResult | null`.

3. Run `bunx --bun tsc --noEmit`.

**Call sites:** 1

**Verification:**

- [ ] `.parse()` replaced with `.safeParse()` + error handling
- [ ] Return type updated to `SplitVerdictResult | null`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 7: Convert `milestone-debate.ts` result builder

**Goal:** Convert 1 `.parse()` to `.safeParse()` in `buildMilestoneDebateResult`.

**Files:** `src/skills/__helpers/milestone-debate.ts`

**Steps:**

1. In `buildMilestoneDebateResult` (line 208), replace:

   ```typescript
   // Before:
   return milestoneDebateResultSchema.parse({...});

   // After:
   const parsed = milestoneDebateResultSchema.safeParse({...});
   if (!parsed.success) {
     console.error(
       "[milestone-debate] Failed to build milestone debate result:",
       parsed.error.message,
     );
     return null;
   }
   return parsed.data;
   ```

2. Update return type from `MilestoneDebateResult` to `MilestoneDebateResult | null`.

3. Note: This function calls `buildTribunalResult` (Task 3 made it nullable). Add null check:

   ```typescript
   const tribunalResult = buildTribunalResult(
     phase,
     allFindings,
     disagreements,
     rebuttals,
     recommendations,
   );
   if (!tribunalResult) {
     console.error(
       "[milestone-debate] Tribunal result build failed, cannot produce milestone result",
     );
     return null;
   }
   ```

4. Run `bunx --bun tsc --noEmit`.

**Call sites:** 1

**Verification:**

- [ ] `.parse()` replaced with `.safeParse()` + error handling
- [ ] Null check added for `buildTribunalResult` dependency
- [ ] Return type updated to `MilestoneDebateResult | null`
- [ ] `bunx --bun tsc --noEmit` passes

### Task 8: Convert `convergence.ts` CLI entry point

**Goal:** Convert 2 `.parse()` calls in the CLI entry point to `.safeParse()`.

**Files:** `src/iteration/__helpers/convergence.ts`

**Steps:**

1. In the CLI `import.meta.main` block (lines 325-330), replace:

   ```typescript
   // Before:
   const currentParsed = classifiedErrorSchema
     .array()
     .parse(JSON.parse(currentRaw));
   const previousParsed = classifiedErrorSchema
     .array()
     .parse(JSON.parse(previousRaw));

   // After:
   const currentResult = classifiedErrorSchema
     .array()
     .safeParse(JSON.parse(currentRaw));
   if (!currentResult.success) {
     console.error("Invalid --current JSON:", currentResult.error.message);
     process.exit(2);
   }
   const currentParsed = currentResult.data;

   const previousResult = classifiedErrorSchema
     .array()
     .safeParse(JSON.parse(previousRaw));
   if (!previousResult.success) {
     console.error("Invalid --previous JSON:", previousResult.error.message);
     process.exit(2);
   }
   const previousParsed = previousResult.data;
   ```

2. Run `bunx --bun tsc --noEmit`.

**Call sites:** 2

**Verification:**

- [ ] Both `.parse()` calls replaced with `.safeParse()` + error handling
- [ ] CLI exits with code 2 on invalid JSON (consistent with existing error handling)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 9: Final validation

**Goal:** Run full verification to confirm no regressions.

**Steps:**

1. Run `bunx --bun tsc --noEmit` — full type check.
2. Run `bun test` — full test suite.
3. Verify zero `.parse()` calls remain in the target files (excluding `JSON.parse()` which is correct).
4. Verify all `.safeParse()` calls have error handling (no unchecked `.success`).
5. Verify nullable return types propagate correctly to callers.

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes (pre-existing failures acceptable)
- [ ] Zero Zod `.parse()` calls remain in target files
- [ ] All `.safeParse()` calls have error handling
- [ ] Nullable return types propagate to callers without type errors

## Success Criteria

- [ ] All ~25 Zod `.parse()` calls converted to `.safeParse()` with error handling
- [ ] Highest-risk site (metrics-collector disk read) returns empty file on corruption
- [ ] Tribunal result builders return `null` on validation failure (non-fatal)
- [ ] Stall debate evaluator defaults to halt on parse failure (safe default)
- [ ] CLI entry points exit with informative error messages
- [ ] No runtime crash possible from schema validation failures
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun test` passes
