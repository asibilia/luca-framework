/**
 * defineCommand — Claude Code slash-command definitions.
 *
 * A slash command in Claude Code is a `.claude/commands/<name>.md`
 * file: a small markdown document with optional frontmatter (name,
 * description) and a body the harness inlines into the prompt when
 * the user types `/<name>`.
 *
 * Distinct from `citty`'s `defineCommand` (which luca-cli uses for
 * the `luca` CLI surface). Citty produces argv-driven CLI handlers;
 * this factory produces declarative slash-command artifacts the
 * compiler emits as markdown.
 *
 * Source-of-truth for what commands look like today (hand-written):
 *   .claude/commands/<name>.md   in luca-framework  (Phase H removes)
 */
import { z } from 'zod'

/**
 * Slash-command definition — the input to `defineCommand`. The
 * compiler emits `.claude/commands/<name>.md` with the optional
 * description frontmatter and the body.
 */
export const CommandDefinitionSchema = z.object({
    /** Tag for the discriminated union. Always `'command'`. */
    kind: z.literal('command').default('command'),
    /**
     * Slash-command name (no leading `/`). The user invokes it as
     * `/<name>`. The compiler uses this as the artifact filename.
     */
    name: z
        .string()
        .min(1)
        .regex(
            /^[a-z][a-z0-9-]*$/,
            'command name must be kebab-case: lowercase letters, digits, hyphens; must start with a letter',
        ),
    /**
     * One-sentence description. Surfaced in the slash-command picker.
     * Be specific about when to invoke this command.
     */
    description: z.string().min(1),
    /**
     * Optional argument-list hint (e.g. `"<phase-id> [--dry-run]"`).
     * Rendered in the slash-command picker and in `/help` output.
     */
    argHint: z.string().optional(),
    /**
     * The command body. Markdown — what Claude should do when the user
     * invokes this command. The body may reference `$ARGUMENTS` (Claude
     * Code substitutes the user's argv on invocation).
     */
    body: z.string().min(1),
})

/** Output type — what `defineCommand` returns. */
export type CommandDefinition = z.infer<typeof CommandDefinitionSchema>

/**
 * Author entry point. Validates via Zod and returns a frozen
 * definition.
 */
export function defineCommand(
    def: z.input<typeof CommandDefinitionSchema>,
): CommandDefinition {
    const parsed = CommandDefinitionSchema.safeParse(def)
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        const name =
            typeof def?.name === 'string' ? def.name : '<unknown>'
        throw new Error(`defineCommand(${name}): ${issues}`)
    }
    return Object.freeze(parsed.data)
}
