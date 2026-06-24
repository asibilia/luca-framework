/**
 * Phase-diff proof — proves that an execute phase actually produced work.
 *
 * Strategy:
 *   1. At phase start, {@link snapshotWorkingTree} records `git rev-parse
 *      HEAD` and the set of dirty files from `git status --porcelain`.
 *   2. At phase complete, {@link computePhaseDiff} diffs against the current
 *      tree: files changed since the start SHA, files newly dirty, and
 *      commits added.
 *   3. When both are empty the phase is flagged `isEmpty: true`, and the
 *      empty-phase guard requires a justification before accepting the
 *      transition.
 *
 * Non-git repos are tolerated: the snapshot returns `gitAvailable: false`
 * and the diff is `indeterminate: true` (can't prove emptiness without git).
 *
 * Ported from luca-mastracode `analysis/phase-diff.ts`. The git helpers are
 * parameterized by `cwd` (mastracode used an implicit `process.cwd()`).
 */
import { spawnSync } from 'node:child_process'

export interface PhaseSnapshot {
    /** Phase name this snapshot belongs to. */
    phase: string
    /** ISO timestamp of when the snapshot was captured. */
    takenAt: string
    /** HEAD commit SHA at snapshot time, or null if non-git. */
    headSha: string | null
    /** Files dirty at snapshot time (relative paths). */
    dirtyFiles: string[]
    /** Whether the working directory is a git repo. */
    gitAvailable: boolean
}

export interface PhaseDiff {
    filesChanged: string[]
    commitsAdded: string[]
    isEmpty: boolean
    /** True when a diff could not be computed (no snapshot, no git). */
    indeterminate: boolean
}

function runGit(
    cwd: string,
    args: string[]
): { ok: boolean; stdout: string; stderr: string } {
    try {
        const result = spawnSync('git', args, { encoding: 'utf-8', cwd })
        return {
            ok: result.status === 0,
            stdout: result.stdout ?? '',
            stderr: result.stderr ?? '',
        }
    } catch {
        return { ok: false, stdout: '', stderr: '' }
    }
}

function isGitRepo(cwd: string): boolean {
    return runGit(cwd, ['rev-parse', '--is-inside-work-tree']).ok
}

/** Capture the current HEAD + dirty file set, tagged with a phase name. */
export function snapshotWorkingTree(phase: string, cwd: string): PhaseSnapshot {
    const takenAt = new Date().toISOString()
    if (!isGitRepo(cwd)) {
        return {
            phase,
            takenAt,
            headSha: null,
            dirtyFiles: [],
            gitAvailable: false,
        }
    }

    const head = runGit(cwd, ['rev-parse', 'HEAD'])
    const status = runGit(cwd, ['status', '--porcelain'])
    const dirtyFiles = status.ok
        ? status.stdout
              .split('\n')
              .filter(Boolean)
              .map((line) => line.slice(3).trim())
              .filter(Boolean)
        : []

    return {
        phase,
        takenAt,
        headSha: head.ok ? head.stdout.trim() : null,
        dirtyFiles,
        gitAvailable: true,
    }
}

/**
 * Compute the diff between a start snapshot and the current tree.
 *
 * Returns `indeterminate: true` when there is no usable snapshot or the
 * repo isn't a git repo — callers should treat indeterminate as "can't
 * prove emptiness": don't punish, but flag for postmortem.
 */
export function computePhaseDiff(
    start: PhaseSnapshot | null,
    cwd: string
): PhaseDiff {
    if (!start || !start.gitAvailable || !isGitRepo(cwd)) {
        return {
            filesChanged: [],
            commitsAdded: [],
            isEmpty: false,
            indeterminate: true,
        }
    }

    const filesChanged = new Set<string>()
    const commitsAdded: string[] = []

    if (start.headSha) {
        const diff = runGit(cwd, ['diff', '--name-only', start.headSha, 'HEAD'])
        if (diff.ok) {
            for (const f of diff.stdout.split('\n').map((s) => s.trim())) {
                if (f) filesChanged.add(f)
            }
        }

        const log = runGit(cwd, ['rev-list', `${start.headSha}..HEAD`])
        if (log.ok) {
            for (const sha of log.stdout.split('\n').map((s) => s.trim())) {
                if (sha) commitsAdded.push(sha)
            }
        }
    }

    const currentStatus = runGit(cwd, ['status', '--porcelain'])
    const currentDirty = currentStatus.ok
        ? new Set(
              currentStatus.stdout
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => line.slice(3).trim())
                  .filter(Boolean)
          )
        : new Set<string>()
    const startDirty = new Set(start.dirtyFiles)
    for (const f of currentDirty) {
        if (!startDirty.has(f)) filesChanged.add(f)
    }

    // If the tree was already dirty at phase start, edits to those pre-dirty
    // files show up in neither the SHA diff nor the new-dirty delta. Treat
    // that as indeterminate so the empty-phase guard can't false-block real
    // work on already-dirty files.
    const baselineDirty = startDirty.size > 0
    const filesChangedArr = Array.from(filesChanged)
    return {
        filesChanged: filesChangedArr,
        commitsAdded,
        isEmpty: baselineDirty
            ? false
            : filesChangedArr.length === 0 && commitsAdded.length === 0,
        indeterminate: baselineDirty,
    }
}
