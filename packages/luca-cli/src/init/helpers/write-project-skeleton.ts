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
                    oversight: 'full-auto',
                    // Canonical vault location is `muninn.vault` (see
                    // resolveRepoVault + the vault-routing rule). `luca
                    // vault:init` fills this in later; the placeholder makes the
                    // canonical home discoverable in a fresh config.
                    muninn: { vault: null },
                },
                null,
                2
            ) + '\n',
        force: opts.force ?? false,
        log,
    })

    // Ensure the consumer repo ignores `.luca/` per-run/ephemeral state so it
    // never gets committed (mirrors the luca-framework repo's own .gitignore).
    await ensureLucaGitignore(opts.cwd, log)
}

/**
 * Per-run or ephemeral workflow artifacts that must NOT be committed.
 *
 * Committed counterparts are intentionally absent: `config.json`, `roadmap.md`
 * (generated view), `milestones/`, `archive/`, and the durable phase artifacts
 * under `phases/<slug>/` ({plan,research,context,verify,learn,audits/*}).
 */
export const LUCA_GITIGNORE_ENTRIES = [
    '.luca/state.json',
    '.luca/state.json.lock',
    '.luca/lock.json',
    '.luca/ledger.jsonl',
    '.luca/telemetry/',
    '.luca/tmp/',
    // Browser UAT artifact dir (playwright-cli screenshots/snapshots/traces).
    // Subagents are instructed (shared prefix) to stage all UAT evidence
    // here instead of the repo root; the shadow scanner sweeps it at
    // milestone close. Gitignored so mid-pipeline UAT never dirties commits.
    '.playwright-cli/',
] as const

/**
 * Ensure the project `.gitignore` ignores per-run/ephemeral workflow state
 * (state, locks, ledger, telemetry, the `.luca/tmp/` CLI-handoff scratch,
 * and the `.playwright-cli/` browser-UAT artifact dir).
 *
 * Idempotent: only entries not already present are appended; a labeled block
 * header is added only when seeding a fresh `.gitignore` (or one with none of
 * these entries yet), so re-running `luca init` never duplicates the header.
 * Creates `.gitignore` if missing.
 *
 * @param cwd - Project root containing `.gitignore`.
 * @param log - Optional progress logger.
 */
export async function ensureLucaGitignore(
    cwd: string,
    log: (msg: string) => void = () => {}
): Promise<void> {
    const gitignorePath = join(cwd, '.gitignore')
    const content = existsSync(gitignorePath)
        ? await readFile(gitignorePath, 'utf-8')
        : ''

    const present = new Set(content.split('\n').map((line) => line.trim()))
    const missing = LUCA_GITIGNORE_ENTRIES.filter((entry) => !present.has(entry))
    if (missing.length === 0) return

    // Only emit the labeled header when starting a fresh block (none of our
    // entries were present). Partial top-ups append the bare missing lines.
    const freshBlock = missing.length === LUCA_GITIGNORE_ENTRIES.length
    const header =
        '# Luca workflow runtime state under the .luca/ contract.\n' +
        '# Committed: config.json, roadmap.md, milestones/, archive/, phases/<slug>/{plan,research,context,verify,learn,audits/*}\n' +
        '# Ignored: per-run state, locks, ledger, telemetry, ephemeral CLI-handoff scratch, browser-UAT artifacts\n'
    const body = (freshBlock ? header : '') + missing.join('\n') + '\n'

    const leadingGap = content === '' || content.endsWith('\n') ? '' : '\n'
    const blockSeparator = content === '' ? '' : '\n'
    await writeFile(gitignorePath, content + leadingGap + blockSeparator + body)
    log(
        `  write: ${gitignorePath} (+${missing.length} .luca/ ignore${
            missing.length === 1 ? '' : 's'
        })`
    )
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
