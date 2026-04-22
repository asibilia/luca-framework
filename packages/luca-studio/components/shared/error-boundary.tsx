'use client'

import { useCallback, type ReactNode } from 'react'

import {
    ErrorBoundary as ReactErrorBoundary,
    type FallbackProps,
} from 'react-error-boundary'

interface ErrorBoundaryProps {
    children: ReactNode
    fallback?: ReactNode
    name?: string
}

/**
 * Error boundary component for graceful error handling.
 *
 * Wraps data-dependent sections to catch rendering errors and display
 * a user-friendly fallback UI with retry functionality.
 *
 * Uses react-error-boundary internally -- no class component needed.
 *
 * @example
 * ```tsx
 * <ErrorBoundary name="AgentTable">
 *   <AgentScorecardTable agents={agents} />
 * </ErrorBoundary>
 * ```
 */
export function ErrorBoundary({
    children,
    fallback,
    name,
}: ErrorBoundaryProps) {
    const handleError = useCallback(
        (error: unknown, info: { componentStack?: string | null }) => {
            console.error(
                `[ErrorBoundary${name ? `:${name}` : ''}]`,
                error,
                info.componentStack
            )
        },
        [name]
    )

    if (fallback !== undefined) {
        return (
            <ReactErrorBoundary fallback={fallback} onError={handleError}>
                {children}
            </ReactErrorBoundary>
        )
    }

    return (
        <ReactErrorBoundary
            FallbackComponent={DefaultFallback}
            onError={handleError}
        >
            {children}
        </ReactErrorBoundary>
    )
}

/**
 * Default fallback UI matching the original error boundary design.
 */
function DefaultFallback({ error, resetErrorBoundary }: FallbackProps) {
    const errorMessage =
        error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : null

    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
                <div className="flex-1">
                    <h3 className="font-mono text-sm font-medium text-destructive">
                        Some data could not be loaded
                    </h3>
                    {errorMessage && (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {errorMessage}
                        </p>
                    )}
                    <button
                        onClick={resetErrorBoundary}
                        className="mt-3 rounded-md bg-primary px-3 py-1.5 font-mono text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                        Try again
                    </button>
                </div>
            </div>
        </div>
    )
}
