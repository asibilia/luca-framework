import type { WalkHost, WalkStatusAction } from './walk-host'
import type { WalkState } from './walk-place'
import type { WalkSession } from './walk-session'

/**
 * Status bar quick actions (#776, section 5): live progress and one-click
 * actions while a walk or plain-diff browse session is active, hidden when
 * no session is active.
 */

const pluralStop = ({ count }: { count: number }): string =>
    count === 1 ? 'stop' : 'stops'

const progressText = ({ state }: { state: WalkState }): string => {
    const total = state.stop_ids.length
    if (state.to_walk_stop_ids.length === 0) return 'Nothing new to walk'
    const done = new Set(state.done_stop_ids)
    if (state.to_walk_stop_ids.every((id) => done.has(id))) {
        return `All ${total} ${pluralStop({ count: total })} walked`
    }
    const at =
        state.current_stop_id === null
            ? -1
            : state.stop_ids.indexOf(state.current_stop_id)
    if (at !== -1) return `Stop ${at + 1} of ${total}`
    return `Walk: ${total} ${pluralStop({ count: total })}`
}

/** Builds the 4 status bar quick actions for an active walk or browse session. */
export const statusBarActions = ({
    state,
    has_story,
}: {
    state: WalkState
    has_story: boolean
}): WalkStatusAction[] => [
    {
        id: 'progress',
        text: progressText({ state }),
        tooltip: has_story ? 'Show the map' : 'Back to the walk',
        command: has_story ? 'lucaWalk.showMap' : 'lucaWalk.backToWalk',
    },
    {
        id: 'next_stop',
        text: '$(arrow-right) Next stop',
        tooltip: 'Go to the next stop',
        command: 'lucaWalk.nextStop',
    },
    {
        id: 'looks_good',
        text: '$(check) This stop looks good',
        tooltip: 'Mark every file in the current stop as looking good',
        command: 'lucaWalk.markStopLooksGood',
    },
    {
        id: 'send_review',
        text: '$(comment-discussion) Send the review',
        tooltip: 'Send your review to GitHub',
        command: 'lucaWalk.sendReview',
    },
]

/** Updates the host's status bar quick actions for `walk` (hides them when null). */
export const showStatusBar = async ({
    host,
    walk,
}: {
    host: WalkHost
    walk: WalkSession | null
}): Promise<void> => {
    const items =
        walk === null
            ? []
            : statusBarActions({
                  state: walk.state(),
                  has_story: walk.story !== null,
              })
    await host.showStatusActions({ items })
}
