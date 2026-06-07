'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'
import { AlertCircle, X } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { validationErrorsAtom } from '~/stores/dirty-tracking'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidationBannerProps = {
    /** Entity key to look up in validationErrorsAtom (atom-driven mode). */
    entityKey?: string
    /** Explicit error list (controlled mode). Takes precedence over entityKey. */
    errors?: string[]
    /** Custom header title. Defaults to "Validation errors". */
    title?: string
    /** Additional CSS classes for the outer wrapper. */
    className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Inline validation error banner with dismiss capability.
 *
 * Supports two usage modes:
 * - **Atom-driven**: Pass `entityKey` to read errors from `validationErrorsAtom`.
 * - **Controlled**: Pass `errors` string array directly.
 *
 * If both are provided, `errors` takes precedence.
 *
 * The banner is dismissible. Once dismissed, it stays hidden until the error
 * list changes (new errors added or existing errors modified), at which point
 * it re-appears automatically.
 *
 * @example
 * ```tsx
 * // Atom-driven mode
 * <ValidationBanner entityKey="agent:lu-router" />
 *
 * // Controlled mode
 * <ValidationBanner
 *   errors={["Name is required", "Model tier must be specified"]}
 *   title="Agent validation errors"
 * />
 * ```
 */
export function ValidationBanner({
    entityKey,
    errors: controlledErrors,
    title = 'Validation errors',
    className,
}: ValidationBannerProps) {
    const atomErrors = useAtomValue(validationErrorsAtom)
    const [dismissed, setDismissed] = useState(false)
    const prevErrorsRef = useRef<string>('')

    // Resolve errors: controlled mode takes precedence
    const resolvedErrors = useMemo(() => {
        if (controlledErrors !== undefined) return controlledErrors
        if (entityKey !== undefined) return atomErrors.get(entityKey) ?? []
        return []
    }, [controlledErrors, entityKey, atomErrors])

    // Stable serialization for change detection
    const errorFingerprint = useMemo(
        () => JSON.stringify(resolvedErrors),
        [resolvedErrors]
    )

    // Re-show banner when errors change after dismissal
    useEffect(() => {
        if (
            dismissed &&
            errorFingerprint !== prevErrorsRef.current &&
            resolvedErrors.length > 0
        ) {
            setDismissed(false)
        }
        prevErrorsRef.current = errorFingerprint
    }, [errorFingerprint, dismissed, resolvedErrors.length])

    if (resolvedErrors.length === 0 || dismissed) return null

    return (
        <div
            role="alert"
            className={cn(
                'relative rounded-md border-l-2 border-l-destructive bg-destructive/5 p-3 text-sm',
                className
            )}
        >
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium text-destructive">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{title}</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss validation errors"
                    className="text-muted-foreground hover:text-foreground"
                >
                    <X className="size-3.5" />
                </Button>
            </div>

            {/* Error list */}
            <ul
                aria-label="Validation errors"
                className="mt-1.5 max-h-[120px] space-y-0.5 overflow-y-auto pl-5.5 text-muted-foreground"
            >
                {resolvedErrors.map((error, index) => (
                    <li key={`${index}-${error}`} className="list-disc">
                        {error}
                    </li>
                ))}
            </ul>
        </div>
    )
}
