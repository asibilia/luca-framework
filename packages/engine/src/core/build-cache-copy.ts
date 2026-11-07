/**
 * Warm builds (#721): `create_ticket_worktree` clones the repo's
 * `build_cache_paths` into a ticket's new worktree, from the run branch's
 * worktree or else the repo's checkout, both only read. Each copy goes to a
 * temporary folder in the run folder first and is then renamed into place,
 * so a worktree never holds a half-made copy. Nothing here ever stops the
 * ticket: a failed scan, git check, copy or temporary folder only skips
 * paths, each journaled with its reason.
 */
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
    copyDir,
    ignoredAmong,
    isGlob,
    matchesIn,
    type CopyDirResult,
} from './build-cache'
import type { BuildContext } from './build-context'

import { buildCachePathsOf } from '../config/engine-config'
import type {
    BuildCacheSkipReason,
    BuildCacheSource,
} from '../journal/build-cache-entries'

/** One source folder a cache may be copied from. */
type Source = { from: BuildCacheSource; dir: string }

/** One match of an entry, in the first source that has it. */
type Match = Source & { path: string }

/** An error's text. */
const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/** Removes a folder; one it can't remove is left, and never throws. */
const removeQuietly = (dir: string): Promise<void> =>
    rm(dir, { recursive: true, force: true }).catch(() => undefined)

/** The run's two warm sources, in order: the run branch's worktree, then the checkout. */
const sourcesOf = ({ context }: { context: BuildContext }): Source[] => {
    const started = context.journal
        .read()
        .find((record) => record.kind === 'run_started')
    const repo = started?.kind === 'run_started' ? started.content.repo : null
    const run_branch = context.state.run_branch?.path ?? null
    const sources: Source[] = []
    if (run_branch !== null) {
        sources.push({ from: 'run_branch', dir: run_branch })
    }
    if (repo !== null) sources.push({ from: 'checkout', dir: repo })
    return sources
}

/**
 * An entry's matches, each from the first source that has it. A source it
 * can't scan has no match.
 */
const matchesOf = async ({
    entry,
    sources,
}: {
    entry: string
    sources: Source[]
}): Promise<Match[]> => {
    const found: Match[] = []
    for (const source of sources) {
        const paths = await matchesIn({ entry, dir: source.dir }).catch(
            (): string[] => []
        )
        for (const path of paths) {
            if (!found.some((match) => match.path === path)) {
                found.push({ ...source, path })
            }
            if (!isGlob(entry)) return found
        }
    }
    return found
}

/** Copies a match to `temp`, then renames it into the worktree. */
const copyInto = async ({
    context,
    match,
    temp,
    worktree,
}: {
    context: BuildContext
    match: Match
    temp: string
    worktree: string
}): Promise<CopyDirResult> => {
    const copy = context.copy_dir ?? copyDir
    try {
        const copied = await copy({
            from: join(match.dir, match.path),
            to: temp,
        })
        if (!copied.ok) return copied
        const target = join(worktree, match.path)
        await mkdir(dirname(target), { recursive: true })
        await rename(temp, target)
        return { ok: true }
    } catch (error) {
        return { ok: false, error: messageOf(error) }
    } finally {
        await removeQuietly(temp)
    }
}

/**
 * Clones the config's build caches that git ignores into ticket `ticket`'s
 * new worktree, journaling `build_cache_skipped` for each path not copied
 * and one `build_cache_copied` when any was.
 *
 * @example
 * await copyBuildCaches({ context, ticket: 11, worktree })
 */
export const copyBuildCaches = async ({
    context,
    ticket,
    worktree,
}: {
    context: BuildContext
    ticket: number
    worktree: string
}): Promise<void> => {
    const entries = buildCachePathsOf({ config: context.config })
    if (entries.length === 0) return
    const skip = (content: {
        path: string
        reason: BuildCacheSkipReason
        error?: string
    }) =>
        context.journal.append({
            kind: 'build_cache_skipped',
            ticket,
            role: null,
            content,
        })
    // A crashed try's leftovers go first; this try's go at the end. When
    // the temporary folder can't be cleared or made, each copy fails.
    const temps = join(context.run_dir, 'cache-copies', String(ticket))
    const uncleared = await rm(temps, { recursive: true, force: true }).then(
        () => null,
        messageOf
    )
    const sources = sourcesOf({ context })
    const matches: Match[] = []
    for (const entry of entries) {
        const found = await matchesOf({ entry, sources })
        if (found.length === 0) skip({ path: entry, reason: 'no_source' })
        for (const match of found) {
            if (!matches.some(({ path }) => path === match.path)) {
                matches.push(match)
            }
        }
    }
    if (matches.length === 0) return
    const ignored = await ignoredAmong({
        git: context.git,
        cwd: worktree,
        paths: matches.map(({ path }) => path),
    }).catch(() => new Set<string>())
    const unmade =
        uncleared ??
        (await mkdir(temps, { recursive: true }).then(() => null, messageOf))
    const started = performance.now()
    const copied: { path: string; from: BuildCacheSource }[] = []
    for (const [index, match] of matches.entries()) {
        if (!ignored.has(match.path)) {
            skip({ path: match.path, reason: 'not_ignored' })
        } else if (existsSync(join(worktree, match.path))) {
            skip({ path: match.path, reason: 'already_present' })
        } else if (unmade !== null) {
            skip({ path: match.path, reason: 'copy_failed', error: unmade })
        } else {
            const done = await copyInto({
                context,
                match,
                temp: join(temps, String(index)),
                worktree,
            })
            if (done.ok) copied.push({ path: match.path, from: match.from })
            else {
                skip({
                    path: match.path,
                    reason: 'copy_failed',
                    error: done.error,
                })
            }
        }
    }
    const ms = Math.round(performance.now() - started)
    await removeQuietly(temps)
    if (copied.length === 0) return
    context.journal.append({
        kind: 'build_cache_copied',
        ticket,
        role: null,
        content: { paths: copied, ms },
    })
}
