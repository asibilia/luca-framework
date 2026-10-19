import { useMemo, useState } from 'react'

import {
    useRpc,
    useWorkspace,
    type PluginWorkspacePanelProps,
} from '@getpaseo/plugin/client'
import { ScrollView } from '@getpaseo/plugin/client/react-native'
import { useQuery } from '@tanstack/react-query'
import { Text, View } from 'react-native'

import { FOR_A_PERSON, TICKET_STAGES, type Key } from './board-panel-stages'
import { makeStyles } from './board-panel-styles'
import { FinalReviewStack } from './final-review-stack'
import { NeedsYouSection } from './needs-you-section'
import { RunFooter } from './run-footer'
import { RunHeader } from './run-header'
import { TicketStack } from './ticket-stack'

import { boardReadRpc } from '../shared/board-rpc'
import {
    EMPTY_BOARD_TEXT,
    POLL_MS,
    showsFinalReview,
} from '../shared/board-state'

/**
 * The side panel: one run of this workspace, top to bottom. Plan usage, a
 * limit-wait banner, "Needs you" pinned on top, the tickets as a stack of
 * stages (Blocked → Building → Reviewing → Testing → Fixing → Joining → Done
 * → Skipped) with step dots, then the final review's 5 lenses as a second
 * stack. It polls `board.read`.
 *
 * The sections are in their own modules: `run-header.tsx` (the top, with
 * `run-picker.tsx` and `usage-line.tsx`), `needs-you-section.tsx`,
 * `ticket-stack.tsx` (with `ticket-card-view.tsx`, `ticket-detail.tsx` and
 * `step-dots.tsx`), `final-review-stack.tsx` and `run-footer.tsx`. They share
 * `board-panel-styles.ts`, `board-panel-stages.ts` and `board-panel-parts.tsx`.
 * This module keeps what a person has opened, folded and picked.
 */

/** The workspace panel: the newest (or picked) run of this workspace. */
export const BoardPanel = ({
    theme,
    layout,
    workspaceId,
}: PluginWorkspacePanelProps) => {
    const readBoard = useRpc(boardReadRpc)
    const directory = useWorkspace(workspaceId, (found) => found.directory)
    const [picked, setPicked] = useState<Key | null>(null)
    const board = useQuery({
        queryKey: ['luca-board', workspaceId, directory, picked],
        queryFn: () =>
            readBoard({
                workspace_id: workspaceId,
                directory,
                run_id: picked,
            }),
        refetchInterval: POLL_MS,
    })
    const styles = useMemo(
        () => makeStyles({ theme, compact: layout.compact }),
        [theme, layout.compact]
    )
    const [openCards, setOpenCards] = useState<ReadonlySet<Key>>(
        () => new Set()
    )
    const [folded, setFolded] = useState<ReadonlySet<Key>>(
        () =>
            new Set<Key>([
                ...TICKET_STAGES.filter((entry) => entry.folded).map(
                    (entry) => entry.stage
                ),
                FOR_A_PERSON,
            ])
    )
    const look = { theme, styles }
    const state = board.data?.selected ?? null

    if (!state) {
        return (
            <ScrollView
                style={styles.screen}
                contentContainerStyle={styles.content}
            >
                <Text style={styles.title}>Luca board</Text>
                <Text style={styles.muted}>
                    {board.isError
                        ? `Couldn't read the board: ${String(board.error)}`
                        : board.isPending
                          ? 'Loading…'
                          : EMPTY_BOARD_TEXT}
                </Text>
            </ScrollView>
        )
    }

    const runs = board.data?.runs ?? []
    const posted = board.data?.posted ?? []
    const chat_agent_id = board.data?.chat_agent_id ?? null

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={styles.content}
        >
            <RunHeader
                state={state}
                runs={runs}
                setPicked={setPicked}
                layout={layout}
                {...look}
            />
            <NeedsYouSection
                state={state}
                posted={posted}
                chat_agent_id={chat_agent_id}
                {...look}
            />
            <TicketStack
                state={state}
                folded={folded}
                setFolded={setFolded}
                openCards={openCards}
                setOpenCards={setOpenCards}
                {...look}
            />
            {showsFinalReview({ state }) ? (
                <>
                    <View style={styles.rule} />
                    <FinalReviewStack state={state} {...look} />
                </>
            ) : null}
            <RunFooter state={state} styles={styles} />
        </ScrollView>
    )
}
