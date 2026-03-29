/**
 * Behavioral contract definitions for 5 critical workflows.
 *
 * Each contract defines precondition/postcondition invariants that must hold
 * during workflow execution. The invariants reference state names from the
 * per-skill state machines in `src/skills/__schemas/states/*.states.ts`.
 *
 * **Contract Registry:**
 * - `pr-address`: No push without learn completion
 * - `milestone-complete`: No archive without shadow scan
 * - `lu`: No phase execution without configuration
 * - `verify`: No review without extraction
 * - `phase-execute`: No commit without harness verification
 *
 * The registry is deeply frozen to prevent mutation after initialization.
 *
 * @module workflow/contract-definitions
 * @see src/workflow/__schemas/contracts/contract.schemas.ts
 * @see src/skills/__schemas/states/pr-address.states.ts
 * @see src/skills/__schemas/states/milestone-complete.states.ts
 * @see src/skills/__schemas/states/lu.states.ts
 * @see src/skills/__schemas/states/verify.states.ts
 * @see src/skills/__schemas/states/phase-execute.states.ts
 */

import { deepFreeze } from "~/shared/__helpers/deep-freeze";

import type { BehavioralContract } from "../__schemas/contracts";

// ─── pr-address Contract ────────────────────────────────────────────────────

/**
 * pr-address behavioral contract.
 *
 * Enforces: "No push without LEARNED transition."
 *
 * The pr-address workflow follows: idle -> fetched -> categorized -> validated
 * -> debated -> planned -> fixed -> verified -> learned -> responded -> pushed.
 *
 * The learn step captures patterns/pitfalls from PR comments. Pushing without
 * learning means losing valuable feedback for MuninnDB. This is a hard
 * invariant because skipping learning permanently loses knowledge.
 *
 * State references from: src/skills/__schemas/states/pr-address.states.ts
 */
const prAddressContract: BehavioralContract = {
  workflow: "pr-address",
  invariants: [
    {
      id: "pr-address:no-push-without-learned",
      kind: "hard",
      description:
        "Cannot push changes without completing the learn step. " +
        "Learning captures patterns and pitfalls from PR comments into MuninnDB.",
      precondition: "learned",
      postcondition: "pushed",
      recovery_limit: 0,
    },
  ],
};

// ─── milestone-complete Contract ────────────────────────────────────────────

/**
 * milestone-complete behavioral contract.
 *
 * Enforces: "No archive without shadow scan."
 *
 * The milestone-complete workflow follows: idle -> learned -> pruned ->
 * scanned -> archived -> finalized.
 *
 * Shadow scanning detects tech debt and orphaned files before archiving.
 * Archiving without scanning risks locking in undetected debt. This is a
 * soft invariant because scanning can be skipped via explicit config
 * (shadow_debt.enabled = false), but recovery should be attempted first.
 *
 * State references from: src/skills/__schemas/states/milestone-complete.states.ts
 */
const milestoneCompleteContract: BehavioralContract = {
  workflow: "milestone-complete",
  invariants: [
    {
      id: "milestone-complete:no-archive-without-scanned",
      kind: "soft",
      description:
        "Should not archive a milestone without completing shadow debt scanning. " +
        "Scanning detects tech debt and orphaned files that may be locked in by archival.",
      precondition: "scanned",
      postcondition: "archived",
      recovery_limit: 1,
    },
  ],
};

// ─── lu Contract ────────────────────────────────────────────────────────────

/**
 * lu orchestrator behavioral contract.
 *
 * Enforces: "No phase execution without configuration."
 *
 * The lu workflow follows: idle -> routed -> configured -> scanned ->
 * executing -> complete.
 *
 * Configuration sets appetite, complexity, oversight level, and other
 * parameters that govern execution behavior. Executing without configuration
 * means running with unvalidated defaults, which can cause incorrect model
 * routing or budget overflows. This is a hard invariant.
 *
 * State references from: src/skills/__schemas/states/lu.states.ts
 */
const luContract: BehavioralContract = {
  workflow: "lu",
  invariants: [
    {
      id: "lu:no-execute-without-configured",
      kind: "hard",
      description:
        "Cannot start phase execution without completing configuration. " +
        "Configuration sets appetite, complexity, and oversight parameters.",
      precondition: "configured",
      postcondition: "executing",
      recovery_limit: 0,
    },
  ],
};

// ─── verify Contract ────────────────────────────────────────────────────────

/**
 * verify orchestrator behavioral contract.
 *
 * Enforces: "No review without extraction."
 *
 * The verify workflow follows: idle -> extracted -> tested -> reviewed
 * (or diagnosed).
 *
 * Extraction collects execution artifacts (summaries, commit hashes, plan
 * files) needed for verification. Reviewing without extraction means
 * verifying against incomplete data. This is a hard invariant.
 *
 * State references from: src/skills/__schemas/states/verify.states.ts
 */
const verifyContract: BehavioralContract = {
  workflow: "verify",
  invariants: [
    {
      id: "verify:no-review-without-extracted",
      kind: "hard",
      description:
        "Cannot review verification results without first extracting execution artifacts. " +
        "Extraction collects summaries, commit hashes, and plan files for review.",
      precondition: "extracted",
      postcondition: "reviewed",
      recovery_limit: 0,
    },
  ],
};

// ─── phase-execute Contract ─────────────────────────────────────────────────

/**
 * phase-execute behavioral contract.
 *
 * Enforces: "No commit without harness verification."
 *
 * The phase-execute workflow follows: idle -> setup -> executed -> verified
 * -> reviewed -> learned -> committed.
 *
 * The harness runs test + typecheck + lint + build checks. Committing
 * without verification risks shipping broken code. This is a hard
 * invariant because unverified commits can break the main branch.
 *
 * State references from: src/skills/__schemas/states/phase-execute.states.ts
 */
const phaseExecuteContract: BehavioralContract = {
  workflow: "phase-execute",
  invariants: [
    {
      id: "phase-execute:no-commit-without-verified",
      kind: "hard",
      description:
        "Cannot commit without completing harness verification. " +
        "The harness runs test, typecheck, lint, and build checks to prevent broken commits.",
      precondition: "verified",
      postcondition: "committed",
      recovery_limit: 0,
    },
  ],
};

// ─── Contract Registry ──────────────────────────────────────────────────────

/**
 * Registry of all behavioral contracts, keyed by workflow name.
 *
 * Deeply frozen to prevent mutation after initialization. Access contracts
 * by workflow name:
 *
 * @example
 * ```typescript
 * import { CONTRACT_REGISTRY } from "~/workflow";
 *
 * const prContract = CONTRACT_REGISTRY["pr-address"];
 * // prContract.invariants[0].id === "pr-address:no-push-without-learned"
 * ```
 */
export const CONTRACT_REGISTRY: Readonly<Record<string, BehavioralContract>> =
  deepFreeze({
    "pr-address": prAddressContract,
    "milestone-complete": milestoneCompleteContract,
    lu: luContract,
    verify: verifyContract,
    "phase-execute": phaseExecuteContract,
  });
