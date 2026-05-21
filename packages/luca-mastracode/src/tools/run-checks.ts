/**
 * run-checks — Mastra tool that runs project checks (tsc, eslint, tests),
 * fingerprints structured errors, and tracks convergence across iterations.
 *
 * Implementation is split across:
 *   • check-runner.ts      — runner detection, command building, subprocess execution
 *   • check-parsers.ts     — parser-registry wrapper + SHA256 fingerprinting
 *   • check-convergence.ts — converging/stalled/resolved state tracking
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    assessConvergence,
    readConvergence,
    writeConvergence,
} from './check-convergence.js'
import {
    parseAndFingerprint,
    type FingerprintedError,
} from './check-parsers.js'
import {
    buildCommand,
    detectCheck,
    detectRunner,
    runWithTimeout,
} from './check-runner.js'

export const runChecksTool = createTool({
    id: 'run-checks',
    description:
        'Run project checks (tsc, eslint, tests) with structured error parsing, fingerprinting, and convergence tracking. Auto-detects available tools; 30s timeout per check. Call IMMEDIATELY after code changes — do NOT batch multiple waves before checking.',
    inputSchema: z.object({
        checks: z
            .array(z.enum(['tsc', 'eslint', 'bun-test', 'all']))
            .default(['all'])
            .describe('Which checks to run'),
        projectDir: z
            .string()
            .optional()
            .describe('Project directory (defaults to cwd)'),
        failFast: z
            .boolean()
            .optional()
            .default(false)
            .describe('Stop on first failure'),
        timeoutSeconds: z
            .number()
            .optional()
            .default(30)
            .describe('Per-check timeout in seconds (default: 30)'),
    }),
    execute: async (inputData) => {
        const {
            checks = ['all'],
            failFast,
            projectDir,
            timeoutSeconds = 30,
        } = inputData
        const cwd = projectDir ?? process.cwd()
        const runner = detectRunner(cwd)
        const timeoutMs = timeoutSeconds * 1000

        const results: Array<{
            name: string
            status: 'pass' | 'fail' | 'skip' | 'timeout'
            duration: number
            errorCount: number
            warningCount: number
            output: string
            parsedErrors: FingerprintedError[]
        }> = []

        const checksToRun = checks.includes('all')
            ? ['tsc', 'eslint', 'bun-test']
            : checks

        for (const check of checksToRun) {
            const detection = detectCheck(check, cwd)
            if (!detection.available) {
                results.push({
                    name: check,
                    status: 'skip',
                    duration: 0,
                    errorCount: 0,
                    warningCount: 0,
                    output: detection.reason ?? 'Tool not available',
                    parsedErrors: [],
                })
                continue
            }

            const start = Date.now()
            const command = buildCommand(check, runner)
            const { exitCode, stdout, stderr, timedOut } = await runWithTimeout(
                command,
                cwd,
                timeoutMs
            )
            const duration = Date.now() - start

            if (timedOut) {
                results.push({
                    name: check,
                    status: 'timeout',
                    duration,
                    errorCount: 0,
                    warningCount: 0,
                    output: `Timed out after ${timeoutSeconds}s — killed process. Command: ${command}`,
                    parsedErrors: [],
                })
                if (failFast) break
                continue
            }

            const output = (stdout + '\n' + stderr).trim()
            const parsed = parseAndFingerprint(check, output)
            const errorCount =
                parsed.length > 0
                    ? parsed.length
                    : (output.match(/error/gi) ?? []).length
            const warningCount = (output.match(/warning/gi) ?? []).length

            results.push({
                name: check,
                status: exitCode === 0 ? 'pass' : 'fail',
                duration,
                errorCount,
                warningCount,
                output: output.slice(0, 2000),
                parsedErrors: parsed,
            })

            if (failFast && exitCode !== 0) break
        }

        // --- Convergence tracking ---
        const allFingerprints = results.flatMap((r) =>
            r.parsedErrors.map((e) => e.fingerprint)
        )
        const prevConvergence = readConvergence()
        const { convergence, newState } = assessConvergence(
            allFingerprints,
            prevConvergence
        )
        writeConvergence(newState)

        const allPassed = results.every(
            (r) => r.status === 'pass' || r.status === 'skip'
        )
        const summary = results.map((r) => `${r.name}: ${r.status}`).join(', ')

        return {
            passed: allPassed,
            summary,
            checks: results.map(({ parsedErrors, ...rest }) => ({
                ...rest,
                fingerprints: parsedErrors.map((e) => e.fingerprint),
            })),
            convergence,
            iteration: newState.totalIterations,
            staleIterations: newState.staleIterations,
            totalErrors: allFingerprints.length,
            newErrors: allFingerprints.filter(
                (fp) => !new Set(prevConvergence.previousFingerprints).has(fp)
            ).length,
            resolvedErrors: prevConvergence.previousFingerprints.filter(
                (fp) => !new Set(allFingerprints).has(fp)
            ).length,
        }
    },
})
