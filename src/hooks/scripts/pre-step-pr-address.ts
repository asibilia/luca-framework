/**
 * pre-step-pr-address — Pre-step enforcement hook for pr-address Agent() sub-agents.
 *
 * Fires before Skill and Agent tool invocations during pr-address execution
 * to verify that the state machine is in the correct state before each
 * sub-agent runs. If the orchestrator attempts to call an agent out of
 * order, the hook blocks the call.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * @module pre-step-pr-address
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-pr-address",
  contextPath: "/tmp/pr-address-context.json",
  subSkills: new Set([
    "fetch",
    "validate",
    "debate",
    "fix",
    "learn",
    "respond",
  ]),
  validStates: {
    fetch: new Set(["idle"]),
    validate: new Set(["fetched"]),
    debate: new Set(["validated"]),
    fix: new Set(["debated", "validated"]),
    learn: new Set(["verified", "fixed"]),
    respond: new Set(["verified", "learned", "fixed"]),
  },
  initialSkill: "fetch",
});

await hook();
