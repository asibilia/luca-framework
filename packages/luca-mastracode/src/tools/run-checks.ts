import { createHash } from 'node:crypto'
import {
    existsSync,
    readdirSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
} from 'node:fs'
import { join } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import type { ParsedError } from './__schemas/checks.schemas'
import { parserRegistry } from './parsers/parser-registry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect the project's package runner from lockfiles. */
function detectRunner(cwd: string): string {
    if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
    if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock')))
        return 'bun'
    if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
    return 'npm'
}

/** Build the shell command for a given check. */
function buildCommand(check: string, runner: string): string {
    switch (check) {
        case 'tsc': {
            const prefix =
                runner === 'bun'
                    ? 'bunx --bun'
                    : runner === 'pnpm'
                      ? 'pnpm exec'
                      : 'npx --yes'
            return `${prefix} tsc --noEmit`
        }
        case 'eslint': {
            const prefix =
                runner === 'bun'
                    ? 'bunx'
                    : runner === 'pnpm'
                      ? 'pnpm exec'
                      : 'npx --yes'
            return `${prefix} eslint .`
        }
        case 'bun-test':
            return runner === 'bun' ? 'bun test' : `${runner} test`
        default:
            return check
    }
}

/** Check whether the tooling for a given check is present in the project. */
function detectCheck(
    check: string,
    cwd: string
): { available: boolean; reason?: string } {
    switch (check) {
        case 'tsc': {
            if (!existsSync(join(cwd, 'tsconfig.json'))) {
                return {
                    available: false,
                    reason: 'No tsconfig.json found — skipping TypeScript check',
                }
            }
            return { available: true }
        }
        case 'eslint': {
            const eslintConfigs = [
                '.eslintrc',
                '.eslintrc.js',
                '.eslintrc.cjs',
                '.eslintrc.json',
                '.eslintrc.yml',
                '.eslintrc.yaml',
                'eslint.config.js',
                'eslint.config.mjs',
                'eslint.config.cjs',
                'eslint.config.ts',
            ]
            const hasConfig = eslintConfigs.some((f) =>
                existsSync(join(cwd, f))
            )
            if (hasConfig) return { available: true }
            // Also check package.json for eslintConfig or eslint dependency
            try {
                const pkg = JSON.parse(
                    readFileSync(join(cwd, 'package.json'), 'utf-8')
                )
                if (pkg.eslintConfig) return { available: true }
                const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
                if (allDeps?.eslint) return { available: true }
            } catch {
                /* no package.json */
            }
            return {
                available: false,
                reason: 'No ESLint config or dependency found — skipping lint check',
            }
        }
        case 'bun-test': {
            // Look for any test files in common locations
            const testPatterns = ['__tests__', 'test', 'tests', 'spec']
            const hasTestDir = testPatterns.some((d) =>
                existsSync(join(cwd, d))
            )
            if (hasTestDir) return { available: true }
            // Check for *.test.* or *.spec.* in src/
            if (existsSync(join(cwd, 'src'))) {
                try {
                    const hasTestFile = findTestFile(join(cwd, 'src'))
                    if (hasTestFile) return { available: true }
                } catch {
                    /* permission error, skip */
                }
            }
            // Check package.json scripts for test
            try {
                const pkg = JSON.parse(
                    readFileSync(join(cwd, 'package.json'), 'utf-8')
                )
                if (
                    pkg.scripts?.test &&
                    pkg.scripts.test !==
                        'echo "Error: no test specified" && exit 1'
                ) {
                    return { available: true }
                }
            } catch {
                /* no package.json */
            }
            return {
                available: false,
                reason: 'No test files or test script found — skipping test check',
            }
        }
        default:
            return { available: true }
    }
}

/** Shallow scan for *.test.* or *.spec.* files (max 2 levels deep). */
function findTestFile(dir: string, depth = 0): boolean {
    if (depth > 2) return false
    try {
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
            if (
                entry.isFile() &&
                (/\.test\./.test(entry.name) || /\.spec\./.test(entry.name))
            ) {
                return true
            }
            if (
                entry.isDirectory() &&
                !entry.name.startsWith('.') &&
                entry.name !== 'node_modules'
            ) {
                if (findTestFile(join(dir, entry.name), depth + 1)) return true
            }
        }
    } catch {
        /* permission denied */
    }
    return false
}

/** Run a subprocess with a timeout. Kills the process and returns 'timeout' if exceeded. */
async function runWithTimeout(
    command: string,
    cwd: string,
    timeoutMs: number
): Promise<{
    exitCode: number | null
    stdout: string
    stderr: string
    timedOut: boolean
}> {
    const proc = Bun.spawn(['sh', '-c', command], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    })

    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        proc.kill()
    }, timeoutMs)

    try {
        const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ])
        const exitCode = await proc.exited
        clearTimeout(timer)
        return { exitCode, stdout, stderr, timedOut }
    } catch {
        clearTimeout(timer)
        return { exitCode: null, stdout: '', stderr: '', timedOut }
    }
}

// ---------------------------------------------------------------------------
// Error fingerprinting and convergence tracking
// ---------------------------------------------------------------------------

interface FingerprintedError extends ParsedError {
    fingerprint: string
}

/** Run the canonical parser for `checkName` and attach SHA256 fingerprints. */
function parseAndFingerprint(
    checkName: string,
    output: string
): FingerprintedError[] {
    const parserFactory = parserRegistry[checkName]
    if (!parserFactory) {
        console.warn(
            `[run-checks] No parser found for check "${checkName}" — raw output will not be parsed`
        )
        return []
    }
    const parser = parserFactory()
    return parser(output).map((err) => ({
        ...err,
        fingerprint: createHash('sha256')
            .update(`${err.file}:${err.line ?? 0}:${err.message}`)
            .digest('hex')
            .slice(0, 12),
    }))
}

const CONVERGENCE_FILE = '.planning/checks-convergence.json'

interface ConvergenceState {
    /** Fingerprints from the last run */
    previousFingerprints: string[]
    /** Number of consecutive iterations with the same error set */
    staleIterations: number
    /** Total iteration count */
    totalIterations: number
}

function readConvergence(): ConvergenceState {
    const p = join(process.cwd(), CONVERGENCE_FILE)
    if (!existsSync(p))
        return {
            previousFingerprints: [],
            staleIterations: 0,
            totalIterations: 0,
        }
    try {
        return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
        return {
            previousFingerprints: [],
            staleIterations: 0,
            totalIterations: 0,
        }
    }
}

function writeConvergence(state: ConvergenceState): void {
    const dir = join(process.cwd(), '.planning')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(
        join(process.cwd(), CONVERGENCE_FILE),
        JSON.stringify(state, null, 2),
        'utf-8'
    )
}

function assessConvergence(
    currentFingerprints: string[],
    prev: ConvergenceState
): {
    convergence: 'converging' | 'stalled' | 'resolved'
    newState: ConvergenceState
} {
    const prevSet = new Set(prev.previousFingerprints)

    // No errors → resolved
    if (currentFingerprints.length === 0) {
        return {
            convergence: 'resolved',
            newState: {
                previousFingerprints: [],
                staleIterations: 0,
                totalIterations: prev.totalIterations + 1,
            },
        }
    }

    // Compute overlap
    const overlap = currentFingerprints.filter((fp) => prevSet.has(fp))
    const overlapRatio =
        prev.previousFingerprints.length > 0
            ? overlap.length / prev.previousFingerprints.length
            : 0

    // If all errors are the same → stalling
    if (
        overlapRatio >= 1.0 &&
        currentFingerprints.length >= prev.previousFingerprints.length
    ) {
        const staleIterations = prev.staleIterations + 1
        return {
            convergence: staleIterations >= 2 ? 'stalled' : 'converging',
            newState: {
                previousFingerprints: currentFingerprints,
                staleIterations,
                totalIterations: prev.totalIterations + 1,
            },
        }
    }

    // Error count is decreasing or fingerprints changed → converging
    return {
        convergence: 'converging',
        newState: {
            previousFingerprints: currentFingerprints,
            staleIterations: 0,
            totalIterations: prev.totalIterations + 1,
        },
    }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

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
            // Use parsed error count when available, fall back to regex for unparsed output
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
