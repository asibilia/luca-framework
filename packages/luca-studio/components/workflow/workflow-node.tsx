'use client'

import { useCallback, useState } from 'react'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
    Activity,
    Bot,
    Brain,
    ChevronDown,
    Copy,
    Edit,
    EllipsisVertical,
    Eye,
    EyeOff,
    Hexagon,
    LayoutDashboard,
    Search,
    Settings,
    Shield,
    SlidersHorizontal,
    Trash2,
    Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { cn } from '~/lib/utils'

// -- Icon Map -----------------------------------------------------------------

/**
 * Map of Lucide icon string names to components.
 *
 * Workflow nodes reference icons by string name in their data. This map
 * resolves those strings to actual Lucide components at render time.
 * Add entries here as new icons are needed by pipeline steps.
 */
const ICON_MAP: Record<string, LucideIcon> = {
    Activity,
    Bot,
    Brain,
    ChevronDown,
    Hexagon,
    LayoutDashboard,
    Search,
    Settings,
    Shield,
    SlidersHorizontal,
    Workflow,
}

// -- Types --------------------------------------------------------------------

/** Domain categories for pipeline workflow steps. */
type WorkflowDomain = 'planning' | 'execution' | 'verification' | 'learning'

/** Status of a workflow step. */
type WorkflowStatus = 'enabled' | 'disabled' | 'error'

/** Data shape passed via React Flow's `data` prop to WorkflowNode. */
export interface WorkflowNodeData {
    /** Display name of the pipeline step. */
    label: string
    /** Lucide icon name (must exist in ICON_MAP). */
    icon: string
    /** Domain category controlling the left accent color. */
    domain: WorkflowDomain
    /** Model tier label (e.g., "balanced", "capable", "fast"). */
    modelTier: string
    /** Number of agents assigned to this step. */
    agentCount: number
    /** Maximum iteration budget for this step. */
    iterationBudget: number
    /** Current status of the step. */
    status: WorkflowStatus
    /** Callback for overflow menu actions. */
    onOverflowAction?: (action: string) => void
    [key: string]: unknown
}

// -- Constants ----------------------------------------------------------------

/** Handle styling consistent with the existing node-card.tsx pattern. */
const HANDLE_CLASS =
    '!bg-muted-foreground/40 !border-border/40 !w-2 !h-2 !border'

/** Domain-to-border-color mapping per the brainstorm spec. */
const DOMAIN_BORDER: Record<WorkflowDomain, string> = {
    planning: 'border-l-blue-500',
    execution: 'border-l-green-500',
    verification: 'border-l-amber-500',
    learning: 'border-l-purple-500',
}

/** Status pill color and label configuration. */
const STATUS_CONFIG: Record<
    WorkflowStatus,
    { label: string; bg: string; text: string }
> = {
    enabled: {
        label: 'Enabled',
        bg: 'bg-green-500/15',
        text: 'text-green-600 dark:text-green-400',
    },
    disabled: {
        label: 'Disabled',
        bg: 'bg-muted',
        text: 'text-muted-foreground',
    },
    error: {
        label: 'Error',
        bg: 'bg-destructive/15',
        text: 'text-destructive',
    },
}

// -- Component ----------------------------------------------------------------

/**
 * Custom React Flow node for pipeline workflow steps.
 *
 * Renders a 280px fixed-width card with:
 * - Domain-colored left accent border (2px)
 * - Header with icon and step name
 * - Metadata row (model tier, agent count, iteration budget)
 * - Footer with status pill and overflow action menu
 * - Source (bottom) and target (top) handles for edge connections
 * - Selected state ring highlight
 *
 * @example
 * ```tsx
 * const nodeTypes = { workflowStep: WorkflowNode };
 * // In React Flow: <ReactFlow nodeTypes={nodeTypes} nodes={nodes} />
 * ```
 */
export function WorkflowNode({ data, selected }: NodeProps) {
    const [menuOpen, setMenuOpen] = useState(false)

    const nodeData = data as unknown as WorkflowNodeData
    const Icon = ICON_MAP[nodeData.icon]
    const statusConfig = STATUS_CONFIG[nodeData.status] ?? STATUS_CONFIG.enabled
    const borderClass =
        DOMAIN_BORDER[nodeData.domain] ?? DOMAIN_BORDER.execution

    const handleAction = useCallback(
        (action: string) => {
            nodeData.onOverflowAction?.(action)
            setMenuOpen(false)
        },
        [nodeData]
    )

    const isEnabled = nodeData.status === 'enabled'

    return (
        <div
            className={cn(
                'w-[280px] rounded-lg border-l-2 border bg-card/95 shadow-md shadow-black/10 overflow-hidden',
                borderClass,
                selected && 'ring-2 ring-primary'
            )}
        >
            <Handle
                type="target"
                position={Position.Top}
                className={HANDLE_CLASS}
            />

            {/* Header: icon + step name */}
            <div className="flex items-center gap-2 px-3 py-2">
                {Icon ? (
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                    <span className="flex size-4 shrink-0 items-center justify-center font-mono text-[10px] text-muted-foreground">
                        {nodeData.icon.charAt(0)}
                    </span>
                )}
                <span className="truncate text-sm font-medium text-foreground">
                    {nodeData.label}
                </span>
            </div>

            {/* Separator */}
            <div className="mx-3 h-px bg-border" />

            {/* Metadata row */}
            <div className="px-3 py-1.5 space-y-0.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                        Model tier:{' '}
                        <span className="text-foreground">
                            {nodeData.modelTier}
                        </span>
                    </span>
                    <span>
                        Agents:{' '}
                        <span className="text-foreground">
                            {nodeData.agentCount}
                        </span>
                    </span>
                </div>
                <div className="text-xs text-muted-foreground">
                    Budget:{' '}
                    <span className="text-foreground">
                        {nodeData.iterationBudget} iteration
                        {nodeData.iterationBudget !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Separator */}
            <div className="mx-3 h-px bg-border" />

            {/* Footer: status pill + overflow menu */}
            <div className="flex items-center justify-between px-3 py-1.5">
                {/* Status pill */}
                <span
                    className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                        statusConfig.bg,
                        statusConfig.text
                    )}
                >
                    {statusConfig.label}
                </span>

                {/* Overflow menu */}
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground"
                            aria-label="Step actions"
                        >
                            <EllipsisVertical className="size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => handleAction('edit')}>
                            <Edit className="size-4" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => handleAction('duplicate')}
                        >
                            <Copy className="size-4" />
                            Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() =>
                                handleAction(isEnabled ? 'disable' : 'enable')
                            }
                        >
                            {isEnabled ? (
                                <EyeOff className="size-4" />
                            ) : (
                                <Eye className="size-4" />
                            )}
                            {isEnabled ? 'Disable' : 'Enable'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => handleAction('delete')}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="size-4" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Handle
                type="source"
                position={Position.Bottom}
                className={HANDLE_CLASS}
            />
        </div>
    )
}
