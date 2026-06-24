/**
 * Doctor check orchestrator.
 *
 * Runs all registered doctor checks in parallel, optionally filtering
 * by scope. Reports results with pass/fail/warning icons and fix suggestions.
 */

import type { CheckResult, DoctorCheck, DoctorScope } from './types'

import { logger } from '../logger'

/**
 * Execute all registered doctor checks, optionally filtered by scope.
 *
 * @param options - Execution options
 * @param options.verbose - Show detailed check information for passing checks
 * @param options.scope - Filter checks to a specific scope category
 * @param options.fix - Apply automatic remediation for checks that support it
 * @returns Exit code: 0 for success (possibly with warnings), 1 for failures
 */
export async function executeDoctor(
    options: { verbose?: boolean; scope?: DoctorScope; fix?: boolean } = {}
): Promise<number> {
    const { verbose = false, scope, fix = false } = options
    logger.info('Running environment diagnostics...\n')

    // Import all checks
    const { bunRuntimeCheck } = await import('./checks/bun-runtime')
    const { muninndbHealthCheck } = await import('./checks/muninndb-health')
    const { muninnMcpCheck } = await import('./checks/muninn-mcp')
    const { staleMcpServerCheck } = await import('./checks/stale-mcp-server')
    const { staleGlobalSymlinksCheck } =
        await import('./checks/stale-global-symlinks')
    const { legacyPackageCheck } = await import('./checks/legacy-package')
    const { legacyClaudeArtifactsCheck } =
        await import('./checks/legacy-claude-artifacts')
    const { sharedTmpPayloadsCheck } =
        await import('./checks/shared-tmp-payloads')
    const { strayLocalInstallCheck } =
        await import('./checks/stray-local-install')
    const { lucaGitignoreCheck } = await import('./checks/luca-gitignore')
    const { configVersionSkewCheck } =
        await import('./checks/config-version-skew')
    const { vaultConfigLocationCheck } =
        await import('./checks/vault-config-location')

    const allChecks: DoctorCheck[] = [
        // Prerequisites
        bunRuntimeCheck,
        staleMcpServerCheck,
        // Global
        muninndbHealthCheck,
        muninnMcpCheck,
        staleGlobalSymlinksCheck,
        legacyPackageCheck,
        legacyClaudeArtifactsCheck,
        sharedTmpPayloadsCheck,
        // Project (cwd-dependent)
        strayLocalInstallCheck,
        configVersionSkewCheck,
        vaultConfigLocationCheck,
        lucaGitignoreCheck,
    ]

    // Filter by scope if provided
    const checks = scope
        ? allChecks.filter((check) => check.scope === scope)
        : allChecks

    if (checks.length === 0) {
        logger.warn(`No checks found for scope: ${scope}`)
        return 0
    }

    const scopeLabel = scope ? ` (scope: ${scope})` : ''

    // Run all checks in parallel
    const results = await Promise.all(checks.map((check) => check.run()))

    // Count results
    const passCount = results.filter((r) => r.status === 'pass').length
    const failCount = results.filter((r) => r.status === 'fail').length
    const warningCount = results.filter((r) => r.status === 'warning').length

    // Display results
    logger.info(`Environment Diagnostics${scopeLabel}`)
    logger.info('='.repeat(50))

    for (const result of results) {
        const icon =
            result.status === 'pass'
                ? '+'
                : result.status === 'fail'
                  ? 'x'
                  : '!'
        const logLine = `${icon} ${result.name}: ${result.message}`

        if (result.status === 'pass') {
            logger.success(logLine)
        } else if (result.status === 'fail') {
            logger.error(logLine)
        } else {
            logger.warn(logLine)
        }

        if (result.details && (verbose || result.status !== 'pass')) {
            logger.info(`  ${result.details}`)
        }
    }

    logger.info('')
    logger.info('='.repeat(50))
    logger.info(
        `Results: ${passCount} passing, ${failCount} failing, ${warningCount} warning(s)`
    )

    // Apply automatic remediation when --fix is passed; otherwise show the
    // suggested fix commands for any non-passing check.
    if (fix) {
        await applyFixes(checks, results)
    } else {
        const fixableChecks = results.filter(
            (r) =>
                (r.status === 'fail' || r.status === 'warning') && r.fixCommand
        )

        if (fixableChecks.length > 0) {
            logger.info('')
            logger.info('Suggested fixes:')
            logger.info('-'.repeat(50))

            for (const check of fixableChecks) {
                if (check.fixCommand) {
                    logger.info(`  ${check.name}:`)
                    logger.info(`  ${check.fixCommand}`)
                }
            }
        }
    }

    logger.info('')

    // Return exit code
    if (failCount > 0) {
        if (!verbose) {
            logger.error(
                'Some checks failed. Run with --verbose for more details.'
            )
        } else {
            logger.error('Some checks failed.')
        }
        return 1
    }

    if (warningCount > 0) {
        logger.warn('All checks passed with warnings.')
        return 0
    }

    logger.success('All checks passed! Your environment is ready.')
    return 0
}

/**
 * Apply automatic remediation for non-passing checks that implement `fix()`.
 *
 * `checks` and `results` are index-aligned (results come from
 * `Promise.all(checks.map(...))`), so each result is matched to its check.
 */
async function applyFixes(
    checks: DoctorCheck[],
    results: CheckResult[]
): Promise<void> {
    const fixable = checks
        .map((check, index) => ({ check, result: results[index] }))
        .filter(
            (pair): pair is { check: DoctorCheck; result: CheckResult } =>
                pair.result !== undefined &&
                pair.result.status !== 'pass' &&
                typeof pair.check.fix === 'function'
        )

    if (fixable.length === 0) {
        const hasIssues = results.some((result) => result.status !== 'pass')
        if (hasIssues) {
            logger.info('')
            logger.info('No automatic fixes available for the issues above.')
        }
        return
    }

    logger.info('')
    logger.info('Applying fixes (--fix)')
    logger.info('-'.repeat(50))

    for (const { check } of fixable) {
        // `fix` is guaranteed defined by the filter above.
        const fixResult = await check.fix!()
        for (const action of fixResult.applied) {
            logger.success(`+ ${check.name}: ${action}`)
        }
        for (const error of fixResult.errors) {
            logger.error(`x ${check.name}: ${error}`)
        }
        if (fixResult.applied.length === 0 && fixResult.errors.length === 0) {
            logger.info(`  ${check.name}: nothing to fix`)
        }
    }
}
