import type { PluginClientContext } from '@getpaseo/plugin/client'

import { BoardPanel } from './client/board-panel'
import { EngineSettingsScreen } from './client/engine-settings-screen'
import {
    EventRowLine,
    LimitRowCard,
    RunRowCard,
    StuckRowCard,
} from './client/timeline-rows'
import {
    EventRowSchema,
    LimitRowSchema,
    ROW_KIND,
    ROW_VERSION,
    RunRowSchema,
    StuckRowSchema,
} from './shared/board-rows'
import { runStartRpc } from './shared/board-rpc'
import { RUN_USAGE } from './shared/board-state'

/** The board panel's id. */
const PANEL_ID = 'board'

/**
 * The board plugin's app side: the `/luca-run` slash command, the side panel
 * (a workspace tab, also in the Explorer), Command Center items to open it,
 * the chat row renderers, and the engine settings screen.
 */
const contribute = (client: PluginClientContext) => {
    client.addSlashCommand({
        name: 'luca-run',
        description:
            'Start a Luca run for a spec: live rows here, and the Luca board panel',
        argumentHint: RUN_USAGE.replace('/luca-run ', ''),
        context: 'agent',
        onSubmit: async ({ args, agent, workspace, rpc, openPanel }) => {
            const result = await rpc(runStartRpc, {
                agent_id: agent.id,
                workspace_id: workspace.id,
                cwd: agent.cwd,
                args,
            })
            // Paseo shows a thrown error as a toast.
            if (!result.ok) throw new Error(result.message)
            openPanel(PANEL_ID)
        },
    })

    client.addWorkspacePanel({
        id: PANEL_ID,
        title: 'Luca board',
        icon: 'Kanban',
        context: 'workspace',
        locations: ['workspace', 'explorer'],
        Component: BoardPanel,
    })
    client.addCommandCenterItem({
        id: 'open-board',
        title: 'Luca board',
        icon: 'Kanban',
        keywords: ['luca', 'board', 'run', 'tickets', 'stages'],
        context: 'workspace',
        onSelect: ({ openPanel }) => openPanel(PANEL_ID),
    })
    client.addCommandCenterItem({
        id: 'open-board-explorer',
        title: 'Luca board in the Explorer',
        icon: 'Kanban',
        keywords: ['luca', 'board', 'explorer'],
        context: 'workspace',
        onSelect: ({ openPanel }) =>
            openPanel(PANEL_ID, { location: 'explorer' }),
    })

    client.addTimelineRenderer({
        kind: ROW_KIND.run,
        version: ROW_VERSION,
        schema: RunRowSchema,
        Component: RunRowCard,
    })
    client.addTimelineRenderer({
        kind: ROW_KIND.event,
        version: ROW_VERSION,
        schema: EventRowSchema,
        Component: EventRowLine,
    })
    client.addTimelineRenderer({
        kind: ROW_KIND.stuck,
        version: ROW_VERSION,
        schema: StuckRowSchema,
        Component: StuckRowCard,
    })
    client.addTimelineRenderer({
        kind: ROW_KIND.limit,
        version: ROW_VERSION,
        schema: LimitRowSchema,
        Component: LimitRowCard,
    })

    client.addSettingsScreen({
        id: 'engine',
        title: 'Engine',
        icon: 'Settings',
        Component: EngineSettingsScreen,
    })

    return () => {}
}

export default contribute
