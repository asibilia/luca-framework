/**
 * emit-rule — handle a `RuleArtifact` envelope during compile.
 *
 * Decision (locked by the D-2 task prompt):
 *
 *   "Rules: emit nothing into Claude Code artifacts. Rules are runtime
 *    luca-core artifacts loaded by `luca rules`. The compiler still
 *    accepts them in the manifest so a single inventory describes the
 *    full surface."
 *
 * Concretely:
 *
 *  - The `defineRule` re-export in luca-tools forwards directly to
 *    `@alecsibilia/luca-core/rule-engine`. Rule packs live as TS files
 *    in `.luca/rules/*.ts` in the consuming repo; the rule-engine
 *    runner discovers and runs them.
 *  - The compiler's job for rules is therefore PASS-THROUGH bookkeeping.
 *    We DO NOT write a file. We DO record the rule in the compile
 *    report so the parity audit can verify every declared artifact is
 *    accounted for.
 *  - The reported path uses the canonical runtime home —
 *    `.luca/rules/<rule.id>.ts` — even though the compiler isn't the
 *    one that put it there. This makes the report self-describing:
 *    "this rule LIVES at this path; the compiler did not touch it."
 *
 * Async signature matches the other emitters for symmetry.
 */
import { join } from 'node:path'

import type { RuleArtifact } from '../define/index.ts'

import type { EmitResult } from './emit-util.ts'

/**
 * Acknowledge a rule artifact during compile. Returns an EmitResult
 * pointing at the rule's runtime home — no file write occurs.
 *
 * Slug rules: `rule.id` may contain `/` (e.g. `convex/require-admin-
 * identity`), since the underlying rule-engine treats it as a flat
 * identifier. We replace `/` with `__` in the reported path so the
 * report shows a flat filename per rule rather than a directory.
 * D-3/D-4 may later choose to mirror rule files into the new tree;
 * for D-2 the rule lives wherever the consuming repo put it.
 */
export async function emitRule(
    art: RuleArtifact,
    outputRoot: string,
): Promise<EmitResult> {
    const flatId = art.rule.id.replace(/\//g, '__')
    const path = join(outputRoot, '.luca', 'rules', `${flatId}.ts`)
    return { path, kind: 'rule' }
}
