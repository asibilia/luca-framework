# Config Changes

> New config sections, Zod schemas, vault routing updates, and complexity matrix extensions for v2.

---

## Overview

V2 adds three categories of configuration changes:

| Category          | Scope                                          | Breaking? |
| ----------------- | ---------------------------------------------- | --------- |
| Workflow version  | New `workflow.version` field                   | No        |
| Research config   | New `research` top-level section               | No        |
| Complexity matrix | New optional fields in existing matrix entries | No        |
| Vault routing     | New `research:*` concept prefix                | No        |

All changes are additive. Missing fields default to v1 behavior.

---

## 1. Workflow Version Field

### Change

Add `version` field to the existing `workflow` section.

### Current Config (v1)

```json
{
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "code_review": true,
    "uat_required": true,
    "always_verify": true,
    "capture_learnings": true,
    "opinionated_guidelines": true,
    "tech_stack_profiles": ["typescript"]
  }
}
```

### Updated Config (v2)

```json
{
  "workflow": {
    "version": "v1",
    "research": true,
    "plan_check": true,
    "verifier": true,
    "code_review": true,
    "uat_required": true,
    "always_verify": true,
    "capture_learnings": true,
    "opinionated_guidelines": true,
    "tech_stack_profiles": ["typescript"]
  }
}
```

### Zod Schema

```typescript
import { z } from "zod";

/**
 * Workflow version discriminator.
 *
 * Determines which pipeline variant runs:
 * - "v1": Original linear pipeline (discuss -> plan -> execute -> verify)
 * - "v2": Extended pipeline with parallel research, review loops, graduation
 *
 * Default: "v1" -- v2 is opt-in only.
 */
export const WorkflowVersionSchema = z.enum(["v1", "v2"]).default("v1");

export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;
```

### Integration Point

The orchestrator (`lu.skill.ts`) reads this field to decide which pipeline to execute:

```typescript
// In orchestrator prompt or bridge read:
const workflowVersion = config.workflow?.version ?? "v1";

if (workflowVersion === "v2") {
  // Run v2 pipeline: research-expand -> review -> graduate -> plan-review -> ...
} else {
  // Run v1 pipeline: discuss -> plan -> execute -> ...
}
```

---

## 2. Research Configuration Section

### Change

Add a new top-level `research` section to `.planning/config.json`.

> **Convention note**: All keys use **camelCase** to match the existing config convention (e.g., `cognitivePreflight`, `planVerificationIterations` in `complexity.matrix`). The `research` section is internal config, not an API payload, so the api-snake-case rule does not apply.

### Schema Definition

```typescript
import { z } from "zod";

/**
 * Research system configuration for v2 workflow.
 *
 * Controls parallel research, review loops, graduation, and per-task recall.
 * All fields have defaults that match v1 behavior (features disabled).
 * Uses camelCase for all keys per existing config convention (Decision 9).
 *
 * When `workflow.version` is "v1", this section is ignored entirely.
 * When `workflow.version` is "v2", individual features can be toggled.
 */
export const ResearchConfigSchema = z.object({
  /**
   * Number of parallel researcher agents to spawn.
   * Set to 4 for full v2 multi-agent research. Default 4.
   * The complexity matrix does NOT override this -- researcher/reviewer
   * counts are always 4/3 at all complexity levels (Decision 13).
   */
  parallelResearchers: z.number().int().positive().default(4),

  /**
   * Research review loop configuration.
   */
  reviewLoop: z
    .object({
      /**
       * Maximum iterations before escalation.
       * Overridden per-complexity by complexity.matrix.*.researchReviewIterations.
       */
      maxIterations: z.number().int().positive().default(3),

      /**
       * Whether to continue looping for IMPORTANT findings (not just CRITICAL).
       * When true, loop continues if iteration < max and IMPORTANT gaps remain.
       */
      continueForImportant: z.boolean().default(true),
    })
    .default({}),

  /**
   * Plan review loop configuration.
   */
  planReviewLoop: z
    .object({
      /**
       * Maximum iterations before escalation.
       * Overridden per-complexity by complexity.matrix.*.planReviewIterations.
       */
      maxIterations: z.number().int().positive().default(2),
    })
    .default({}),

  /**
   * Graduation configuration.
   */
  graduation: z
    .object({
      /**
       * Minimum confidence level for graduation.
       * Only HIGH and MEDIUM confidence findings graduate.
       */
      confidenceThreshold: z.enum(["HIGH", "MEDIUM"]).default("MEDIUM"),

      /**
       * Scoring threshold for the weighted sum formula.
       * score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
       * Findings below this threshold are filtered out.
       */
      scoringThreshold: z.number().min(0).max(1).default(0.55),

      /**
       * Whether to auto-cleanup research:* engrams after milestone completion.
       */
      autoCleanupAfterMilestone: z.boolean().default(false),
    })
    .default({}),

  /**
   * Per-task recall configuration for executor.
   */
  perTaskRecall: z
    .object({
      /**
       * Whether per-task MuninnDB recall is enabled.
       * When false, executor receives full plan context (v1 behavior).
       * Requires graduation to produce engrams first.
       */
      enabled: z.boolean().default(true),

      /**
       * Maximum engrams to recall per task.
       * Limits context injection size.
       */
      maxEngramsPerTask: z.number().int().positive().default(5),
    })
    .default({}),
});

export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;
```

### Example Config

```json
{
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true
    },
    "planReviewLoop": {
      "maxIterations": 2
    },
    "graduation": {
      "confidenceThreshold": "MEDIUM",
      "scoringThreshold": 0.55,
      "autoCleanupAfterMilestone": false
    },
    "perTaskRecall": {
      "enabled": true,
      "maxEngramsPerTask": 5
    }
  }
}
```

### Precedence: Complexity Matrix vs. Research Config

The complexity matrix provides **per-complexity-level overrides** for iteration budgets. The research config provides **global defaults**. Precedence:

1. `complexity.matrix.{LEVEL}.researchReviewIterations` overrides `research.reviewLoop.maxIterations`
2. `complexity.matrix.{LEVEL}.planReviewIterations` overrides `research.planReviewLoop.maxIterations`
3. Researcher/reviewer **counts** are NOT in the complexity matrix -- they are always 4 researchers and 3 reviewers at all complexity levels (per Decision 13). The `parallelResearchers` field is in the research config only.
4. If a complexity matrix field is absent (0 or missing), the research config default applies.

### Dependency Validation

The schema should enforce logical dependencies between features:

```typescript
/**
 * Refined research config with cross-field validation.
 *
 * Enforces logical constraints:
 * - perTaskRecall requires graduation scoring to be configured
 *   (nothing to recall without graduated engrams)
 */
export const ResearchConfigRefinedSchema = ResearchConfigSchema.refine(
  (config) => {
    if (
      config.perTaskRecall.enabled &&
      config.graduation.scoringThreshold > 0.95
    ) {
      return false;
    }
    return true;
  },
  {
    message:
      "perTaskRecall requires graduation to produce engrams (scoringThreshold too high would filter everything)",
  },
);
```

---

## 3. Complexity Matrix Extensions

### Change

Add optional fields to each complexity level entry in the existing `complexity.matrix` section.

### Current Matrix Entry (v1)

```json
{
  "MODERATE": {
    "cognitivePreflight": "full",
    "planVerificationIterations": 1,
    "harnessFixIterations": 2,
    "verifyFixIterations": 1,
    "verificationMode": "standard",
    "recallDepth": 3
  }
}
```

### Updated Matrix Entry (v2)

```json
{
  "MODERATE": {
    "cognitivePreflight": "full",
    "planVerificationIterations": 1,
    "harnessFixIterations": 2,
    "verifyFixIterations": 1,
    "verificationMode": "standard",
    "recallDepth": 3,
    "researchReviewIterations": 2,
    "planReviewIterations": 2
  }
}
```

### New Fields

| Field                      | Type   | Default (if absent) | Purpose                                                                                 |
| -------------------------- | ------ | ------------------- | --------------------------------------------------------------------------------------- |
| `researchReviewIterations` | number | 1                   | Max iterations for research review loop (overrides `research.reviewLoop.maxIterations`) |
| `planReviewIterations`     | number | 1                   | Max iterations for plan review loop (overrides `research.planReviewLoop.maxIterations`) |

> **Note**: Researcher and reviewer **counts** are NOT in the complexity matrix. Per Decision 13, counts are always 4 researchers and 3 reviewers at all complexity levels. The count is configured only in `research.parallelResearchers` (default 4). Complexity affects model tier and iteration budget, not agent count.

### Schema Extension

```typescript
/**
 * Extended complexity matrix entry schema with v2 fields.
 *
 * All v2 fields are optional with defaults that match v1 behavior.
 * This ensures backward compatibility with existing config files.
 *
 * Researcher/reviewer counts are NOT per-complexity -- they are global
 * in the research config section (Decision 13: 3 reviewers at all levels).
 * Only iteration budgets vary by complexity (Decision 14).
 */
export const ComplexityMatrixEntrySchema = z.object({
  // Existing v1 fields
  cognitivePreflight: z.enum(["lite", "full"]),
  planVerificationIterations: z.number().int().nonnegative(),
  harnessFixIterations: z.number().int().nonnegative(),
  verifyFixIterations: z.number().int().nonnegative(),
  verificationMode: z.enum(["quick", "standard", "full", "full+human"]),
  recallDepth: z.number().int().nonnegative().nullable(),

  // New v2 fields (optional, defaults to v1 behavior)
  // These override research.reviewLoop.maxIterations and
  // research.planReviewLoop.maxIterations per complexity level.
  researchReviewIterations: z.number().int().nonnegative().default(1),
  planReviewIterations: z.number().int().nonnegative().default(1),
});
```

### Full v2 Complexity Matrix

Iteration budgets per Decision 14. Researcher/reviewer counts are NOT per-complexity (always 4/3 per Decision 13).

```json
{
  "complexity": {
    "defaultLevel": "auto",
    "matrix": {
      "TRIVIAL": {
        "cognitivePreflight": "lite",
        "planVerificationIterations": 1,
        "harnessFixIterations": 1,
        "verifyFixIterations": 1,
        "verificationMode": "quick",
        "recallDepth": 1,
        "researchReviewIterations": 1,
        "planReviewIterations": 1
      },
      "SIMPLE": {
        "cognitivePreflight": "lite",
        "planVerificationIterations": 1,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "quick",
        "recallDepth": 1,
        "researchReviewIterations": 2,
        "planReviewIterations": 1
      },
      "MODERATE": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 1,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "standard",
        "recallDepth": 3,
        "researchReviewIterations": 2,
        "planReviewIterations": 2
      },
      "COMPLEX": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 2,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "full",
        "recallDepth": null,
        "researchReviewIterations": 3,
        "planReviewIterations": 2
      },
      "CRITICAL": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 3,
        "harnessFixIterations": 3,
        "verifyFixIterations": 2,
        "verificationMode": "full+human",
        "recallDepth": null,
        "researchReviewIterations": 3,
        "planReviewIterations": 3
      }
    }
  }
}
```

---

## 4. Vault Routing Updates

### New Concept Prefix: `research:*`

Add `research:*` to the write routing table. Research findings are project-scoped (not useful in a different repo), so they route to the **repo vault**.

### Changes to `.claude/rules/vault-routing.md`

Add to the Write Routing Heuristic table:

| Concept Prefix | Write To   | Rationale                                  |
| -------------- | ---------- | ------------------------------------------ |
| `research:*`   | Repo vault | Research findings are project/phase-scoped |

### Changes to `~/.claude/rules/vault-guard.md`

Mirror the same addition in the global vault guard rule.

### Recall Routing

Add to the Recall Routing section:

| Memory Type  | Vault Source    | Rationale                                     |
| ------------ | --------------- | --------------------------------------------- |
| `research:*` | Repo vault only | Research is project-scoped, not cross-cutting |

### Research Concept Prefix Subtypes

```
research:approach-*   -- Recommended strategies and approaches
research:pattern-*    -- Design patterns specific to this research
research:api-*        -- API references and verified usage
research:pitfall-*    -- Pitfalls discovered during research
research:config-*     -- Configuration details and recommended values
research:decision-*   -- Decisions locked during research/discussion
```

---

## 5. Complete Example Config (v2 Fully Enabled)

```json
{
  "branding": {
    "frameworkName": "Luca",
    "commandPrefix": "lu",
    "ticketPattern": "[A-Z]+-\\d+",
    "placeholderTicket": "PROJ-0000"
  },
  "stack": "typescript",
  "workTracker": "github",
  "mode": "interactive",
  "depth": "comprehensive",
  "model_profile": "balanced",
  "cognitive": {
    "enabled": true,
    "memory_recall": true,
    "working_memory": true,
    "intuition_check": true,
    "routing": "auto"
  },
  "workflow": {
    "version": "v2",
    "research": true,
    "plan_check": true,
    "verifier": true,
    "code_review": true,
    "uat_required": true,
    "always_verify": true,
    "capture_learnings": true,
    "opinionated_guidelines": true,
    "tech_stack_profiles": ["typescript"]
  },
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true
    },
    "planReviewLoop": {
      "maxIterations": 2
    },
    "graduation": {
      "confidenceThreshold": "MEDIUM",
      "scoringThreshold": 0.55,
      "autoCleanupAfterMilestone": false
    },
    "perTaskRecall": {
      "enabled": true,
      "maxEngramsPerTask": 5
    }
  },
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2
  },
  "gates": {
    "confirm_project": true,
    "confirm_phases": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_plan": true,
    "execute_next_plan": true,
    "issues_review": true,
    "confirm_transition": true,
    "premortem": true,
    "process_data": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  },
  "harness": {
    "enabled": true,
    "maxFixIterations": 3,
    "failFast": false,
    "checks": [
      {
        "name": "test",
        "command": "bun test",
        "enabled": true,
        "timeout": 120,
        "parser": "bun-test"
      },
      {
        "name": "typecheck",
        "command": "bunx --bun tsc --noEmit",
        "enabled": true,
        "timeout": 60,
        "parser": "tsc"
      },
      {
        "name": "lint",
        "command": "bunx --bun eslint . --format json",
        "enabled": false,
        "timeout": 60,
        "parser": "eslint"
      },
      {
        "name": "build",
        "command": "bun run check:drift",
        "enabled": true,
        "timeout": 120,
        "parser": "generic"
      }
    ]
  },
  "iteration": {
    "default_mode": "afk",
    "soft_stop_percent": 80,
    "stale_threshold": 2,
    "promotion_threshold": 3
  },
  "complexity": {
    "defaultLevel": "auto",
    "matrix": {
      "TRIVIAL": {
        "cognitivePreflight": "lite",
        "planVerificationIterations": 1,
        "harnessFixIterations": 1,
        "verifyFixIterations": 1,
        "verificationMode": "quick",
        "recallDepth": 1,
        "researchReviewIterations": 1,
        "planReviewIterations": 1
      },
      "SIMPLE": {
        "cognitivePreflight": "lite",
        "planVerificationIterations": 1,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "quick",
        "recallDepth": 1,
        "researchReviewIterations": 2,
        "planReviewIterations": 1
      },
      "MODERATE": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 1,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "standard",
        "recallDepth": 3,
        "researchReviewIterations": 2,
        "planReviewIterations": 2
      },
      "COMPLEX": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 2,
        "harnessFixIterations": 2,
        "verifyFixIterations": 1,
        "verificationMode": "full",
        "recallDepth": null,
        "researchReviewIterations": 3,
        "planReviewIterations": 2
      },
      "CRITICAL": {
        "cognitivePreflight": "full",
        "planVerificationIterations": 3,
        "harnessFixIterations": 3,
        "verifyFixIterations": 2,
        "verificationMode": "full+human",
        "recallDepth": null,
        "researchReviewIterations": 3,
        "planReviewIterations": 3
      }
    }
  },
  "lu": {
    "oversight": "full-auto",
    "max_phases_per_session": 10,
    "auto_plan_phases": true,
    "skip_uat": true,
    "gap_closure_retries": 1,
    "pause_on_critical_review": true,
    "cross_milestone": false,
    "backlog_scan": true
  },
  "planner": {
    "session_cap_minutes": 180,
    "weekly_allocation": {
      "needle_movers": 60,
      "quick_wins": 25,
      "maintenance": 10,
      "reserve": 5
    },
    "zone_boundaries": {
      "peak_end": 30,
      "good_end": 50,
      "degrading_end": 70
    },
    "cold_start_costs": {
      "TRIVIAL": 5,
      "SIMPLE": 10,
      "MODERATE": 20,
      "COMPLEX": 35,
      "CRITICAL": 50
    }
  },
  "dogfood": {
    "enabled": true,
    "source": "src/",
    "outputs": [".claude/"],
    "build_command": "bun run build:all",
    "lock_file": ".claude/.session-lock",
    "manifest_file": ".claude/.build-manifest.json"
  },
  "runtime": "bun",
  "muninn": {
    "vault": "luca-framework"
  },
  "context_management": {
    "clear_suggestion_threshold": 42,
    "clear_suggestion_enabled": true,
    "observation_on_zone_transition": true
  },
  "shadow_debt": {
    "enabled": true,
    "phase_scan_mode": "quick",
    "milestone_scan_mode": "full",
    "block_milestone_on_critical": true,
    "allowlist": ["scripts/", ".planning/", "docs/", "packages/"],
    "denylist_patterns": [
      "test-*.ts",
      "debug-*.ts",
      "check-*.ts",
      "fix-*.ts",
      "temp-*",
      "tmp-*",
      "scratch-*"
    ],
    "known_good_script_dirs": [
      "scripts/",
      "src/hooks/scripts/",
      ".claude/hooks/"
    ],
    "known_artifact_dirs": [
      ".playwright-cli",
      ".next",
      ".turbo",
      ".cache",
      "coverage"
    ]
  }
}
```

---

## 6. Schema File Location

The new Zod schemas should live in the appropriate domain per the module boundary rules. Per the domain-architecture structural invariant, schemas live in `__schemas/` directories -- not inline.

| Schema                            | Domain     | File                                                               |
| --------------------------------- | ---------- | ------------------------------------------------------------------ |
| `WorkflowVersionSchema`           | shared     | `src/shared/__schemas/workflow-version.schemas.ts`                 |
| `ResearchConfigSchema`            | shared     | `src/shared/__schemas/research-config.schemas.ts`                  |
| `ComplexityMatrixEntrySchema` ext | complexity | `src/complexity/__schemas/complexity.schemas.ts` (extend existing) |

The schemas are T0 (Foundation) since they define config shapes consumed by multiple higher-tier modules.

## 7. Config Parser Updates

The existing config parser at `src/shared/__schemas/lu-config.schemas.ts` must be extended to consume the new `research` section and `workflow.version` field. Without this, the Zod schemas above would be dead code -- nothing would actually read and validate the config.

| File to Modify                              | Change                                                                |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `src/shared/__schemas/lu-config.schemas.ts` | Import and compose `ResearchConfigSchema` and `WorkflowVersionSchema` |

The config parser should import the new schemas and add them to the top-level config shape. Example integration:

```typescript
import { ResearchConfigSchema } from "./research-config.schemas";
import { WorkflowVersionSchema } from "./workflow-version.schemas";

// In the top-level config schema, add:
// workflow.version field (extends existing workflow section)
// research section (new top-level key)
```

This file should be modified in **Phase 6** (Orchestrator Integration), or earlier if schema validation is needed during development phases.

---

## Related Documentation

- [migration-from-v1.md](migration-from-v1.md) -- How config changes enable gradual migration
- [phased-rollout.md](phased-rollout.md) -- When each config change is implemented
- [new-agents-needed.md](new-agents-needed.md) -- Agents that these configs control
- [new-skills-needed.md](new-skills-needed.md) -- Skills that read these configs
