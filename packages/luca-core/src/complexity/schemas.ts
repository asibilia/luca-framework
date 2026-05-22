import { z } from 'zod'

import { ComplexityLevel } from '../state/index.ts'

/**
 * Input to the deterministic complexity classifier.
 *
 * Defaults live in the schema (not in destructuring) — callers may pass a
 * partial object; {@link ClassifyComplexityInputSchema}.parse applies them.
 */
export const ClassifyComplexityInputSchema = z.object({
    taskDescription: z.string().describe('Description of the development task'),
    estimatedFileCount: z
        .number()
        .default(0)
        .describe('Estimated number of files affected'),
    crossCuttingConcerns: z
        .array(z.string())
        .default([])
        .describe('Cross-cutting concerns (e.g. auth, state, API changes)'),
    hasBreakingChanges: z
        .boolean()
        .default(false)
        .describe('Whether the change introduces breaking changes'),
    affectedDomains: z
        .array(z.string())
        .default([])
        .describe('Affected architectural domains'),
})

/** Raw (pre-parse) input — defaults are optional for the caller. */
export type ClassifyComplexityInput = z.input<
    typeof ClassifyComplexityInputSchema
>

/** Result of the deterministic complexity classifier. */
export const ComplexityResultSchema = z.object({
    complexity: ComplexityLevel,
    reasoning: z.string(),
    factors: z.object({
        fileScope: z.enum(['small', 'medium', 'large']),
        dependencyDepth: z.enum(['shallow', 'moderate', 'deep']),
        riskLevel: z.enum(['low', 'medium', 'high']),
    }),
})

export type ComplexityResult = z.infer<typeof ComplexityResultSchema>
