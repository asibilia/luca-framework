/**
 * pre-step-phase-execute — Pre-step enforcement hook for phase-execute Agent() sub-agents.
 *
 * Fires before Skill and Agent tool invocations during phase-execute execution.
 * Uses prefix-based matching for parallel reviewer agents (review-arch, review-dx, etc.).
 *
 * @module pre-step-phase-execute
 * @see docs/skill-to-agent-migration/architecture.md
 */

import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";

// ─── Hook ──────────────────────────────────────────────────────────────────

const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-phase-execute",
  contextPath: "/tmp/phase-execute-context.json",
  subSkills: new Set([
    "execute-waves",
    "harness",
    "fix",
    "verify",
    "learn",
    "process-data",
  ]),
  agentPrefixes: new Set([
    "review-", // matches review-arch, review-dx, review-security, review-simplify
  ]),
  validStates: {
    "execute-waves": new Set(["setup"]),
    harness: new Set(["executed"]),
    fix: new Set(["executed"]),
    verify: new Set(["executed", "verified"]),
    "review-": new Set(["verified"]),
    learn: new Set(["reviewed"]),
    "process-data": new Set(["reviewed", "learned"]),
  },
  // NO initialSkill — fail-closed on missing context
});

await hook();
