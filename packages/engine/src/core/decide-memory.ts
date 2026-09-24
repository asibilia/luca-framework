import uniqBy from 'lodash/uniqBy'

import type { BuildAction } from './decide-build'
import { failedChecks } from './fix-loop-text'
import { learnerPrompt, type RunEnding } from './learner-digest'
import { MAX_ENGINE_FAILURES, MAX_FIX_ROUNDS } from './loop-caps'
import {
    memoriesComment,
    memoryQuery,
    memorySection,
    newMemories,
} from './memory-text'
import { openFindingsText } from './review-text'

import type { JournalRecord } from '../journal/journal-record'
import type { RunState, TicketProgress } from '../journal/replay'
import { memoryFeedback, routeMemories } from '../memory/memory-routing'
import type { RecallPoint, RecalledMemory } from '../memory/memory-schemas'

/**
 * Memory's half of the decision step (#370). Pure. With memory off (the
 * run's `run_started` has no `memory`), it changes nothing. With it on:
 * the **recall points** (a search before the step that needs it, and the
 * memories added to that step's prompt or message), and, at the end of
 * every run that ran agents, the learner, its saves, and their listing.
 */

/** A proposed memory ready to save, with its op id and tags. */
export type MemorySaveStep = {
    type: string
    vault: string
    /** The stored concept, `<type>:<concept>`. */
    concept: string
    content: string
    summary: string
    /** So a save repeated after a crash adds the memory once. */
    op_id: string
    tags: string[]
}

/** Memory's steps. */
export type MemoryAction =
    /**
     * Search the project vault and `default` at a recall point, merge by
     * score, and journal `memory_recalled` under `key`. `ticket` is the
     * ticket's, or `null` for the run's start and the final review.
     */
    | {
          type: 'recall_memories'
          point: RecallPoint
          ticket: number | null
          key: string
          query: string
      }
    /** Start the learner, a fresh read-only agent, on the run branch's worktree. */
    | { type: 'launch_learner'; prompt: string }
    /** The learner failed every try: the run ends without it. */
    | { type: 'skip_learning'; reason: string }
    /**
     * Save the learner's memories (each updates a similar one or adds a new
     * one), log the refused ones, and send the feedback on each shown
     * memory.
     */
    | {
          type: 'save_memories'
          saves: MemorySaveStep[]
          refused: { type: string; concept: string; reason: string }[]
          feedback: { id: string; vault: string; useful: boolean }[]
      }
    /** With no PR, list the new memories in a comment on the spec issue. */
    | {
          type: 'report_memories'
          spec_number: number
          body: string
          count: number
      }

const MEMORY_ACTION_TYPES: ReadonlySet<string> = new Set<MemoryAction['type']>([
    'recall_memories',
    'launch_learner',
    'skip_learning',
    'save_memories',
    'report_memories',
])

/**
 * Whether an action is one of memory's.
 *
 * @example
 * isMemoryAction({ type: 'recall_memories' }) // true
 */
export const isMemoryAction = <Action extends { type: string }>(
    action: Action
): action is Extract<Action, MemoryAction> =>
    MEMORY_ACTION_TYPES.has(action.type)

/** The key of the run's start recall. */
export const RUN_START_KEY = 'run_start'

/** One recall point a step needs, before it runs. */
type RecallNeed = {
    point: RecallPoint
    ticket: number | null
    key: string
    query: () => string
}

/** The seq of the latest record that matches, or 0. */
const latestSeq = ({
    records,
    match,
}: {
    records: JournalRecord[]
    match: (record: JournalRecord) => boolean
}): number => records.findLast(match)?.seq ?? 0

/** The ticket's recall: its title and body. */
const ticketNeed = ({
    state,
    ticket,
}: {
    state: RunState
    ticket: number
}): RecallNeed => ({
    point: 'ticket',
    ticket,
    key: `ticket:${ticket}`,
    query: () => {
        const snapshot = state.snapshot?.tickets[ticket]
        return memoryQuery({
            text: `${snapshot?.title ?? ''}\n\n${snapshot?.body ?? ''}`,
        })
    },
})

/** The files a ticket's next review looks at: a fix commit's, or the whole ticket's. */
const reviewFiles = (progress: TicketProgress): string[] =>
    progress.commits.fix !== null
        ? progress.commit_files.fix
        : [
              ...new Set([
                  ...progress.commit_files.red,
                  ...progress.commit_files.green,
              ]),
          ]

const reviewQuery = ({
    title,
    files,
}: {
    title: string
    files: string[]
}): string =>
    memoryQuery({
        text: `${title}\n\nFiles changed:\n${files.join('\n')}`,
    })

/** Whether a ticket's review fix round waits on this fixer. */
const reviewFixWaitsOn = ({
    progress,
    role,
}: {
    progress: TicketProgress
    role: string
}): boolean => {
    const fix = progress.review_fix
    if (fix === null || progress.commits.green === null) return false
    if (role === 'test-writer') return !fix.tests_answered
    if (role === 'implementer') return fix.tests_answered && !fix.code_answered
    return false
}

/** A ticket's review fix round: searched with the blocking findings. */
const reviewFixNeed = ({
    records,
    progress,
    ticket,
}: {
    records: JournalRecord[]
    progress: TicketProgress
    ticket: number
}): RecallNeed => ({
    point: 'fix_round',
    ticket,
    key: `fix_round:${ticket}:review:${latestSeq({
        records,
        match: (record) =>
            record.kind === 'agent_finished' &&
            record.ticket === ticket &&
            record.content.role === 'ticket-reviewer',
    })}`,
    query: () =>
        memoryQuery({
            text: openFindingsText({
                findings: progress.review_fix?.findings ?? [],
            }),
            tail: true,
        }),
})

/**
 * The recall points a step needs, and whether it is a fresh agent (which
 * also gets the run's start memories at the top of its prompt). `null` for
 * a step that gets no memories: every step but agents, and follow-ups that
 * are no fix round (a failed try, a clash).
 */
const needsOf = ({
    action,
    state,
    records,
}: {
    action: BuildAction
    state: RunState
    records: JournalRecord[]
}): { fresh: boolean; needs: RecallNeed[] } | null => {
    const review = state.final_review
    switch (action.type) {
        case 'launch_agent': {
            const { ticket, role } = action
            const progress = state.tickets[ticket]
            if (progress === undefined) return { fresh: true, needs: [] }
            if (role === 'ticket-reviewer') {
                const sha =
                    progress.commits.fix ?? progress.commits.green ?? 'none'
                return {
                    fresh: true,
                    needs: [
                        {
                            point: 'review',
                            ticket,
                            key: `review:${ticket}:${sha}`,
                            query: () =>
                                reviewQuery({
                                    title:
                                        state.snapshot?.tickets[ticket]
                                            ?.title ?? '',
                                    files: reviewFiles(progress),
                                }),
                        },
                    ],
                }
            }
            return {
                fresh: true,
                needs: [
                    ticketNeed({ state, ticket }),
                    ...(reviewFixWaitsOn({ progress, role })
                        ? [reviewFixNeed({ records, progress, ticket })]
                        : []),
                ],
            }
        }
        case 'follow_up_agent': {
            const { ticket, role } = action
            const progress = state.tickets[ticket]
            // A failed try's follow-up is no fix round.
            if (progress === undefined || progress.agent_failure !== null) {
                return null
            }
            const { red_check, gates, rejoin } = progress
            if (role === 'test-writer' && red_check !== null && !red_check.ok) {
                return {
                    fresh: false,
                    needs: [
                        {
                            point: 'fix_round',
                            ticket,
                            key: `fix_round:${ticket}:red:${latestSeq({
                                records,
                                match: (record) =>
                                    record.kind === 'red_check' &&
                                    record.ticket === ticket,
                            })}`,
                            query: () =>
                                memoryQuery({
                                    text: `The red check failed:\n${red_check.problems.join('\n')}\n\n${red_check.output}`,
                                    tail: true,
                                }),
                        },
                    ],
                }
            }
            if (role !== 'implementer' || rejoin?.code_pending === true) {
                return null
            }
            if (reviewFixWaitsOn({ progress, role })) {
                return {
                    fresh: false,
                    needs: [reviewFixNeed({ records, progress, ticket })],
                }
            }
            if (gates !== null && !gates.ok) {
                return {
                    fresh: false,
                    needs: [
                        {
                            point: 'fix_round',
                            ticket,
                            key: `fix_round:${ticket}:gates:${latestSeq({
                                records,
                                match: (record) =>
                                    record.kind === 'gates_run' &&
                                    record.ticket === ticket &&
                                    record.content.target === 'ticket',
                            })}`,
                            query: () =>
                                memoryQuery({
                                    text: failedChecks({ gates }),
                                    tail: true,
                                }),
                        },
                    ],
                }
            }
            return null
        }
        case 'launch_lens':
            return {
                fresh: true,
                needs: [
                    {
                        point: 'review',
                        ticket: null,
                        key: `review:final:${review.head_sha ?? 'none'}`,
                        query: () =>
                            reviewQuery({
                                title: state.snapshot?.spec.title ?? '',
                                files: review.files,
                            }),
                    },
                ],
            }
        case 'launch_final_fixer':
        case 'follow_up_final_fixer': {
            const fresh = action.type === 'launch_final_fixer'
            const { gates, fix } = review
            // A failed try's follow-up is no fix round.
            if (!fresh && review.agent_failures[action.role] !== undefined) {
                return null
            }
            const forGates =
                gates !== null &&
                !gates.ok &&
                (!fresh ||
                    (action.role === 'implementer' &&
                        fix?.code_answered === true))
            if (forGates) {
                return {
                    fresh,
                    needs: [
                        {
                            point: 'fix_round',
                            ticket: null,
                            key: `fix_round:final:gates:${latestSeq({
                                records,
                                match: (record) =>
                                    record.kind === 'gates_run' &&
                                    record.ticket === null &&
                                    record.content.target === 'run_branch',
                            })}`,
                            query: () =>
                                memoryQuery({
                                    text: failedChecks({ gates }),
                                    tail: true,
                                }),
                        },
                    ],
                }
            }
            if (!fresh) return null
            return {
                fresh,
                needs: [
                    {
                        point: 'fix_round',
                        ticket: null,
                        key: `fix_round:final:review:${latestSeq({
                            records,
                            match: (record) =>
                                record.kind === 'final_review_fixing',
                        })}`,
                        query: () =>
                            memoryQuery({
                                text: openFindingsText({
                                    findings: fix?.findings ?? [],
                                }),
                                tail: true,
                            }),
                    },
                ],
            }
        }
        default:
            return null
    }
}

const memoryKey = ({ vault, id }: RecalledMemory): string =>
    `${vault}\u0000${id}`

/**
 * A step with its memories: a fresh agent's prompt gets the run's start
 * memories at the very top (every agent in the run shares them, so the
 * prompt's start is cached) and each point's memories at the end, next to
 * the run notes; a follow-up's message gets its fix round's at the end.
 * Memories already shown at the run's start, or earlier in the same
 * prompt, aren't repeated.
 */
const withMemories = ({
    action,
    state,
    fresh,
    needs,
}: {
    action: BuildAction
    state: RunState
    fresh: boolean
    needs: RecallNeed[]
}): BuildAction => {
    const recalls = state.memory.recalls
    const start = fresh ? (recalls[RUN_START_KEY]?.memories ?? []) : []
    const seen = new Set(start.map(memoryKey))
    const sections = needs.flatMap(({ point, key }) => {
        const memories = (recalls[key]?.memories ?? []).filter(
            (memory) => !seen.has(memoryKey(memory))
        )
        for (const memory of memories) seen.add(memoryKey(memory))
        const text = memorySection({ point, memories })
        return text === null ? [] : [text]
    })
    const top = memorySection({ point: 'run_start', memories: start })
    const wrap = (text: string): string =>
        [...(top === null ? [] : [top]), text, ...sections].join('\n\n')
    switch (action.type) {
        case 'launch_agent':
        case 'launch_lens':
        case 'launch_final_fixer':
            return { ...action, prompt: wrap(action.prompt) }
        case 'follow_up_agent':
        case 'follow_up_final_fixer':
            return { ...action, message: wrap(action.message) }
        default:
            return action
    }
}

/**
 * The step itself with its memories, or the search it waits on: the first
 * of its recall points not journaled yet, under the same ticket (so tickets
 * still search at the same time).
 */
const recallFirst = ({
    action,
    state,
    records,
}: {
    action: BuildAction
    state: RunState
    records: JournalRecord[]
}): BuildAction | MemoryAction => {
    const wanted = needsOf({ action, state, records })
    if (wanted === null) return action
    const missing = wanted.needs.find(
        ({ key }) => state.memory.recalls[key] === undefined
    )
    if (missing !== undefined) {
        return {
            type: 'recall_memories',
            point: missing.point,
            ticket: missing.ticket,
            key: missing.key,
            query: missing.query(),
        }
    }
    return withMemories({ action, state, ...wanted })
}

/** Whether every ticket of the run was skipped. */
const allSkipped = (state: RunState): boolean => {
    const numbers = (state.snapshot?.ticket_order ?? []).filter(
        (number) => state.snapshot?.tickets[number] !== undefined
    )
    return (
        numbers.length > 0 &&
        numbers.every(
            (number) => (state.tickets[number]?.skipped ?? null) !== null
        )
    )
}

/**
 * How the run is about to end, if it is: its PR opens next, the owner said
 * `stop`, or every ticket was skipped. `null` while it keeps going (or once
 * its PR is open). Refused runs, nothing to do, and billing stops never get
 * here: no agent ran, or starting one could bill per token.
 */
const endingOf = ({
    state,
    build,
}: {
    state: RunState
    build: BuildAction[]
}): RunEnding | null => {
    if (state.pull_request !== null || state.run_branch === null) return null
    if (state.stop !== null) return 'stopped_by_user'
    if (build.some(({ type }) => type === 'open_pull_request')) {
        return 'pr_opened'
    }
    return allSkipped(state) ? 'all_skipped' : null
}

/**
 * The learner's steps once the run is about to end: the learner (again
 * after a failed try, until its tries or engine failures run out, then
 * `skip_learning`), the saves, and with no PR the spec comment. `null` once
 * they are done, so the run ends as it would have.
 */
const learnerStep = ({
    state,
    records,
    ending,
    spec_number,
}: {
    state: RunState
    records: JournalRecord[]
    ending: RunEnding
    spec_number: number
}): MemoryAction | null => {
    const { learner, saved, reported, project_vault, shown } = state.memory
    if (learner.skipped !== null) return null
    if (learner.result === null) {
        const failed = learner.agent_failure
        if (failed !== null) {
            if (
                failed.failure === 'engine' &&
                learner.engine_failures >= MAX_ENGINE_FAILURES
            ) {
                return {
                    type: 'skip_learning',
                    reason: `The engine failed to run the learner ${learner.engine_failures} times in a row: ${failed.error}`,
                }
            }
            if (
                failed.failure !== 'engine' &&
                learner.failed_tries >= MAX_FIX_ROUNDS
            ) {
                return {
                    type: 'skip_learning',
                    reason: `The learner failed ${learner.failed_tries} tries; the last one: ${failed.error}`,
                }
            }
        }
        return {
            type: 'launch_learner',
            prompt: learnerPrompt({ records, state, ending }),
        }
    }
    if (saved === null) {
        const { saves, refused } = routeMemories({
            proposals: learner.result.memories,
            project_vault,
        })
        return {
            type: 'save_memories',
            saves: saves.map((save, index) => ({
                ...save,
                op_id: `luca-spec-${spec_number}-${learner.result_seq ?? 0}-${index + 1}`,
                tags: ['luca', `spec-${spec_number}`],
            })),
            refused,
            feedback: memoryFeedback({
                shown,
                helped: learner.result.helped,
            }),
        }
    }
    const count = newMemories({ saves: saved.saves }).length
    if (ending !== 'pr_opened' && !reported && count > 0) {
        return {
            type: 'report_memories',
            spec_number,
            body: memoriesComment({ spec_number, saves: saved.saves }),
            count,
        }
    }
    return null
}

/**
 * Memory's half of the decision step, over the build's steps. Pure. With
 * memory off it returns `build` as it is.
 *
 * With memory on:
 * 1. The run's start: before anything is built, one search with the spec's
 *    title and body (`run_start`), alone.
 * 2. Each step that needs a recall point it has no search for yet is
 *    swapped for that search (`recall_memories`); once searched, the
 *    memories go in its prompt or message. Fresh test-writers and
 *    implementers need their ticket's (`ticket:<n>`), and in a review fix
 *    round that round's; ticket reviewers the review's (`review:<n>:<sha>`);
 *    lenses the final review round's (`review:final:<head>`); follow-ups
 *    after a failed red check or failed gates, and review and final review
 *    fix rounds, the round's (`fix_round:...`), searched with the failure
 *    text. Failed-try follow-ups and clash fixes are no fix rounds.
 * 3. When the run is about to end with its PR, a `stop`, or every ticket
 *    skipped: the learner, its saves, and with no PR the spec comment,
 *    before anything else (always before the last worktrees are removed).
 *
 * @example
 * decideMemory({ state, records, spec_number: 10, build: decideBuild({ state, spec_number: 10 }) })
 * // [{ type: 'recall_memories', point: 'run_start', ticket: null, key: 'run_start', query: '...' }]
 */
export const decideMemory = ({
    state,
    records,
    spec_number,
    build,
}: {
    state: RunState
    records: JournalRecord[]
    spec_number: number
    build: BuildAction[]
}): (BuildAction | MemoryAction)[] => {
    if (!state.memory.on) return build
    if (state.memory.recalls[RUN_START_KEY] === undefined) {
        const spec = state.snapshot?.spec
        return [
            {
                type: 'recall_memories',
                point: 'run_start',
                ticket: null,
                key: RUN_START_KEY,
                query: memoryQuery({
                    text: `${spec?.title ?? ''}\n\n${spec?.body ?? ''}`,
                }),
            },
        ]
    }
    const ending = endingOf({ state, build })
    if (ending !== null) {
        const step = learnerStep({ state, records, ending, spec_number })
        if (step !== null) return [step]
    }
    // Five lenses wait on one search: it is asked for once.
    const steps = build.map((action, index) => ({
        index,
        step: recallFirst({ action, state, records }),
    }))
    return uniqBy(steps, ({ index, step }) =>
        step.type === 'recall_memories' ? `recall:${step.key}` : `step:${index}`
    ).map(({ step }) => step)
}
