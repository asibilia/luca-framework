import { contextHtml, notInWalkHtml } from './context-html'
import { readDrafts, saveWalkPlace, type WalkPlace } from './drafts-file'
import type { PullRequestRef } from './pull-request-ref'
import type { WalkHost } from './walk-host'
import { baseUri, checkoutFileUri, documentOf } from './walk-uris'

import type { StoryChange, StoryStop } from '../../engine/src/story/story-parts'
import type { Story } from '../../engine/src/story/story-schema'

/**
 * The walk (#752, section 6): the Stops view, going to a stop as a
 * full-file diff, Next and Back through stops and changes, and the place
 * in the walk, kept in the pull request's drafts file.
 */

const LAST_STOP = "That was the last stop. Send the review when you're ready."

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
}: {
    host: WalkHost
    walk_dir: string
    ref: PullRequestRef
    checkout: string
    story: Story
}) => {
    const { stops } = story
    const stopOf = (id: string | null) =>
        stops.find((stop) => stop.id === id) ?? null
    const saved = (await readDrafts({ walk_dir, ref })).walk
    const current = stopOf(saved.current_stop_id)
    let place: WalkPlace = {
        current_stop_id: current?.id ?? null,
        done_stop_ids: saved.done_stop_ids.filter((id) => stopOf(id) !== null),
        last_change_id: current?.changes.some(
            ({ id }) => id === saved.last_change_id
        )
            ? saved.last_change_id
            : null,
    }
    /** The last line the cursor was on, by document (path and side). */
    const cursors = new Map<string, number>()
    const cursorKey = ({ path, side }: { path: string; side: string }) =>
        `${side}:${path}`
    let saving: Promise<void> = Promise.resolve()

    const save = () => {
        const walk = place
        saving = saving
            .catch(() => undefined)
            .then(() => saveWalkPlace({ walk_dir, ref, walk }))
        return saving
    }

    const showStops = () =>
        host.showStops({
            items: stops.map((stop, at) => ({
                label: `${at + 1}. ${stop.title}`,
                description:
                    stop.id === place.current_stop_id
                        ? 'current'
                        : place.done_stop_ids.includes(stop.id)
                          ? 'done'
                          : '',
                stop_id: stop.id,
            })),
        })

    const openChange = async (change: StoryChange) => {
        const file = story.map.files.find(({ path }) => path === change.path)
        const status = file?.status ?? 'modified'
        const base_path =
            status === 'renamed' && file?.previous_path
                ? file.previous_path
                : change.path
        const base_uri = baseUri({
            path: base_path,
            sha: status === 'added' ? null : story.base_sha,
        })
        const head_uri =
            status === 'deleted'
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

    const goToStop = async (stop: StoryStop) => {
        const left = place.current_stop_id
        const done =
            left === null ||
            left === stop.id ||
            place.done_stop_ids.includes(left)
                ? place.done_stop_ids
                : [...place.done_stop_ids, left]
        const [first] = stop.changes
        place = {
            current_stop_id: stop.id,
            done_stop_ids: done,
            last_change_id: first?.id ?? null,
        }
        await save()
        await showStops()
        if (first !== undefined) await openChange(first)
    }

    const goToChange = async (change: StoryChange) => {
        place = { ...place, last_change_id: change.id }
        await save()
        await openChange(change)
    }

    const start = async () => {
        const [first] = stops
        if (first !== undefined) await goToStop(first)
    }

    /** One stop along: `step` 1 is Next, -1 is Back. */
    const moveStop = async (step: 1 | -1) => {
        const stop = stopOf(place.current_stop_id)
        if (stop === null) return start()
        const to = stops[stops.indexOf(stop) + step]
        if (to !== undefined) return goToStop(to)
        if (step === 1) {
            await host.showMessage({ kind: 'info', text: LAST_STOP })
        }
    }

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
    const moveLooseChange = async (stop: StoryStop, step: 1 | -1) => {
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
            stop.changes.find(({ id }) => id === place.last_change_id) ??
            stop.changes[0]
        if (from === undefined) return
        const to = stop.changes[stop.changes.indexOf(from) + step]
        if (to !== undefined) await goToChange(to)
    }

    /** In any other stop: the stop's changes in the open file, by line. */
    const moveFileChange = async (stop: StoryStop, step: 1 | -1) => {
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
        if (to !== undefined) await goToChange(to)
    }

    const moveChange = async (step: 1 | -1) => {
        const stop = stopOf(place.current_stop_id)
        if (stop === null) return start()
        if (stop.kind === 'loose_ends') return moveLooseChange(stop, step)
        return moveFileChange(stop, step)
    }

    return {
        /** Shows the Stops view as the drafts file left it. */
        showStops,
        start,
        nextStop: () => moveStop(1),
        previousStop: () => moveStop(-1),
        nextChange: () => moveChange(1),
        previousChange: () => moveChange(-1),

        /** Reopens the current stop at the change the owner was last on. */
        backToWalk: async () => {
            const stop = stopOf(place.current_stop_id)
            if (stop === null) return start()
            const change =
                stop.changes.find(({ id }) => id === place.last_change_id) ??
                stop.changes[0]
            if (change !== undefined) await openChange(change)
        },

        pickStop: async ({ stop_id }: { stop_id: string }) => {
            const stop = stopOf(stop_id)
            if (stop !== null) await goToStop(stop)
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
            const stop = stopOf(place.current_stop_id)
            if (stop === null) return
            const under = stop.changes.find(
                (change) =>
                    change.path === document.path &&
                    change.side === document.side &&
                    holds({ change, line })
            )
            if (under === undefined || under.id === place.last_change_id) return
            place = { ...place, last_change_id: under.id }
            await save()
        },
    }
}

export type WalkSession = Awaited<ReturnType<typeof createWalkSession>>
