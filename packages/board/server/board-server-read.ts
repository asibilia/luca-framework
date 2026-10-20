/**
 * What the side panel reads and posts: `board.read` (the runs started from
 * a workspace's chats and the runs the plugin didn't start, read from their
 * journals), and `reply.post`.
 */
import { resolve } from 'node:path'

import { z } from 'zod'

import type { RunStore } from './board-server-store'
import type { BoardServerConfig, OutsideRun } from './board-server-types'
import { needsEngine } from './board-server-util'
import { readLiveFile, withLive } from './live-file'
import { createBoardState } from './reduce-board'
import type { ReplyRun } from './reply-post'
import { listJournals } from './run-journals'

import type {
    BoardReadInput,
    BoardReadOutput,
    EngineRecord,
    ReplyPostInput,
    ReplyPostOutput,
} from '../shared/board-rpc'

const RunRepoSchema = z.object({ repo: z.string().min(1) })

/** The repo a run's `run_started` record names, if any. */
const repoOf = ({ records }: { records: EngineRecord[] }): string | null => {
    const started = records.find((record) => record.kind === 'run_started')
    const parsed = RunRepoSchema.safeParse(started?.content)
    return parsed.success ? resolve(parsed.data.repo) : null
}

/** How many runs the plugin didn't start it shows, the latest changed first. */
const OUTSIDE_RUNS_SHOWN = 50

export const createBoardReads = ({
    config,
    store,
}: {
    config: BoardServerConfig
    store: RunStore
}) => {
    const { runs_dir = null } = config
    const { runs, poster, applyInOrder, journalOf, ready } = store
    const outside = new Map<string, OutsideRun>()

    /**
     * Reads the journals of runs this plugin didn't start, the latest
     * changed first: a new or changed journal is read again and its new
     * records applied.
     */
    const readOutside = async () => {
        if (runs_dir === null) return
        const journals = (await listJournals({ runs_dir }))
            .filter((journal) => !runs.has(journal.run_id))
            .slice(0, OUTSIDE_RUNS_SHOWN)
        const shown = new Set(journals.map((journal) => journal.run_id))
        for (const run_id of outside.keys()) {
            if (!shown.has(run_id)) outside.delete(run_id)
        }
        await Promise.all(
            journals.map(async ({ run_id, size, changed_ms }) => {
                const known = outside.get(run_id)
                if (known?.size === size && known.changed_ms === changed_ms) {
                    return
                }
                const records = await journalOf({ run_id })
                const first = records[0]
                if (!first) return
                const run: OutsideRun = known ?? {
                    state: createBoardState({
                        run_id,
                        spec_number: null,
                        demo: false,
                        started_at: first.time,
                        log_path: null,
                    }),
                    next_seq: 1,
                    size,
                    changed_ms,
                    repo: null,
                    engine_gone: false,
                }
                applyInOrder({ memory: run, records })
                run.size = size
                run.changed_ms = changed_ms
                run.repo ??= repoOf({ records })
                outside.set(run_id, run)
            })
        )
    }

    /**
     * `board.read`: the runs started from the workspace's chats and the runs
     * this plugin didn't start whose repo is the workspace's folder, newest
     * first, and one of them in full, with its live file laid over it.
     */
    const readBoard = async (
        input: BoardReadInput
    ): Promise<BoardReadOutput> => {
        await ready
        await readOutside()
        const directory = input.directory ? resolve(input.directory) : null
        const list = [
            ...[...runs.values()].filter(
                (memory) => memory.entry.workspace_id === input.workspace_id
            ),
            ...[...outside.values()]
                .filter((run) => directory !== null && run.repo === directory)
                .map((run) => ({
                    state: {
                        ...run.state,
                        engine_gone:
                            run.engine_gone &&
                            needsEngine({ state: run.state }),
                    },
                })),
        ]
            .map(({ state }) => state)
            .toSorted((left, right) =>
                right.run.started_at === left.run.started_at
                    ? right.run.run_id.localeCompare(left.run.run_id)
                    : right.run.started_at.localeCompare(left.run.started_at)
            )
        const selected =
            (input.run_id
                ? list.find((state) => state.run.run_id === input.run_id)
                : undefined) ?? list[0]
        const selected_id = selected?.run.run_id ?? null
        const live =
            runs_dir === null || selected_id === null
                ? null
                : await readLiveFile({ runs_dir, run_id: selected_id })
        return {
            runs: list.map((state) => ({
                run_id: state.run.run_id,
                spec_number: state.run.spec_number,
                spec_title: state.run.spec_title,
                demo: state.run.demo,
                status: state.run.status,
                started_at: state.run.started_at,
                needs_you: state.needs_you.length,
            })),
            selected:
                selected === undefined
                    ? null
                    : withLive({ state: selected, live }),
            chat_agent_id:
                selected_id === null
                    ? null
                    : (runs.get(selected_id)?.entry.agent_id ?? null),
            posted:
                selected_id === null
                    ? []
                    : poster.postedOf({ run_id: selected_id }),
        }
    }

    /**
     * `reply.post` (#503): posts a reply button's word on the run's spec
     * issue. Works for runs this plugin started and for runs it only reads
     * (their journal is read again first); see `createReplyPoster`.
     */
    const postReply = async (
        input: ReplyPostInput
    ): Promise<ReplyPostOutput> => {
        await ready
        await readOutside()
        const memory = runs.get(input.run_id)
        const other = outside.get(input.run_id)
        const run: ReplyRun | null = memory
            ? {
                  state: memory.state,
                  repo_dir: memory.entry.repo,
                  next_seq: memory.next_seq,
              }
            : other
              ? {
                    state: other.state,
                    repo_dir: other.repo,
                    next_seq: other.next_seq,
                }
              : null
        return poster.postReply({ run, input })
    }

    return { outside, readOutside, readBoard, postReply }
}
