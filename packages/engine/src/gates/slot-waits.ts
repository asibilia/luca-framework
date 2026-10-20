/**
 * Waits inside a step (#632): a check that must wait for a prepare slot or
 * a test slot says so to whoever listens for the step it runs in, such as
 * the run's live file. The listener rides along with the step's work (an
 * `AsyncLocalStorage`), so the checks deep in the gate runner need no new
 * argument. Nothing is journaled: the wait's length is already `wait_ms`.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

/** What a check waits for. */
export type SlotKind = 'prepare_slot' | 'test_slot'

/** A wait for a slot, as it starts: `in_use` of the `slots` are taken. */
export type SlotWait = { for: SlotKind; in_use: number; slots: number }

/** Hears a wait start; the function it gives back hears the slot taken. */
export type SlotWaitListener = (wait: SlotWait) => () => void

const LISTENER = new AsyncLocalStorage<SlotWaitListener>()

/**
 * Runs `run` with `listener` hearing every slot wait inside it.
 *
 * @example
 * await hearSlotWaits({ listener: live.slotWaits({ ticket: 11 }), run: () => runGates(...) })
 */
export const hearSlotWaits = <T>({
    listener,
    run,
}: {
    listener: SlotWaitListener
    run: () => Promise<T>
}): Promise<T> => LISTENER.run(listener, run)

/**
 * The `on_wait` for a take of `kind` slots, at most `limit` at once, or
 * `undefined` when nobody listens. With no cap (`Infinity`), the slots are
 * the ones in use.
 */
export const onSlotWait = ({
    kind,
    limit,
}: {
    kind: SlotKind
    limit: number
}): ((in_use: number) => () => void) | undefined => {
    const listener = LISTENER.getStore()
    if (listener === undefined) return undefined
    return (in_use) =>
        listener({
            for: kind,
            in_use,
            slots: Number.isFinite(limit) ? limit : in_use,
        })
}
