'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
    Bot,
    Compass,
    Eye,
    FileText,
    Hexagon,
    Home,
    Keyboard,
    PanelRight,
    Save,
    Settings,
    Shield,
    Sidebar,
    Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { cn } from '~/lib/utils'
import {
    commandPaletteOpenAtom,
    compiledPreviewOpenAtom,
    detailPanelStateAtom,
    globalSaveCallbackAtom,
    navRailExpandedAtom,
} from '~/stores/layout'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Command = {
    /** Unique identifier for the command. */
    id: string
    /** Display name shown in the palette. */
    label: string
    /** Category for grouping (Navigate, Action). */
    category: 'Navigate' | 'Action'
    /** Lucide icon component. */
    icon: LucideIcon
    /** Keyboard shortcut hint (displayed as badge). */
    shortcut?: string
    /** Action to execute when selected. */
    action: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Searchable command palette overlay triggered by Cmd+K.
 *
 * Renders as a centered modal with backdrop blur. Provides fuzzy search
 * over navigation routes and action commands. Arrow key navigation with
 * highlighted selection. Enter to execute, Escape to close.
 *
 * Reads `commandPaletteOpenAtom` to show/hide. Mounts via LayoutShell.
 *
 * @example
 * ```tsx
 * // In layout-shell.tsx
 * <CommandPalette />
 * ```
 */
export function CommandPalette() {
    const [open, setOpen] = useAtom(commandPaletteOpenAtom)
    const router = useRouter()
    const inputRef = useRef<HTMLInputElement>(null)

    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Atom setters for action commands
    const saveCallback = useAtomValue(globalSaveCallbackAtom)
    const setNavRailExpanded = useSetAtom(navRailExpandedAtom)
    const setDetailPanelState = useSetAtom(detailPanelStateAtom)
    const setCompiledPreviewOpen = useSetAtom(compiledPreviewOpenAtom)

    // Close helper
    const close = useCallback(() => {
        setOpen(false)
        setQuery('')
        setSelectedIndex(0)
    }, [setOpen])

    // Build command list
    const commands: Command[] = useMemo(() => {
        const navigate = (path: string) => {
            router.push(path)
            close()
        }

        return [
            // Navigation commands
            {
                id: 'nav-home',
                label: 'Home',
                category: 'Navigate' as const,
                icon: Home,
                action: () => navigate('/'),
            },
            {
                id: 'nav-agents',
                label: 'Agents',
                category: 'Navigate' as const,
                icon: Bot,
                action: () => navigate('/agents'),
            },
            {
                id: 'nav-skills',
                label: 'Skills',
                category: 'Navigate' as const,
                icon: Hexagon,
                action: () => navigate('/skills'),
            },
            {
                id: 'nav-rules',
                label: 'Rules',
                category: 'Navigate' as const,
                icon: Shield,
                action: () => navigate('/rules'),
            },
            {
                id: 'nav-config',
                label: 'Config',
                category: 'Navigate' as const,
                icon: Settings,
                action: () => navigate('/config'),
            },
            {
                id: 'nav-pipeline',
                label: 'Pipeline',
                category: 'Navigate' as const,
                icon: Workflow,
                action: () => navigate('/pipeline'),
            },
            {
                id: 'nav-memory',
                label: 'Memory',
                category: 'Navigate' as const,
                icon: Compass,
                action: () => navigate('/memory'),
            },
            {
                id: 'nav-settings',
                label: 'Settings',
                category: 'Navigate' as const,
                icon: FileText,
                action: () => navigate('/settings'),
            },
            // Action commands
            {
                id: 'action-save',
                label: 'Save',
                category: 'Action' as const,
                icon: Save,
                shortcut: 'Cmd+S',
                action: () => {
                    if (saveCallback) void saveCallback()
                    close()
                },
            },
            {
                id: 'action-toggle-nav',
                label: 'Toggle Nav Rail',
                category: 'Action' as const,
                icon: Sidebar,
                shortcut: 'Cmd+\\',
                action: () => {
                    setNavRailExpanded((prev) => !prev)
                    close()
                },
            },
            {
                id: 'action-toggle-detail',
                label: 'Toggle Detail Panel',
                category: 'Action' as const,
                icon: PanelRight,
                shortcut: 'Cmd+.',
                action: () => {
                    setDetailPanelState((prev) =>
                        prev === 'closed' ? 'docked' : 'closed'
                    )
                    close()
                },
            },
            {
                id: 'action-preview',
                label: 'Preview Compiled Output',
                category: 'Action' as const,
                icon: Eye,
                shortcut: 'Cmd+Shift+P',
                action: () => {
                    setCompiledPreviewOpen((prev) => !prev)
                    close()
                },
            },
        ]
    }, [
        close,
        router,
        saveCallback,
        setCompiledPreviewOpen,
        setDetailPanelState,
        setNavRailExpanded,
    ])

    // Fuzzy filter
    const filtered = useMemo(() => {
        if (!query.trim()) return commands
        const lower = query.toLowerCase()
        return commands.filter((cmd) => cmd.label.toLowerCase().includes(lower))
    }, [commands, query])

    // Reset selection when filter changes
    useEffect(() => {
        setSelectedIndex(0)
    }, [filtered.length])

    // Focus input on open
    useEffect(() => {
        if (open) {
            // Small delay to ensure DOM is ready
            requestAnimationFrame(() => {
                inputRef.current?.focus()
            })
        }
    }, [open])

    // Handle keyboard navigation within the palette
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex((prev) =>
                    prev < filtered.length - 1 ? prev + 1 : 0
                )
                return
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : filtered.length - 1
                )
                return
            }

            if (e.key === 'Enter' && filtered.length > 0) {
                e.preventDefault()
                filtered[selectedIndex]?.action()
                return
            }

            if (e.key === 'Escape') {
                e.preventDefault()
                close()
            }
        },
        [close, filtered, selectedIndex]
    )

    if (!open) return null

    // Group filtered commands by category
    const navigateCommands = filtered.filter((c) => c.category === 'Navigate')
    const actionCommands = filtered.filter((c) => c.category === 'Action')

    // Build flat index mapping for arrow key navigation
    let flatIndex = 0

    return (
        // Backdrop
        <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[20vh]"
            onClick={(e) => {
                // Close on backdrop click (not on palette content click)
                if (e.target === e.currentTarget) close()
            }}
            onKeyDown={handleKeyDown}
        >
            {/* Palette container */}
            <div className="w-full max-w-lg rounded-xl border bg-background shadow-2xl">
                {/* Search input */}
                <div className="flex items-center gap-2 border-b px-4 py-3">
                    <Keyboard className="size-4 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Type a command..."
                        aria-label="Search commands"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                </div>

                {/* Command list */}
                <div
                    role="listbox"
                    aria-label="Commands"
                    className="max-h-[min(320px,50vh)] overflow-y-auto p-2"
                >
                    {filtered.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                            No matching commands
                        </div>
                    ) : (
                        <>
                            {navigateCommands.length > 0 && (
                                <div>
                                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                                        Navigate
                                    </div>
                                    {navigateCommands.map((cmd) => {
                                        const idx = flatIndex++
                                        return (
                                            <CommandRow
                                                key={cmd.id}
                                                command={cmd}
                                                isSelected={
                                                    idx === selectedIndex
                                                }
                                                onSelect={cmd.action}
                                            />
                                        )
                                    })}
                                </div>
                            )}

                            {actionCommands.length > 0 && (
                                <div>
                                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                                        Actions
                                    </div>
                                    {actionCommands.map((cmd) => {
                                        const idx = flatIndex++
                                        return (
                                            <CommandRow
                                                key={cmd.id}
                                                command={cmd}
                                                isSelected={
                                                    idx === selectedIndex
                                                }
                                                onSelect={cmd.action}
                                            />
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer hint */}
                <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
                    <span>
                        <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
                            ↑↓
                        </kbd>{' '}
                        Navigate
                    </span>
                    <span>
                        <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
                            ↵
                        </kbd>{' '}
                        Select
                    </span>
                    <span>
                        <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
                            Esc
                        </kbd>{' '}
                        Close
                    </span>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// CommandRow
// ---------------------------------------------------------------------------

/**
 * Single row in the command palette list.
 *
 * Displays the command icon, label, and optional keyboard shortcut badge.
 * Highlights when selected via arrow keys.
 */
function CommandRow({
    command,
    isSelected,
    onSelect,
}: {
    command: Command
    isSelected: boolean
    onSelect: () => void
}) {
    const Icon = command.icon

    return (
        <button
            type="button"
            role="option"
            aria-selected={isSelected}
            className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted'
            )}
            onClick={onSelect}
        >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 text-left">{command.label}</span>
            {command.shortcut && (
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {command.shortcut}
                </kbd>
            )}
        </button>
    )
}
