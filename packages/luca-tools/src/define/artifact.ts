/**
 * Artifact — the discriminated union over every artifact kind that the
 * luca-tools compiler (D-2) consumes.
 *
 * Each `defineX` factory in this directory produces one variant of this
 * union. The compiler dispatches on the `kind` field. Adding a new kind
 * means: (1) write the factory, (2) extend the union below, (3) extend
 * the compiler's dispatch.
 *
 * Why a separate file: the union has to import every variant's type, and
 * keeping it next to the factories avoids a cyclic-import graph through
 * `index.ts`.
 *
 * Pattern parallel to luca-core's `defineRule`: factories validate at
 * authoring time (throw on misuse) and return a frozen, typed definition
 * object. No runtime mutation after construction.
 */
import type { AgentDefinition } from './agent.ts'
import type { CommandDefinition } from './command.ts'
import type { HookDefinition } from './hook.ts'
import type { RuleDefinition } from './rule.ts'
import type { SkillDefinition } from './skill.ts'
import type { SubagentDefinition } from './subagent.ts'

/**
 * The full set of artifact kinds the compiler knows how to emit. The
 * `kind` field is the discriminator; the rest of the shape is unique
 * per variant.
 *
 * `RuleDefinition` is the shape exported by luca-core's rule-engine. It
 * does NOT carry a `kind` field (the runner consumes it directly), so
 * the union wraps it in a tagged envelope at the artifact layer. The
 * `defineRule` re-export in this package returns the bare luca-core
 * `RuleDefinition`; if the compiler later needs to enumerate rules as
 * artifacts, it lifts them into `RuleArtifact` itself — keeping rule
 * authorship ergonomically identical to the existing contract.
 */
export type Artifact =
    | AgentDefinition
    | SubagentDefinition
    | CommandDefinition
    | SkillDefinition
    | HookDefinition
    | RuleArtifact

/**
 * Tagged envelope around a `RuleDefinition` for compiler-side
 * uniformity. The luca-core `defineRule` shape stays unchanged — repo-
 * local rule packs are unaffected.
 */
export interface RuleArtifact {
    kind: 'rule'
    rule: RuleDefinition
}

/** Narrow guard: artifact is an agent (mode-agent) definition. */
export function isAgent(a: Artifact): a is AgentDefinition {
    return a.kind === 'agent'
}

/** Narrow guard: artifact is a subagent (Task-tool-spawnable) definition. */
export function isSubagent(a: Artifact): a is SubagentDefinition {
    return a.kind === 'subagent'
}

/** Narrow guard: artifact is a slash-command definition. */
export function isCommand(a: Artifact): a is CommandDefinition {
    return a.kind === 'command'
}

/** Narrow guard: artifact is a Claude Code skill definition. */
export function isSkill(a: Artifact): a is SkillDefinition {
    return a.kind === 'skill'
}

/** Narrow guard: artifact is a Claude Code hook definition. */
export function isHook(a: Artifact): a is HookDefinition {
    return a.kind === 'hook'
}

/** Narrow guard: artifact wraps a rule pack. */
export function isRule(a: Artifact): a is RuleArtifact {
    return a.kind === 'rule'
}
