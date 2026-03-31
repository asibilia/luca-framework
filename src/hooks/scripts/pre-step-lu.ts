/**
 * pre-step-lu — Pre-step enforcement hook for lu Agent() sub-agents.
 *
 * Fires before Skill and Agent tool invocations during lu execution.
 * Uses prefix-based matching for phase-suffixed agents (classify-{NN},
 * execute-{NN}, etc.) and exact matching for singleton agents (cognition,
 * configure, backlog, milestone-*).
 *
 * @module pre-step-lu
 * @see docs/skill-to-agent-migration/architecture.md
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
    "execute-",
    "execute-gaps-",
    "harness-",
    "fix-",
    "verify-",
    "review-",
    "learn-",
    "process-data-",
  ]),
  validStates: {
    // Singleton agents
    cognition: new Set(["idle", "preflight"]),
    configure: new Set(["routed"]),
    backlog: new Set(["configured"]),
    // Phase-suffixed agents (use prefix as key)
    "classify-": new Set(["idle", "scanned", "configured", "executing"]),
    "discuss-": new Set(["scanned", "configured", "executing"]),
    "plan-": new Set(["scanned", "configured", "executing"]),
    "plan-gaps-": new Set(["executing"]),
    "execute-": new Set(["executing"]),
    "execute-gaps-": new Set(["executing"]),
    "harness-": new Set(["executing"]),
    "fix-": new Set(["executing"]),
    "verify-": new Set(["executing"]),
    "review-": new Set(["executing"]),
    "learn-": new Set(["executing"]),
    "process-data-": new Set(["executing"]),
    // Milestone agents
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
