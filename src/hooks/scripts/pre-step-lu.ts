/**
 * pre-step-lu — Pre-step enforcement hook for lu Agent() sub-agents.
 *
 * Fires before Skill and Agent tool invocations during lu execution.
 * Uses prefix-based matching for phase-suffixed agents (classify-{NN},
 * execute-{NN}, etc.) and exact matching for singleton agents (cognition,
 * configure, backlog, milestone-*).
 *
 * @module pre-step-lu
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";
import { resolveGatePath } from "../__helpers/orchestrator-gate-config.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-lu",
  contextPath: resolveGatePath(".planning/state.json"),
  subSkills: new Set([
    // Singleton agents (exact match)
    "cognition",
    "configure",
    "backlog",
    "milestone-learn",
    "milestone-prune",
    "milestone-shadow",
    "milestone-archive",
    "milestone-finalize",
  ]),
  agentPrefixes: new Set([
    // Phase-suffixed agents (prefix match)
    "classify-",
    "discuss-",
    "plan-",
    "plan-gaps-",
    "plan-review-",
    "plan-revise-",
    "execute-",
    "execute-gaps-",
    "harness-",
    "fix-",
    "verify-",
    "review-",
    "learn-",
    "process-data-",
    // v2 research agents
    "research-scope-",
    "research-arch-",
    "research-impl-",
    "research-eco-",
    "research-risk-",
    "research-synth-",
    "research-expand-",
    "research-graduate-",
    // v2 research reviewers
    "review-accuracy-",
    "review-completeness-",
    "review-actionability-",
  ]),
  validStates: {
    // Singleton agents
    cognition: new Set(["idle", "preflight"]),
    configure: new Set(["routed"]),
    backlog: new Set(["configured"]),
    // Phase-suffixed agents (use prefix as key)
    // Bare "executing" remains in every set for backward compat with old state.json files
    "classify-": new Set([
      "idle",
      "scanned",
      "configured",
      "executing",
      "executing.discussing",
    ]),
    "discuss-": new Set([
      "scanned",
      "configured",
      "executing",
      "executing.discussing",
    ]),
    "plan-": new Set([
      "scanned",
      "configured",
      "executing",
      "executing.planning",
    ]),
    "plan-gaps-": new Set(["executing", "executing.planning"]),
    "execute-": new Set(["executing", "executing.running"]),
    "execute-gaps-": new Set(["executing", "executing.running"]),
    "harness-": new Set(["executing", "executing.harnessing"]),
    "fix-": new Set(["executing", "executing.harnessing", "executing.running"]),
    "verify-": new Set(["executing", "executing.verifying"]),
    "review-": new Set(["executing", "executing.reviewing"]),
    "learn-": new Set(["executing", "executing.learning"]),
    "process-data-": new Set(["executing", "executing.learning"]),
    // v2 research agents (not part of linear pipeline — bare executing only)
    "research-scope-": new Set(["executing"]),
    "research-arch-": new Set(["executing"]),
    "research-impl-": new Set(["executing"]),
    "research-eco-": new Set(["executing"]),
    "research-risk-": new Set(["executing"]),
    "research-synth-": new Set(["executing"]),
    "research-expand-": new Set(["executing"]),
    "research-graduate-": new Set(["executing"]),
    "review-accuracy-": new Set(["executing"]),
    "review-completeness-": new Set(["executing"]),
    "review-actionability-": new Set(["executing"]),
    // v2 plan review
    "plan-review-": new Set(["executing", "executing.planning"]),
    "plan-revise-": new Set(["executing", "executing.planning"]),
    // Milestone agents (not part of linear pipeline — bare executing only)
    "milestone-learn": new Set(["executing"]),
    "milestone-prune": new Set(["executing"]),
    "milestone-shadow": new Set(["executing"]),
    "milestone-archive": new Set(["executing"]),
    "milestone-finalize": new Set(["executing"]),
  },
  initialSkill: "cognition",
  use_computed_position: true,
});

await hook();
