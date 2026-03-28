/**
 * pre-step-phase-execute — Pre-step enforcement hook for phase-execute sub-skills.
 *
 * Fires before Skill tool invocations during phase-execute execution to verify
 * that the state machine is in the correct state before each sub-skill runs.
 * If the orchestrator attempts to call a sub-skill out of order, the hook
 * blocks the call.
 *
 * **Scope:** Validates ordering of the 3 phase-execute sub-skills:
 * phase-execute-waves, phase-execute-verify, phase-execute-review.
 * Setup and learning/commit steps are handled by the orchestrator directly
 * (not sub-skills), so this hook only enforces the 3 extracted loop sub-skills.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * @module pre-step-phase-execute
 * @see .planning/phases/224-anti-skip-rollout/03-PLAN.md Task 6
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-phase-execute",
  contextPath: "/tmp/phase-execute-context.json",
  subSkills: new Set([
    "phase-execute-waves",
    "phase-execute-verify",
    "phase-execute-review",
  ]),
  validStates: {
    "phase-execute-waves": new Set(["setup"]),
    "phase-execute-verify": new Set(["executed"]),
    "phase-execute-review": new Set(["verified"]),
  },
  // NO initialSkill — fail-closed on missing context (PREMORTEM R1)
});

await hook();
