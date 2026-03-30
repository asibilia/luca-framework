/**
 * pre-step-verify — Pre-step enforcement hook for verify Agent() sub-agents.
 *
 * Fires before Skill and Agent tool invocations during verify execution to
 * verify that the state machine is in the correct state before each agent
 * runs. If the orchestrator attempts to call an agent out of order, the
 * hook blocks the call.
 *
 * NOTE: verify-test runs INLINE (interactive), not via Agent(), so it is
 * NOT in the subSkills set. The hook only enforces extract, diagnose, review.
 *
 * **Divergent paths:** After `tested`, either diagnose (Path B: issues found)
 * or review (Path A: no issues) may be called. Both are valid from `tested`.
 *
 * @module pre-step-verify
 * @see docs/skill-to-agent-migration/architecture.md
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-verify",
  contextPath: "/tmp/verify-context.json",
  subSkills: new Set([
    "extract",
    "diagnose",
    "review",
    // NOTE: verify-test runs INLINE (interactive), not via Agent()
  ]),
  validStates: {
    extract: new Set(["idle"]),
    diagnose: new Set(["tested"]),
    review: new Set(["tested"]),
  },
  initialSkill: "extract",
});

await hook();
