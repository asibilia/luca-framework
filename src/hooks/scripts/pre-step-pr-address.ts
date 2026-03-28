/**
 * pre-step-pr-address — Pre-step enforcement hook for pr-address sub-skills.
 *
 * Fires before Skill tool invocations during pr-address execution to verify
 * that the state machine is in the correct state before each sub-skill runs.
 * If the orchestrator attempts to call a sub-skill out of order, the hook
 * blocks the call.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * @module pre-step-pr-address
 * @see .planning/phases/226-security-hardening/PLAN.md Task 3
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-pr-address",
  contextPath: "/tmp/pr-address-context.json",
  subSkills: new Set([
    "pr-fetch",
    "pr-validate",
    "pr-debate",
    "pr-fix",
    "pr-learn",
    "pr-respond",
  ]),
  validStates: {
    "pr-fetch": new Set(["idle"]),
    "pr-validate": new Set(["fetched"]),
    "pr-debate": new Set(["validated"]),
    "pr-fix": new Set(["planned", "debated"]),
    "pr-learn": new Set(["verified"]),
    "pr-respond": new Set(["verified", "learned", "responded"]),
  },
  initialSkill: "pr-fetch",
});

await hook();
