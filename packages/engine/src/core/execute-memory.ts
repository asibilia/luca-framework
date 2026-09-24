import type { MemoryAction, MemorySaveStep } from './decide-memory'
import { buildContext, need, runTurn, type BuildDeps } from './execute-build'

import type { Journal } from '../journal/journal'
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

/**
 * Saves one memory: searches its vault for the most similar stored one,
 * updates it (evolve) when it is close enough (`SIMILAR_MEMORY_SCORE`),
 * and adds a new one otherwise.
 */
const saveOne = async ({
    save,
    memory,
    spec_number,
}: {
    save: MemorySaveStep
    memory: SafeMemory
    spec_number: number
}): Promise<MemorySave> => {
    const { type, vault, concept, content, summary, op_id, tags } = save
    const base = { type, concept, vault }
    const found = await memory.recall({
        vault,
        query: `${concept}\n\n${content}`,
        limit: 1,
        threshold: 0,
    })
    if (!found.ok) {
        return {
            ...base,
            outcome: 'failed',
            id: null,
            similar: null,
            error: `Could not look for a similar memory: ${found.error}`,
        }
    }
    const top = found.value[0]
    const similar =
        top === undefined
            ? null
            : { id: top.id, score: top.score, vector_score: top.vector_score }
    if (
        top !== undefined &&
        top.vector_score !== null &&
        top.vector_score >= SIMILAR_MEMORY_SCORE
    ) {
        const evolved = await memory.evolve({
            vault,
            id: top.id,
            content,
            reason: `The Luca learner of a run on spec #${spec_number}: ${summary || concept}`,
        })
        return evolved.ok
            ? {
                  ...base,
                  outcome: 'updated',
                  id: evolved.value.id,
                  similar,
                  error: null,
              }
            : {
                  ...base,
                  outcome: 'failed',
                  id: null,
                  similar,
                  error: evolved.error,
              }
    }
    const added = await memory.remember({
        vault,
        type,
        concept,
        content,
        summary,
        tags,
        op_id,
    })
    return added.ok
        ? {
              ...base,
              outcome: 'added',
              id: added.value.id,
              similar,
              error: null,
          }
        : { ...base, outcome: 'failed', id: null, similar, error: added.error }
}

/**
 * Saves the learner's memories one by one, then sends the feedback on
 * every shown memory, and journals it all once as `memories_saved`, the
 * refused memories included. Never throws.
 */
const saveMemories = async ({
    action,
    journal,
    memory,
    spec_number,
}: {
    action: Extract<MemoryAction, { type: 'save_memories' }>
    journal: Journal
    memory: SafeMemory
    spec_number: number
}): Promise<void> => {
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
        saves.push(await saveOne({ save, memory, spec_number }))
    }
    const feedback: MemoryFeedback[] = []
    for (const { id, vault, useful } of action.feedback) {
        const sent = await memory.feedback({ vault, id, useful })
        feedback.push({
            id,
            vault,
            useful,
            ok: sent.ok,
            error: sent.ok ? null : sent.error,
        })
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
}: {
    action: MemoryAction
    journal: Journal
    tracker: Tracker
    /** The memory client; with none, every search and save fails, journaled. */
    memory: MemoryDeps | undefined
    /** Needed for the learner. */
    build: BuildDeps | undefined
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
            })
        }
        case 'report_memories': {
            const { id } = await tracker.comment({
                number: action.spec_number,
                body: action.body,
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
