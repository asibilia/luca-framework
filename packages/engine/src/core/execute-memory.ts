import type { MemoryAction, MemorySaveStep } from './decide-memory'
import { buildContext, need, runTurn, type BuildDeps } from './execute-build'

import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    safeMemory,
    type MemoryDeps,
    type SafeMemory,
} from '../memory/memory-client'
import { mergeRecalled, recallVaults } from '../memory/memory-recall'
import {
    MAX_MEMORIES_PER_RECALL,
    MIN_MEMORY_SCORE,
    SIMILAR_MEMORY_SCORE,
    type MemoryFeedback,
    type MemorySave,
    type VaultSearch,
} from '../memory/memory-schemas'
import { postCommentOnce, type CommentStep } from '../tracker/post-comment-once'
import type { Tracker } from '../tracker/tracker'

/**
 * Carries out memory's steps (#370): the searches at each recall point, the
 * learner's turn, its saves and feedback, and the spec comment. Every call
 * to MuninnDB goes through `safeMemory`, so an error or a timeout is
 * journaled as a value and the run goes on.
 */

/**
 * Searches every vault of the run (the project vault and `default`) at
 * once, merges the hits by score, and journals `memory_recalled`: each
 * vault's outcome and count, and the memories to show with their scores.
 * Only reads, so a search a crash cut off is simply made again (#369).
 */
const recallMemories = async ({
    action,
    journal,
    memory,
    project_vault,
}: {
    action: Extract<MemoryAction, { type: 'recall_memories' }>
    journal: Journal
    memory: SafeMemory
    project_vault: string | null
}): Promise<void> => {
    const vaults = recallVaults({ project_vault })
    const found = await Promise.all(
        vaults.map(async (vault) => ({
            vault,
            result: await memory.recall({
                vault,
                query: action.query,
                limit: MAX_MEMORIES_PER_RECALL,
                threshold: MIN_MEMORY_SCORE,
            }),
        }))
    )
    const searches: VaultSearch[] = found.map(({ vault, result }) =>
        result.ok
            ? { vault, ok: true, error: null, found: result.value.length }
            : { vault, ok: false, error: result.error, found: 0 }
    )
    journal.append({
        kind: 'memory_recalled',
        ticket: action.ticket,
        role: null,
        content: {
            point: action.point,
            key: action.key,
            query: action.query,
            vaults: searches,
            memories: mergeRecalled({
                searches: found.map(({ vault, result }) => ({
                    vault,
                    hits: result.ok ? result.value : [],
                })),
            }),
        },
    })
}

type WriteStarted = Extract<
    JournalRecord,
    { kind: 'memory_write_started' }
>['content']
type WriteDone = Extract<
    JournalRecord,
    { kind: 'memory_write_done' }
>['content']

/**
 * The MuninnDB writes earlier tries of this `save_memories` step journaled,
 * by write key: those started and those done. Only records after the
 * step's first try's `step_started` count, so a first try finds none.
 */
type EarlierWrites = {
    started: Map<string, WriteStarted>
    done: Map<string, WriteDone>
}

const earlierWrites = ({
    records,
    step,
}: {
    records: JournalRecord[]
    step: CommentStep
}): EarlierWrites => {
    const writes: EarlierWrites = { started: new Map(), done: new Map() }
    for (const record of records) {
        if (record.seq <= step.first_seq) continue
        if (record.kind === 'memory_write_started') {
            writes.started.set(record.content.write_key, record.content)
        }
        if (record.kind === 'memory_write_done') {
            writes.done.set(record.content.write_key, record.content)
        }
    }
    return writes
}

/** The feedback error of a feedback a crash cut off, never sent again. */
export const FEEDBACK_IN_DOUBT =
    'unknown: a crash cut it off before its answer was journaled, so it was not sent again (it could count twice)'

/**
 * Makes one save's write, as its `memory_write_started` says: updates the
 * similar memory (evolve), or adds a new one (remember, with its `op_id`,
 * so MuninnDB adds it once even when repeated).
 */
const writeSave = async ({
    save,
    started,
    memory,
    spec_number,
}: {
    save: MemorySaveStep
    started: Extract<WriteStarted, { what: 'save' }>
    memory: SafeMemory
    spec_number: number
}): Promise<MemorySave> => {
    const { type, vault, concept, content, summary, op_id, tags } = save
    const base = { type, concept, vault, similar: started.similar }
    const written =
        started.update_id === null
            ? await memory.remember({
                  vault,
                  type,
                  concept,
                  content,
                  summary,
                  tags,
                  op_id,
              })
            : await memory.evolve({
                  vault,
                  id: started.update_id,
                  content,
                  reason: `The Luca learner of a run on spec #${spec_number}: ${summary || concept}`,
              })
    if (!written.ok) {
        return { ...base, outcome: 'failed', id: null, error: written.error }
    }
    return {
        ...base,
        outcome: started.update_id === null ? 'added' : 'updated',
        id: written.value.id,
        error: null,
    }
}

/**
 * Saves one memory: searches its vault for the most similar stored one,
 * updates it (evolve) when it is close enough (`SIMILAR_MEMORY_SCORE`),
 * and adds a new one otherwise. The write is journaled before
 * (`memory_write_started`) and after (`memory_write_done`). On a redo, a
 * save done is not made again (its outcome is reused), and one started but
 * not done is repeated as it started, with no new search: an update of the
 * same memory with the same content, or an add with the same `op_id`.
 */
const saveOne = async ({
    save,
    memory,
    spec_number,
    journal,
    earlier,
}: {
    save: MemorySaveStep
    memory: SafeMemory
    spec_number: number
    journal: Journal
    earlier: EarlierWrites
}): Promise<MemorySave> => {
    const write_key = `save:${save.op_id}`
    const done = earlier.done.get(write_key)
    if (done?.what === 'save') return done.save
    const finish = (outcome: MemorySave): MemorySave => {
        journal.append({
            kind: 'memory_write_done',
            ticket: null,
            role: null,
            content: { write_key, what: 'save', save: outcome },
        })
        return outcome
    }
    const inDoubt = earlier.started.get(write_key)
    if (inDoubt?.what === 'save') {
        return finish(
            await writeSave({ save, started: inDoubt, memory, spec_number })
        )
    }
    const { type, vault, concept, content, op_id } = save
    const found = await memory.recall({
        vault,
        query: `${concept}\n\n${content}`,
        limit: 1,
        threshold: 0,
    })
    if (!found.ok) {
        return finish({
            type,
            concept,
            vault,
            outcome: 'failed',
            id: null,
            similar: null,
            error: `Could not look for a similar memory: ${found.error}`,
        })
    }
    const top = found.value[0]
    const started: Extract<WriteStarted, { what: 'save' }> = {
        write_key,
        what: 'save',
        vault,
        concept,
        op_id,
        update_id:
            top !== undefined &&
            top.vector_score !== null &&
            top.vector_score >= SIMILAR_MEMORY_SCORE
                ? top.id
                : null,
        similar:
            top === undefined
                ? null
                : {
                      id: top.id,
                      score: top.score,
                      vector_score: top.vector_score,
                  },
    }
    journal.append({
        kind: 'memory_write_started',
        ticket: null,
        role: null,
        content: started,
    })
    return finish(await writeSave({ save, started, memory, spec_number }))
}

/**
 * Sends the feedback on one shown memory, journaled before and after. On a
 * redo, one done is reused, and one started but not done is not sent
 * again, since MuninnDB may have counted it: it is journaled as not ok
 * (`FEEDBACK_IN_DOUBT`).
 */
const feedbackOne = async ({
    id,
    vault,
    useful,
    memory,
    journal,
    earlier,
}: {
    id: string
    vault: string
    useful: boolean
    memory: SafeMemory
    journal: Journal
    earlier: EarlierWrites
}): Promise<MemoryFeedback> => {
    const write_key = `feedback:${vault}:${id}`
    const done = earlier.done.get(write_key)
    if (done?.what === 'feedback') return done.feedback
    const sendIt = async (): Promise<MemoryFeedback> => {
        journal.append({
            kind: 'memory_write_started',
            ticket: null,
            role: null,
            content: { write_key, what: 'feedback', vault, id, useful },
        })
        const sent = await memory.feedback({ vault, id, useful })
        return sent.ok
            ? { id, vault, useful, ok: true, error: null }
            : { id, vault, useful, ok: false, error: sent.error }
    }
    const feedback: MemoryFeedback = earlier.started.has(write_key)
        ? { id, vault, useful, ok: false, error: FEEDBACK_IN_DOUBT }
        : await sendIt()
    journal.append({
        kind: 'memory_write_done',
        ticket: null,
        role: null,
        content: { write_key, what: 'feedback', feedback },
    })
    return feedback
}

/**
 * Saves the learner's memories one by one, then sends the feedback on
 * every shown memory, each write journaled before and after it, and
 * journals it all once as `memories_saved`, the refused memories included,
 * in the action's order. Safe to redo after a crash: see `saveOne` and
 * `feedbackOne`. Throws only when the journal does.
 */
const saveMemories = async ({
    action,
    journal,
    memory,
    spec_number,
    step,
}: {
    action: Extract<MemoryAction, { type: 'save_memories' }>
    journal: Journal
    memory: SafeMemory
    spec_number: number
    step: CommentStep
}): Promise<void> => {
    const earlier = earlierWrites({ records: journal.read(), step })
    const saves: MemorySave[] = action.refused.map(
        ({ type, concept, reason }) => ({
            type,
            concept,
            vault: null,
            outcome: 'refused',
            id: null,
            similar: null,
            error: reason,
        })
    )
    for (const save of action.saves) {
        saves.push(
            await saveOne({ save, memory, spec_number, journal, earlier })
        )
    }
    const feedback: MemoryFeedback[] = []
    for (const { id, vault, useful } of action.feedback) {
        feedback.push(
            await feedbackOne({ id, vault, useful, memory, journal, earlier })
        )
    }
    journal.append({
        kind: 'memories_saved',
        ticket: null,
        role: null,
        content: { saves, feedback },
    })
}

/**
 * Carries out one of memory's steps and journals what happened. The
 * learner runs in the run branch's worktree, with the same turn machinery
 * as every agent (snapshot, after-turn check, result check, session, plan
 * cut-offs, stops); the launcher is handed the spec's number as its ticket.
 */
export const executeMemoryAction = async ({
    action,
    journal,
    tracker,
    memory,
    build,
    step,
}: {
    action: MemoryAction
    journal: Journal
    tracker: Tracker
    /** The memory client; with none, every search and save fails, journaled. */
    memory: MemoryDeps | undefined
    /** Needed for the learner. */
    build: BuildDeps | undefined
    /** Which try of its step this is: a redo reuses its first try's writes. */
    step: CommentStep
}): Promise<void> => {
    const state = replayRun({ records: journal.read() })
    switch (action.type) {
        case 'recall_memories': {
            return recallMemories({
                action,
                journal,
                memory: safeMemory({ deps: memory }),
                project_vault: state.memory.project_vault,
            })
        }
        case 'launch_learner': {
            if (build === undefined) {
                throw new Error(
                    'The engine needs a git adapter and an agent launcher to launch_learner.'
                )
            }
            const built = buildContext({ journal, tracker, ...build })
            const worktree = need({
                value: built.state.run_branch,
                what: 'run branch',
            })
            const spec_number = need({
                value: built.state.spec_number,
                what: 'spec',
            })
            journal.append({
                kind: 'agent_started',
                ticket: null,
                role: 'learner',
                content: {
                    role: 'learner',
                    prompt: action.prompt,
                    follow_up_of: null,
                },
            })
            await runTurn({
                context: built,
                worktree,
                ticket: null,
                role: 'learner',
                may_edit_tests: false,
                start: (cwd) =>
                    built.launcher.launch({
                        role: 'learner',
                        ticket: spec_number,
                        prompt: action.prompt,
                        cwd,
                        may_edit_tests: false,
                        config: built.config,
                        // The learner writes nothing and talks to nobody.
                        messaging: null,
                    }),
            })
            return
        }
        case 'skip_learning':
            journal.append({
                kind: 'learning_skipped',
                ticket: null,
                role: null,
                content: { reason: action.reason },
            })
            return
        case 'save_memories': {
            return saveMemories({
                action,
                journal,
                memory: safeMemory({ deps: memory }),
                spec_number: need({ value: state.spec_number, what: 'spec' }),
                step,
            })
        }
        case 'report_memories': {
            // Posted once: a redo adopts the comment its first try posted.
            const { id } = await postCommentOnce({
                tracker,
                number: action.spec_number,
                body: action.body,
                step,
                n: 0,
            })
            journal.append({
                kind: 'memories_reported',
                ticket: null,
                role: null,
                content: { comment_id: id, count: action.count },
            })
            return
        }
    }
}
