/**
 * pre-step-milestone-complete — Pre-step enforcement hook for milestone-complete sub-skills.
 *
 * Fires before Skill tool invocations during milestone-complete execution to
 * verify that the state machine is in the correct state before each sub-skill
 * runs. If the orchestrator attempts to call a sub-skill out of order, the
 * hook blocks the call.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * @module pre-step-milestone-complete
 * @see .planning/phases/224-anti-skip-rollout/01-PLAN.md Task 8
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-milestone-complete",
  contextPath: "/tmp/milestone-complete-context.json",
  subSkills: new Set([
    "milestone-learn",
    "milestone-prune",
    "milestone-shadow-gate",
    "milestone-archive",
    "milestone-finalize",
  ]),
  validStates: {
    "milestone-learn": new Set(["idle"]),
    "milestone-prune": new Set(["learned"]),
    "milestone-shadow-gate": new Set(["pruned"]),
    "milestone-archive": new Set(["scanned"]),
    "milestone-finalize": new Set(["archived"]),
  },
  initialSkill: "milestone-learn",
});

await hook();
