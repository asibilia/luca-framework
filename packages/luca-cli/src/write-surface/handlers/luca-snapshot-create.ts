import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadCurrentState, resolveActiveSlug } from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'

const inputSchema = z.object({})

/**
 * Repo-relative path of the consume-once snapshot payload written by
 * `luca snapshot create` and consumed by `luca snapshot diff`.
 */
export const REVIEW_PREFIX_TREE_RELPATH = '.luca/tmp/review-prefix-tree.json'

/**
 * Shape of the consume-once snapshot payload. Shared contract between the
 * producer (`luca snapshot create`) and the consumer (`luca snapshot diff`),
 * which `safeParse`s the payload and maps failure to its fail-safe
 * `ambiguous` verdict.
 */
export const snapshotPayloadSchema = z.object({
    tree: z.string().min(1),
    phase: z.string().min(1),
})

/** Result of a single `git` invocation via {@link runGit}. */
export interface GitRunResult {
    code: number
    stdout: string
    stderr: string
}

/**
 * Spawn `git <args>` in `cwd` and capture exit code, stdout, and stderr.
 *
 * Shared by the snapshot create/diff handlers (the diff handler imports it
 * rather than duplicating the spawn plumbing).
 *
 * @param cwd - Working directory for the git process.
 * @param args - Arguments passed after the `git` executable.
 * @param env - Optional full environment for the spawn (e.g. to set
 *   `GIT_INDEX_FILE` for temp-index operations).
 * @returns The exit `code` plus collected `stdout`/`stderr`.
 *
 * @example
 * ```typescript
 * const r = await runGit('/repo', ['rev-parse', '--verify', 'HEAD'])
 * if (r.code === 0) console.log(r.stdout.trim())
 * ```
 */
export async function runGit(
    cwd: string,
    args: string[],
    env?: Record<string, string | undefined>
): Promise<GitRunResult> {
    const proc = Bun.spawn(['git', ...args], {
        cwd,
        env,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const code = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    return { code, stdout, stderr }
}

export interface SnapshotTreeOk {
    ok: true
    tree: string
}
export interface SnapshotTreeFail {
    ok: false
    error: string
}
export type SnapshotTreeResult = SnapshotTreeOk | SnapshotTreeFail

/**
 * Build a git tree object capturing the CURRENT worktree content
 * (tracked + untracked-but-not-ignored files) without touching the real
 * index or the worktree.
 *
 * Mechanism: a unique temp `GIT_INDEX_FILE` receives `read-tree HEAD`
 * (base), then `add -A` (worktree capture), then `write-tree` (snapshot
 * tree sha). `GIT_INDEX_FILE` is set ONLY on these three spawns, so the
 * repository's real index is never read or written. `add -A` does write
 * blob objects into the object database — harmless, and required for the
 * tree to be diffable later.
 *
 * Unborn-branch edge (no commits yet): `read-tree HEAD` fails, so the
 * EMPTY TREE is used as the read-tree base instead (`read-tree --empty`);
 * `add -A` + `write-tree` still capture the worktree files.
 *
 * The temp index file is removed on every path.
 *
 * Exported for the `luca-snapshot-diff` handler, which rebuilds the
 * current tree with the same mechanism to run a tree-to-tree diff.
 *
 * @param cwd - Repository root to snapshot.
 * @returns `{ ok: true, tree }` with the snapshot tree sha, or
 *   `{ ok: false, error }` when any git step fails (e.g. not a git repo).
 *
 * @example
 * ```typescript
 * const built = await buildWorktreeSnapshotTree('/path/to/repo')
 * if (built.ok) console.log(built.tree) // e.g. "4b825dc6..."
 * ```
 */
export async function buildWorktreeSnapshotTree(
    cwd: string
): Promise<SnapshotTreeResult> {
    const tempIndex = join(tmpdir(), `luca-snapshot-index-${randomUUID()}`)
    const env = { ...process.env, GIT_INDEX_FILE: tempIndex }

    try {
        const readHead = await runGit(cwd, ['read-tree', 'HEAD'], env)
        if (readHead.code !== 0) {
            // Unborn branch (HEAD unresolvable — no commits yet): seed the
            // temp index from the empty tree so add -A still captures the
            // worktree. A non-repo cwd fails here too and errors out.
            const readEmpty = await runGit(cwd, ['read-tree', '--empty'], env)
            if (readEmpty.code !== 0) {
                return {
                    ok: false,
                    error: `git read-tree failed in ${cwd}: ${readEmpty.stderr.trim() || readHead.stderr.trim()}`,
                }
            }
        }

        const add = await runGit(cwd, ['add', '-A'], env)
        if (add.code !== 0) {
            return {
                ok: false,
                error: `git add -A (temp index) failed: ${add.stderr.trim()}`,
            }
        }

        const writeTree = await runGit(cwd, ['write-tree'], env)
        if (writeTree.code !== 0) {
            return {
                ok: false,
                error: `git write-tree failed: ${writeTree.stderr.trim()}`,
            }
        }

        const tree = writeTree.stdout.trim()
        // 40 hex = sha1 object format, 64 hex = sha256 object format.
        if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(tree)) {
            return {
                ok: false,
                error: `git write-tree produced an unexpected value: "${tree}"`,
            }
        }

        return { ok: true, tree }
    } finally {
        // `force` — the temp index may not exist when read-tree never ran.
        await rm(tempIndex, { force: true })
        await rm(`${tempIndex}.lock`, { force: true })
    }
}

/**
 * Capture a worktree snapshot tree and persist it as the consume-once
 * review-gate payload `.luca/tmp/review-prefix-tree.json` with shape
 * `{ "tree": "<snapshot tree sha>", "phase": "<active phase slug>" }`.
 *
 * The `tree` value is a SNAPSHOT TREE sha (never a commit sha), so the
 * later tree-to-tree diff is correct on the live no-commit path —
 * untracked files are captured exactly. Phase-agnostic (no
 * allowedPhases): capture happens in EXECUTING and REVIEWING alike.
 */
export const lucaSnapshotCreateTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_snapshot_create',
    description:
        'Capture a worktree snapshot tree (temp-index read-tree/add -A/write-tree — real index and worktree untouched) and write the consume-once payload {"tree","phase"} to .luca/tmp/review-prefix-tree.json for the review diff-gate.',
    inputSchema,
    async handler(_args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const resolved = resolveActiveSlug(state)
        if (!resolved.ok) {
            return {
                content: [{ type: 'text', text: resolved.error }],
                isError: true,
            }
        }

        const built = await buildWorktreeSnapshotTree(ctx.cwd)
        if (!built.ok) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `luca_snapshot_create: ${built.error}`,
                    },
                ],
                isError: true,
            }
        }

        const payloadAbs = join(ctx.cwd, REVIEW_PREFIX_TREE_RELPATH)
        await mkdir(join(ctx.cwd, '.luca', 'tmp'), { recursive: true })
        await writeFile(
            payloadAbs,
            `${JSON.stringify({ tree: built.tree, phase: resolved.slug }, null, 2)}\n`
        )

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            ok: true,
                            tree: built.tree,
                            phase: resolved.slug,
                            payload: REVIEW_PREFIX_TREE_RELPATH,
                        },
                        null,
                        2
                    ),
                },
            ],
        }
    },
}
