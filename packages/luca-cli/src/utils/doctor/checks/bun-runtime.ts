import type { CheckResult, DoctorCheck } from '../types'

/**
 * Minimum required Bun version for the Luca framework.
 *
 * Luca uses Bun-specific APIs (Bun.file, Bun.write, Bun.version)
 * that require at least Bun 1.0.0.
 */
const MIN_BUN_VERSION = '1.0.0'

/**
 * Compare two semver version strings.
 *
 * Returns true if `current` >= `minimum`.
 *
 * @param current - Current version string (e.g. "1.1.38")
 * @param minimum - Minimum required version string (e.g. "1.0.0")
 * @returns true if current meets the minimum requirement
 */
function isSemverGte(current: string, minimum: string): boolean {
    const currentParts = current.split('.').map(Number)
    const minimumParts = minimum.split('.').map(Number)

    for (let i = 0; i < 3; i++) {
        const curr = currentParts[i] ?? 0
        const min = minimumParts[i] ?? 0
        if (curr > min) return true
        if (curr < min) return false
    }

    return true // equal
}

/**
 * Doctor check: verify Bun runtime is available and meets minimum version.
 *
 * Checks `Bun.version` (available at runtime when executing under Bun)
 * and verifies it is >= 1.0.0. This replaces the previous Node.js version
 * check since Luca is a Bun-first project.
 *
 * @example
 * ```typescript
 * const result = await bunRuntimeCheck.run();
 * // { name: 'Bun Runtime', status: 'pass', message: 'Bun 1.1.38 (1.0.0+ required)', ... }
 * ```
 */
export const bunRuntimeCheck: DoctorCheck = {
    name: 'Bun Runtime',
    scope: 'prerequisites',

    async run(): Promise<CheckResult> {
        // Check if Bun global is available
        if (typeof Bun === 'undefined') {
            return {
                name: this.name,
                status: 'fail',
                message: 'Bun runtime not detected',
                fixCommand:
                    'curl -fsSL https://bun.sh/install | bash  # Install Bun\nhttps://bun.sh/  # or visit the website',
                details:
                    'Luca requires the Bun runtime. It appears you are running under a different runtime (e.g. Node.js).',
            }
        }

        const currentVersion = Bun.version

        if (isSemverGte(currentVersion, MIN_BUN_VERSION)) {
            return {
                name: this.name,
                status: 'pass',
                message: `Bun ${currentVersion} (${MIN_BUN_VERSION}+ required)`,
                fixCommand: null,
                details: null,
            }
        }

        return {
            name: this.name,
            status: 'fail',
            message: `Bun ${currentVersion} (${MIN_BUN_VERSION}+ required)`,
            fixCommand:
                'bun upgrade  # Upgrade to latest Bun\ncurl -fsSL https://bun.sh/install | bash  # or reinstall',
            details: `Luca requires Bun ${MIN_BUN_VERSION} or later. Current version: ${currentVersion}`,
        }
    },
}
