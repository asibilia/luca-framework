import {
    ClassifyComplexityInputSchema,
    type ClassifyComplexityInput,
    type ComplexityResult,
} from '../schemas.ts'

/**
 * Deterministically classify the complexity of a development task.
 *
 * Pure heuristic — scores file count, cross-cutting concerns, breaking
 * changes, domain spread, and description keywords, then maps the score to a
 * five-level rating (TRIVIAL → CRITICAL). No I/O.
 *
 * Ported from luca-mastracode `tools/classify-complexity.ts`: the Mastra
 * `createTool` wrapper is dropped — this is the harness-agnostic core.
 *
 * @param input - Task descriptors. Missing fields fall back to the schema
 *   defaults (zero files, no concerns, non-breaking, no domains).
 * @returns The complexity rating, a one-line reasoning string, and the
 *   underlying factor breakdown.
 *
 * @example
 * ```typescript
 * classifyComplexity({ taskDescription: 'fix a typo', estimatedFileCount: 1 })
 * // { complexity: 'TRIVIAL', reasoning: 'Score 0: ...', factors: {...} }
 * ```
 */
export function classifyComplexity(
    input: ClassifyComplexityInput
): ComplexityResult {
    const {
        taskDescription,
        estimatedFileCount,
        crossCuttingConcerns,
        hasBreakingChanges,
        affectedDomains,
    } = ClassifyComplexityInputSchema.parse(input)

    let score = 0

    // File-count factor.
    if (estimatedFileCount <= 2) score += 0
    else if (estimatedFileCount <= 5) score += 1
    else if (estimatedFileCount <= 15) score += 2
    else if (estimatedFileCount <= 30) score += 3
    else score += 4

    // Cross-cutting concerns (capped).
    score += Math.min(crossCuttingConcerns.length, 4)

    // Breaking changes.
    if (hasBreakingChanges) score += 2

    // Domain spread.
    if (affectedDomains.length > 3) score += 2
    else if (affectedDomains.length > 1) score += 1

    // Description keywords.
    const desc = taskDescription.toLowerCase()
    if (desc.includes('refactor') || desc.includes('migration')) score += 1
    if (desc.includes('security') || desc.includes('auth')) score += 1
    if (desc.includes('database') || desc.includes('schema')) score += 1

    const complexity =
        score <= 1
            ? 'TRIVIAL'
            : score <= 3
              ? 'SIMPLE'
              : score <= 6
                ? 'MODERATE'
                : score <= 9
                  ? 'COMPLEX'
                  : 'CRITICAL'

    const fileScope =
        estimatedFileCount <= 3
            ? 'small'
            : estimatedFileCount <= 15
              ? 'medium'
              : 'large'

    const dependencyDepth =
        crossCuttingConcerns.length <= 1
            ? 'shallow'
            : crossCuttingConcerns.length <= 3
              ? 'moderate'
              : 'deep'

    const riskLevel =
        hasBreakingChanges || score > 6
            ? 'high'
            : score > 3
              ? 'medium'
              : 'low'

    return {
        complexity,
        reasoning: `Score ${score}: ${estimatedFileCount} files, ${crossCuttingConcerns.length} cross-cutting concerns, ${affectedDomains.length} domains${hasBreakingChanges ? ', has breaking changes' : ''}`,
        factors: { fileScope, dependencyDepth, riskLevel },
    }
}
