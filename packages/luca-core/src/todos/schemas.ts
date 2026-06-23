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

/**
 * Reserved concept for the backlog **root** container engram.
 *
 * The backlog is stored as a MuninnDB tree: one root engram whose
 * `is_part_of` children are the individual `todo:<id>` engrams. Listing
 * resolves this root by concept (deterministic, via
 * `muninn_find_by_entity`) and then enumerates the whole subtree with
 * `muninn_recall_tree` — a structural walk that returns EVERY child
 * regardless of vault size or embedding similarity. This replaces the
 * old semantic-recall enumeration that silently dropped the long tail.
 *
 * The double-underscore suffix is deliberate: {@link TodoIdSchema}
 * forbids underscores, so `todoConceptFor(<any valid id>)` can never
 * collide with this reserved concept. It stays under the `todo:` prefix
 * so the existing vault-routing rule (`todo:*` → repo vault) applies
 * unchanged.
 */
export const TODO_BACKLOG_ROOT_CONCEPT = 'todo:__backlog__'

/**
 * Content body for the backlog root container engram. Plain natural
 * language (the root is NOT a {@link Todo} — it has no TodoSchema
 * content), so listing logic skips any node whose content does not
 * parse as a Todo.
 */
export const TODO_BACKLOG_ROOT_CONTENT =
    'Luca development backlog — container node. Its is_part_of children ' +
    'are the individual todo:<id> engrams. Resolve this node via ' +
    'muninn_find_by_entity, then enumerate the backlog with ' +
    'muninn_recall_tree for complete, deterministic listing.'

/**
 * True when a concept is the reserved backlog-root container rather than
 * a real todo. Listing/enumeration logic uses this to skip the root.
 */
export function isBacklogRootConcept(concept: string): boolean {
    return concept === TODO_BACKLOG_ROOT_CONCEPT
}
