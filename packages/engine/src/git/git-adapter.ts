import { commitOps } from './git-commits'
import { joinOps } from './git-join'
import { readOps } from './git-read'
import { createWorktreeOps } from './git-worktrees'

/** One changed path in a worktree, from `git status`. */
export type FileChange = {
    path: string
    change: 'added' | 'modified' | 'deleted'
}

/** A commit the engine made. */
export type EngineCommit = { sha: string; files: string[] }

/** Where a commit is, next to a base commit (see `commitOnBase`). */
export type CommitPlace = 'on_base' | 'not_on_base' | 'unknown'

/**
 * Every git side effect of a run. Only the engine calls these; agents never
 * commit, branch, or push.
 */
export type GitAdapter = {
    /**
     * Fetches `base_branch` from `origin` into `origin/<base_branch>`, so a
     * new run branch starts from the latest code, never a stale local
     * branch. A failed fetch is returned as an error.
     */
    fetchBase: (args: {
        base_branch: string
    }) => Promise<{ ok: true } | { ok: false; error: string }>
    /**
     * Makes `branch` from `origin/<base_branch>` (fetched by `fetchBase`),
     * checked out in a worktree at `path`. Safe to repeat, as
     * `createWorktree`.
     */
    createRunBranch: (args: {
        branch: string
        base_branch: string
        path: string
    }) => Promise<{ base_sha: string }>
    /**
     * Makes `branch` from the tip of `from`, checked out at `path`. Safe to
     * repeat after a crash: a worktree git has at `path` on `branch` is
     * adopted as it is (reset to its commit, in case its checkout was cut
     * off); a folder at `path` git doesn't know is removed first; and a
     * `branch` that exists without a worktree is checked out there as it is.
     */
    createWorktree: (args: {
        branch: string
        from: string
        path: string
    }) => Promise<{ base_sha: string }>
    /** Every changed, new, or deleted path in a worktree, untracked included. */
    changes: (args: { cwd: string }) => Promise<FileChange[]>
    /**
     * Paths that differ from commit `from`, committed or not, untracked
     * included.
     */
    changedSince: (args: { cwd: string; from: string }) => Promise<string[]>
    /** The text of `path` at commit `sha`, or `null` if it wasn't there (#581). */
    fileAt: (args: {
        cwd: string
        sha: string
        path: string
    }) => Promise<string | null>
    /** Paths that differ between two commits. */
    filesBetween: (args: {
        cwd: string
        from: string
        to: string
    }) => Promise<string[]>
    /**
     * Untracked paths git doesn't ignore, as git sees them: a symlink is one
     * path (never followed), and a folder with its own repo is one path
     * ending in `/`.
     */
    untracked: (args: { cwd: string }) => Promise<string[]>
    /** Tracked and untracked files, minus ignored ones. */
    listFiles: (args: { cwd: string }) => Promise<string[]>
    /** Tracked files whose text contains `text`. */
    filesMentioning: (args: { cwd: string; text: string }) => Promise<string[]>
    /**
     * Stages everything and commits it, skipping hooks (the engine ran the
     * gates). Paths in `leave_out` (what the prepare command made) are
     * never staged, however odd: not even a folder with its own repo, which
     * `git add` would fail on.
     */
    commitAll: (args: {
        cwd: string
        message: string
        /** Untracked paths to keep out of the commit. Left out, none. */
        leave_out?: string[]
    }) => Promise<EngineCommit>
    /**
     * Commits only `paths` (new or changed), skipping hooks. Every other
     * change at `cwd`, staged or not, stays out of the commit, as it was.
     */
    commitPaths: (args: {
        cwd: string
        message: string
        paths: string[]
    }) => Promise<EngineCommit>
    /**
     * Throws away every uncommitted change at `cwd`, new untracked files
     * included (ignored files such as `node_modules` stay), and returns the
     * commit it went back to.
     */
    discardChanges: (args: { cwd: string }) => Promise<{ sha: string }>
    /**
     * Resets the worktree at `cwd` hard to `to`, moving its branch there, and
     * throws away untracked files (ignored ones are kept), as when a
     * retried ticket starts over from the run branch's tip. A cherry-pick
     * left half-done (by a crash) is dropped too.
     */
    resetWorktree: (args: {
        cwd: string
        to: string
    }) => Promise<{ sha: string }>
    /** Commits after `from` up to `to`, oldest first. */
    commitsBetween: (args: {
        cwd: string
        from: string
        to: string
    }) => Promise<string[]>
    /**
     * Replays commits onto the branch checked out at `cwd`, in order. A clash
     * is undone and returned as an error.
     */
    replay: (args: {
        cwd: string
        commits: string[]
    }) => Promise<{ ok: true; shas: string[] } | { ok: false; error: string }>
    /**
     * Undoes a replay on the branch checked out at `cwd`: resets it hard to
     * the commit before `first_sha`. It never rewinds over other work
     * (#519), so it refuses, with the branch left as it is, when
     * `first_sha` is no commit (or has no parent), is not on the branch, or
     * when any commit from `first_sha` up to the branch's tip is not in
     * `only`. Safe to run twice: with the branch already at the commit
     * before `first_sha`, it undoes nothing.
     *
     * @returns The commits it undid, oldest first, or why it refused.
     */
    undoReplay: (args: {
        cwd: string
        first_sha: string
        /** The commits it may undo: any other on top of `first_sha` refuses. */
        only: string[]
    }) => Promise<{ ok: true; undone: string[] } | { ok: false; error: string }>
    /**
     * Moves a worktree's change onto another commit: resets the worktree at
     * `cwd` hard to `onto`, then applies the whole diff from `from` to `to`
     * with a three-way merge, and leaves it all uncommitted and unstaged.
     * Clashing files keep git's conflict markers.
     *
     * @returns The files that clashed.
     */
    rebaseWorktree: (args: {
        cwd: string
        from: string
        to: string
        onto: string
    }) => Promise<{ conflicts: string[] }>
    /**
     * Removes the worktree at `path`, even with changes in it. A path that
     * is already gone, or is no worktree, is fine. Its branch stays.
     */
    removeWorktree: (args: { path: string }) => Promise<void>
    /** Pushes `branch` to `origin`. */
    push: (args: { cwd: string; branch: string }) => Promise<void>
    /** The commit checked out at `cwd`. */
    head: (args: { cwd: string }) => Promise<string>
    /**
     * Where commit `sha` is: `on_base` if it is `base` or in its history,
     * `not_on_base` if the repo has it but `base` doesn't, `unknown` if the
     * repo has no such commit (or `sha` is no commit id).
     */
    commitOnBase: (args: {
        cwd: string
        sha: string
        base: string
    }) => Promise<CommitPlace>
    /**
     * The commit checked out at `cwd` with its whole message (trimmed) and
     * its files, such as to adopt a commit a crash left out of the journal.
     */
    lastCommit: (args: {
        cwd: string
    }) => Promise<EngineCommit & { message: string }>
}

/**
 * Runs async work one piece at a time, in call order, so git never races
 * itself on the repo's lock files when tickets build at the same time.
 */
const createQueue = () => {
    let tail: Promise<unknown> = Promise.resolve()
    return <T>(work: () => Promise<T>): Promise<T> => {
        const run = tail.then(work, work)
        tail = run.catch(() => undefined)
        return run
    }
}

/**
 * The git adapter for the repo at `repo_root`, through the `git` CLI. Its
 * calls run one at a time, even when tickets build at the same time.
 *
 * @example
 * const git = createGitAdapter({ repo_root: '/code/app' })
 * const { base_sha } = await git.createRunBranch({ branch, base_branch: 'main', path })
 */
export const createGitAdapter = ({
    repo_root,
}: {
    repo_root: string
}): GitAdapter => {
    const raw: GitAdapter = {
        ...createWorktreeOps({ repo_root }),
        ...readOps,
        ...commitOps,
        ...joinOps,
    }

    const inTurn = createQueue()
    const serial =
        <A, R>(work: (args: A) => Promise<R>) =>
        (args: A): Promise<R> =>
            inTurn(() => work(args))
    return {
        fetchBase: serial(raw.fetchBase),
        createRunBranch: serial(raw.createRunBranch),
        createWorktree: serial(raw.createWorktree),
        changes: serial(raw.changes),
        changedSince: serial(raw.changedSince),
        fileAt: serial(raw.fileAt),
        filesBetween: serial(raw.filesBetween),
        untracked: serial(raw.untracked),
        listFiles: serial(raw.listFiles),
        filesMentioning: serial(raw.filesMentioning),
        commitAll: serial(raw.commitAll),
        commitPaths: serial(raw.commitPaths),
        discardChanges: serial(raw.discardChanges),
        resetWorktree: serial(raw.resetWorktree),
        commitsBetween: serial(raw.commitsBetween),
        replay: serial(raw.replay),
        undoReplay: serial(raw.undoReplay),
        rebaseWorktree: serial(raw.rebaseWorktree),
        removeWorktree: serial(raw.removeWorktree),
        push: serial(raw.push),
        head: serial(raw.head),
        commitOnBase: serial(raw.commitOnBase),
        lastCommit: serial(raw.lastCommit),
    }
}
