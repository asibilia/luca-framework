/**
 * pre-step-verify — Pre-step enforcement hook for verify sub-skills.
 *
 * Fires before Skill tool invocations during verify execution to
 * verify that the state machine is in the correct state before each
 * sub-skill runs. If the orchestrator attempts to call a sub-skill
 * out of order, the hook blocks the call.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * **Divergent paths:** After `tested`, either verify-diagnose (Path B: issues
 * found) or verify-review (Path A: no issues) may be called. Both are valid
 * from the `tested` state — the orchestrator decides which based on
 * `issues_found` in the context file.
 *
 * @module pre-step-verify
 * @see .planning/phases/224-anti-skip-rollout/02-PLAN.md Task 7
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-verify",
  contextPath: "/tmp/verify-context.json",
  subSkills: new Set([
    "verify-extract",
    "verify-test",
    "verify-diagnose",
    "verify-review",
  ]),
  validStates: {
    "verify-extract": new Set(["idle"]),
    "verify-test": new Set(["extracted"]),
    "verify-diagnose": new Set(["tested"]),
    "verify-review": new Set(["tested"]),
  },
  initialSkill: "verify-extract",
});

await hook();
