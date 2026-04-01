/**
 * pre-step-milestone-complete — Pre-step enforcement hook for milestone-complete Agent() sub-agents.
 *
 * Fires before Skill and Agent tool invocations during milestone-complete
 * execution to verify state ordering.
 *
 * @module pre-step-milestone-complete
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-milestone-complete",
  contextPath: "/tmp/milestone-complete-context.json",
  subSkills: new Set([
    "milestone-learn",
    "milestone-prune",
    "milestone-shadow",
    "milestone-archive",
    "milestone-finalize",
  ]),
  validStates: {
    "milestone-learn": new Set(["idle"]),
    "milestone-prune": new Set(["learned"]),
    "milestone-shadow": new Set(["pruned"]),
    "milestone-archive": new Set(["scanned"]),
    "milestone-finalize": new Set(["archived"]),
  },
  initialSkill: "milestone-learn",
});

await hook();
