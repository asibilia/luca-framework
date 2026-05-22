/**
 * Doctor check: MuninnDB binary installation and service health.
 *
 * Validates that the MuninnDB binary is installed at ~/.luca/bin/muninndb
 * and that the service is running and healthy. Uses the existing
 * `checkMuninndbBinary()` and `checkMuninndbService()` utilities.
 *
 * @see packages/luca-framework/src/utils/muninndb-health.ts
 */

import {
    checkMuninndbBinary,
    checkMuninndbService,
} from '../../muninndb-health'
import type { CheckResult, DoctorCheck } from '../types'

/**
 * Doctor check: verify MuninnDB binary is installed and service is healthy.
 *
 * Check 1 — Binary: looks for ~/.luca/bin/muninndb and verifies it is executable.
 * Check 2 — Service: sends an HTTP health check to the running MuninnDB process.
 *
 * Returns:
 * - **pass** if binary found AND service healthy
 * - **warning** if binary found but service not running/unhealthy
 * - **fail** if binary not found
 *
 * @example
 * ```typescript
 * const result = await muninndbHealthCheck.run();
 * // { name: 'MuninnDB', status: 'pass', message: 'Binary installed, service healthy (port 8476)', ... }
 * ```
 */
export const muninndbHealthCheck: DoctorCheck = {
    name: 'MuninnDB',
    scope: 'global',

    async run(): Promise<CheckResult> {
        // Check 1: Binary installed and executable
        const binary = await checkMuninndbBinary()

        if (!binary.installed) {
            return {
                name: this.name,
                status: 'fail',
                message: 'MuninnDB binary not found',
                fixCommand: 'luca init',
                details:
                    'MuninnDB binary not installed at ~/.luca/bin/muninndb. Run `luca init` to install it.',
            }
        }

        if (!binary.executable) {
            return {
                name: this.name,
                status: 'fail',
                message: 'MuninnDB binary not executable',
                fixCommand: 'chmod +x ~/.luca/bin/muninndb',
                details: `Binary found at ${binary.path} but lacks executable permissions.`,
            }
        }

        // Check 2: Service running and healthy
        const service = await checkMuninndbService()

        if (!service.running) {
            const versionSuffix = binary.version ? ` (${binary.version})` : ''
            return {
                name: this.name,
                status: 'warning',
                message: `Binary installed${versionSuffix}, service not running`,
                fixCommand: 'muninn start',
                details: `Binary at ${binary.path}. Start the service with: muninn start`,
            }
        }

        if (!service.healthy) {
            return {
                name: this.name,
                status: 'warning',
                message: `Service running on port ${service.port} but unhealthy`,
                fixCommand: 'Restart MuninnDB',
                details:
                    'MuninnDB process is running but failed the health check. Try restarting it.',
            }
        }

        const versionSuffix = binary.version ? ` (${binary.version})` : ''
        const pidSuffix = service.pid ? `, PID ${service.pid}` : ''
        return {
            name: this.name,
            status: 'pass',
            message: `Binary installed${versionSuffix}, service healthy (port ${service.port}${pidSuffix})`,
            fixCommand: null,
            details: null,
        }
    },
}
