/**
 * pre-step-lu — Pre-step enforcement hook for lu sub-skills.
 *
 * Fires before Skill tool invocations during lu execution to verify
 * that the state machine is in the correct state before each sub-skill runs.
 * If the orchestrator attempts to call a sub-skill out of order, the hook
 * blocks the call.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * **Note:** lu-phase-loop is valid from both "scanned" (after SCAN_COMPLETE)
 * and "configured" (after SKIP_BACKLOG). The hook accepts both states.
 *
 * @module pre-step-lu
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 7
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-lu",
  contextPath: "/tmp/lu-context.json",
  subSkills: new Set([
    "lu-route",
    "lu-configure",
    "lu-backlog",
    "lu-phase-loop",
  ]),
  validStates: {
    "lu-route": new Set(["idle"]),
    "lu-configure": new Set(["routed"]),
    "lu-backlog": new Set(["configured"]),
    "lu-phase-loop": new Set(["scanned", "configured"]),
  },
  initialSkill: "lu-route",
});

await hook();
