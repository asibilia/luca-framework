/**
 * defineSubagent — Task-tool-spawnable subagent definitions.
 *
 * In Claude Code, subagents are spawned via the Task tool. Each one has
 * a frontmatter header (name, description, model, optional
 * allowed-tools) and a prompt body. The compiler (D-2) emits these as
 * `.claude/agents/<name>.md` files.
 *
 * Locked design D1 — RESTORE + IMPROVE: the v13 hand-rewrite dropped
 * vertical-slice planning guidance, TDD guidance, telemetry
 * instrumentation, and rule/postmortem/claim-verify invocations. The
 * shape below is rich enough to encode all of those declaratively, so
 * the compiler (or the body itself, by composition) can insert them at
 * the right pipeline points instead of relying on the LLM to remember
 * them.
 *
 * Source-of-truth for what subagents need to express:
 *   packages/luca-mastracode/src/subagents/{researcher,executor,planner,
 *     plan-reviewer,reviewer,verifier,learner,discussion,
 *     shadow-scanner,shared-prefix}.ts
 */
import { z } from 'zod'

/**
 * Claude Code tool names the harness ships with. The compiler emits
 * this allowlist into the frontmatter's `allowed-tools` field. The set
 * is intentionally permissive — we don't gatekeep every internal tool
 * here; we gatekeep the ones authors actually allow/deny per subagent.
 *
 * Authors may pass any string — the runtime tool registry validates
 * for real. This schema is documentation, not enforcement.
 */
export const SubagentAllowedToolSchema = z.string().min(1)

/**
 * Pipeline points at which a subagent should emit a telemetry event.
 * The compiler injects the matching `mcp__luca-telemetry__...` /
 * `luca telemetry emit ...` invocations into the prompt body.
 *
 * Why declarative instead of free-form prose: the v13 hand-rewrite
 * dropped these instrumentation lines silently. Declaring them by
 * symbolic name lets a single compiler change re-emit them consistently
 * across all 9 subagents — and lets the §3 parity audit verify each
 * one is present.
 */
export const TelemetryHookSchema = z.enum([
    'phase-start',
    'phase-end',
    'wave-start',
    'wave-end',
    'subagent-start',
    'subagent-end',
    'verification-start',
    'verification-end',
])
export type TelemetryHook = z.infer<typeof TelemetryHookSchema>

/**
 * Pipeline invocation points the subagent should perform. These map to
 * the cross-cutting subsystems the v13 hand-rewrite either dropped or
 * scattered into per-subagent prose:
 *
 *  - `rule-run`            — runs repo-local rule packs (luca-core/rule-engine)
 *  - `claim-verify`        — runs claim verification (luca-core/claim-verifier)
 *  - `postmortem-generate` — produces a phase postmortem (luca-core/analysis)
 *  - `confidence-log`      — emits a confidence-journal entry on a decision
 *  - `muninn-recall`       — pre-invoke MuninnDB recall (shared-prefix did this)
 *
 * Compiler reads these and weaves the corresponding invocation prose
 * into the prompt body at the right pipeline boundary.
 */
export const PipelineInvocationSchema = z.enum([
    'rule-run',
    'claim-verify',
    'postmortem-generate',
    'confidence-log',
    'muninn-recall',
])
export type PipelineInvocation = z.infer<typeof PipelineInvocationSchema>

/**
 * Guidance flags — restored functionality from the v13 hand-rewrite. The
 * compiler interpolates the matching guidance block into the prompt
 * body when the flag is set. Flags compose: a planner subagent might
 * declare `{ tdd: true, verticalSlice: true }` and get both blocks.
 */
export const SubagentGuidanceSchema = z
    .object({
        /**
         * Vertical-slice planning guidance — produce end-to-end thin
         * slices that exercise every layer (UI, API, data) rather than
         * horizontal waves by layer. Restored from luca-mastracode's
         * `planner.ts` (lost in v13).
         */
        verticalSlice: z.boolean().default(false),
        /**
         * TDD guidance — write the failing test first, then the
         * implementation that turns it green. Restored from
         * luca-mastracode's `executor.ts` + the §7 Decisions log line
         * "Phase B ports follow TDD".
         */
        tdd: z.boolean().default(false),
        /**
         * Self-verification mandate — re-read files before editing;
         * verify every assumption with a tool call. This was in
         * shared-prefix; we surface it per-subagent so the compiler
         * can skip it for subagents that genuinely shouldn't (e.g. a
         * pure read-only learner).
         */
        selfVerify: z.boolean().default(true),
        /**
         * Anti-sycophancy — every APPROVE verdict requires specific
         * evidence. Required for review-like subagents; opt-in
         * elsewhere.
         */
        antiSycophancy: z.boolean().default(false),
    })
    .prefault({})
export type SubagentGuidance = z.infer<typeof SubagentGuidanceSchema>

/**
 * Subagent definition — the input to `defineSubagent`. The compiler
 * consumes this to emit `.claude/agents/<id>.md` with the shared-prefix
 * + guidance blocks + telemetry/invocation hooks + the body.
 */
export const SubagentDefinitionSchema = z.object({
    /**
     * Tag for the discriminated union. Always `'subagent'`. The factory
     * stamps this on the returned object; authors don't pass it.
     */
    kind: z.literal('subagent').default('subagent'),
    /** Stable id, e.g. `researcher`. Used as the artifact filename. */
    id: z
        .string()
        .min(1)
        .regex(
            /^[a-z][a-z0-9-]*$/,
            'subagent id must be kebab-case: lowercase letters, digits, hyphens; must start with a letter'
        ),
    /** Human-readable name shown in the Task tool picker. */
    name: z.string().min(1),
    /**
     * One-sentence description. Claude Code shows this in the Task
     * tool's subagent picker — be specific about when to invoke this
     * subagent, not what it does in general.
     */
    description: z.string().min(1),
    /**
     * Step budget. Claude Code's Task tool caps execution at this many
     * tool calls. Subagents that recurse deeply (planner) get more;
     * pure read-only ones (learner) get less.
     */
    maxSteps: z.number().int().positive().max(200).default(30),
    /**
     * Optional tool allowlist. If present, only these Claude Code tools
     * are exposed to the subagent. Omitting means "all tools". The
     * compiler emits this into the frontmatter's `allowed-tools`.
     */
    allowedTools: z.array(SubagentAllowedToolSchema).optional(),
    /**
     * Optional model override. If absent, the compiler uses the routing
     * preset for the subagent (see luca-core's complexity routing).
     */
    model: z.string().optional(),
    /**
     * Guidance flags — see `SubagentGuidanceSchema`. The compiler
     * interpolates the matching guidance block into the prompt body.
     * The schema's own `.prefault({})` materializes all inner defaults
     * when this field is omitted by the author.
     */
    guidance: SubagentGuidanceSchema,
    /**
     * Telemetry hooks — symbolic pipeline points at which the subagent
     * should emit a telemetry event. Compiler injects the matching
     * `luca telemetry emit` lines.
     */
    telemetryHooks: z.array(TelemetryHookSchema).default([]),
    /**
     * Pipeline invocations — cross-cutting subsystems the subagent
     * should call at the appropriate boundary (see
     * `PipelineInvocationSchema`).
     */
    pipelineInvocations: z.array(PipelineInvocationSchema).default([]),
    /**
     * Known footguns for this subagent — recurring mistakes, sharp
     * edges, or counter-intuitive behaviors the subagent should be
     * warned about up front. The compiler renders these as a
     * `## Gotchas` block in the prompt body (mirroring how `guidance`
     * flags expand into their own blocks). Optional — defaults to an
     * empty list, which the compiler renders as no block at all.
     */
    gotchas: z.array(z.string()).default([]),
    /**
     * The prompt body. Markdown — what the subagent should actually
     * do. The shared-prefix and the guidance/telemetry blocks are
     * composed in at compile time; this body is the subagent-specific
     * instruction set.
     */
    instructions: z.string().min(1),
})

/**
 * Output type — what `defineSubagent` returns. The compiler imports
 * this and emits Claude Code artifacts from it.
 */
export type SubagentDefinition = z.infer<typeof SubagentDefinitionSchema>

/**
 * Author entry point. Validates the input via Zod and returns a frozen
 * definition. Throws a single aggregated error on schema violation —
 * mirrors `defineRule`'s ergonomics.
 */
export function defineSubagent(
    def: z.input<typeof SubagentDefinitionSchema>
): SubagentDefinition {
    const parsed = SubagentDefinitionSchema.safeParse(def)
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        const id = typeof def?.id === 'string' ? def.id : '<unknown>'
        throw new Error(`defineSubagent(${id}): ${issues}`)
    }
    return Object.freeze(parsed.data)
}
