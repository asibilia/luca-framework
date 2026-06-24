/**
 * defineSkill — Claude Code skill definitions.
 *
 * A skill in Claude Code is a `<name>/SKILL.md` file with frontmatter
 * (name, description, optional model, optional allowed-tools) and a
 * body. The harness scans skill directories at session start, surfaces
 * the descriptions to the model, and inlines the body when the skill
 * is invoked (via `/<name>` or a Skill tool call).
 *
 * Skills are a thicker artifact than commands: they often package a
 * full workflow (multi-step procedure, decision tree, reference
 * material) and can list trigger keywords in their description.
 *
 * Source-of-truth for what skills look like today (hand-written):
 *   skills/<name>/SKILL.md   in luca-framework  (Phase H removes)
 */
import { z } from 'zod'

/**
 * Skill definition — the input to `defineSkill`. The compiler emits
 * `skills/<name>/SKILL.md` (or whatever path the Claude Code skill
 * loader expects) with the frontmatter and body.
 */
export const SkillDefinitionSchema = z.object({
    /** Tag for the discriminated union. Always `'skill'`. */
    kind: z.literal('skill').default('skill'),
    /**
     * Skill name. Used as the directory name and as the `name` field in
     * the emitted frontmatter. Users invoke via `/<name>` if the skill
     * registers itself that way.
     */
    name: z
        .string()
        .min(1)
        .regex(
            /^[a-z][a-z0-9-]*$/,
            'skill name must be kebab-case: lowercase letters, digits, hyphens; must start with a letter'
        ),
    /**
     * Description — the trigger guidance shown to the model. Should
     * describe BOTH what the skill does AND when to invoke it (the
     * Claude Code skill loader uses this as the model-facing prompt
     * for the auto-invocation decision).
     */
    description: z.string().min(1),
    /**
     * Optional model override for the skill. If absent, Claude Code
     * uses the session's current model.
     */
    model: z.string().optional(),
    /**
     * Optional tool allowlist. If present, only these Claude Code
     * tools are exposed while the skill is active.
     */
    allowedTools: z.array(z.string().min(1)).optional(),
    /**
     * The skill body. Markdown — the full procedure, decision tree,
     * reference material, examples, etc. Claude Code inlines this
     * verbatim when the skill is invoked.
     */
    body: z.string().min(1),
})

/** Output type — what `defineSkill` returns. */
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>

/**
 * Author entry point. Validates via Zod and returns a frozen
 * definition.
 */
export function defineSkill(
    def: z.input<typeof SkillDefinitionSchema>
): SkillDefinition {
    const parsed = SkillDefinitionSchema.safeParse(def)
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        const name = typeof def?.name === 'string' ? def.name : '<unknown>'
        throw new Error(`defineSkill(${name}): ${issues}`)
    }
    return Object.freeze(parsed.data)
}
