/**
 * Phase diff proof — proves that an execute phase actually produced work.
 *
 * Strategy:
 *   1. At `start-phase` we snapshot `git rev-parse HEAD` and the set of
 *      dirty files reported by `git status --porcelain`.
 *   2. At `complete-phase` we compute the diff against the current tree:
 *      - Files changed via `git diff --name-only <startSha> HEAD` (committed work).
 *      - Files newly dirty since the start snapshot (uncommitted work).
 *      - Commits added since the start snapshot.
 *   3. If both file changes and commits added are empty, the phase is
 *      flagged `isEmpty: true` and `complete-phase` requires a matching
 *      `phase-empty-justification` ledger event before it will accept the
 *      transition.
 *
 * Non-git repos are tolerated: snapshot returns `gitAvailable: false` and
 * the diff is returned with `indeterminate: true`. Non-git phases bypass
 * the empty-phase guard (we can't prove emptiness without git).
 */
import { spawnSync } from 'node:child_process'

export interface PhaseSnapshot {
    /** Phase name this snapshot belongs to */
    phase: string
    /** ISO timestamp of when the snapshot was captured */
    takenAt: string
    /** HEAD commit SHA at snapshot time, or null if non-git */
    headSha: string | null
    /** Files dirty at snapshot time (relative paths) */
    dirtyFiles: string[]
    /** Whether the working directory is a git repo */
    gitAvailable: boolean
}

export interface PhaseDiff {
    filesChanged: string[]
    commitsAdded: string[]
    isEmpty: boolean
    /** True when we couldn't compute a diff (no snapshot, no git) */
    indeterminate: boolean
}

function runGit(args: string[]): {
    ok: boolean
    stdout: string
    stderr: string
} {
    try {
        const result = spawnSync('git', args, {
            encoding: 'utf-8',
            cwd: process.cwd(),
        })
        return {
            ok: result.status === 0,
            stdout: result.stdout ?? '',
            stderr: result.stderr ?? '',
        }
    } catch {
        return { ok: false, stdout: '', stderr: '' }
    }
}

function isGitRepo(): boolean {
    return runGit(['rev-parse', '--is-inside-work-tree']).ok
}

/**
 * Capture the current HEAD + dirty file set, tagged with a phase name.
 */
export function snapshotWorkingTree(phase: string): PhaseSnapshot {
    const takenAt = new Date().toISOString()
    if (!isGitRepo()) {
        return {
            phase,
            takenAt,
            headSha: null,
            dirtyFiles: [],
            gitAvailable: false,
        }
    }

    const head = runGit(['rev-parse', 'HEAD'])
    const status = runGit(['status', '--porcelain'])
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
 * Returns `indeterminate: true` when there's no usable snapshot or the
 * repo isn't a git repo. Callers should treat indeterminate as
 * "can't prove emptiness" — i.e. don't punish, but flag for postmortem.
 */
export function computePhaseDiff(start: PhaseSnapshot | null): PhaseDiff {
    if (!start || !start.gitAvailable) {
        return {
            filesChanged: [],
            commitsAdded: [],
            isEmpty: false,
            indeterminate: true,
        }
    }

    if (!isGitRepo()) {
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
        const diff = runGit(['diff', '--name-only', start.headSha, 'HEAD'])
        if (diff.ok) {
            for (const f of diff.stdout.split('\n').map((s) => s.trim())) {
                if (f) filesChanged.add(f)
            }
        }

        const log = runGit(['rev-list', `${start.headSha}..HEAD`])
        if (log.ok) {
            for (const sha of log.stdout.split('\n').map((s) => s.trim())) {
                if (sha) commitsAdded.push(sha)
            }
        }
    }

    const currentStatus = runGit(['status', '--porcelain'])
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

    // If the working tree was already dirty at start-phase, edits to those
    // pre-dirty files won't show up in either the HEAD..HEAD diff or the
    // "new dirty files" delta above. Treat that as indeterminate so the
    // empty-phase guard can't false-block real work on already-dirty files.
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
