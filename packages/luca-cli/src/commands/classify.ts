/**
 * CLI command: `luca classify`
 *
 * Deterministically classify a development task's complexity (TRIVIAL →
 * CRITICAL) via the luca-core heuristic. Surfaces the classify-complexity
 * logic ported in Phase B — §5.3 flagged it as a dropped tool with no v13
 * handler.
 */
import { classifyComplexity } from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'

import { logger } from '../utils/logger.ts'

/** Split a comma-separated flag value into a trimmed, non-empty list. */
function splitList(value: string | undefined): string[] {
    if (!value) return []
    return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
}

export const classifyCommand = defineCommand({
    meta: {
        name: 'classify',
        description:
            'Classify a development task’s complexity (TRIVIAL → CRITICAL).',
    },
    args: {
        task: {
            type: 'string',
            required: true,
            description: 'Task description.',
        },
        files: {
            type: 'string',
            description: 'Estimated number of files affected.',
        },
        concerns: {
            type: 'string',
            description: 'Comma-separated cross-cutting concerns.',
        },
        domains: {
            type: 'string',
            description: 'Comma-separated affected architectural domains.',
        },
        breaking: {
            type: 'boolean',
            description: 'The task introduces breaking changes.',
        },
        json: {
            type: 'boolean',
            description: 'Emit the full ComplexityResult as JSON.',
        },
    },
    run({ args }) {
        const result = classifyComplexity({
            taskDescription: args.task,
            estimatedFileCount:
                args.files !== undefined ? Number(args.files) : undefined,
            crossCuttingConcerns: splitList(args.concerns),
            hasBreakingChanges: args.breaking,
            affectedDomains: splitList(args.domains),
        })

        if (args.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
            return
        }

        logger.info(`Complexity: ${result.complexity}`)
        logger.info(result.reasoning)
        logger.info(
            `Factors: fileScope=${result.factors.fileScope}, ` +
                `dependencyDepth=${result.factors.dependencyDepth}, ` +
                `riskLevel=${result.factors.riskLevel}`
        )
    },
})
