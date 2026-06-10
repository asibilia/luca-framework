/**
 * Doctor check: stray pre-v13 luca handoff payloads in the shared OS /tmp.
 *
 * Before v13, LLM→CLI `--file` payloads (e.g. the `luca checks run`
 * commands array) were staged at `/tmp/luca-*.json`. The OS tmp dir is
 * GLOBAL, so two repos running pipelines concurrently overwrote each
 * other's payloads. v13 stages payloads at the repo-scoped
 * `.luca/tmp/<kebab-name>.json` and the stage-gate hook now denies writes
 * to the legacy location — but files written by older versions (or by
 * sessions predating the deny rule) linger and can be silently consumed
 * by a `--file` invocation that resolves the stale path.
 *
 * `fix()` deletes the stray files — they are ephemeral handoff scratch by
 * definition, never durable data.
 */
import { lstatSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { CheckResult, DoctorCheck, DoctorFixResult } from '../types'

const CHECK_NAME = 'Shared-tmp luca payloads'

/**
 * The legacy staging location. On macOS `/tmp` is a symlink to
 * `/private/tmp`, so scanning `/tmp` covers both spellings. On platforms
 * without `/tmp` (Windows) the readdir fails and the check passes.
 */
const SHARED_TMP = '/tmp'

/** Legacy payload name shape: `luca-<anything>.json`. */
const LEGACY_PAYLOAD_RE = /^luca-.*\.json$/

/** Find stray legacy payload files (regular files only). */
async function scanSharedTmp(): Promise<string[]> {
    let entries: string[]
    try {
        entries = await readdir(SHARED_TMP)
    } catch {
        // No /tmp on this platform — nothing to find.
        return []
    }
    const found: string[] = []
    for (const name of entries) {
        if (!LEGACY_PAYLOAD_RE.test(name)) continue
        const path = join(SHARED_TMP, name)
        try {
            if (lstatSync(path).isFile()) found.push(path)
        } catch {
            // Raced away between readdir and lstat — skip.
        }
    }
    return found
}

/**
 * Doctor check: warn when legacy `/tmp/luca-*.json` payload files linger.
 * Warning — not failure — since stale scratch degrades correctness only
 * when a `--file` invocation resolves it. `luca doctor --fix` deletes them.
 */
export const sharedTmpPayloadsCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'global',

    async run(): Promise<CheckResult> {
        const files = await scanSharedTmp()

        if (files.length === 0) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: 'no stray luca payload files in /tmp',
                fixCommand: null,
                details: null,
            }
        }

        const detailLines = [
            'Pre-v13 luca staged CLI handoff payloads at /tmp/luca-*.json,',
            'where concurrent repos overwrote each other. v13 uses the',
            'repo-scoped .luca/tmp/ instead and blocks the legacy path;',
            'these leftovers are stale scratch. Found:',
            ...files.map((f) => `- ${f}`),
        ]

        return {
            name: CHECK_NAME,
            status: 'warning',
            message: `${files.length} stray legacy payload file(s) in /tmp`,
            fixCommand: 'luca doctor --fix',
            details: detailLines.join('\n  '),
        }
    },

    async fix(): Promise<DoctorFixResult> {
        const applied: string[] = []
        const errors: string[] = []

        for (const path of await scanSharedTmp()) {
            try {
                await rm(path, { force: true })
                applied.push(`removed ${path}`)
            } catch (err) {
                errors.push(
                    `could not remove ${path}: ${(err as Error).message}`
                )
            }
        }

        return { applied, errors }
    },
}
