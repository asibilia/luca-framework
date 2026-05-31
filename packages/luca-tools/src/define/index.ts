/**
 * Barrel exports for the artifact-definition surface.
 *
 * Authors writing TS artifact definitions (agents, subagents,
 * commands, skills, hooks, rules) import from this module — typically
 * via the package-level entry `@alecsibilia/luca-tools/define`. The
 * compiler (D-2) consumes the same exports through the `Artifact`
 * discriminated union.
 *
 * Each factory validates at authoring time and returns a frozen
 * definition. The factory file owns the schema and the type — keep
 * additions there; this index is barrel-only.
 */

// Factories
export { defineAgent } from './agent.ts'
export { defineSubagent } from './subagent.ts'
export { defineCommand } from './command.ts'
export { defineSkill } from './skill.ts'
export { defineHook } from './hook.ts'
export { defineRule } from './rule.ts'

// Per-artifact types + schemas (authors need these for variant typing,
// the compiler needs them for parse + emit)
export {
    AgentDefinitionSchema,
    AgentStageSchema,
} from './agent.ts'
export type { AgentDefinition, AgentStage } from './agent.ts'

export {
    PipelineInvocationSchema,
    SubagentAllowedToolSchema,
    SubagentDefinitionSchema,
    SubagentGuidanceSchema,
    TelemetryHookSchema,
} from './subagent.ts'
export type {
    PipelineInvocation,
    SubagentDefinition,
    SubagentGuidance,
    TelemetryHook,
} from './subagent.ts'

export { CommandDefinitionSchema } from './command.ts'
export type { CommandDefinition } from './command.ts'

export { SkillDefinitionSchema } from './skill.ts'
export type { SkillDefinition } from './skill.ts'

export {
    HookDefinitionSchema,
    HookEventSchema,
    HookRuntimeSchema,
} from './hook.ts'
export type {
    HookDefinition,
    HookEvent,
    HookRuntime,
} from './hook.ts'

export type {
    RuleDefinition,
    RuleFile,
    RuleFinding,
    RuleSeverity,
} from './rule.ts'

// Discriminated union + narrow guards
export type { Artifact, RuleArtifact } from './artifact.ts'
export {
    isAgent,
    isCommand,
    isHook,
    isRule,
    isSkill,
    isSubagent,
} from './artifact.ts'
