/**
 * Shared schemas for the skill-optimization loop. Task-specific corpus item
 * shapes live in each task module (tasks/*.ts); this file holds only the
 * cross-task primitives: splits and the bounded-edit vocabulary.
 */
import { z } from 'zod'

export const SplitSchema = z.enum(['train', 'val', 'test'])
export type Split = z.infer<typeof SplitSchema>

/** Bounded edit ops — the only mutations the optimizer may propose. */
export const EditOpSchema = z.enum([
    'append',
    'insert_after',
    'replace',
    'delete',
])
export type EditOp = z.infer<typeof EditOpSchema>

export const EditSchema = z.object({
    op: EditOpSchema,
    /** Exact text to anchor on (insert_after / replace / delete). */
    target: z.string().default(''),
    /** New markdown (append / insert_after / replace). */
    content: z.string().default(''),
})
export type Edit = z.infer<typeof EditSchema>

/** A reflection result: reasoning plus the proposed bounded edits. */
export const PatchSchema = z.object({
    reasoning: z.string().default(''),
    edits: z.array(EditSchema).default([]),
})
export type Patch = z.infer<typeof PatchSchema>

/** Equivalence-judge verdict (used by the caveman task). */
export const EquivalenceSchema = z.object({
    pass: z.boolean(),
    reason: z.string().default(''),
})
export type Equivalence = z.infer<typeof EquivalenceSchema>
