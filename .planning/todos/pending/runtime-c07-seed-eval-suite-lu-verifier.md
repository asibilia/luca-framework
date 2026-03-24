---
title: "Runtime C07: Seed eval suite for lu-verifier"
area: eval
created: 2026-03-24
source: docs/runtime-architecture/research/agent-evaluation.md
depends_on: [C01]
phase: runtime-c
estimated_files: 1
---

## Context

Create 25 eval cases for lu-verifier gap detection. lu-verifier receives a code diff, task description, and verification criteria, then produces a structured verification report identifying gaps (missing implementations, stubs, unwired artifacts).

**lu-verifier input contract** (from `src/agents/general/lu-verifier.agent.ts`):

- Receives: phase goal, PLAN.md content, SUMMARY.md content, code artifacts to verify
- Outputs: VERIFICATION.md with status (`passed | gaps_found | human_needed`), must-have truths, artifact checks, and structured gap analysis

For eval purposes, the input is a record with:

- `phase_goal`: string (what the phase should deliver)
- `code_diff`: string (unified diff of changes)
- `task_description`: string (what was supposed to be done)
- `verification_criteria`: string[] (list of criteria to check)

The expected output is a record with:

- `status`: `"passed" | "gaps_found" | "human_needed"`
- `gaps`: string[] (list of gap descriptions, empty for passed)
- `score`: number (0.0 to 1.0, fraction of criteria met)

Grading uses `composite` -- code grader for known gaps detection + LLM grader for explanation quality.

## Files to Create

### 1. `src/eval/suites/lu-verifier.eval.ts`

```typescript
import type { EvalSuite } from "../__schemas/eval.schemas";

/**
 * Seed eval suite for lu-verifier gap detection.
 *
 * Tests whether lu-verifier correctly identifies gaps in implementations:
 * - 5 no-gap cases (clean implementations, should produce status: "passed")
 * - 5 obvious-gap cases (missing error handling, stubs, no types)
 * - 5 subtle-gap cases (edge cases, performance issues, security concerns)
 * - 5 false-positive traps (valid alternatives that should NOT be flagged)
 * - 5 partial-completeness cases (some criteria met, others not)
 */
export const luVerifierEvalSuite: EvalSuite = {
  id: "lu-verifier-gap-detection",
  component: "lu-verifier",
  description: "Gap detection precision and recall for lu-verifier agent",
  config: {
    judge_model: "claude-haiku-4-5-20250514",
    timeout_ms: 60_000,
    sampling_rate: 1.0,
    use_batch_api: false,
  },
  cases: [
    // ─── NO GAPS (5 cases) ─────────────────────────────────────────────

    {
      id: "verifier-clean-001",
      component: "lu-verifier",
      description:
        "Clean implementation: new utility function with types, exports, and usage",
      input: {
        phase_goal: "Add a formatDuration utility to the shared helpers",
        code_diff: `diff --git a/src/shared/__helpers/format-duration.ts b/src/shared/__helpers/format-duration.ts
new file mode 100644
--- /dev/null
+++ b/src/shared/__helpers/format-duration.ts
@@ -0,0 +1,25 @@
+/**
+ * Format milliseconds to human-readable duration string.
+ * @param ms - Duration in milliseconds
+ * @returns Formatted string like "2m 30s"
+ */
+export function formatDuration(ms: number): string {
+  if (ms < 0) return "0ms";
+  if (ms < 1000) return \`\${Math.round(ms)}ms\`;
+  const seconds = Math.floor(ms / 1000) % 60;
+  const minutes = Math.floor(ms / 60000) % 60;
+  const hours = Math.floor(ms / 3600000);
+  const parts: string[] = [];
+  if (hours > 0) parts.push(\`\${hours}h\`);
+  if (minutes > 0) parts.push(\`\${minutes}m\`);
+  if (seconds > 0) parts.push(\`\${seconds}s\`);
+  return parts.join(" ") || "0ms";
+}
diff --git a/src/shared/index.ts b/src/shared/index.ts
--- a/src/shared/index.ts
+++ b/src/shared/index.ts
@@ -5,3 +5,4 @@
 export { getArg, hasFlag } from "./__helpers/cli-utils";
+export { formatDuration } from "./__helpers/format-duration";`,
        task_description:
          "Create a formatDuration utility that converts ms to human-readable format",
        verification_criteria: [
          "Function exists and is exported",
          "Handles edge cases (negative, zero, sub-second)",
          "Returns correct format with hours, minutes, seconds",
          "Exported from barrel index.ts",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if the verifier correctly identifies this as a complete implementation with no gaps. Score 0.5 if it identifies minor non-blocking issues. Score 0.0 if it incorrectly reports gaps that don't exist.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["clean", "smoke"],
      trials: 3,
    },

    {
      id: "verifier-clean-002",
      component: "lu-verifier",
      description:
        "Clean implementation: Zod schema with all required fields and defaults",
      input: {
        phase_goal: "Add a cache config schema to the eval domain",
        code_diff: `diff --git a/src/eval/__schemas/cache.schemas.ts b/src/eval/__schemas/cache.schemas.ts
new file mode 100644
--- /dev/null
+++ b/src/eval/__schemas/cache.schemas.ts
@@ -0,0 +1,18 @@
+import { z } from "zod";
+
+export const CacheConfigSchema = z.object({
+  enabled: z.boolean().default(false),
+  max_entries: z.number().int().positive().default(1000),
+  ttl_ms: z.number().int().positive().default(3600000),
+  storage_path: z.string().default(".planning/evals/.cache"),
+});
+export type CacheConfig = z.infer<typeof CacheConfigSchema>;
+
+export const CacheEntrySchema = z.object({
+  key: z.string(),
+  value: z.unknown(),
+  created_at: z.string().datetime(),
+  expires_at: z.string().datetime(),
+});
+export type CacheEntry = z.infer<typeof CacheEntrySchema>;`,
        task_description: "Create cache config and entry schemas with Zod",
        verification_criteria: [
          "CacheConfigSchema defined with all fields",
          "All fields have defaults per schema-first parsing rule",
          "Types exported via z.infer",
          "Uses snake_case field names",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if verifier correctly identifies no gaps. Score 0.0 if false positives flagged.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["clean"],
      trials: 3,
    },

    {
      id: "verifier-clean-003",
      component: "lu-verifier",
      description: "Clean implementation: barrel update with only re-exports",
      input: {
        phase_goal: "Export new eval schemas from the barrel",
        code_diff: `diff --git a/src/eval/index.ts b/src/eval/index.ts
--- a/src/eval/index.ts
+++ b/src/eval/index.ts
@@ -1,3 +1,5 @@
 export { EvalCaseSchema } from "./__schemas/eval.schemas";
+export { CacheConfigSchema, CacheEntrySchema } from "./__schemas/cache.schemas";
+export type { CacheConfig, CacheEntry } from "./__schemas/cache.schemas";`,
        task_description: "Add cache schema exports to the eval barrel",
        verification_criteria: [
          "Barrel only contains re-exports",
          "New schemas are accessible via barrel",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if correctly identified as clean. Score 0.0 if flagged incorrectly.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["clean"],
      trials: 3,
    },

    {
      id: "verifier-clean-004",
      component: "lu-verifier",
      description:
        "Clean implementation: factory function following no-classes pattern",
      input: {
        phase_goal: "Create an adapter factory for eval LLM calls",
        code_diff: `diff --git a/src/eval/__helpers/adapter-factory.ts b/src/eval/__helpers/adapter-factory.ts
new file mode 100644
--- /dev/null
+++ b/src/eval/__helpers/adapter-factory.ts
@@ -0,0 +1,20 @@
+import type { LlmAdapter } from "./llm-grader";
+
+export function createAdapter(apiKey: string): LlmAdapter {
+  return {
+    async call(model, systemPrompt, userMessage, temperature) {
+      const response = await fetch("https://api.anthropic.com/v1/messages", {
+        method: "POST",
+        headers: {
+          "x-api-key": apiKey,
+          "anthropic-version": "2023-06-01",
+          "content-type": "application/json",
+        },
+        body: JSON.stringify({ model, max_tokens: 1024, temperature, system: systemPrompt, messages: [{ role: "user", content: userMessage }] }),
+      });
+      if (!response.ok) throw new Error(\`API error: \${response.status}\`);
+      const data = await response.json();
+      return { text: data.content[0].text, input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens };
+    },
+  };
+}`,
        task_description: "Create an adapter factory function for LLM calls",
        verification_criteria: [
          "Uses factory function pattern (no classes)",
          "Returns LlmAdapter interface",
          "Handles API errors",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if correctly identified as complete. Score 0.0 if false gaps reported.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["clean"],
      trials: 3,
    },

    {
      id: "verifier-clean-005",
      component: "lu-verifier",
      description: "Clean implementation: complete CLI argument parsing",
      input: {
        phase_goal: "Add eval CLI command argument parsing",
        code_diff: `diff --git a/packages-dev/bun-scripts/eval.ts b/packages-dev/bun-scripts/eval.ts
new file mode 100644
--- /dev/null
+++ b/packages-dev/bun-scripts/eval.ts
@@ -0,0 +1,30 @@
+import { getArg, hasFlag } from "~/shared/__helpers/cli-utils";
+const args = Bun.argv.slice(2);
+const suite = getArg(args, "suite", "");
+const tag = getArg(args, "tag", "");
+const trials = parseInt(getArg(args, "trials", "3"), 10);
+const format = getArg(args, "report", "console") as "json" | "markdown" | "console";
+const judgeModel = getArg(args, "judge-model", "claude-haiku-4-5-20250514");
+const compare = hasFlag(args, "compare");
+const dryRun = hasFlag(args, "dry-run");
+const saveBaseline = hasFlag(args, "save-baseline");
+const verbose = hasFlag(args, "verbose");
+
+if (trials < 1 || isNaN(trials)) { console.error("--trials must be a positive integer"); process.exit(1); }
+if (!["json", "markdown", "console"].includes(format)) { console.error("--report must be json, markdown, or console"); process.exit(1); }
+
+console.log(JSON.stringify({ suite, tag, trials, format, judgeModel, compare, dryRun, saveBaseline, verbose }));`,
        task_description:
          "Implement CLI argument parsing for luca eval command",
        verification_criteria: [
          "All documented flags are parsed",
          "Validation for invalid inputs",
          "Uses cli-utils from shared",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if correctly identified as complete implementation. Score 0.0 if false gaps.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["clean"],
      trials: 3,
    },

    // ─── OBVIOUS GAPS (5 cases) ─────────────────────────────────────────

    {
      id: "verifier-obvious-001",
      component: "lu-verifier",
      description:
        "Obvious gap: function body is a stub (TODO comment, returns empty)",
      input: {
        phase_goal: "Implement eval comparator logic",
        code_diff: `diff --git a/src/eval/__helpers/eval-comparator.ts b/src/eval/__helpers/eval-comparator.ts
new file mode 100644
--- /dev/null
+++ b/src/eval/__helpers/eval-comparator.ts
@@ -0,0 +1,10 @@
+import type { EvalReport, EvalComparison } from "../__schemas/eval.schemas";
+
+export function compareEvalRuns(baseline: EvalReport, current: EvalReport): EvalComparison {
+  // TODO: implement comparison logic
+  return {} as EvalComparison;
+}
+
+export async function compareWithLatestBaseline(current: EvalReport): Promise<EvalComparison | null> {
+  return null; // placeholder
+}`,
        task_description:
          "Implement eval run comparison with regression detection",
        verification_criteria: [
          "compareEvalRuns computes deltas",
          "Detects regressions",
          "Produces verdict",
          "Loads baseline",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "compareEvalRuns is a stub",
          "compareWithLatestBaseline returns null placeholder",
        ],
        score: 0.0,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if verifier identifies both functions as stubs/placeholders. Score 0.5 if only one identified. Score 0.0 if no gaps found.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["obvious-gap"],
      trials: 3,
    },

    {
      id: "verifier-obvious-002",
      component: "lu-verifier",
      description:
        "Obvious gap: missing error handling (no try/catch around API call)",
      input: {
        phase_goal: "Implement Anthropic API adapter with error handling",
        code_diff: `diff --git a/src/eval/__helpers/anthropic-adapter.ts b/src/eval/__helpers/anthropic-adapter.ts
new file mode 100644
--- /dev/null
+++ b/src/eval/__helpers/anthropic-adapter.ts
@@ -0,0 +1,15 @@
+export function createAnthropicAdapter() {
+  const apiKey = process.env.ANTHROPIC_API_KEY;
+  return {
+    async call(model: string, systemPrompt: string, userMessage: string, temperature: number) {
+      const response = await fetch("https://api.anthropic.com/v1/messages", {
+        method: "POST",
+        headers: { "x-api-key": apiKey!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
+        body: JSON.stringify({ model, max_tokens: 1024, temperature, system: systemPrompt, messages: [{ role: "user", content: userMessage }] }),
+      });
+      const data = await response.json();
+      return { text: data.content[0].text, input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens };
+    },
+  };
+}`,
        task_description: "Create Anthropic adapter with proper error handling",
        verification_criteria: [
          "Validates API key exists",
          "Handles HTTP errors",
          "Handles malformed responses",
          "Returns typed result",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "No API key validation",
          "No HTTP error handling",
          "No response parsing error handling",
        ],
        score: 0.25,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if verifier identifies all 3 missing error handling patterns. Score 0.5 if 1-2 identified. Score 0.0 if none found.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["obvious-gap"],
      trials: 3,
    },

    {
      id: "verifier-obvious-003",
      component: "lu-verifier",
      description: "Obvious gap: file exists but not exported from barrel",
      input: {
        phase_goal: "Add graders to eval domain",
        code_diff: `diff --git a/src/eval/__helpers/code-grader.ts b/src/eval/__helpers/code-grader.ts
new file mode 100644
--- /dev/null
+++ b/src/eval/__helpers/code-grader.ts
@@ -0,0 +1,5 @@
+import type { GraderResult } from "../__schemas/eval.schemas";
+export function gradeWithCode(output: unknown, config: any): GraderResult {
+  return { passed: true, score: 1.0, reason: "Match", metadata: {} };
+}`,
        task_description: "Implement code grader and export from barrel",
        verification_criteria: [
          "gradeWithCode function implemented",
          "Exported from src/eval/index.ts barrel",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: ["Not exported from barrel index.ts"],
        score: 0.5,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if verifier identifies the missing barrel export. Score 0.0 if missed.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["obvious-gap"],
      trials: 3,
    },

    {
      id: "verifier-obvious-004",
      component: "lu-verifier",
      description: "Obvious gap: missing type annotations (uses any)",
      input: {
        phase_goal: "Add typed eval runner",
        code_diff: `diff --git a/src/eval/__helpers/eval-runner.ts b/src/eval/__helpers/eval-runner.ts
new file mode 100644
--- /dev/null
+++ b/src/eval/__helpers/eval-runner.ts
@@ -0,0 +1,12 @@
+export async function runEvalSuite(suite: any, options: any): Promise<any> {
+  const results: any[] = [];
+  for (const c of suite.cases) {
+    const result: any = { case_id: c.id, trial: 1, passed: true, score: 1.0 };
+    results.push(result);
+  }
+  return { results, pass_at_1: 1.0, pass_at_k: 1.0 };
+}`,
        task_description:
          "Implement typed eval runner with proper Zod schema types",
        verification_criteria: [
          "All parameters use schema-derived types",
          "Return type matches EvalReport",
          "No 'any' types",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "Parameters typed as any",
          "Return type is any",
          "Missing EvalReport fields",
        ],
        score: 0.1,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if verifier flags all 'any' usage and missing types. Score 0.5 if partially identified.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["obvious-gap"],
      trials: 3,
    },

    {
      id: "verifier-obvious-005",
      component: "lu-verifier",
      description: "Obvious gap: hardcoded values where dynamic expected",
      input: {
        phase_goal: "Implement per-case pass@1 calculation",
        code_diff: `diff --git a/src/eval/__helpers/metrics.ts b/src/eval/__helpers/metrics.ts
new file mode 100644
--- /dev/null
+++ b/src/eval/__helpers/metrics.ts
@@ -0,0 +1,6 @@
+export function computePassAt1(results: any[]): number {
+  return 0.85; // average observed value
+}
+export function computePassAtK(results: any[]): number {
+  return 0.75; // average observed value
+}`,
        task_description: "Compute pass@1 and pass@k metrics from eval results",
        verification_criteria: [
          "pass@1 computed from actual results",
          "pass@k computed from actual results",
          "No hardcoded values",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: ["Both functions return hardcoded values"],
        score: 0.0,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if verifier identifies hardcoded return values. Score 0.0 if missed.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["obvious-gap"],
      trials: 3,
    },

    // ─── SUBTLE GAPS (5 cases) ──────────────────────────────────────────
    // These require deeper analysis to identify

    {
      id: "verifier-subtle-001",
      component: "lu-verifier",
      description: "Subtle gap: race condition in concurrent trial execution",
      input: {
        phase_goal: "Run eval trials concurrently for speed",
        code_diff: `diff --git a/src/eval/__helpers/eval-runner.ts b/src/eval/__helpers/eval-runner.ts
--- a/src/eval/__helpers/eval-runner.ts
+++ b/src/eval/__helpers/eval-runner.ts
@@ -10,8 +10,8 @@
 export async function runEvalSuite(suite, options) {
   const results = [];
   for (const c of suite.cases) {
-    for (let t = 1; t <= c.trials; t++) {
-      const result = await executeTrial(c, t, options);
+    const trialPromises = Array.from({ length: c.trials }, (_, i) =>
+      executeTrial(c, i + 1, options)
+    );
+    const trialResults = await Promise.all(trialPromises);
     results.push(...trialResults);
   }`,
        task_description:
          "Optimize trial execution with concurrent Promise.all",
        verification_criteria: [
          "Trials run correctly",
          "Results are collected",
          "No race conditions or shared state issues",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "Trials should run sequentially per spec (independent trials, rate limit avoidance)",
        ],
        score: 0.5,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.5,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.5,
            llm_config: {
              rubric:
                "Score 1.0 if verifier flags that trials within a case should run sequentially per the eval spec (not concurrently). Score 0.5 if noted as a concern but not blocking. Score 0.0 if missed entirely.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["subtle-gap"],
      trials: 3,
    },

    {
      id: "verifier-subtle-002",
      component: "lu-verifier",
      description:
        "Subtle gap: division by zero when no cases executed (sampling_rate = 0)",
      input: {
        phase_goal: "Compute aggregate metrics from eval results",
        code_diff: `diff --git a/src/eval/__helpers/metrics.ts b/src/eval/__helpers/metrics.ts
+++ b/src/eval/__helpers/metrics.ts
@@ -1,4 +1,8 @@
+export function computeMetrics(results, totalCases) {
+  const passAt1 = results.filter(r => r.passed).length / totalCases;
+  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
+  return { pass_at_1: passAt1, avg_score: avgScore };
+}`,
        task_description: "Compute pass@1 and avg_score from results",
        verification_criteria: [
          "Handles empty results array",
          "Handles zero totalCases",
          "Returns correct metrics",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: ["Division by zero when results is empty or totalCases is 0"],
        score: 0.5,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.5,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.5,
            llm_config: {
              rubric:
                "Score 1.0 if division by zero risk is identified. Score 0.0 if missed.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["subtle-gap"],
      trials: 3,
    },

    {
      id: "verifier-subtle-003",
      component: "lu-verifier",
      description: "Subtle gap: JSON.parse without try/catch on LLM response",
      input: {
        phase_goal: "Parse LLM judge response safely",
        code_diff: `diff --git a/src/eval/__helpers/llm-grader.ts b/src/eval/__helpers/llm-grader.ts
+++ b/src/eval/__helpers/llm-grader.ts
@@ -5,6 +5,10 @@
+  const response = await adapter.call(model, systemPrompt, userMessage, 0);
+  const parsed = JSON.parse(response.text);
+  return { passed: parsed.passed, score: parsed.score, reason: parsed.reasoning, metadata: {} };`,
        task_description: "Parse judge model JSON response and extract score",
        verification_criteria: [
          "Handles malformed JSON from LLM",
          "Handles missing fields",
          "Returns valid GraderResult always",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: ["No try/catch around JSON.parse - LLM may return non-JSON text"],
        score: 0.3,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.5,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.5,
            llm_config: {
              rubric:
                "Score 1.0 if verifier identifies missing JSON parse error handling. Score 0.0 if missed.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["subtle-gap"],
      trials: 3,
    },

    {
      id: "verifier-subtle-004",
      component: "lu-verifier",
      description:
        "Subtle gap: timestamp not ISO 8601 format (uses Date.now() instead of toISOString)",
      input: {
        phase_goal: "Record eval result timestamps",
        code_diff: `diff --git a/src/eval/__helpers/eval-runner.ts b/src/eval/__helpers/eval-runner.ts
+++ b/src/eval/__helpers/eval-runner.ts
@@ -12,6 +12,7 @@
+  const result = {
+    case_id: evalCase.id,
+    trial: trialNum,
+    passed: graderResult.passed,
+    score: graderResult.score,
+    timestamp: Date.now(),
+  };`,
        task_description: "Build eval result with ISO 8601 timestamp",
        verification_criteria: [
          "timestamp is ISO 8601 string",
          "Matches EvalResultSchema datetime format",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "timestamp uses Date.now() (number) instead of new Date().toISOString() (ISO 8601 string)",
        ],
        score: 0.5,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.5,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.5,
            llm_config: {
              rubric:
                "Score 1.0 if the timestamp type mismatch (number vs ISO string) is identified. Score 0.0 if missed.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["subtle-gap"],
      trials: 3,
    },

    {
      id: "verifier-subtle-005",
      component: "lu-verifier",
      description:
        "Subtle gap: comparison only checks pass_at_1, ignores score regressions",
      input: {
        phase_goal: "Implement regression detection in comparator",
        code_diff: `diff --git a/src/eval/__helpers/eval-comparator.ts b/src/eval/__helpers/eval-comparator.ts
+++ b/src/eval/__helpers/eval-comparator.ts
@@ -5,10 +5,15 @@
+export function compareEvalRuns(baseline, current) {
+  const regressions = [];
+  const improvements = [];
+  for (const caseId of Object.keys(baselineMap)) {
+    if (baselineMap[caseId].passed && !currentMap[caseId].passed) regressions.push(caseId);
+    if (!baselineMap[caseId].passed && currentMap[caseId].passed) improvements.push(caseId);
+  }
+  return { regressions, improvements, verdict: regressions.length > 0 ? "fail" : "pass" };
+}`,
        task_description:
          "Compare eval runs with regression detection including score-based analysis",
        verification_criteria: [
          "Detects pass/fail regressions",
          "Computes score deltas",
          "Uses significance threshold",
          "Produces complete EvalComparison",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "Missing score delta computation",
          "Missing significance threshold",
          "Missing unchanged array",
          "Incomplete EvalComparison fields",
        ],
        score: 0.3,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.5,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.5,
            llm_config: {
              rubric:
                "Score 1.0 if verifier identifies all missing features (score deltas, threshold, unchanged array, full schema compliance). Score 0.5 if partial.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["subtle-gap"],
      trials: 3,
    },

    // ─── FALSE POSITIVE TRAPS (5 cases) ─────────────────────────────────
    // These are valid implementations that should NOT be flagged

    {
      id: "verifier-fp-001",
      component: "lu-verifier",
      description:
        "False positive trap: using lodash get() instead of optional chaining (valid per project rules)",
      input: {
        phase_goal: "Extract nested values from eval output",
        code_diff: `+import get from "lodash/get";
+const score = get(output, "grader_output.score", 0);`,
        task_description: "Extract score from nested eval output",
        verification_criteria: [
          "Safely extracts nested value",
          "Handles missing properties",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if verifier accepts lodash get() as valid. This project prefers lodash over optional chaining per lodash-preference rule. Score 0.0 if flagged as a gap.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["false-positive-trap"],
      trials: 3,
    },

    {
      id: "verifier-fp-002",
      component: "lu-verifier",
      description:
        "False positive trap: factory function pattern instead of class (valid per no-classes rule)",
      input: {
        phase_goal: "Create grader instances",
        code_diff: `+export function createCodeGrader(config) { return { grade: (output) => gradeWithCode(output, config) }; }`,
        task_description: "Create a grader factory",
        verification_criteria: [
          "Creates grader instances",
          "Follows project patterns",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if accepted as valid factory pattern. Score 0.0 if incorrectly flagged for not using class.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["false-positive-trap"],
      trials: 3,
    },

    {
      id: "verifier-fp-003",
      component: "lu-verifier",
      description:
        "False positive trap: returning early from function on error (valid guard clause pattern)",
      input: {
        phase_goal: "Handle invalid suite in runner",
        code_diff: `+export async function runEvalSuite(suite, options) {
+  const parseResult = EvalSuiteSchema.safeParse(suite);
+  if (!parseResult.success) return createEmptyReport(suite.id, parseResult.error.message);
+  // ... rest of implementation`,
        task_description: "Validate suite before running",
        verification_criteria: [
          "Suite is validated",
          "Invalid suites are handled gracefully",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if safeParse+early-return is accepted as valid pattern per schema-first-parsing rule. Score 0.0 if flagged.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["false-positive-trap"],
      trials: 3,
    },

    {
      id: "verifier-fp-004",
      component: "lu-verifier",
      description:
        "False positive trap: using Bun.file instead of node:fs (valid per Bun preference)",
      input: {
        phase_goal: "Read eval report files",
        code_diff: `+export async function loadReport(component, runId) {
+  const path = \`.planning/evals/\${component}/\${runId}.json\`;
+  const file = Bun.file(path);
+  if (!(await file.exists())) return null;
+  return await file.json();
+}`,
        task_description: "Load eval reports from disk",
        verification_criteria: ["Reads JSON files", "Handles missing files"],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if Bun.file() is accepted as correct per Bun preference rule. Score 0.0 if flagged for not using node:fs.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["false-positive-trap"],
      trials: 3,
    },

    {
      id: "verifier-fp-005",
      component: "lu-verifier",
      description:
        "False positive trap: snake_case in schema (valid per API convention)",
      input: {
        phase_goal: "Define eval result schema",
        code_diff: `+export const EvalResultSchema = z.object({
+  case_id: z.string(),
+  trial: z.number(),
+  passed: z.boolean(),
+  score: z.number().min(0).max(1),
+  grader_output: GraderResultSchema,
+  latency_ms: z.number(),
+  token_usage: TokenUsageSchema,
+  cost_usd: z.number(),
+  timestamp: z.string().datetime(),
+});`,
        task_description: "Define EvalResult schema with proper conventions",
        verification_criteria: [
          "All fields defined",
          "Uses project naming conventions",
        ],
      },
      expected: { status: "passed", gaps: [], score: 1.0 },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "passed",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if snake_case is accepted per API snake_case convention rule. Score 0.0 if incorrectly flagged for not using camelCase.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["false-positive-trap"],
      trials: 3,
    },

    // ─── PARTIAL COMPLETENESS (5 cases) ─────────────────────────────────

    {
      id: "verifier-partial-001",
      component: "lu-verifier",
      description: "Partial: 3 of 5 grader strategies implemented",
      input: {
        phase_goal: "Implement all 6 code grader strategies",
        code_diff: `+export function gradeWithCode(output, config) {
+  switch (config.strategy) {
+    case "exact_match": return exactMatch(output, config);
+    case "contains": return containsCheck(output, config);
+    case "regex": return regexMatch(output, config);
+    default: return { passed: false, score: 0, reason: "Unknown strategy" };
+  }
+}`,
        task_description:
          "Implement all code grader strategies: exact_match, contains, regex, set_membership, threshold, custom",
        verification_criteria: [
          "exact_match implemented",
          "contains implemented",
          "regex implemented",
          "set_membership implemented",
          "threshold implemented",
          "custom implemented",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "set_membership not implemented",
          "threshold not implemented",
          "custom not implemented",
        ],
        score: 0.5,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if verifier identifies exactly the 3 missing strategies. Score 0.5 if some identified. Score 0.0 if none found.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["partial"],
      trials: 3,
    },

    {
      id: "verifier-partial-002",
      component: "lu-verifier",
      description: "Partial: reporter writes JSON but missing markdown format",
      input: {
        phase_goal: "Implement eval reporter with JSON and markdown formats",
        code_diff: `+export async function writeJsonReport(report) {
+  const dir = \`.planning/evals/\${report.component}\`;
+  await mkdir(dir, { recursive: true });
+  await Bun.write(\`\${dir}/\${report.run_id}.json\`, JSON.stringify(report, null, 2));
+  await Bun.write(\`\${dir}/latest.json\`, JSON.stringify(report, null, 2));
+  return \`\${dir}/\${report.run_id}.json\`;
+}
+
+export function formatMarkdownReport(report) {
+  // TODO: implement markdown formatting
+  return "";
+}`,
        task_description: "Implement JSON and markdown report generation",
        verification_criteria: [
          "JSON report written to correct path",
          "latest.json updated",
          "Markdown format generates readable table",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: ["formatMarkdownReport is a stub returning empty string"],
        score: 0.6,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 0.6-0.7 if verifier correctly identifies JSON as complete but markdown as stub. Score 1.0 if perfectly accurate.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["partial"],
      trials: 3,
    },

    {
      id: "verifier-partial-003",
      component: "lu-verifier",
      description: "Partial: CLI parses args but missing validation",
      input: {
        phase_goal: "Implement CLI with argument parsing and validation",
        code_diff: `+const suite = getArg(args, "suite", "");
+const trials = getArg(args, "trials", "3");
+const format = getArg(args, "report", "console");
+// Run suite
+const report = await runEvalSuite(loadSuite(suite), { trials: parseInt(trials) });`,
        task_description: "Parse and validate CLI arguments for eval command",
        verification_criteria: [
          "All flags parsed",
          "trials validated as positive integer",
          "format validated against allowed values",
          "Unknown suite produces helpful error",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "No validation for trials",
          "No validation for format",
          "No error handling for unknown suite",
        ],
        score: 0.3,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if all 3 missing validations identified. Score 0.5 if partial.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["partial"],
      trials: 3,
    },

    {
      id: "verifier-partial-004",
      component: "lu-verifier",
      description: "Partial: pass@1 computed but pass@k missing",
      input: {
        phase_goal: "Compute both pass@1 and pass@k aggregate metrics",
        code_diff: `+function aggregateResults(results, caseIds) {
+  let passAt1Count = 0;
+  for (const caseId of caseIds) {
+    const caseResults = results.filter(r => r.case_id === caseId);
+    if (caseResults.some(r => r.passed)) passAt1Count++;
+  }
+  return { pass_at_1: passAt1Count / caseIds.length };
+}`,
        task_description:
          "Compute pass@1 (capability) and pass@k (reliability) metrics",
        verification_criteria: [
          "pass@1 correctly computed",
          "pass@k correctly computed",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: ["pass@k (all trials pass) not computed"],
        score: 0.5,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if missing pass@k identified. Score 0.0 if missed.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["partial"],
      trials: 3,
    },

    {
      id: "verifier-partial-005",
      component: "lu-verifier",
      description:
        "Partial: comparison computes deltas but missing verdict logic",
      input: {
        phase_goal: "Implement full comparison with verdicts",
        code_diff: `+export function compareEvalRuns(baseline, current, threshold = 0.05) {
+  const deltas = {
+    pass_at_1_delta: current.pass_at_1 - baseline.pass_at_1,
+    pass_at_k_delta: current.pass_at_k - baseline.pass_at_k,
+    avg_score_delta: current.avg_score - baseline.avg_score,
+    cost_delta: current.total_cost_usd - baseline.total_cost_usd,
+    latency_delta: current.total_latency_ms - baseline.total_latency_ms,
+  };
+  return { deltas, regressions: [], improvements: [], unchanged: [] };
+}`,
        task_description:
          "Compare eval runs with delta computation and verdict determination",
        verification_criteria: [
          "Deltas computed",
          "Per-case regression detection",
          "Verdict based on threshold",
          "Regressions/improvements populated",
        ],
      },
      expected: {
        status: "gaps_found",
        gaps: [
          "Per-case regression detection not implemented (empty arrays)",
          "Verdict missing",
        ],
        score: 0.4,
      },
      grader: "composite",
      composite_grader_config: {
        graders: [
          {
            type: "code",
            weight: 0.6,
            code_config: {
              strategy: "exact_match",
              expected_value: "gaps_found",
              output_path: "status",
            },
          },
          {
            type: "llm",
            weight: 0.4,
            llm_config: {
              rubric:
                "Score 1.0 if both missing features identified (per-case analysis and verdict). Score 0.5 if one identified.",
            },
          },
        ],
        pass_threshold: 0.7,
      },
      tags: ["partial"],
      trials: 3,
    },
  ],
};
```

## Update `src/eval/index.ts`

Add to the barrel:

```typescript
export { luVerifierEvalSuite } from "./suites/lu-verifier.eval";
```

## Verification

```bash
bunx --bun tsc --noEmit
```

## Notes

- The code diffs in the input fields are simplified representations. Real lu-verifier cases would have full file diffs.
- The composite grader uses 60% code (did it get the right status?) + 40% LLM (was the gap identification complete and accurate?).
- False positive traps are particularly important for lu-verifier -- it should NOT flag valid project patterns as gaps.
