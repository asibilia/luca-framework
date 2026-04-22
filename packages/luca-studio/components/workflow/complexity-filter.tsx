'use client'

import { useCallback } from 'react'

import { COMPLEXITY_LEVELS } from '~/lib/constants'
import { cn } from '~/lib/utils'

// -- Types --------------------------------------------------------------------

interface ComplexityFilterProps {
    value: string | undefined
    onChange: (complexity: string | undefined) => void
}

const LEVELS = Object.keys(COMPLEXITY_LEVELS) as Array<
    keyof typeof COMPLEXITY_LEVELS
>

// -- Component ----------------------------------------------------------------

/**
 * Complexity tier visualization selector for the workflow editor.
 *
 * Renders a horizontal row of complexity level buttons using a radiogroup
 * pattern with roving tabindex for keyboard navigation. Selecting a level
 * updates agent card accents and tier badges to show each agent's model
 * tier at that complexity (resolved from routing presets). All agents
 * remain visible at all complexity levels. Clicking the active level
 * again clears the selection (returns to default MODERATE tiers).
 *
 * Rendered inside a React Flow `<Panel position="top-center">` by the canvas.
 */
export function ComplexityFilter({ value, onChange }: ComplexityFilterProps) {
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            const currentIndex = value
                ? LEVELS.indexOf(value as keyof typeof COMPLEXITY_LEVELS)
                : -1
            let nextIndex = -1

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                nextIndex =
                    currentIndex < LEVELS.length - 1 ? currentIndex + 1 : 0
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                nextIndex =
                    currentIndex > 0 ? currentIndex - 1 : LEVELS.length - 1
            }

            if (nextIndex >= 0) {
                const nextLevel = LEVELS[nextIndex]
                if (nextLevel) {
                    onChange(nextLevel)
                    // Focus the newly selected button
                    const container = e.currentTarget
                    const buttons =
                        container.querySelectorAll<HTMLButtonElement>(
                            '[role=radio]'
                        )
                    buttons[nextIndex]?.focus()
                }
            }
        },
        [value, onChange]
    )

    return (
        <div
            className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/95 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-sm"
            role="radiogroup"
            aria-label="Complexity level"
            onKeyDown={handleKeyDown}
        >
            <span className="mr-1 text-xs font-medium text-muted-foreground">
                Complexity
            </span>
            {LEVELS.map((level) => {
                const meta = COMPLEXITY_LEVELS[level]
                const isSelected = value === level
                return (
                    <button
                        key={level}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={
                            isSelected || (!value && level === LEVELS[0])
                                ? 0
                                : -1
                        }
                        onClick={() => onChange(isSelected ? undefined : level)}
                        className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                            isSelected
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                        title={`Show model tiers at ${meta.label} complexity (${meta.tier} tier)`}
                    >
                        {meta.label}
                    </button>
                )
            })}
        </div>
    )
}
