import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { generateRunId, lucaStateSchema } from '@alecsibilia/luca-core'

import { LUCA_VERSION } from '../../utils/manifest.ts'

export interface WriteProjectSkeletonOptions {
    cwd: string
    force?: boolean
    log?: (msg: string) => void
}

/**
 * Write the per-project .luca/ skeleton at the given cwd.
 *
 * Idempotent — existing files are preserved unless `force` is true.
 * Files written use the canonical schemas from @alecsibilia/luca-core so
 * the output is guaranteed to parse cleanly under strict validation.
 */
export async function writeProjectSkeleton(
    opts: WriteProjectSkeletonOptions
): Promise<void> {
    const log = opts.log ?? (() => {})
    const lucaDir = join(opts.cwd, '.luca')
    await mkdir(lucaDir, { recursive: true })

    // Bootstrap a stable, non-empty `sessionId` so ledger entries carry a
    // real runId. Without this, `state.sessionId` is undefined and ledger
    // writers fall back to "" — which `readLedgerForRun` can never resolve,
    // silently dropping every postmortem signal for the run.
    await writeIfMissing({
        path: join(lucaDir, 'state.json'),
        contents:
            JSON.stringify(
                lucaStateSchema.parse({ sessionId: generateRunId() }),
                null,
                2
            ) + '\n',
        force: opts.force ?? false,
        log,
    })

    await writeIfMissing({
        path: join(lucaDir, 'config.json'),
        contents:
            JSON.stringify(
                {
                    lucaVersion: LUCA_VERSION,
                    vault: null,
                    oversight: 'full-auto',
                },
                null,
                2
            ) + '\n',
        force: opts.force ?? false,
        log,
    })
}

async function writeIfMissing(args: {
    path: string
    contents: string
    force: boolean
    log: (msg: string) => void
}): Promise<void> {
    if (existsSync(args.path) && !args.force) {
        args.log(`  skip:  ${args.path} (already exists)`)
        return
    }
    await writeFile(args.path, args.contents)
    args.log(`  write: ${args.path}`)
}
