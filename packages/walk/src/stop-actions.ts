import { z } from 'zod'

import type { Shown } from './load-pull-request'
import type { WalkHost } from './walk-host'

/**
 * Stop-level actions (#776, section 3): `This stop looks good` and the
 * `stop_action` messages sent from the Map panel.
 */

const StopArgSchema = z.object({ stop_id: z.string() })

export const StopActionMessageSchema = z.object({
    type: z.literal('stop_action'),
    action: z.enum(['open', 'mark_looks_good', 'walk_next']),
    stop_id: z.string(),
})
export type StopActionMessage = z.infer<typeof StopActionMessageSchema>

/**
 * Marks every file of a stop as looking good: the stop named in `args[0]`
 * (`{ stop_id }`), or the current stop when no argument is given.
 */
export const markStopLooksGood = async ({
    host,
    now,
    args,
}: {
    host: WalkHost
    now: Shown
    args: unknown[]
}): Promise<void> => {
    if (now.walk === null) {
        await host.showMessage({ kind: 'info', text: 'Start the walk first.' })
        return
    }
    const parsed = StopArgSchema.safeParse(args[0])
    const stop_id = parsed.success
        ? parsed.data.stop_id
        : now.walk.state().current_stop_id
    if (stop_id === null) {
        await host.showMessage({ kind: 'info', text: 'Start the walk first.' })
        return
    }
    const paths = now.walk.filesOf({ stop_id })
    if (paths === null) return
    const { changed } = await now.feedback.markLooksGood({ paths })
    if (!changed) {
        await host.showMessage({
            kind: 'info',
            text: 'Every file in this stop already looks good.',
        })
    }
}

/** Handles a `stop_action` message from the Map panel. */
export const handleStopAction = async ({
    host,
    now,
    action,
    stop_id,
}: {
    host: WalkHost
    now: Shown
    action: StopActionMessage['action']
    stop_id: string
}): Promise<void> => {
    if (now.walk === null) return
    if (now.walk.filesOf({ stop_id }) === null) return
    if (action === 'open') {
        await now.walk.pickStop({ stop_id })
        return
    }
    if (action === 'mark_looks_good') {
        await markStopLooksGood({ host, now, args: [{ stop_id }] })
        return
    }
    await now.walk.pickStop({ stop_id })
    await now.walk.nextStop()
}
