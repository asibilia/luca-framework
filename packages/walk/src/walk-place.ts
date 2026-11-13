import { readDrafts, saveWalkPlace, type WalkPlace } from './drafts-file'
import type { PullRequestRef } from './pull-request-ref'
import type { WalkHost } from './walk-host'

/**
 * The owner's place in a walk (#752, sections 6, 12 and 15), the same for
 * a story's walk and the plain diff: the current stop, the stops done, the
 * last change, and which stops are to walk on this visit. It is kept in
 * the pull request's drafts file with the last review it was made under;
 * a place made under another review is from an earlier visit, so it is
 * dropped and the second visit starts fresh.
 */

const LAST_STOP = "That was the last stop. Send the review when you're ready."
const NOTHING_TO_WALK =
    'Nothing to walk: no stop changed since your last review.'
const UNCHANGED = 'unchanged since your last review'

const NO_PLACE: WalkPlace = {
    current_stop_id: null,
    done_stop_ids: [],
    last_change_id: null,
}

/** A stop as the place sees it: its id, its changes' ids, and whether it is to walk. */
export type PlaceStop = { id: string; change_ids: string[]; to_walk: boolean }

/**
 * The place in a walk of `stops`, in walk order, back where the drafts
 * file left it when it was made under the same last review.
 *
 * @param last_review - The last review's commit; null when there was none.
 */
export const createWalkPlace = async <Stop extends PlaceStop>({
    host,
    walk_dir,
    ref,
    stops,
    last_review,
}: {
    host: WalkHost
    walk_dir: string
    ref: PullRequestRef
    stops: Stop[]
    last_review: string | null
}) => {
    const stopOf = (id: string | null) =>
        stops.find((stop) => stop.id === id) ?? null
    const drafts = await readDrafts({ walk_dir, ref })
    const saved =
        (drafts.walk_review ?? null) === last_review ? drafts.walk : NO_PLACE
    const current = stopOf(saved.current_stop_id)
    let place: WalkPlace = {
        current_stop_id: current?.id ?? null,
        done_stop_ids: saved.done_stop_ids.filter((id) => stopOf(id) !== null),
        last_change_id:
            saved.last_change_id !== null &&
            current?.change_ids.includes(saved.last_change_id)
                ? saved.last_change_id
                : null,
    }

    const keep = async (next: WalkPlace) => {
        place = next
        await saveWalkPlace({ walk_dir, ref, walk: next, last_review })
    }

    /** The first stop to walk; null, after saying so, when no stop is. */
    const first = async (): Promise<Stop | null> => {
        const found = stops.find(({ to_walk }) => to_walk)
        if (found !== undefined) return found
        if (stops.length > 0) {
            await host.showMessage({ kind: 'info', text: NOTHING_TO_WALK })
        }
        return null
    }

    return {
        /** The stop on screen; null before the walk starts. */
        current: (): Stop | null => stopOf(place.current_stop_id),

        /** The change the owner was last on in the current stop. */
        lastChangeId: (): string | null => place.last_change_id,

        /**
         * The Stops view's description of stop `id`: `current`, `done` or
         * `unchanged since your last review` (`current` wins), then
         * `looks good`, joined with ` · `.
         */
        descriptionOf: ({
            id,
            looks_good,
        }: {
            id: string
            looks_good: boolean
        }): string =>
            [
                id === place.current_stop_id
                    ? 'current'
                    : place.done_stop_ids.includes(id)
                      ? 'done'
                      : stopOf(id)?.to_walk === false
                        ? UNCHANGED
                        : '',
                looks_good ? 'looks good' : '',
            ]
                .filter((part) => part !== '')
                .join(' · '),

        /**
         * Goes to stop `id` at change `change_id`: the stop being left is
         * then done.
         */
        enter: async ({
            id,
            change_id,
        }: {
            id: string
            change_id: string | null
        }) => {
            const left = place.current_stop_id
            const done =
                left === null ||
                left === id ||
                place.done_stop_ids.includes(left)
                    ? place.done_stop_ids
                    : [...place.done_stop_ids, left]
            await keep({
                current_stop_id: id,
                done_stop_ids: done,
                last_change_id: change_id,
            })
        },

        /** Keeps `change_id` as the change the owner was last on. */
        keepChange: async ({ change_id }: { change_id: string }) => {
            if (change_id === place.last_change_id) return
            await keep({ ...place, last_change_id: change_id })
        },

        first,

        /**
         * The stop to walk `step` along from the current one (1 is Next,
         * -1 is Back), or the first one before the walk starts. Null at an
         * end, after saying it was the last stop on Next.
         */
        along: async ({ step }: { step: 1 | -1 }): Promise<Stop | null> => {
            const at = stops.findIndex(({ id }) => id === place.current_stop_id)
            if (at === -1) return first()
            const to =
                step === 1
                    ? stops.slice(at + 1).find(({ to_walk }) => to_walk)
                    : stops.slice(0, at).findLast(({ to_walk }) => to_walk)
            if (to !== undefined) return to
            if (step === 1) {
                await host.showMessage({ kind: 'info', text: LAST_STOP })
            }
            return null
        },
    }
}
