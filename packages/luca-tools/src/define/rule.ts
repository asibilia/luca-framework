/**
 * defineRule — repo-local rule pack authoring.
 *
 * Re-exported from `@alecsibilia/luca-core/rule-engine`. The luca-core
 * implementation is the single source of truth — repo-local rule packs
 * have been shipping against that API since Phase B. We re-export it
 * here so authors using the luca-tools artifact surface have a uniform
 * entry point (`@alecsibilia/luca-tools/define`) for all six artifact
 * kinds.
 *
 * The luca-core `RuleDefinition` does not carry a `kind` discriminator —
 * the rule-engine runner consumes it directly. The artifact-level
 * compiler wraps a `RuleDefinition` in a `RuleArtifact` envelope (see
 * `./artifact.ts`) only when it needs to enumerate rules alongside
 * the other artifact kinds.
 */
export { defineRule } from '@alecsibilia/luca-core/rule-engine'
export type {
    RuleDefinition,
    RuleFile,
    RuleFinding,
    RuleSeverity,
} from '@alecsibilia/luca-core/rule-engine'
