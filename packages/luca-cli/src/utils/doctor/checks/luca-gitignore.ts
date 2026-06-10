/**
 * Doctor check: the project `.gitignore` covers luca's ephemeral paths.
 *
 * `luca init` appends a managed block ignoring per-run workflow state
 * (`.luca/state.json`, locks, ledger, telemetry, the `.luca/tmp/`
 * CLI-handoff scratch) and the `.playwright-cli/` browser-UAT artifact
 * dir. Repos initialized by older luca versions are missing the entries
 * added since (e.g. `.playwright-cli/`, added when `playwright-cli`
 * became runnable at any pipeline step) — so UAT screenshots and scratch
 * payloads risk being swept into commits by `git add .`.
 *
 * Only runs in luca-managed repos (a `.luca/` directory exists). `fix()`
 * delegates to the same idempotent `ensureLucaGitignore` top-up that
 * `luca init` uses.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureLucaGitignore, LUCA_GITIGNORE_ENTRIES } from '../../../init'

import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Luca gitignore coverage'

/** Managed entries missing from `<cwd>/.gitignore` (empty when complete). */
async function missingEntries(cwd: string): Promise<string[]> {
    const gitignorePath = join(cwd, '.gitignore')
    const content = existsSync(gitignorePath)
        ? await readFile(gitignorePath, 'utf-8')
        : ''
    const present = new Set(content.split('\n').map((line) => line.trim()))
    return LUCA_GITIGNORE_ENTRIES.filter((entry) => !present.has(entry))
}

/**
 * Doctor check: warn when a luca-managed repo's `.gitignore` is missing
 * managed entries. `luca doctor --fix` appends them (idempotent top-up,
 * identical to `luca init`).
 */
export const lucaGitignoreCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'project',

    async run(): Promise<CheckResult> {
        const cwd = process.cwd()

        if (!existsSync(join(cwd, '.luca'))) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: 'not a luca-managed repo (no .luca/) — skipped',
                fixCommand: null,
                details: null,
            }
        }

        const missing = await missingEntries(cwd)
        if (missing.length === 0) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: 'all managed luca ignore entries present',
                fixCommand: null,
                details: null,
            }
        }

        return {
            name: CHECK_NAME,
            status: 'warning',
            message: `${missing.length} managed ignore entr${missing.length === 1 ? 'y' : 'ies'} missing from .gitignore`,
            fixCommand: 'luca doctor --fix',
            details: [
                'Without these, ephemeral workflow state and browser-UAT',
                'artifacts can be swept into commits by `git add .`. Missing:',
                ...missing.map((e) => `- ${e}`),
            ].join('\n  '),
        }
    },

    async fix(): Promise<DoctorFixResult> {
        const cwd = process.cwd()
        const applied: string[] = []
        const errors: string[] = []

        const before = await missingEntries(cwd)
        try {
            await ensureLucaGitignore(cwd)
            for (const entry of before) {
                applied.push(`appended '${entry}' to .gitignore`)
            }
        } catch (err) {
            errors.push(
                `could not update .gitignore: ${(err as Error).message}`
            )
        }

        return { applied, errors }
    },
}
