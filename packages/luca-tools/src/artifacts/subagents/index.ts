/**
 * Subagents barrel — the Task-tool-spawnable subagents authored as
 * `defineSubagent` definitions in this package.
 *
 * Per plan §5.6, the v12-era `planner` and `fix` subagents are
 * INTENTIONALLY DROPPED:
 *   - `planner` was registered but never invoked (the architect mode
 *     does the planning work directly).
 *   - `fix` was referenced in `execute.md` but never existed as a
 *     concrete subagent file in mastracode.
 *
 * `test-writer` and `debater` were RESTORED (v13 roster reconciliation):
 *   - `test-writer` — tests are first-class in v13 again; authors focused,
 *     non-vacuous tests and can settle a dispute with an empirical repro.
 *   - `debater` — stance-parameterized adversarial validator; the reusable
 *     primitive behind the verification tribunal (defender vs challenger).
 *
 * `shadow-scanner` is included; the partially-broken state called out
 * in plan §5.1 is addressed by retargeting `.planning/` → `.luca/` and
 * keying off the canonical LUCA_DIR_CONTRACT instead of an ad-hoc
 * allowlist.
 *
 * The exported `SUBAGENTS` array is the source the artifact manifest
 * pulls from; the order here is the order on disk.
 */
import type { Artifact } from '../../define/index.ts'

import { debaterSubagent } from './debater.ts'
import { discussionSubagent } from './discussion.ts'
import { executorSubagent } from './executor.ts'
import { learnerSubagent } from './learner.ts'
import { planReviewerSubagent } from './plan-reviewer.ts'
import { researcherSubagent } from './researcher.ts'
import { reviewerSubagent } from './reviewer.ts'
import { shadowScannerSubagent } from './shadow-scanner.ts'
import { testWriterSubagent } from './test-writer.ts'
import { verifierSubagent } from './verifier.ts'

export {
    debaterSubagent,
    discussionSubagent,
    executorSubagent,
    learnerSubagent,
    planReviewerSubagent,
    researcherSubagent,
    reviewerSubagent,
    shadowScannerSubagent,
    testWriterSubagent,
    verifierSubagent,
}

/**
 * Ordered list of every subagent shipped with luca-tools. The order is
 * stable and influences the compile-report's `paths` order (alphabetical
 * by id keeps the output diff-friendly).
 */
export const SUBAGENTS: readonly Artifact[] = [
    debaterSubagent,
    discussionSubagent,
    executorSubagent,
    learnerSubagent,
    planReviewerSubagent,
    researcherSubagent,
    reviewerSubagent,
    shadowScannerSubagent,
    testWriterSubagent,
    verifierSubagent,
]
