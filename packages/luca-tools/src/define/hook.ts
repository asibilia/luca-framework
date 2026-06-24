/**
 * defineHook — Claude Code hook definitions.
 *
 * Claude Code hooks let the harness run code at lifecycle events
 * (PreToolUse, PostToolUse, SessionStart, SessionEnd, UserPromptSubmit,
 * Stop, SubagentStop, PreCompact, Notification). The compiler (D-2)
 * emits these as entries in `.claude/settings.json` under the `hooks`
 * key, plus the matching handler script in `.claude/hooks/<name>.{sh,ts}`.
 *
 * Locked design D1 carries through here: the handler itself is a
 * separate TS module referenced by path. The hook definition is
 * declarative metadata — the compiler decides whether to emit a shell
 * wrapper or a direct invocation based on the runtime.
 *
 * Source-of-truth for what hooks need to express:
 *   .claude/settings.json `hooks` block (today's hand-written form,
 *   Phase E will re-implement orchestration concerns as hooks)
 */
import { z } from 'zod'

/**
 * Claude Code hook events. The set is closed by the runtime contract —
 * adding an event means the Claude Code harness added one. Keep this
 * list in sync with the upstream documentation.
 *
 * Why an enum: catching typos at compile time matters more than future
 * flexibility. If Claude Code ships a new event we extend the enum in
 * one place.
 */
export const HookEventSchema = z.enum([
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'Notification',
    'Stop',
    'SubagentStop',
    'PreCompact',
    'SessionStart',
    'SessionEnd',
])
export type HookEvent = z.infer<typeof HookEventSchema>

/**
 * Hook handler runtime. The compiler picks the emission strategy from
 * this field:
 *  - `bun-script`  → reference a `.ts` file, run via `bunx`
 *  - `shell`       → reference a `.sh` file, run via `bash`
 *  - `inline`      → emit a one-liner shell command directly
 *
 * `inline` is for tiny commands (e.g. `echo`, `git status`). Anything
 * with logic belongs in a `bun-script` so it can be typechecked.
 */
export const HookRuntimeSchema = z.enum(['bun-script', 'shell', 'inline'])
export type HookRuntime = z.infer<typeof HookRuntimeSchema>

/**
 * Hook definition — the input to `defineHook`. The compiler emits the
 * matching `.claude/settings.json` entry and (for non-inline runtimes)
 * sets up the handler script.
 */
export const HookDefinitionSchema = z
    .object({
        /** Tag for the discriminated union. Always `'hook'`. */
        kind: z.literal('hook').default('hook'),
        /**
         * Stable id, used as the handler filename. The Claude Code hook
         * config keys off the event + matcher, but the id keeps the
         * source-side filename stable across regenerations.
         */
        id: z
            .string()
            .min(1)
            .regex(
                /^[a-z][a-z0-9-]*$/,
                'hook id must be kebab-case: lowercase letters, digits, hyphens; must start with a letter'
            ),
        /**
         * One-sentence description. Not surfaced to the model — purely
         * documentation for the human reader of `.claude/settings.json`.
         */
        description: z.string().min(1),
        /** Lifecycle event that triggers this hook. */
        event: HookEventSchema,
        /**
         * Optional matcher pattern. Semantics vary by event:
         *  - PreToolUse / PostToolUse: matches the tool name
         *    (e.g. `Write|Edit`, `Bash`, `*`).
         *  - SubagentStop: matches the subagent id.
         *  - Other events: matcher is ignored.
         *
         * Omit for unconditional firing.
         */
        matcher: z.string().optional(),
        /** Handler runtime — see `HookRuntimeSchema`. */
        runtime: HookRuntimeSchema,
        /**
         * Handler reference. For `bun-script` and `shell` this is the
         * repo-relative path to the script. For `inline` this is the
         * one-liner command itself.
         */
        handler: z.string().min(1),
        /**
         * Optional timeout (ms). Claude Code kills the hook after this
         * elapsed wall time. Default is harness-defined; pass an
         * explicit value for hooks that legitimately need more.
         */
        timeoutMs: z.number().int().positive().optional(),
        /**
         * Whether the hook runs in the background (async) or blocks the
         * triggering event until completion. Use background sparingly —
         * blocking hooks gate the harness's progress.
         */
        background: z.boolean().default(false),
    })
    .refine(
        (h) => {
            // `inline` handlers must be non-empty commands; the other
            // runtimes must reference a path that looks plausible (we
            // can't check existence at definition time).
            if (h.runtime === 'inline') return h.handler.trim().length > 0
            return (
                h.handler.includes('/') ||
                h.handler.endsWith('.ts') ||
                h.handler.endsWith('.sh')
            )
        },
        {
            message:
                'hook.handler: inline runtimes need a non-empty command; bun-script/shell runtimes need a path-like reference',
            path: ['handler'],
        }
    )

/** Output type — what `defineHook` returns. */
export type HookDefinition = z.infer<typeof HookDefinitionSchema>

/**
 * Author entry point. Validates via Zod and returns a frozen
 * definition.
 */
export function defineHook(
    def: z.input<typeof HookDefinitionSchema>
): HookDefinition {
    const parsed = HookDefinitionSchema.safeParse(def)
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        const id = typeof def?.id === 'string' ? def.id : '<unknown>'
        throw new Error(`defineHook(${id}): ${issues}`)
    }
    return Object.freeze(parsed.data)
}
