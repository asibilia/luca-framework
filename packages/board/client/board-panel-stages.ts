/**
 * The stages the panel stacks tickets and lenses in, and the keys of the
 * cards and stages a person opens or folds.
 */
import type { LensState, TicketStage } from '../shared/board-state'

type StackStage = Exclude<TicketStage, 'stuck'>

export const TICKET_STAGES: {
    stage: StackStage
    title: string
    hint: string
    icon: string
    folded: boolean
}[] = [
    {
        stage: 'blocked',
        title: 'Blocked',
        hint: "waits on a ticket that isn't done",
        icon: 'Lock',
        folded: false,
    },
    {
        stage: 'building',
        title: 'Building',
        hint: 'the first tests and code',
        icon: 'Hammer',
        folded: false,
    },
    {
        stage: 'reviewing',
        title: 'Reviewing',
        hint: 'a reviewer reads the ticket',
        icon: 'ScanSearch',
        folded: false,
    },
    {
        stage: 'testing',
        title: 'Testing',
        hint: 'the red check or the checks running',
        icon: 'FlaskConical',
        folded: false,
    },
    {
        stage: 'fixing',
        title: 'Fixing',
        hint: 'a fix round after the checks, a review or a join',
        icon: 'Wrench',
        folded: false,
    },
    {
        stage: 'joining',
        title: 'Joining',
        hint: 'joining the run branch and its checks there',
        icon: 'GitMerge',
        folded: false,
    },
    {
        stage: 'done',
        title: 'Done',
        hint: 'joined the run branch',
        icon: 'CircleCheck',
        folded: true,
    },
    {
        stage: 'skipped',
        title: 'Skipped',
        hint: 'left out of this run, stays open',
        icon: 'SkipForward',
        folded: true,
    },
]

export const LENS_STAGES: { stage: LensState; title: string; icon: string }[] =
    [
        { stage: 'waiting', title: 'Waiting', icon: 'Clock' },
        { stage: 'reviewing', title: 'Reviewing', icon: 'ScanSearch' },
        { stage: 'fixing', title: 'Fixing', icon: 'Wrench' },
        { stage: 'clean', title: 'Clean', icon: 'CircleCheck' },
    ]

/** A card or stage key. */
export type Key = string

/** The key of the fold for tickets left out for a person (#499). */
export const FOR_A_PERSON: Key = 'for_a_person'

export const toggled = ({
    set,
    key,
}: {
    set: ReadonlySet<Key>
    key: string
}): Set<Key> => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
}
