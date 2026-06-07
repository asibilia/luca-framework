'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useSetAtom } from 'jotai'
import { Bot, Loader2 } from 'lucide-react'

import { AgentTabContainer } from '~/components/agents/agent-tab-container'
import { EntityTree } from '~/components/editor/entity-tree'
import type { EntityItem } from '~/components/editor/entity-tree'
import { NavigationGuard } from '~/components/feedback/navigation-guard'
import { SaveBar } from '~/components/feedback/save-bar'
import { DiffPreview } from '~/components/shared/diff-preview'
import { Skeleton } from '~/components/ui/skeleton'
import { useAgentDetail } from '~/hooks/use-agent-detail'
import { useAgentList } from '~/hooks/use-agent-list'
import { useAgentSave } from '~/hooks/use-agent-save'
import { useDirtyTitle } from '~/hooks/use-dirty-title'
import { useEditMode } from '~/hooks/use-edit-mode'
import { useEntityConflict } from '~/hooks/use-entity-conflict'
import { useUndo } from '~/hooks/use-undo'
import { agentHistoryAtom } from '~/stores/entity-atoms'
import {
    entitySidebarAtom,
    layoutContextAtom,
    setGlobalSaveCallbackAtom,
} from '~/stores/layout'

/**
 * Agents browser page.
 *
 * Three-column layout: EntityTree (left) | Tab editor (center).
 * Supports browsing all agents, viewing config/prompt/source/compiled tabs,
 * editing configuration, and saving changes with ETag concurrency.
 *
 * The compiled preview is available in the "Compiled" tab within the editor.
 * A docked DetailPanel preview will be added in a future enhancement when the
 * root layout supports dynamic detail content injection.
 */
export default function AgentsPage() {
    const [selectedName, setSelectedName] = useState<string | null>(null)
    const setLayoutContext = useSetAtom(layoutContextAtom)
    const setEntitySidebar = useSetAtom(entitySidebarAtom)

    // Set editor layout context on mount (collapses NavRail)
    useEffect(() => {
        setLayoutContext('editor')
        return () => {
            setLayoutContext('dashboard')
        }
    }, [setLayoutContext])

    // Fetch agent list
    const { agents, loading: listLoading } = useAgentList()

    // Fetch selected agent detail
    const {
        detail,
        loading: detailLoading,
        etag,
    } = useAgentDetail(selectedName)

    // Undo/redo for the selected agent's draft
    useUndo(agentHistoryAtom(selectedName ?? '__noop__'))

    // Map API summaries to EntityTree items
    const entityItems: EntityItem[] = useMemo(() => {
        return agents.map((agent) => {
            // Derive directory from filePath: extract the subdir (general/ or luca/)
            const pathParts = agent.filePath.split('/')
            const srcIdx = pathParts.indexOf('agents')
            const directory =
                srcIdx >= 0 && srcIdx + 1 < pathParts.length
                    ? `${pathParts[srcIdx + 1]}/`
                    : 'unknown/'
            return {
                name: agent.name,
                directory,
                type: 'agent' as const,
            }
        })
    }, [agents])

    // Push entity tree into the LayoutShell entity sidebar slot
    useEffect(() => {
        setEntitySidebar(
            <div className="flex h-full flex-col pt-2">
                <div className="px-2 pb-1.5">
                    <h2 className="text-xs font-semibold text-muted-foreground">
                        Agents
                    </h2>
                </div>
                {listLoading ? (
                    <div className="space-y-1 px-2">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Skeleton key={i} className="h-7 w-full" />
                        ))}
                    </div>
                ) : (
                    <EntityTree
                        entities={entityItems}
                        selectedName={selectedName}
                        onSelect={setSelectedName}
                        className="flex-1 overflow-y-auto"
                    />
                )}
            </div>
        )
        return () => setEntitySidebar(null)
    }, [
        entityItems,
        listLoading,
        selectedName,
        setSelectedName,
        setEntitySidebar,
    ])

    // Save/discard integration
    const { save, discard } = useAgentSave(selectedName, etag)

    // Edit mode for the selected entity
    const entityKey = selectedName ? `agent:${selectedName}` : ''
    const editMode = useEditMode(entityKey, discard)

    // Browser tab title signal
    useDirtyTitle('agent:')

    const handleSave = useCallback(async () => {
        await save()
        editMode.forceExit()
    }, [save, editMode])

    const handleDiscard = useCallback(() => {
        discard()
        editMode.forceExit()
    }, [discard, editMode])

    // Conflict resolution via shared hook
    const {
        entityConflict,
        handleAcceptLocal,
        handleAcceptServer,
        handleDismissConflict,
    } = useEntityConflict({
        entityKey,
        endpoint: '/api/entities/agents',
        name: selectedName,
        metadata: detail?.metadata ?? {},
        discard,
    })

    // Register save callback for centralized Cmd+S shortcut
    const setSaveCallback = useSetAtom(setGlobalSaveCallbackAtom)
    useEffect(() => {
        setSaveCallback(() => save())
        return () => setSaveCallback(null)
    }, [save, setSaveCallback])

    return (
        <div className="flex h-full flex-col">
            {/* Conflict resolution dialog */}
            {entityConflict && (
                <DiffPreview
                    localContent={entityConflict.localContent}
                    serverContent={entityConflict.serverContent}
                    onAcceptLocal={handleAcceptLocal}
                    onAcceptServer={handleAcceptServer}
                    onDismiss={handleDismissConflict}
                />
            )}

            {/* Editor area (entity tree is rendered via entitySidebarAtom in LayoutShell) */}
            <div className="flex h-full flex-col overflow-hidden">
                {!selectedName ? (
                    <EmptyState />
                ) : detailLoading ? (
                    <LoadingState />
                ) : detail ? (
                    <AgentTabContainer
                        name={selectedName}
                        detail={detail}
                        isEditing={editMode.isEditing}
                        onEnterEdit={editMode.enterEdit}
                        onExitEdit={editMode.exitEdit}
                    />
                ) : (
                    <EmptyState />
                )}

                {/* Save bar scoped to agent entities -- only visible in edit mode */}
                {editMode.isEditing && (
                    <SaveBar
                        onSave={handleSave}
                        onDiscard={handleDiscard}
                        entityFilter="agent:"
                    />
                )}

                {/* Navigation guard for unsaved changes */}
                <NavigationGuard
                    when={editMode.isEditing && editMode.isDirty}
                    showDialog={editMode.showExitConfirm}
                    onConfirm={editMode.confirmExit}
                    onCancel={editMode.cancelExit}
                />
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Internal: Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Bot className="size-10 opacity-30" />
            <p className="text-sm">Select an agent to view its configuration</p>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Internal: Loading state
// ---------------------------------------------------------------------------

function LoadingState() {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-sm">Loading agent configuration...</p>
        </div>
    )
}
