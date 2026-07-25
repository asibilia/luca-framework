import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import {
    loadCurrentState,
    phasePathFor,
    resolveActiveSlug,
} from '@alecsibilia/luca-core'

import {
    z,
    type ToolDescriptor,
    type WriteResult,
} from '../__schemas/write-surface.schemas.ts'
import {
    buildWorktreeSnapshotTree,
    REVIEW_PREFIX_TREE_RELPATH,
    runGit,
    snapshotPayloadSchema,
} from './luca-snapshot-create.ts'

const inputSchema = z.object({})

/**
 * Verdict of the review diff-gate comparison.
 *
 * - `empty`        — nothing outside `.luca/` changed since the snapshot.
 * - `zero-overlap` — changes exist, cites exist, and PROVABLY no changed
 *                    path is cited by a prior MUST-FIX/SHOULD-FIX finding.
 * - `overlap`      — at least one changed path is cited by a prior finding.
 * - `ambiguous`    — fail-safe: anything that prevents a proof (missing or
 *                    unparsable payload, phase mismatch, invalid prior
 *                    tree, audit parse failure, or an empty cite set with
 *                    a non-empty changed set).
 */
export type SnapshotDiffVerdict =
    | 'empty'
    | 'zero-overlap'
    | 'overlap'
    | 'ambiguous'

export interface AuditCitesOk {
    ok: true
    paths: string[]
}
export interface AuditCitesFail {
    ok: false
    error: string
}
export type AuditCitesResult = AuditCitesOk | AuditCitesFail

const FINDING_BULLET = /^\s*-\s*\[([A-Z-]+)\]/
const FILE_LINE = /^\s*File:\s*(.+?)\s*$/
// The path segment may contain NO colon and NO whitespace: a greedy
// `(.+):(\d+)` would extract `src/a.ts:12` from the line:col form
// `src/a.ts:12:5` and `src/a.ts:12 and src/b.ts` from multi-path prose —
// garbage that passes the repo-relative shape guard yet can never equal a
// git changed path, silently dropping the REAL cite from the intersection
// (false zero-overlap). Such cites must fail parsing → `ambiguous`.
// Colons/whitespace in real repo paths are vanishingly rare, and the cost
// of a false reject is only a full re-review (fail-safe direction).
const CITE = /^([^:\s]+):(\d+)$/

/**
 * Whether a cite path is plain-repo-relative — the ONLY form that can ever
 * intersect git's repo-relative `--name-only` output. Absolute paths
 * (POSIX or Windows drive), `./`- or `../`-prefixed paths, backslashed
 * paths, and paths containing `.`/`..` segments can never string-match a
 * changed path, so accepting them would make zero-overlap unsound.
 */
function isPlainRepoRelativePath(path: string): boolean {
    if (path.startsWith('/') || path.includes('\\')) return false
    if (/^[A-Za-z]:[\\/]/.test(path)) return false
    const segments = path.split('/')
    if (segments.includes('.') || segments.includes('..')) return false
    return true
}

/**
 * Extract cited file paths from a reviewer audit (`audits/<reviewer>.md`).
 *
 * Cites are `File: {path}:{line}` lines belonging to `[MUST-FIX]` or
 * `[SHOULD-FIX]` findings (the reviewer output format in
 * `luca-tools/src/artifacts/subagents/reviewer.ts`). `[NOTE]` findings are
 * skipped. Any malformation — an unknown severity tag, a `File:` line
 * before any finding bullet, a cite that does not parse as `path:line`
 * with a colon-free, whitespace-free path (rejects `path:line:col` and
 * multi-path prose forms), a cite path that is not plain-repo-relative
 * (absolute, `./`-prefixed, etc. — such a cite can never intersect git's
 * repo-relative changed paths), or a MUST-FIX/SHOULD-FIX finding bullet
 * with NO `File:` cite at
 * all (its location is unknown, so zero-overlap is unprovable) — is a
 * parse FAILURE, which the caller maps to the fail-safe `ambiguous`
 * verdict. An audit with no findings at all still parses (empty cite set).
 *
 * @param markdown - Raw audit file content.
 * @returns `{ ok: true, paths }` with the cited paths (line numbers
 *   stripped, duplicates preserved), or `{ ok: false, error }`.
 *
 * @example
 * ```typescript
 * parseAuditCitePaths('- [MUST-FIX] bug\n  File: src/a.ts:12\n')
 * // => { ok: true, paths: ['src/a.ts'] }
 * ```
 */
export function parseAuditCitePaths(markdown: string): AuditCitesResult {
    const paths: string[] = []
    let mode: 'none' | 'collect' | 'skip' = 'none'
    // Set while inside a MUST-FIX/SHOULD-FIX finding that has not yet
    // produced a `File:` cite; if it is still set when the next finding
    // starts (or at EOF), that actionable finding has no location and
    // zero-overlap cannot be proven.
    let uncitedActionable: string | null = null
    for (const line of markdown.split('\n')) {
        const bullet = FINDING_BULLET.exec(line)
        if (bullet) {
            if (uncitedActionable !== null) {
                return {
                    ok: false,
                    error: `actionable finding without a "File:" cite: "${uncitedActionable}"`,
                }
            }
            const severity = bullet[1]
            if (severity === 'MUST-FIX' || severity === 'SHOULD-FIX') {
                mode = 'collect'
                uncitedActionable = line.trim()
            } else if (severity === 'NOTE') {
                mode = 'skip'
            } else {
                return {
                    ok: false,
                    error: `unknown finding severity "[${severity}]"`,
                }
            }
            continue
        }
        const file = FILE_LINE.exec(line)
        if (!file) continue
        if (mode === 'none') {
            return {
                ok: false,
                error: `"File:" cite outside any finding: "${line.trim()}"`,
            }
        }
        if (mode === 'skip') continue
        const cite = CITE.exec(file[1] ?? '')
        if (!cite?.[1]) {
            return {
                ok: false,
                error: `unparsable cite "${file[1]}" (expected path:line)`,
            }
        }
        if (!isPlainRepoRelativePath(cite[1])) {
            return {
                ok: false,
                error: `cite path "${cite[1]}" is not plain-repo-relative (absolute or ./-prefixed paths can never match git's repo-relative changed paths)`,
            }
        }
        uncitedActionable = null
        paths.push(cite[1])
    }
    if (uncitedActionable !== null) {
        return {
            ok: false,
            error: `actionable finding without a "File:" cite: "${uncitedActionable}"`,
        }
    }
    return { ok: true, paths }
}

function diffResult(
    verdict: SnapshotDiffVerdict,
    priorTree: string | null,
    changedPaths: string[],
    citePaths: string[],
    reason: string
): WriteResult {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(
                    {
                        verdict,
                        prior_tree: priorTree,
                        changed_paths: changedPaths,
                        cite_paths: citePaths,
                        reason,
                    },
                    null,
                    2
                ),
            },
        ],
    }
}

function isLucaPath(path: string): boolean {
    return path === '.luca' || path.startsWith('.luca/')
}

/**
 * Review diff-gate: compare the snapshot tree captured by
 * `luca snapshot create` against the CURRENT worktree tree and decide
 * whether re-review can be skipped.
 *
 * Algorithm:
 * 1. Read the consume-once payload `.luca/tmp/review-prefix-tree.json`
 *    and DELETE it immediately after reading — before any other work —
 *    so the consume-once lifecycle (G-ARCH-002) holds on every branch.
 * 2. Validate the payload (`snapshotPayloadSchema`): parsable JSON,
 *    `phase` matching the active phase slug, `tree` verifying as a git
 *    tree object. Any failure → `ambiguous`.
 * 3. Rebuild the current worktree tree (temp index — real index and
 *    worktree untouched) and run a tree-to-tree
 *    `git -c core.quotepath=false diff --no-renames <prior> <current>
 *    --name-only`, excluding `.luca/` paths. `--no-renames` keeps a
 *    renamed+modified cited file visible under its OLD (cited) path;
 *    `core.quotepath=false` keeps non-ASCII paths literal so they can
 *    string-match cites.
 * 4. Collect `File: {path}:{line}` cites from the active phase's
 *    `audits/*.md` under MUST-FIX and SHOULD-FIX findings. Parse
 *    failure → `ambiguous`.
 * 5. Verdict: empty changed set → `empty`; empty cite set with a
 *    non-empty changed set → `ambiguous` (never a vacuous skip); no
 *    intersection → `zero-overlap`; otherwise `overlap`.
 */
export const lucaSnapshotDiffTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_snapshot_diff',
        description:
            'Consume the review-gate snapshot payload (.luca/tmp/review-prefix-tree.json — deleted on every path), diff the prior snapshot tree against the current worktree tree, intersect changed paths with prior MUST-FIX/SHOULD-FIX audit cites, and return {"verdict","prior_tree","changed_paths","cite_paths","reason"} where verdict is empty | zero-overlap | overlap | ambiguous (fail-safe) and prior_tree is the consumed snapshot tree sha (null when the payload was missing/unparsable).',
        inputSchema,
        async handler(_args, ctx) {
            const payloadAbs = join(ctx.cwd, REVIEW_PREFIX_TREE_RELPATH)

            // Consume-once (G-ARCH-002): read, then delete BEFORE any
            // further processing so every branch below — including every
            // ambiguous fail-safe — returns with the payload gone.
            let payloadRaw: string | null = null
            try {
                payloadRaw = await readFile(payloadAbs, 'utf-8')
            } catch {
                payloadRaw = null
            }
            await rm(payloadAbs, { force: true })

            if (payloadRaw === null) {
                return diffResult(
                    'ambiguous',
                    null,
                    [],
                    [],
                    `snapshot payload ${REVIEW_PREFIX_TREE_RELPATH} is missing — run luca snapshot create before the diff-gate`
                )
            }

            let parsedJson: unknown
            try {
                parsedJson = JSON.parse(payloadRaw)
            } catch {
                return diffResult(
                    'ambiguous',
                    null,
                    [],
                    [],
                    `snapshot payload ${REVIEW_PREFIX_TREE_RELPATH} is not valid JSON`
                )
            }
            const payload = snapshotPayloadSchema.safeParse(parsedJson)
            if (!payload.success) {
                return diffResult(
                    'ambiguous',
                    null,
                    [],
                    [],
                    'snapshot payload is missing string "tree"/"phase" fields'
                )
            }
            const { tree: priorTree, phase: payloadPhase } = payload.data

            // Crash-after-consumption hardening: the payload is already
            // deleted, so an unexpected throw below (e.g. a Bun.spawn
            // failure when the git binary is missing) must still surface
            // as a controlled fail-safe `ambiguous` result instead of an
            // unhandled crash.
            try {
                return await computeDiffVerdict(
                    ctx.cwd,
                    priorTree,
                    payloadPhase
                )
            } catch (error) {
                return diffResult(
                    'ambiguous',
                    priorTree,
                    [],
                    [],
                    `unexpected error after payload consumption: ${error instanceof Error ? error.message : String(error)}`
                )
            }
        },
    }

/**
 * Post-consumption diff-gate pipeline: validate the consumed payload
 * against the active phase, rebuild the current worktree tree, run the
 * tree-to-tree diff, parse audit cites, and produce the verdict. Called
 * only AFTER the consume-once payload has been read and deleted; the
 * caller wraps this in a try/catch that maps any unexpected throw to the
 * fail-safe `ambiguous` verdict.
 *
 * @param cwd - Repository root.
 * @param priorTree - Snapshot tree sha from the consumed payload.
 * @param payloadPhase - Phase slug from the consumed payload.
 * @returns The diff-gate verdict envelope (see {@link diffResult}).
 */
async function computeDiffVerdict(
    cwd: string,
    priorTree: string,
    payloadPhase: string
): Promise<WriteResult> {
    const state = await loadCurrentState({ cwd })
    const resolved = resolveActiveSlug(state)
    if (!resolved.ok) {
        return diffResult('ambiguous', priorTree, [], [], resolved.error)
    }
    if (resolved.slug !== payloadPhase) {
        return diffResult(
            'ambiguous',
            priorTree,
            [],
            [],
            `payload phase "${payloadPhase}" does not match active phase "${resolved.slug}" — stale snapshot`
        )
    }

    const verify = await runGit(cwd, [
        'rev-parse',
        '--verify',
        '--quiet',
        `${priorTree}^{tree}`,
    ])
    if (verify.code !== 0) {
        return diffResult(
            'ambiguous',
            priorTree,
            [],
            [],
            `payload tree "${priorTree}" is not a resolvable git tree object`
        )
    }

    const built = await buildWorktreeSnapshotTree(cwd)
    if (!built.ok) {
        return diffResult(
            'ambiguous',
            priorTree,
            [],
            [],
            `failed to rebuild the current worktree tree: ${built.error}`
        )
    }

    // `-c core.quotepath=false` — non-ASCII changed paths must come
    // out literal (not "\303\244"-escaped) or they can never
    // string-match a cite. `--no-renames` — rename detection is on
    // by default (diff.renames, git >= 2.9) and would list ONLY the
    // new path of a renamed+modified file, silently dropping the
    // old (cited) path from the intersection.
    const diff = await runGit(cwd, [
        '-c',
        'core.quotepath=false',
        'diff',
        '--no-renames',
        priorTree,
        built.tree,
        '--name-only',
    ])
    if (diff.code !== 0) {
        return diffResult(
            'ambiguous',
            priorTree,
            [],
            [],
            `git diff failed: ${diff.stderr.trim()}`
        )
    }
    const changedPaths = diff.stdout
        .split('\n')
        .filter(Boolean)
        .filter((path) => !isLucaPath(path))
        .sort()

    const auditsDirAbs = join(cwd, phasePathFor(resolved.slug), 'audits')
    let auditFiles: string[] = []
    try {
        auditFiles = (await readdir(auditsDirAbs))
            .filter((name) => name.endsWith('.md'))
            .sort()
    } catch {
        // No audits directory — cite set stays empty; verdict
        // logic below decides whether that is `empty` or the
        // fail-safe `ambiguous`.
        auditFiles = []
    }
    const citeSet = new Set<string>()
    for (const name of auditFiles) {
        let content: string
        try {
            content = await readFile(join(auditsDirAbs, name), 'utf-8')
        } catch {
            return diffResult(
                'ambiguous',
                priorTree,
                changedPaths,
                [],
                `failed to read audit audits/${name}`
            )
        }
        const cites = parseAuditCitePaths(content)
        if (!cites.ok) {
            return diffResult(
                'ambiguous',
                priorTree,
                changedPaths,
                [],
                `audit audits/${name} failed cite parsing: ${cites.error}`
            )
        }
        for (const path of cites.paths) citeSet.add(path)
    }
    const citePaths = [...citeSet].sort()

    if (changedPaths.length === 0) {
        return diffResult(
            'empty',
            priorTree,
            changedPaths,
            citePaths,
            'no non-.luca paths changed since the snapshot'
        )
    }
    if (citePaths.length === 0) {
        return diffResult(
            'ambiguous',
            priorTree,
            changedPaths,
            citePaths,
            'paths changed but no MUST-FIX/SHOULD-FIX cites were found — cannot prove zero overlap (no vacuous skip)'
        )
    }
    const overlap = changedPaths.filter((path) => citeSet.has(path))
    if (overlap.length === 0) {
        return diffResult(
            'zero-overlap',
            priorTree,
            changedPaths,
            citePaths,
            'no changed path is cited by a prior MUST-FIX/SHOULD-FIX finding'
        )
    }
    return diffResult(
        'overlap',
        priorTree,
        changedPaths,
        citePaths,
        `changed paths intersect prior cites: ${overlap.join(', ')}`
    )
}
