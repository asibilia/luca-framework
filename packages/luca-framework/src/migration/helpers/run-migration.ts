import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
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

// Root-file mappings: .planning/<source> → .luca/<dest>
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
    for (const [src, dest] of ROOT_FILE_MAP) {
        const srcAbs = join(planningDir, src)
        const destAbs = join(cwd, '.luca', dest)
        // Idempotency: skip when destination already exists.
        if (existsSync(srcAbs) && !existsSync(destAbs)) {
            moves.push({
                from: `.planning/${src}`,
                to: `.luca/${dest}`,
            })
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

async function executePlan(
    cwd: string,
    plan: MigrationPlan,
    force: boolean
): Promise<void> {
    for (const move of plan.moves) {
        const destAbs = join(cwd, move.to)
        await mkdir(dirname(destAbs), { recursive: true })
        if (force) {
            await Bun.$`git mv -f ${move.from} ${move.to}`.cwd(cwd).quiet()
        } else {
            await Bun.$`git mv ${move.from} ${move.to}`.cwd(cwd).quiet()
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
