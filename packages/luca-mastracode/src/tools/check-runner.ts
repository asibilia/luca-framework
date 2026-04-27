/**
 * check-runner — runner detection, tool detection, command building, and
 * subprocess execution for the run-checks tool.
 *
 * Pure helpers. No state, no Mastra dependencies.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Detect the project's package runner from lockfiles. */
export function detectRunner(cwd: string): string {
    if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
    if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock')))
        return 'bun'
    if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
    return 'npm'
}

/** Build the shell command for a given check. */
export function buildCommand(check: string, runner: string): string {
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

/** Check whether the tooling for a given check is present in the project. */
export function detectCheck(
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
            const testPatterns = ['__tests__', 'test', 'tests', 'spec']
            const hasTestDir = testPatterns.some((d) =>
                existsSync(join(cwd, d))
            )
            if (hasTestDir) return { available: true }
            if (existsSync(join(cwd, 'src'))) {
                try {
                    const hasTestFile = findTestFile(join(cwd, 'src'))
                    if (hasTestFile) return { available: true }
                } catch {
                    /* permission error, skip */
                }
            }
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

/** Run a subprocess with a timeout. Kills the process and returns 'timeout' if exceeded. */
export async function runWithTimeout(
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
