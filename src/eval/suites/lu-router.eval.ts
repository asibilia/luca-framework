import type { EvalSuite } from "../__schemas/eval.schemas";

/**
 * Seed eval suite for lu-router complexity classification.
 *
 * Tests whether lu-router correctly classifies task descriptions into
 * the 5 complexity levels: TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL.
 *
 * 25 cases total:
 * - 5 TRIVIAL (clear single-file, low-risk tasks)
 * - 5 SIMPLE (2-3 file, straightforward tasks)
 * - 5 MODERATE (3-5 file, feature-scoped tasks)
 * - 5 COMPLEX (5-10 file, cross-cutting tasks)
 * - 5 CRITICAL (10+ file, architectural tasks)
 *
 * Includes 3 edge cases where adjacent levels are both acceptable.
 *
 * All cases use code-based grading (zero LLM cost for grading).
 */
export const luRouterEvalSuite: EvalSuite = {
  id: "lu-router-classification",
  component: "lu-router",
  description: "Complexity classification accuracy for lu-router agent",
  config: {
    judge_model: "claude-haiku-4-5-20250514",
    timeout_ms: 30_000,
    sampling_rate: 1.0,
    use_batch_api: false,
  },
  cases: [
    // ─── TRIVIAL (5 cases) ─────────────────────────────────────────────

    {
      id: "router-trivial-001",
      component: "lu-router",
      description: "Fix a typo in a README file",
      input: {
        task_description: "Fix the typo 'recieve' -> 'receive' in README.md",
        cognitive_report: "",
      },
      expected: { complexity: "TRIVIAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "TRIVIAL",
        output_path: "complexity",
      },
      tags: ["smoke", "trivial"],
      trials: 3,
    },

    {
      id: "router-trivial-002",
      component: "lu-router",
      description: "Update a version number in package.json",
      input: {
        task_description: "Bump version from 5.3.3 to 5.3.4 in package.json",
        cognitive_report: "",
      },
      expected: { complexity: "TRIVIAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "TRIVIAL",
        output_path: "complexity",
      },
      tags: ["trivial"],
      trials: 3,
    },

    {
      id: "router-trivial-003",
      component: "lu-router",
      description: "Add a single JSDoc comment to an existing function",
      input: {
        task_description:
          "Add a JSDoc comment to the createFingerprint function in src/iteration/__helpers/convergence.ts",
        cognitive_report: "",
      },
      expected: { complexity: "TRIVIAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "TRIVIAL",
        output_path: "complexity",
      },
      tags: ["trivial"],
      trials: 3,
    },

    {
      id: "router-trivial-004",
      component: "lu-router",
      description: "Change a default config value",
      input: {
        task_description:
          "Change the default stale_threshold from 2 to 3 in the iteration config schema",
        cognitive_report: "",
      },
      expected: { complexity: "TRIVIAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "TRIVIAL",
        output_path: "complexity",
      },
      tags: ["trivial"],
      trials: 3,
    },

    {
      id: "router-trivial-005",
      component: "lu-router",
      description: "Remove an unused import",
      input: {
        task_description:
          "Remove the unused 'filter' import from src/eval/__helpers/eval-runner.ts",
        cognitive_report: "",
      },
      expected: { complexity: "TRIVIAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "TRIVIAL",
        output_path: "complexity",
      },
      tags: ["trivial"],
      trials: 3,
    },

    // ─── SIMPLE (5 cases) ──────────────────────────────────────────────

    {
      id: "router-simple-001",
      component: "lu-router",
      description: "Add a new CLI flag to an existing command",
      input: {
        task_description:
          "Add a --verbose flag to the luca-bridge read-status command that includes full state details in the output",
        cognitive_report: "",
      },
      expected: { complexity: "SIMPLE" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "SIMPLE",
        output_path: "complexity",
      },
      tags: ["simple"],
      trials: 3,
    },

    {
      id: "router-simple-002",
      component: "lu-router",
      description: "Add a new Zod schema field and update related type",
      input: {
        task_description:
          "Add a 'priority' field (enum: low/medium/high, default 'medium') to the EvalCaseSchema and update all type references",
        cognitive_report: "",
      },
      expected: { complexity: "SIMPLE" },
      grader: "code",
      code_grader_config: {
        strategy: "set_membership",
        allowed_values: ["TRIVIAL", "SIMPLE"],
        output_path: "complexity",
      },
      tags: ["simple"],
      trials: 3,
    },

    {
      id: "router-simple-003",
      component: "lu-router",
      description: "Create a small utility function with types",
      input: {
        task_description:
          "Create a formatDuration utility in src/shared/__helpers/ that converts milliseconds to human-readable '2m 30s' format, with TypeScript types",
        cognitive_report: "",
      },
      expected: { complexity: "SIMPLE" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "SIMPLE",
        output_path: "complexity",
      },
      tags: ["simple"],
      trials: 3,
    },

    {
      id: "router-simple-004",
      component: "lu-router",
      description: "Rename a function and update its callers",
      input: {
        task_description:
          "Rename computeFingerprintOverlap to computeJaccardSimilarity in convergence.ts and update the 2 call sites",
        cognitive_report: "",
      },
      expected: { complexity: "SIMPLE" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "SIMPLE",
        output_path: "complexity",
      },
      tags: ["simple"],
      trials: 3,
    },

    {
      id: "router-simple-005",
      component: "lu-router",
      description: "Add error handling to an existing function",
      input: {
        task_description:
          "Add try/catch error handling with typed error response to the loadLatestReport function in eval-reporter.ts",
        cognitive_report: "",
      },
      expected: { complexity: "SIMPLE" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "SIMPLE",
        output_path: "complexity",
      },
      tags: ["simple"],
      trials: 3,
    },

    // ─── MODERATE (5 cases) ─────────────────────────────────────────────

    {
      id: "router-moderate-001",
      component: "lu-router",
      description:
        "Implement a new feature with schema, helper, and barrel update",
      input: {
        task_description:
          "Add a response caching layer to the eval runner: create a cache schema, implement cache-read/cache-write helpers, and integrate into runEvalSuite so repeated identical inputs skip the LLM call",
        cognitive_report: "",
      },
      expected: { complexity: "MODERATE" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "MODERATE",
        output_path: "complexity",
      },
      tags: ["moderate"],
      trials: 3,
    },

    {
      id: "router-moderate-002",
      component: "lu-router",
      description: "Add a new rule with schema validation",
      input: {
        task_description:
          "Create a new Luca rule 'eval-coverage.rule.ts' that checks whether agents have corresponding eval suites, with Zod schema for the rule config, and register it in the rule registry",
        cognitive_report: "",
      },
      expected: { complexity: "MODERATE" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "MODERATE",
        output_path: "complexity",
      },
      tags: ["moderate"],
      trials: 3,
    },

    {
      id: "router-moderate-003",
      component: "lu-router",
      description: "Refactor a function and update 3-4 consumers",
      input: {
        task_description:
          "Refactor computeConvergenceSignals to accept an options object instead of positional parameters, update all 4 call sites in convergence.ts, stall-detector.ts, and the CLI entry point",
        cognitive_report: "",
      },
      expected: { complexity: "MODERATE" },
      grader: "code",
      code_grader_config: {
        strategy: "set_membership",
        allowed_values: ["SIMPLE", "MODERATE"],
        output_path: "complexity",
      },
      tags: ["moderate"],
      trials: 3,
    },

    {
      id: "router-moderate-004",
      component: "lu-router",
      description: "Add integration between two existing modules",
      input: {
        task_description:
          "Integrate the eval reporter with the harness verification pipeline so that after each harness run, eval metrics for affected agents are included in the harness report output",
        cognitive_report: "",
      },
      expected: { complexity: "MODERATE" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "MODERATE",
        output_path: "complexity",
      },
      tags: ["moderate"],
      trials: 3,
    },

    {
      id: "router-moderate-005",
      component: "lu-router",
      description: "Implement validation with multiple edge cases",
      input: {
        task_description:
          "Implement input validation for the luca eval CLI command: validate --suite exists, --tag matches available tags, --trials is positive integer, --judge-model is valid model ID, with helpful error messages for each",
        cognitive_report: "",
      },
      expected: { complexity: "MODERATE" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "MODERATE",
        output_path: "complexity",
      },
      tags: ["moderate"],
      trials: 3,
    },

    // ─── COMPLEX (5 cases) ──────────────────────────────────────────────

    {
      id: "router-complex-001",
      component: "lu-router",
      description: "New domain with cross-cutting impact",
      input: {
        task_description:
          "Create the src/eval/ domain with Zod schemas, eval runner, reporter, comparator, three grader types, and CLI integration. Involves 10 new files across schemas, helpers, suites, and CLI entry point.",
        cognitive_report:
          "Memory recall: This project has strict domain architecture with T0-T3 tiers. New domains must follow Archetype B conventions. Intuition: CAUTION - cross-domain boundary risks.",
      },
      expected: { complexity: "COMPLEX" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "COMPLEX",
        output_path: "complexity",
      },
      tags: ["complex"],
      trials: 3,
    },

    {
      id: "router-complex-002",
      component: "lu-router",
      description: "Multi-file refactor with external integration",
      input: {
        task_description:
          "Refactor the compiler pipeline to support pluggable adapters: extract the Claude-specific compilation into a Claude adapter, define an adapter interface in src/workflow/, update all compiler entry points, and add a new API adapter skeleton",
        cognitive_report:
          "Memory recall: Previous compiler changes caused cascading type errors. Pitfall: changing compile.ts signature breaks all downstream callers. RISK flag present.",
      },
      expected: { complexity: "COMPLEX" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "COMPLEX",
        output_path: "complexity",
      },
      tags: ["complex"],
      trials: 3,
    },

    {
      id: "router-complex-003",
      component: "lu-router",
      description: "Database schema change with migration",
      input: {
        task_description:
          "Add a new 'eval_history' table to the MuninnDB schema, create migration scripts, update the MuninnDB adapter to support eval result storage, and integrate with the eval reporter for persistent storage",
        cognitive_report:
          "Intuition flags: RISK (database schema changes), UNKNOWN (MuninnDB migration patterns not well-documented)",
      },
      expected: { complexity: "COMPLEX" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "COMPLEX",
        output_path: "complexity",
      },
      tags: ["complex"],
      trials: 3,
    },

    {
      id: "router-complex-004",
      component: "lu-router",
      description: "Cross-cutting concern touching multiple domains",
      input: {
        task_description:
          "Implement token budget tracking across the iteration, harness, and observability domains: add token counting to each harness check, aggregate in iteration budget, surface in observability metrics, and update the CLI to show token usage",
        cognitive_report: "",
      },
      expected: { complexity: "COMPLEX" },
      grader: "code",
      code_grader_config: {
        strategy: "set_membership",
        allowed_values: ["COMPLEX", "CRITICAL"],
        output_path: "complexity",
      },
      tags: ["complex"],
      trials: 3,
    },

    {
      id: "router-complex-005",
      component: "lu-router",
      description: "New integration with external service",
      input: {
        task_description:
          "Integrate PostHog analytics into the Luca workflow: add event tracking for phase completion, eval results, and convergence metrics. Create a PostHog adapter, define event schemas, and add opt-in configuration",
        cognitive_report:
          "Intuition flags: RISK (external service dependency), CAUTION (privacy implications of analytics)",
      },
      expected: { complexity: "COMPLEX" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "COMPLEX",
        output_path: "complexity",
      },
      tags: ["complex"],
      trials: 3,
    },

    // ─── CRITICAL (5 cases) ─────────────────────────────────────────────

    {
      id: "router-critical-001",
      component: "lu-router",
      description: "Full architecture redesign",
      input: {
        task_description:
          "Replace the prose orchestrator (lu.skill.ts, 1597 lines) with a typed DAG workflow engine. Define workflow steps as typed objects with Zod schemas, implement a DAG executor, create compilation adapters for Claude and API formats, and migrate all 13 workflow phases",
        cognitive_report:
          "Memory recall: lu.skill.ts is the central orchestrator. Changing it affects every workflow path. Past attempts at partial refactors caused cascading failures. Intuition: RISK and UNKNOWN both present.",
      },
      expected: { complexity: "CRITICAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "CRITICAL",
        output_path: "complexity",
      },
      tags: ["critical"],
      trials: 3,
    },

    {
      id: "router-critical-002",
      component: "lu-router",
      description: "Security overhaul",
      input: {
        task_description:
          "Implement API key rotation and secret management across the framework: add encrypted secret storage, rotate Anthropic API keys automatically, audit all env var access points, add secret scanning to pre-commit hooks, and update CI/CD pipelines",
        cognitive_report:
          "Intuition flags: RISK (security-critical), UNKNOWN (encryption patterns not established in codebase)",
      },
      expected: { complexity: "CRITICAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "CRITICAL",
        output_path: "complexity",
      },
      tags: ["critical"],
      trials: 3,
    },

    {
      id: "router-critical-003",
      component: "lu-router",
      description: "Platform migration",
      input: {
        task_description:
          "Migrate the entire Luca framework from Bun to Deno: update all import statements to use Deno conventions, replace Bun-specific APIs (Bun.file, Bun.write, bun:sqlite) with Deno equivalents, update the test runner, CI/CD, and all documentation",
        cognitive_report:
          "Intuition flags: RISK (system-wide impact), UNKNOWN (Deno API compatibility gaps unknown)",
      },
      expected: { complexity: "CRITICAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "CRITICAL",
        output_path: "complexity",
      },
      tags: ["critical"],
      trials: 3,
    },

    {
      id: "router-critical-004",
      component: "lu-router",
      description: "Multi-tenant architecture addition",
      input: {
        task_description:
          "Add multi-tenant support to Luca: each project gets isolated MuninnDB vaults, separate eval history, independent complexity matrices, tenant-scoped API keys, and a tenant management CLI. Requires changes to state machine, config system, and all domain schemas.",
        cognitive_report: "",
      },
      expected: { complexity: "CRITICAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "CRITICAL",
        output_path: "complexity",
      },
      tags: ["critical"],
      trials: 3,
    },

    {
      id: "router-critical-005",
      component: "lu-router",
      description: "Breaking migration affecting all consumers",
      input: {
        task_description:
          "Redesign the agent schema system: change AgentConfig from a flat structure to a hierarchical capability-based model, migrate all 35+ agent definitions, update all 3 compilers (Claude, Cursor, Plugin), update the model routing table, and version the schema with backward compatibility layer",
        cognitive_report:
          "Memory recall: Agent schema is imported by T2 entity domains and consumed by T3 compilers. Changes cascade everywhere. Intuition: RISK (breaking change), UNKNOWN (migration path unclear).",
      },
      expected: { complexity: "CRITICAL" },
      grader: "code",
      code_grader_config: {
        strategy: "exact_match",
        expected_value: "CRITICAL",
        output_path: "complexity",
      },
      tags: ["critical"],
      trials: 3,
    },
  ],
};
