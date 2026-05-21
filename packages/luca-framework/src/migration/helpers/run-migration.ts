import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface MigrationOptions {
    cwd: string
    dryRun?: boolean
    force?: boolean
}

export interface MigrationPlan {
    moves: Array<{ from: string; to: string }>
    deletes: string[]
}

export interface MigrationResult {
    plan: MigrationPlan
}

// Root-file mappings: .planning/<source> → .luca/<dest>.
// Order encodes precedence: when two sources map to the same destination
// (e.g. both legacy `luca-state.json` and `state.json` map to
// `.luca/state.json`), the FIRST listed source wins and the rest are
// skipped — see the dedupe-by-destination logic in buildPlan().
const ROOT_FILE_MAP: Array<[string, string]> = [
    ['luca-state.json', 'state.json'],
    ['state.json', 'state.json'],
    ['.luca-lock.json', 'lock.json'],
    ['ROADMAP.md', 'roadmap.md'],
    ['config.json', 'config.json'],
    ['session-ledger.jsonl', 'ledger.jsonl'],
]

// Ephemeral .planning/ files that should be deleted, not migrated.
const EPHEMERAL_FILES: string[] = [
    '.context-metrics.json',
    'harness-result.json',
]

function buildPlan(cwd: string): MigrationPlan {
    const planningDir = join(cwd, '.planning')
    if (!existsSync(planningDir)) {
        return { moves: [], deletes: [] }
    }

    const moves: MigrationPlan['moves'] = []
    // Track planned destinations so two sources can never both target the
    // same `.luca/` path — the second `git mv` would fail once the first
    // created the destination. First match in ROOT_FILE_MAP wins.
    const plannedDests = new Set<string>()
    for (const [src, dest] of ROOT_FILE_MAP) {
        const srcAbs = join(planningDir, src)
        const destAbs = join(cwd, '.luca', dest)
        const destRel = `.luca/${dest}`
        // Idempotency: skip when destination already exists.
        // Collision-safety: skip when an earlier source already claimed it.
        if (
            existsSync(srcAbs) &&
            !existsSync(destAbs) &&
            !plannedDests.has(destRel)
        ) {
            moves.push({ from: `.planning/${src}`, to: destRel })
            plannedDests.add(destRel)
        }
    }

    const deletes: string[] = []
    for (const filename of EPHEMERAL_FILES) {
        if (existsSync(join(planningDir, filename))) {
            deletes.push(`.planning/${filename}`)
        }
    }

    return { moves, deletes }
}

async function hasUncommittedPlanningChanges(cwd: string): Promise<boolean> {
    // `git status --porcelain` lists modified/staged/untracked entries scoped
    // to a path. Any non-empty output means dirty.
    const out = await Bun.$`git status --porcelain -- .planning`.cwd(cwd).text()
    return out.trim().length > 0
}

/**
 * Is `relPath` tracked by git? `git mv` only works on tracked files, but
 * several legacy `.planning/*` artifacts (luca-state.json, .luca-lock.json,
 * session-ledger.jsonl) are gitignored and therefore untracked.
 */
async function isTracked(cwd: string, relPath: string): Promise<boolean> {
    const res = await Bun.$`git ls-files --error-unmatch ${relPath}`
        .cwd(cwd)
        .quiet()
        .nothrow()
    return res.exitCode === 0
}

async function executePlan(
    cwd: string,
    plan: MigrationPlan,
    force: boolean
): Promise<void> {
    for (const move of plan.moves) {
        const destAbs = join(cwd, move.to)
        await mkdir(dirname(destAbs), { recursive: true })
        if (await isTracked(cwd, move.from)) {
            // Tracked: use `git mv` to preserve file history.
            if (force) {
                await Bun.$`git mv -f ${move.from} ${move.to}`.cwd(cwd).quiet()
            } else {
                await Bun.$`git mv ${move.from} ${move.to}`.cwd(cwd).quiet()
            }
        } else {
            // Untracked (typically gitignored runtime state): plain
            // filesystem rename — there is no history to preserve.
            await rename(join(cwd, move.from), destAbs)
        }
    }
    for (const relPath of plan.deletes) {
        await rm(join(cwd, relPath), { force: true })
    }
}

export async function runMigration(
    opts: MigrationOptions
): Promise<MigrationResult> {
    const plan = buildPlan(opts.cwd)

    // Nothing to migrate → no-op. Short-circuit before touching git so an
    // already-migrated (or `.planning/`-free) project never errors.
    if (plan.moves.length === 0 && plan.deletes.length === 0) {
        return { plan }
    }

    if (!opts.dryRun) {
        if (!opts.force && (await hasUncommittedPlanningChanges(opts.cwd))) {
            throw new Error(
                'Refusing to migrate: .planning/ has uncommitted changes. Commit, stash, or re-run with --force.'
            )
        }
        await executePlan(opts.cwd, plan, opts.force ?? false)
    }

    return { plan }
}
