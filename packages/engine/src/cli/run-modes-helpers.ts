import type { RunLauncher } from './run-modes'

import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import {
    createBoardSync,
    type BoardEnded,
    type BoardLink,
} from '../board/board-sync'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'

/**
 * What the run modes' end-to-end tests share: a stand-in for the Claude
 * launcher, a board that keeps what it is sent, and readers of a run's journal.
 */

/**
 * A stand-in for the Claude launcher: scripted turns, plus a `closeAll`
 * that counts its calls.
 */
export const fakeClaudeLauncher = ({ turns }: { turns: ScriptedTurn[] }) => {
    const scripted = createScriptedLauncher({ turns })
    let closed = 0
    const launcher: RunLauncher = {
        launch: scripted.launch,
        followUp: scripted.followUp,
        closeSession: scripted.closeSession,
        closeAll: async () => {
            closed += 1
        },
    }
    return { launcher, closed: () => closed, launches: scripted.launches }
}

/** A board that keeps everything it is sent. */
export const recordingBoard = () => {
    const kinds: string[] = []
    const seqs: number[] = []
    const endings: BoardEnded[] = []
    const link: BoardLink = {
        send: async ({ records, ended }) => {
            for (const record of records) {
                if (record.seq === seqs.length + 1) {
                    seqs.push(record.seq)
                    kinds.push(record.kind)
                }
            }
            if (ended !== null) endings.push(ended)
            return { ok: true, next_seq: seqs.length + 1, message: 'ok' }
        },
    }
    return {
        board: createBoardSync({ link }),
        /** The kinds it got, without the scheduler's step records. */
        kinds: () =>
            kinds.filter(
                (kind) =>
                    kind !== 'step_started' &&
                    kind !== 'step_ended' &&
                    kind !== 'run_resumed'
            ),
        endings: () => endings,
    }
}

/** The records of run `run_id` in `runs_dir`. */
export const recordsOf = ({
    runs_dir,
    run_id,
}: {
    runs_dir: string
    run_id: string
}): JournalRecord[] =>
    createJournal({ file: runJournalPath({ runs_dir, run_id }) }).read()

/** The kinds of a run's records, oldest first. */
export const kindsIn = (records: JournalRecord[]) =>
    records.map(({ kind }) => kind)
