import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
    //
    // C1 safety: NEVER clobber an ACTIVE state.json — even with `force`.
    // A fresh skeleton write resets to idle + a brand-new sessionId, which is
    // exactly the "state.json wiped mid-pipeline" corruption from the v13 run
    // report. `force` is only meant to refresh an idle/empty skeleton, so an
    // active state (non-idle step, or a non-empty roadmap, or currentPhase>0)
    // is protected unconditionally.
    const statePath = join(lucaDir, 'state.json')
    if (existsSync(statePath) && (await isActiveState(statePath))) {
        log(`  skip:  ${statePath} (active workflow — refusing to overwrite)`)
    } else {
        await writeIfMissing({
            path: statePath,
            contents:
                JSON.stringify(
                    lucaStateSchema.parse({ sessionId: generateRunId() }),
                    null,
                    2
                ) + '\n',
            force: opts.force ?? false,
            log,
        })
    }

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

/**
 * True when `state.json` holds progress worth protecting from a skeleton
 * overwrite: a non-idle pipelineStep, a non-empty roadmap, or currentPhase>0.
 * A corrupt/unreadable file returns `false` (let the bootstrap path replace
 * it) — matching the "permissive when not initialized" contract.
 */
async function isActiveState(statePath: string): Promise<boolean> {
    try {
        const raw = JSON.parse(await readFile(statePath, 'utf-8')) as Record<
            string,
            unknown
        >
        const step = raw.pipelineStep
        const roadmap = raw.roadmap
        const currentPhase = raw.currentPhase
        return (
            (typeof step === 'string' && step !== 'idle') ||
            (Array.isArray(roadmap) && roadmap.length > 0) ||
            (typeof currentPhase === 'number' && currentPhase > 0)
        )
    } catch {
        return false
    }
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
