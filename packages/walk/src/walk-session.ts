import { isPlainRepoPath, staysInCheckout } from './checkout-path'
import { contextHtml, notInWalkHtml } from './context-html'
import type { PullRequestRef } from './pull-request-ref'
import type { WalkHost } from './walk-host'
import { createWalkPlace } from './walk-place'
import { baseUri, checkoutFileUri, documentOf } from './walk-uris'

import type { StoryChange, StoryStop } from '../../engine/src/story/story-parts'
import type { Story } from '../../engine/src/story/story-schema'

/**
 * The walk (#752, section 6): the Stops view, going to a stop as a
 * full-file diff, Next and Back through stops and changes, and the place
 * in the walk, kept in the pull request's drafts file.
 */

const holds = ({ change, line }: { change: StoryChange; line: number }) =>
    change.start_line <= line && line <= change.end_line

/**
 * The walk through `story` for the checkout at `checkout`, back at the
 * place the drafts file kept.
 */
export const createWalkSession = async ({
    host,
    walk_dir,
    ref,
    checkout,
    story,
    looksGood,
    files_to_walk = null,
    last_review = null,
}: {
    host: WalkHost
    walk_dir: string
    ref: PullRequestRef
    checkout: string
    story: Story
    /** Whether the owner marked the file `path` as looking good. */
    looksGood: (path: string) => boolean
    /**
     * On a second visit, the files changed since the last review: only
     * the stops with a change in one of them are walked. Null walks all.
     */
    files_to_walk?: string[] | null
    /** The last review's commit; null when there was none. */
    last_review?: string | null
}) => {
    const { stops } = story
    const place = await createWalkPlace({
        host,
        walk_dir,
        ref,
        last_review,
        stops: stops.map((stop) => ({
            id: stop.id,
            change_ids: stop.changes.map(({ id }) => id),
            to_walk:
                files_to_walk === null ||
                stop.changes.some(({ path }) => files_to_walk.includes(path)),
            stop,
        })),
    })
    const currentStop = () => place.current()?.stop ?? null
    /** The last line the cursor was on, by document (path and side). */
    const cursors = new Map<string, number>()
    const cursorKey = ({ path, side }: { path: string; side: string }) =>
        `${side}:${path}`

    /** A stop looks good when every file it changes was marked so. */
    const stopLooksGood = (stop: StoryStop) =>
        stop.changes.length > 0 &&
        stop.changes.every(({ path }) => looksGood(path))

    const showStops = () =>
        host.showStops({
            items: stops.map((stop, at) => ({
                label: `${at + 1}. ${stop.title}`,
                description: place.descriptionOf({
                    id: stop.id,
                    looks_good: stopLooksGood(stop),
                }),
                stop_id: stop.id,
            })),
        })

    const openChange = async ({ change }: { change: StoryChange }) => {
        const file = story.map.files.find(({ path }) => path === change.path)
        const status = file?.status ?? 'modified'
        const base_path =
            status === 'renamed' && file?.previous_path
                ? file.previous_path
                : change.path
        const deleted = status === 'deleted'
        const kept_in =
            isPlainRepoPath({ path: base_path }) &&
            (deleted
                ? isPlainRepoPath({ path: change.path })
                : await staysInCheckout({ checkout, path: change.path }))
        if (!kept_in) {
            const stop = stops.find(({ changes }) => changes.includes(change))
            await host.showMessage({
                kind: 'error',
                text: `The story's stop "${stop?.title ?? ''}" names ${isPlainRepoPath({ path: base_path }) ? change.path : base_path}, which is outside the checkout of #${ref.number}, so Luca Walk will not open it.`,
            })
            return
        }
        const base_uri = baseUri({
            path: base_path,
            sha: status === 'added' ? null : story.base_sha,
        })
        const head_uri = deleted
            ? baseUri({ path: change.path, sha: null })
            : checkoutFileUri({ checkout, path: change.path })
        await host.openDiff({
            title: `${change.path} (#${ref.number})`,
            base_uri,
            head_uri,
            reveal_line: change.start_line,
            reveal_side: change.side,
        })
        cursors.set(cursorKey(change), change.start_line)
    }

    /** Goes to `stop`, at `first` (the stop's first change by default). */
    const goToStop = async ({
        stop,
        first = stop.changes[0],
    }: {
        stop: StoryStop
        first?: StoryChange
    }) => {
        await place.enter({ id: stop.id, change_id: first?.id ?? null })
        await showStops()
        if (first !== undefined) await openChange({ change: first })
    }

    const goToChange = async ({ change }: { change: StoryChange }) => {
        await place.keepChange({ change_id: change.id })
        await openChange({ change })
    }

    const goToPlaced = async (placed: { stop: StoryStop } | null) => {
        if (placed !== null) await goToStop({ stop: placed.stop })
    }

    const start = async () => goToPlaced(await place.first())

    /**
     * The open editor's path and side, with the cursor's last line in it:
     * the last `cursorMoved` there, else the editor's own selection.
     */
    const openDocument = async () => {
        const editor = await host.activeEditor()
        if (editor === null) return null
        const document = documentOf({ checkout, uri: editor.uri })
        if (document === null) return null
        const line = cursors.get(cursorKey(document)) ?? editor.start_line
        return { ...document, line }
    }

    /** In the loose ends: the stop's changes in walk order, across files. */
    const moveLooseChange = async ({
        stop,
        step,
    }: {
        stop: StoryStop
        step: 1 | -1
    }) => {
        const document = await openDocument()
        const under =
            document === null
                ? undefined
                : stop.changes.find(
                      (change) =>
                          change.path === document.path &&
                          change.side === document.side &&
                          holds({ change, line: document.line })
                  )
        const from =
            under ??
            stop.changes.find(({ id }) => id === place.lastChangeId()) ??
            stop.changes[0]
        if (from === undefined) return
        const to = stop.changes[stop.changes.indexOf(from) + step]
        if (to !== undefined) await goToChange({ change: to })
    }

    /** In any other stop: the stop's changes in the open file, by line. */
    const moveFileChange = async ({
        stop,
        step,
    }: {
        stop: StoryStop
        step: 1 | -1
    }) => {
        const document = await openDocument()
        if (document === null) {
            await host.showMessage({
                kind: 'error',
                text: `Open a file of #${ref.number} first.`,
            })
            return
        }
        const { line } = document
        const here = stop.changes
            .filter(
                ({ path, side }) =>
                    path === document.path && side === document.side
            )
            .toSorted((a, b) => a.start_line - b.start_line)
        const under = here.find((change) => holds({ change, line }))
        const pivot = under?.start_line ?? line
        const to =
            step === 1
                ? here.find(({ start_line }) => start_line > line)
                : here.findLast(({ start_line }) => start_line < pivot)
        if (to !== undefined) await goToChange({ change: to })
    }

    const moveChange = async ({ step }: { step: 1 | -1 }) => {
        const stop = currentStop()
        if (stop === null) return start()
        if (stop.kind === 'loose_ends') return moveLooseChange({ stop, step })
        return moveFileChange({ stop, step })
    }

    return {
        /** Shows the Stops view as the drafts file left it. */
        showStops,
        start,
        nextStop: async () => goToPlaced(await place.along({ step: 1 })),
        previousStop: async () => goToPlaced(await place.along({ step: -1 })),
        nextChange: () => moveChange({ step: 1 }),
        previousChange: () => moveChange({ step: -1 }),

        /** Reopens the current stop at the change the owner was last on. */
        backToWalk: async () => {
            const stop = currentStop()
            if (stop === null) return start()
            const change =
                stop.changes.find(({ id }) => id === place.lastChangeId()) ??
                stop.changes[0]
            if (change !== undefined) await openChange({ change })
        },

        pickStop: async ({ stop_id }: { stop_id: string }) => {
            const stop = stops.find(({ id }) => id === stop_id)
            if (stop !== undefined) await goToStop({ stop })
        },

        /** The story this walk goes through. */
        story,

        /** Goes to the first stop with a change in the file at `path`. */
        goToFile: async ({ path }: { path: string }) => {
            const stop = stops.find(({ changes }) =>
                changes.some((change) => change.path === path)
            )
            if (stop === undefined) return
            await goToStop({
                stop,
                first: stop.changes.find((change) => change.path === path),
            })
        },

        /**
         * The cursor moved: the Context view shows the story's context
         * there, and on a change of the current stop it is the last change.
         */
        cursorMoved: async ({ uri, line }: { uri: string; line: number }) => {
            const document = documentOf({ checkout, uri })
            if (document === null) {
                // A file outside the checkout is not part of the walk; the
                // empty side of an added or deleted file says nothing.
                if (uri.startsWith('file:')) {
                    await host.showContext({ html: notInWalkHtml() })
                }
                return
            }
            cursors.set(cursorKey(document), line)
            await host.showContext({
                html: contextHtml({ story, cursor: { ...document, line } }),
            })
            const under = currentStop()?.changes.find(
                (change) =>
                    change.path === document.path &&
                    change.side === document.side &&
                    holds({ change, line })
            )
            if (under !== undefined) {
                await place.keepChange({ change_id: under.id })
            }
        },
    }
}

/** A story's walk or the plain diff's: `story` is null for the plain diff. */
export type WalkSession = Omit<
    Awaited<ReturnType<typeof createWalkSession>>,
    'story'
> & { story: Story | null }
