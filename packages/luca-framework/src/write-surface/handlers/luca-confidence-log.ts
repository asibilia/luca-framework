import { existsSync } from 'node:fs'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { phasePathFor, loadCurrentState } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { resolveActiveSlug } from '../helpers/resolve-active-slug.ts'

const inputSchema = z.object({
    score: z
        .number()
        .min(0)
        .max(1)
        .describe(
            'Confidence score in [0,1]: 0 = no confidence, 1 = certain. Subjective per-agent estimate.'
        ),
    stage: z
        .string()
        .min(1)
        .describe(
            'Pipeline stage at which this confidence was recorded (e.g. "plan", "execute", "verify", "review").'
        ),
    rationale: z
        .string()
        .min(1)
        .describe(
            'Free-text justification for the score — what raised or lowered confidence.'
        ),
    metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
            'Optional structured fields the caller wants to capture alongside the score.'
        ),
})

/**
 * Append a confidence entry to .luca/phases/<active-slug>/confidence.jsonl.
 * One JSON object per line. Callable in any pipelineStep — different agents
 * (planner, executor, verifier, reviewer) all contribute entries to the
 * same per-phase log.
 */
export const lucaConfidenceLogTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_confidence_log',
    description:
        "Append a confidence-score entry to the active phase's confidence.jsonl. One JSONL line per call. Use to record subjective certainty at each stage (plan/execute/verify/review).",
    inputSchema,
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const slug = resolveActiveSlug(state)
        if (!slug.ok) {
            return {
                content: [{ type: 'text', text: slug.error }],
                isError: true,
            }
        }

        const relPath = phasePathFor(slug.slug, 'confidence')
        const absPath = join(ctx.cwd, relPath)

        const entry = {
            timestamp: new Date().toISOString(),
            stage: args.stage,
            score: args.score,
            rationale: args.rationale,
            ...(args.metadata ? { metadata: args.metadata } : {}),
        }
        const line = JSON.stringify(entry) + '\n'

        await mkdir(dirname(absPath), { recursive: true })
        if (existsSync(absPath)) {
            await appendFile(absPath, line)
        } else {
            await writeFile(absPath, line)
        }

        return {
            content: [
                {
                    type: 'text',
                    text: `appended ${line.length} bytes to ${relPath}`,
                },
            ],
        }
    },
}
