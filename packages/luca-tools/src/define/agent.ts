/**
 * defineAgent — mode-agent definitions for top-level pipeline stages.
 *
 * "Mode agents" are the architect / plan / execute / review / etc.
 * top-level pipeline stages — distinct from `defineSubagent`, which is
 * for Task-tool-spawnable workers. In luca-mastracode these lived under
 * `src/modes/`; their instruction bodies lived under `src/instructions/`
 * as separate markdown files.
 *
 * In the new structure both the mode definition and its instruction
 * body live in a single TS definition. The compiler (D-2) emits
 * `.claude/agents/<id>.md` files alongside subagents, but the
 * instruction body is composed with the mode-agent constraint shell
 * (core-operating-rules + hard-constraints + alwaysApply rules +
 * memory-tier-discipline + recency-reminders) from
 * luca-mastracode's `agent-constraints.ts` — that shell will be
 * re-implemented in luca-tools as part of D-3.
 *
 * Source-of-truth for what mode-agents need to express:
 *   packages/luca-mastracode/src/modes/{architect,plan,execute,review,
 *     research,discuss,fast,finalize,triage,build}.ts
 *   packages/luca-mastracode/src/instructions/*.md  (body content)
 *   packages/luca-mastracode/src/agent-constraints.ts  (shell)
 */
import { z } from 'zod'

import {
    PipelineInvocationSchema,
    SubagentGuidanceSchema,
    TelemetryHookSchema,
} from './subagent.ts'

/**
 * Stage ids in the Luca pipeline. The set is closed — adding a stage
 * means evolving the pipeline state machine. The mode-agent's `stage`
 * field anchors it to a specific pipeline step so the compiler can
 * weave in stage-specific telemetry / state-transition prose.
 *
 * `'standalone'` covers stock utility modes (e.g. the read-only `plan`
 * mode that explores a codebase without entering the pipeline).
 */
export const AgentStageSchema = z.enum([
    'triage',
    'research',
    'discuss',
    'architect',
    'plan',
    'execute',
    'build',
    'review',
    'finalize',
    'fast',
    'standalone',
])
export type AgentStage = z.infer<typeof AgentStageSchema>

/**
 * Mode-agent definition — the input to `defineAgent`. Shape parallels
 * `SubagentDefinition` but layers on stage + color + defaultModelId
 * (mode agents drive the pipeline's identity, so they carry more
 * presentation/routing metadata).
 */
export const AgentDefinitionSchema = z.object({
    /** Tag for the discriminated union. Always `'agent'`. */
    kind: z.literal('agent').default('agent'),
    /**
     * Stable id, e.g. `architect`. Used as the artifact filename. The
     * id is the canonical pipeline identifier — `state.json` references
     * it directly during transitions.
     */
    id: z
        .string()
        .min(1)
        .regex(
            /^[a-z][a-z0-9-]*$/,
            'agent id must be kebab-case: lowercase letters, digits, hyphens; must start with a letter'
        ),
    /** Human-readable name shown in the mode picker. */
    name: z.string().min(1),
    /**
     * One-sentence description. Surfaced in the mode picker — what the
     * stage does in a sentence, not a paragraph.
     */
    description: z.string().min(1),
    /**
     * Pipeline stage this mode-agent represents. Anchors the compiler's
     * stage-specific prose injection.
     */
    stage: AgentStageSchema,
    /**
     * Display color (hex). Used by the mode badge in the UI surface.
     * Mode-agents are user-facing identity; subagents are not.
     */
    color: z
        .string()
        .regex(
            /^#[0-9a-fA-F]{6}$/,
            'color must be a 6-digit hex code with a leading #'
        )
        .optional(),
    /**
     * Default model id. Resolved at compile time from the
     * complexity-routing preset; an explicit value here overrides the
     * preset. Mode-agents typically run on the `capable` tier.
     */
    defaultModelId: z.string().optional(),
    /**
     * Guidance flags — same vocabulary as subagents. Mode-agents that
     * plan should set `verticalSlice`; mode-agents that write code
     * should set `tdd`. Compiler interpolates the matching guidance
     * block. The schema's own `.prefault({})` materializes defaults
     * when this field is omitted.
     */
    guidance: SubagentGuidanceSchema,
    /**
     * Telemetry hooks — symbolic pipeline points at which the
     * mode-agent should emit a telemetry event. Mode-agents typically
     * own `phase-start` / `phase-end` events that subagents do not.
     */
    telemetryHooks: z.array(TelemetryHookSchema).default([]),
    /**
     * Pipeline invocations — cross-cutting subsystems the mode-agent
     * should call at the appropriate boundary.
     */
    pipelineInvocations: z.array(PipelineInvocationSchema).default([]),
    /**
     * Known footguns for this mode-agent — recurring mistakes, sharp
     * edges, or counter-intuitive behaviors the agent should be warned
     * about up front. The compiler renders these as a `## Gotchas` block
     * in the agent body (mirroring how `guidance` flags expand into
     * their own blocks). Optional — defaults to an empty list, which the
     * compiler renders as no block at all.
     */
    gotchas: z.array(z.string()).default([]),
    /**
     * The prompt body. Markdown — what the mode-agent should do at this
     * stage. The constraint shell (core-operating-rules + hard-
     * constraints + alwaysApply rules + memory-tier-discipline +
     * recency-reminders) is composed in at compile time; this body is
     * the stage-specific instruction set.
     */
    instructions: z.string().min(1),
})

/** Output type — what `defineAgent` returns. */
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>

/**
 * Author entry point. Validates via Zod and returns a frozen
 * definition. Aggregated-error ergonomics match `defineRule` /
 * `defineSubagent`.
 */
export function defineAgent(
    def: z.input<typeof AgentDefinitionSchema>
): AgentDefinition {
    const parsed = AgentDefinitionSchema.safeParse(def)
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        const id = typeof def?.id === 'string' ? def.id : '<unknown>'
        throw new Error(`defineAgent(${id}): ${issues}`)
    }
    return Object.freeze(parsed.data)
}
