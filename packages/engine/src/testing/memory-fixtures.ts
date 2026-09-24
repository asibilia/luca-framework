import { intakePassed } from './build-fixtures'

import type { ProposedMemory } from '../agents/role-results'
import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import type {
    MemorySave,
    RecallPoint,
    RecalledMemory,
} from '../memory/memory-schemas'

/**
 * Journal entry builders for memory (#370): a run with memory on, its
 * searches, the learner's turns, and the saves, so decision-step tests can
 * write a journal that stops anywhere along them.
 */

/** The project vault the memory fixtures use. */
export const PROJECT_VAULT = 'luca-monorepo'

/** A run whose intake passed with memory on, and these tickets. */
export const intakePassedWithMemory = ({
    tickets,
    project_vault,
}: {
    tickets: TicketSnapshot[]
    /** Defaults to `PROJECT_VAULT`; `null` for no project vault. */
    project_vault?: string | null
}): JournalEntry[] =>
    intakePassed({ tickets }).map((entry) =>
        entry.kind === 'run_started'
            ? {
                  ...entry,
                  content: {
                      ...entry.content,
                      memory: {
                          project_vault:
                              project_vault === undefined
                                  ? PROJECT_VAULT
                                  : project_vault,
                      },
                  },
              }
            : entry
    )

/** One memory shown to agents. */
export const recalledMemory = ({
    id,
    vault,
    score,
    concept,
}: {
    id: string
    /** Defaults to `default`. */
    vault?: string
    /** Defaults to 0.9. */
    score?: number
    /** Defaults to `pitfall:<id>`. */
    concept?: string
}): RecalledMemory => ({
    id,
    vault: vault ?? 'default',
    concept: concept ?? `pitfall:${id}`,
    content: `The lesson of ${id}.`,
    score: score ?? 0.9,
})

/** A search at a recall point, both vaults fine, with these memories. */
export const memoryRecalled = ({
    point,
    key,
    ticket,
    memories,
    query,
}: {
    point: RecallPoint
    /** Defaults to the point's name (the run's start's key). */
    key?: string
    /** Defaults to `null`. */
    ticket?: number | null
    /** Defaults to none. */
    memories?: RecalledMemory[]
    query?: string
}): JournalEntry => ({
    kind: 'memory_recalled',
    ticket: ticket ?? null,
    role: null,
    content: {
        point,
        key: key ?? point,
        query: query ?? 'q',
        vaults: [
            {
                vault: PROJECT_VAULT,
                ok: true,
                error: null,
                found: (memories ?? []).length,
            },
            { vault: 'default', ok: true, error: null, found: 0 },
        ],
        memories: memories ?? [],
    },
})

/** The learner's turn started. */
export const learnerStarted = (): JournalEntry => ({
    kind: 'agent_started',
    ticket: null,
    role: 'learner',
    content: { role: 'learner', prompt: 'p', follow_up_of: null },
})

/** The learner's answer. */
export const learnerFinished = ({
    memories,
    helped,
}: {
    memories?: ProposedMemory[]
    helped?: string[]
}): JournalEntry => ({
    kind: 'agent_finished',
    ticket: null,
    role: 'learner',
    content: {
        role: 'learner',
        session_id: 'learner-1',
        result: { memories: memories ?? [], helped: helped ?? [] },
    },
})

/** A learner turn that failed. */
export const learnerFailed = ({
    failure,
}: {
    failure: 'agent' | 'result' | 'guard' | 'engine'
}): JournalEntry => ({
    kind: 'agent_failed',
    ticket: null,
    role: 'learner',
    content: {
        role: 'learner',
        failure,
        error: 'The learner broke.',
        session_id: 'learner-1',
    },
})

/** A proposed memory of this type. */
export const proposedMemory = ({
    type,
    concept,
}: {
    type: string
    concept: string
}): ProposedMemory => ({
    type,
    concept,
    content: `The lesson of ${concept}.`,
    summary: `${concept} in short.`,
})

/** A saved memory: added to `default` unless told otherwise. */
export const memorySave = ({
    concept,
    outcome,
    vault,
    id,
}: {
    concept: string
    outcome?: MemorySave['outcome']
    vault?: string
    id?: string
}): MemorySave => ({
    type: concept.split(':')[0] ?? 'pitfall',
    concept,
    vault: vault ?? 'default',
    outcome: outcome ?? 'added',
    id: id ?? `id-${concept}`,
    similar: null,
    error: null,
})

/** The learner's memories were saved, with no feedback to send. */
export const memoriesSaved = ({
    saves,
}: {
    saves: MemorySave[]
}): JournalEntry => ({
    kind: 'memories_saved',
    ticket: null,
    role: null,
    content: { saves, feedback: [] },
})

/** The engine gave up on the learner. */
export const learningSkipped = (): JournalEntry => ({
    kind: 'learning_skipped',
    ticket: null,
    role: null,
    content: { reason: 'It failed.' },
})
