/**
 * Doctor check: `.luca/config.json#lucaVersion` skewed from the installed CLI.
 *
 * `lucaVersion` is written ONCE at `luca init` from the CLI's `LUCA_VERSION`
 * and never reconciled afterward (`luca preferences write` preserves it
 * verbatim). After a CLI upgrade the stored value goes stale — e.g. a project
 * initialized on 12.x still reads `lucaVersion: 12.0.0-…` while the running
 * CLI is 13.x. Stale version metadata misleads skills/agents that branch on it
 * (the v13 run report, M4).
 *
 * Project-scoped (reads `<cwd>/.luca/config.json`). Warning-only with an
 * auto-`fix()` that rewrites `lucaVersion` to the installed version, preserving
 * every other config key. Skipped in dev (`0.0.0-dev`), where no real version
 * is injected to compare against.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { LUCA_VERSION } from '../../manifest.ts'
import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Config version skew'

function configPath(): string {
    return join(process.cwd(), '.luca', 'config.json')
}

/** True for a dev/unreplaced version where comparison is meaningless. */
function isDevVersion(v: string): boolean {
    return v === '0.0.0-dev' || v.includes('dev')
}

async function readConfig(): Promise<Record<string, unknown> | null> {
    const p = configPath()
    if (!existsSync(p)) return null
    try {
        const raw = JSON.parse(await readFile(p, 'utf-8')) as unknown
        return raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : null
    } catch {
        return null
    }
}

export const configVersionSkewCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'project',

    async run(): Promise<CheckResult> {
        const pass = (message: string): CheckResult => ({
            name: CHECK_NAME,
            status: 'pass',
            message,
            fixCommand: null,
            details: null,
        })

        if (isDevVersion(LUCA_VERSION)) {
            return pass('dev CLI build — version skew not checked')
        }
        const config = await readConfig()
        if (config === null) {
            // No project / unreadable config — nothing to reconcile.
            return pass('no .luca/config.json to check')
        }
        const stored = config.lucaVersion
        if (typeof stored !== 'string' || stored.length === 0) {
            return pass('config.json has no lucaVersion to compare')
        }
        if (stored === LUCA_VERSION) {
            return pass(`config.lucaVersion matches CLI (${LUCA_VERSION})`)
        }

        return {
            name: CHECK_NAME,
            status: 'warning',
            message: `config.lucaVersion ${stored} ≠ installed CLI ${LUCA_VERSION}`,
            fixCommand: 'luca doctor --fix',
            details: [
                `.luca/config.json records lucaVersion="${stored}" but the `
                    + `installed CLI is ${LUCA_VERSION}.`,
                `Skills/agents that branch on lucaVersion may behave as if on `
                    + `the older version.`,
                `Run \`luca doctor --fix\` to reconcile (rewrites lucaVersion, `
                    + `preserves all other config keys).`,
            ].join('\n  '),
        }
    },

    async fix(): Promise<DoctorFixResult> {
        if (isDevVersion(LUCA_VERSION)) {
            return { applied: [], errors: [] }
        }
        const config = await readConfig()
        if (config === null) {
            return { applied: [], errors: [] }
        }
        const stored = config.lucaVersion
        if (stored === LUCA_VERSION) {
            return { applied: [], errors: [] }
        }
        try {
            const next = { ...config, lucaVersion: LUCA_VERSION }
            await writeFile(
                configPath(),
                JSON.stringify(next, null, 2) + '\n'
            )
            return {
                applied: [
                    `Reconciled .luca/config.json lucaVersion `
                        + `${typeof stored === 'string' ? stored : 'unset'} → ${LUCA_VERSION}`,
                ],
                errors: [],
            }
        } catch (err) {
            return {
                applied: [],
                errors: [
                    `Failed to rewrite .luca/config.json lucaVersion: `
                        + `${(err as Error).message}`,
                ],
            }
        }
    },
}
