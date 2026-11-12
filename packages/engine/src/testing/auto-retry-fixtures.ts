import {
    agentFailed,
    baselineTests,
    BUILD_CONFIG,
    intakePassed,
    runBranchCreated,
    testsWritten,
    ticketBuilt,
    ticketStuck,
    ticketWorktreeCreated,
    withInstalls,
} from './build-fixtures'
import { specIssue, ticketIssue } from './intake-fixtures'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import type { EngineConfig } from '../config/engine-config'
import type { EngineAction } from '../core/decide'
import { runEngine, startRun } from '../core/execute'
import { createGitAdapter } from '../git/git-adapter'
import type { TicketSnapshot } from '../intake/intake-schemas'
import { createJournal, runJournalPath, type Journal } from '../journal/journal'
import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import type { EngineClock } from '../limits/limit-wait'
import {
    createInMemoryTracker,
    type InMemoryTracker,
} from '../tracker/in-memory-tracker'
import type { Tracker } from '../tracker/tracker'

/**
 * Fixtures for the engine's own retry of a routine stuck item (#705): a run
 * whose intake the engine read from the in-memory tracker, entries appended
 * after it, and the engine run on from there until it would start an agent,
 * wait for a reply, or end, so a test sees what it journaled and posted.
 */

/** The exact comments of an automatic retry. */
export const TICKET_RETRY_TEXT =
    "Luca retried #12 by itself after agent_failed. If it gets stuck the same way again, it'll wait for a reply."
export const FINAL_RETRY_TEXT =
    "Luca retried the final review by itself after agent_failed. If it gets stuck the same way again, it'll wait for a reply."
export const RUN_RETRY_TEXT =
    "Luca retried the run by itself after pull_request_failed. If it gets stuck the same way again, it'll wait for a reply."

/** The config of these runs: the engine's retry left at its default unless set. */
export const AUTO_CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

/** The actions the engine stops before: past the retry, nothing more runs. */
const STOPS: EngineAction['type'][] = [
    'launch_agent',
    'follow_up_agent',
    'wait_for_reply',
    'run_baseline_tests',
    'install_dependencies',
    'create_ticket_worktree',
    'start_final_review',
    'launch_lens',
    'start_final_fix',
    'launch_final_fixer',
    'run_final_slow_tests',
    'pass_final_review',
    // The PR's story's agent (#743), like every other agent's turn.
    'launch_story_writer',
    'remove_worktrees',
]

/** A clock that only moves when the engine sleeps on it. */
const fakeClock = (): EngineClock => {
    let now = Date.parse('2026-10-30T12:00:00.000Z')
    return {
        now: () => now,
        sleep: async (ms) => {
            now += ms
        },
    }
}

/** A fresh journal for run `run_id` in `runs_dir`. */
export const journalIn = ({
    runs_dir,
    run_id = 'run',
}: {
    runs_dir: string
    run_id?: string
}): Journal => createJournal({ file: runJournalPath({ runs_dir, run_id }) })

/** Spec #10 with ticket #12, "Add product", owned by the spec's owner. */
export const productTracker = (): InMemoryTracker =>
    createInMemoryTracker({
        issues: [
            specIssue({ number: 10 }),
            ticketIssue({ number: 12, title: 'Add product' }),
        ],
        sub_tickets: { 10: [12] },
    })

/** Runs the engine on from the journal as it is, until a stop. */
export const runOn = ({
    journal,
    tracker,
    runs_dir,
}: {
    journal: Journal
    tracker: Tracker
    runs_dir: string
}): Promise<EngineAction> =>
    runEngine({
        journal,
        tracker,
        git: createGitAdapter({ repo_root: runs_dir }),
        launcher: createScriptedLauncher({ turns: [] }),
        clock: fakeClock(),
        log: () => undefined,
        stop_before: STOPS,
    })

/** Starts a run with `config` and lets the engine read its intake. */
export const intakeRead = async ({
    journal,
    tracker,
    config,
}: {
    journal: Journal
    tracker: Tracker
    config?: EngineConfig
}): Promise<void> => {
    startRun({ journal, spec_number: 10, config: config ?? AUTO_CONFIG })
    await runEngine({
        journal,
        tracker,
        log: () => undefined,
        stop_before: ['create_run_branch'],
    })
}

/** Appends entries to the journal, with an install after each new worktree. */
export const appendAll = ({
    journal,
    entries,
}: {
    journal: Journal
    entries: JournalEntry[]
}): void => {
    for (const entry of withInstalls({ entries })) journal.append(entry)
}

/** #12's run branch, worktree, baseline, tests and red commit. */
export const productTestsCommitted = (): JournalEntry[] => [
    runBranchCreated(),
    ticketWorktreeCreated({ ticket: 12 }),
    baselineTests({ ticket: 12 }),
    testsWritten({ ticket: 12 }),
    ...ticketBuilt({ ticket: 12 }).slice(3, 6),
]

/** #12's implementer failing once per failure kind, then #12 stuck as agent_failed. */
export const implementerFailed = (
    failures: ('agent' | 'result' | 'guard' | 'engine')[]
): JournalEntry[] => [
    ...failures.map((failure, index) =>
        agentFailed({
            ticket: 12,
            role: 'implementer',
            failure,
            session_id: `impl-${index + 1}`,
        })
    ),
    ticketStuck({
        ticket: 12,
        reason: 'agent_failed',
        detail: 'The implementer failed 3 tries; the last one: It broke.',
    }),
]

/** An `auto_retried` record as the engine journals it. */
export const autoRetried = ({
    item,
    ticket,
    reason,
    comment_id,
    body,
}: {
    item: 'ticket' | 'final_review' | 'run'
    ticket: number | null
    reason: string
    comment_id: number
    body: string
}): JournalEntry => ({
    kind: 'auto_retried',
    ticket,
    role: null,
    content: { item, reason, comment_id, body },
})

/** Intake passed with these tickets, on `config` (BUILD_CONFIG with the retry on). */
export const intakeWith = ({
    tickets,
    config,
}: {
    tickets: TicketSnapshot[]
    config?: EngineConfig
}): JournalEntry[] =>
    intakePassed({ tickets }).map((entry) =>
        entry.kind === 'run_started'
            ? {
                  ...entry,
                  content: {
                      ...entry.content,
                      config: config ?? { ...BUILD_CONFIG, auto_retry: true },
                  },
              }
            : entry
    )

/** The records of one kind. */
export const ofKind = <Kind extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: Kind
): Extract<JournalRecord, { kind: Kind }>[] =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: Kind }> =>
            record.kind === kind
    )
