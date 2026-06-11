/**
 * Todo schema.
 *
 * Todos are stored in MuninnDB under concept `todo:<id>` in the repo
 * vault. The luca server validates the shape server-side via this
 * schema, then emits a `muninn_remember` instruction for the agent to
 * execute (delegation pattern — the MCP server can't call other MCP
 * servers directly).
 *
 * Status transitions (`pending → done`) require a verificationRef
 * pointing at a met criterion in the active phase's verify.json. That
 * guard is enforced in the MCP tool handler before the muninn
 * instruction is emitted.
 */
import { z } from 'zod'

export const TodoStatus = z.enum(['pending', 'backlog', 'done'])
export type TodoStatus = z.infer<typeof TodoStatus>

export const TodoPriority = z.enum(['low', 'medium', 'high', 'critical'])
export type TodoPriority = z.infer<typeof TodoPriority>

/**
 * Stable kebab-case identifier for a todo. Matches the suffix of the
 * MuninnDB concept (`todo:<id>`). Lowercase letters, digits, single
 * hyphens between segments; no leading/trailing dash; ≤60 chars.
 */
export const TodoIdSchema = z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
        message: 'must be kebab-case (lowercase a-z, digits, single dashes)',
    })

/**
 * Area/component tag for a todo (e.g. 'cli', 'mcp-server'). Constrained
 * to a kebab-case charset (lowercase letters, digits, single hyphens
 * between segments; no leading/trailing dash; ≤60 chars) so the value
 * is safe to interpolate into agent-facing instruction text. Single
 * source of truth — handler inputSchemas import this rather than
 * redeclaring the constraint.
 */
export const TodoAreaSchema = z
    .string()
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
        message: 'must be kebab-case (lowercase a-z, digits, single dashes)',
    })

export const VerificationRefSchema = z.object({
    criterionId: z
        .string()
        .min(1)
        .describe(
            "Stable criterion id (e.g. 'ac-03') matching an entry in the active phase's verify.json."
        ),
})
export type VerificationRef = z.infer<typeof VerificationRefSchema>

export const TodoSchema = z.object({
    schemaVersion: z.literal(1),
    id: TodoIdSchema,
    title: z.string().min(1).max(200),
    body: z.string().max(8192).optional(),
    status: TodoStatus,
    /** Optional triage priority. Absent on todos created before this field existed. */
    priority: TodoPriority.optional(),
    /** Optional kebab-case area/component tag (e.g. 'cli', 'mcp-server'); ≤60 chars. */
    area: TodoAreaSchema.optional(),
    source: z.string().max(120).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    updatedAt: z
        .string()
        .datetime({ message: 'updatedAt must be ISO 8601 datetime' }),
    verificationRef: VerificationRefSchema.optional(),
})
export type Todo = z.infer<typeof TodoSchema>

/**
 * Convert a free-form title into a kebab-case slug suitable as a Todo
 * id and MuninnDB concept suffix. Throws when the slug would be empty
 * (e.g. all-punctuation input) — callers must surface that to the user.
 */
export function slugFromTitle(title: string): string {
    const slug = title
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '')
    if (slug.length === 0) {
        throw new Error(
            `cannot derive a slug from title "${title}" (no alphanumeric content)`
        )
    }
    return slug
}

/**
 * MuninnDB concept prefix for all todos. Tools/tests can compose
 * `${TODO_CONCEPT_PREFIX}${id}` rather than hardcoding the string.
 */
export const TODO_CONCEPT_PREFIX = 'todo:'

export function todoConceptFor(id: string): string {
    return `${TODO_CONCEPT_PREFIX}${id}`
}
