'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { json } from '@codemirror/lang-json'
import { Compartment, EditorState } from '@codemirror/state'
import {
    EditorView,
    type ViewUpdate,
    placeholder as placeholderExt,
} from '@codemirror/view'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, CheckCircle, Loader2, XCircle } from 'lucide-react'
import { z } from 'zod'

import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { configAtom, configEtagAtom } from '~/stores/config-atoms'
import {
    markCleanAtom,
    markDirtyAtom,
    setValidationErrorsAtom,
} from '~/stores/dirty-tracking'
import { rawConfigDraftAtom } from '~/stores/settings-atoms'

// ---------------------------------------------------------------------------
// Luca Config Schema (lightweight full-config validation)
// ---------------------------------------------------------------------------

/**
 * Lightweight schema for the full config.json.
 *
 * Uses passthrough() on each section to allow unknown keys, since the full
 * config contains many sections beyond what Studio manages. The primary
 * purpose is to validate structural integrity, not exhaustive field checking.
 */
const FullConfigSchema = z
    .object({
        branding: z.record(z.unknown()).optional(),
        stack: z.string().optional(),
        runtime: z.string().optional(),
        mode: z.string().optional(),
        depth: z.string().optional(),
        model_profile: z.string().optional(),
        cognitive: z.record(z.unknown()).optional(),
        workflow: z.record(z.unknown()).optional(),
        planning: z.record(z.unknown()).optional(),
        parallelization: z.record(z.unknown()).optional(),
        gates: z.record(z.string(), z.boolean()).optional(),
        safety: z.record(z.unknown()).optional(),
        harness: z.record(z.unknown()).optional(),
        iteration: z.record(z.unknown()).optional(),
        complexity: z.record(z.unknown()).optional(),
        lu: z.record(z.unknown()).optional(),
        planner: z.record(z.unknown()).optional(),
        dogfood: z.record(z.unknown()).optional(),
        muninn: z.record(z.unknown()).optional(),
        context_management: z.record(z.unknown()).optional(),
        shadow_debt: z.record(z.unknown()).optional(),
    })
    .passthrough()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidationState = 'valid' | 'json-error' | 'schema-error' | 'idle'

// ---------------------------------------------------------------------------
// Luca Theme (CSS-variable-aware) -- matches code-mirror-wrapper.tsx
// ---------------------------------------------------------------------------

const lucaTheme = EditorView.theme({
    '&': {
        fontSize: '14px',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
    },
    '.cm-content': {
        caretColor: 'hsl(var(--primary))',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'hsl(var(--primary))',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'hsl(var(--primary) / 0.2)',
    },
    '.cm-activeLine': {
        backgroundColor: 'hsl(var(--muted) / 0.3)',
    },
    '.cm-gutters': {
        backgroundColor: 'hsl(var(--muted))',
        color: 'hsl(var(--muted-foreground))',
        borderRight: '1px solid hsl(var(--border))',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'hsl(var(--muted) / 0.5)',
    },
    '.cm-placeholder': {
        color: 'hsl(var(--muted-foreground))',
    },
    '.cm-scroller': {
        overflow: 'auto',
    },
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIRTY_KEY = 'raw-config'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CodeMirror-based raw JSON editor for the full config.json.
 *
 * Provides dual validation: JSON syntax first, then Zod schema validation.
 * Only valid+schema-compliant JSON can be saved via PUT /api/config.
 *
 * Integrates with dirty tracking via `markDirtyAtom("raw-config")` and
 * uses ETag concurrency for saves.
 *
 * @param readOnly - When true, the editor is non-editable (View mode)
 */
export function RawConfigEditor({ readOnly }: { readOnly?: boolean }) {
    const config = useAtomValue(configAtom)
    const etag = useAtomValue(configEtagAtom)
    const rawDraft = useAtomValue(rawConfigDraftAtom)
    const setRawDraft = useSetAtom(rawConfigDraftAtom)
    const markDirty = useSetAtom(markDirtyAtom)
    const markClean = useSetAtom(markCleanAtom)
    const setValidationErrors = useSetAtom(setValidationErrorsAtom)

    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const onChangeRef = useRef<(val: string) => void>()

    const [validationState, setValidationState] =
        useState<ValidationState>('idle')
    const [errors, setErrors] = useState<string[]>([])
    const [saving, setSaving] = useState(false)

    // Compartments for dynamic reconfiguration
    const readOnlyCompartment = useMemo(() => new Compartment(), [])

    // Initial value: draft if set, otherwise stringified config
    const initialValue = useMemo(() => {
        if (rawDraft != null) return rawDraft
        if (config != null) return JSON.stringify(config, null, 2)
        return ''
    }, [rawDraft, config])

    // ---------------------------
    // Dual validation
    // ---------------------------

    const validate = useCallback(
        (value: string): { valid: boolean; errors: string[] } => {
            if (!value.trim()) {
                return { valid: false, errors: ['Config is empty'] }
            }

            // Step 1: JSON parse
            let parsed: unknown
            try {
                parsed = JSON.parse(value)
            } catch (err) {
                const msg =
                    err instanceof SyntaxError
                        ? err.message
                        : 'Invalid JSON syntax'
                return { valid: false, errors: [msg] }
            }

            // Step 2: Zod schema validation
            const result = FullConfigSchema.safeParse(parsed)
            if (!result.success) {
                const zodErrors = result.error.issues.map(
                    (issue) => `${issue.path.join('.')}: ${issue.message}`
                )
                return { valid: false, errors: zodErrors }
            }

            return { valid: true, errors: [] }
        },
        []
    )

    // ---------------------------
    // onChange handler
    // ---------------------------

    onChangeRef.current = useCallback(
        (value: string) => {
            setRawDraft(value)
            markDirty(DIRTY_KEY)

            const result = validate(value)
            if (result.valid) {
                setValidationState('valid')
                setErrors([])
                setValidationErrors({ key: DIRTY_KEY, errors: [] })
            } else {
                // Distinguish JSON parse error from schema error
                try {
                    JSON.parse(value)
                    setValidationState('schema-error')
                } catch {
                    setValidationState('json-error')
                }
                setErrors(result.errors)
                setValidationErrors({ key: DIRTY_KEY, errors: result.errors })
            }
        },
        [setRawDraft, markDirty, validate, setValidationErrors]
    )

    // ---------------------------
    // EditorView lifecycle
    // ---------------------------

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const updateListener = EditorView.updateListener.of(
            (update: ViewUpdate) => {
                if (update.docChanged) {
                    const newValue = update.state.doc.toString()
                    onChangeRef.current?.(newValue)
                }
            }
        )

        const state = EditorState.create({
            doc: initialValue,
            extensions: [
                lucaTheme,
                json(),
                EditorView.lineWrapping,
                updateListener,
                readOnlyCompartment.of(
                    EditorState.readOnly.of(readOnly ?? false)
                ),
                placeholderExt('Paste or edit config.json here...'),
            ],
        })

        const view = new EditorView({ state, parent: container })
        viewRef.current = view

        // Run initial validation
        if (initialValue) {
            const result = validate(initialValue)
            if (result.valid) {
                setValidationState('valid')
            }
        }

        return () => {
            view.destroy()
            viewRef.current = null
        }
        // Only run on mount/unmount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Sync readOnly changes
    useEffect(() => {
        const view = viewRef.current
        if (!view) return
        view.dispatch({
            effects: readOnlyCompartment.reconfigure(
                EditorState.readOnly.of(readOnly ?? false)
            ),
        })
    }, [readOnly, readOnlyCompartment])

    // Sync external config changes (when SSE updates arrive)
    useEffect(() => {
        const view = viewRef.current
        if (!view || rawDraft != null) return

        if (config) {
            const newValue = JSON.stringify(config, null, 2)
            const currentDoc = view.state.doc.toString()
            if (currentDoc !== newValue) {
                view.dispatch({
                    changes: {
                        from: 0,
                        to: currentDoc.length,
                        insert: newValue,
                    },
                })
            }
        }
    }, [config, rawDraft])

    // ---------------------------
    // Save handler
    // ---------------------------

    const handleSave = useCallback(async () => {
        const currentValue = viewRef.current?.state.doc.toString() ?? ''
        const result = validate(currentValue)

        if (!result.valid) {
            setErrors(result.errors)
            return
        }

        setSaving(true)
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            }
            if (etag) {
                headers['If-Match'] = etag
            }

            const res = await fetch('/api/config', {
                method: 'PUT',
                headers,
                body: currentValue,
            })

            if (res.status === 409) {
                setErrors([
                    'Conflict: config has been modified externally. Please refresh.',
                ])
                return
            }

            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as {
                    error?: string
                }
                setErrors([
                    body.error ?? `Save failed with status ${res.status}`,
                ])
                return
            }

            // Success: clear dirty state
            setRawDraft(null)
            markClean(DIRTY_KEY)
            setValidationState('valid')
            setErrors([])
        } catch (err) {
            setErrors([
                err instanceof Error ? err.message : 'Save failed unexpectedly',
            ])
        } finally {
            setSaving(false)
        }
    }, [validate, etag, setRawDraft, markClean])

    // ---------------------------
    // Render
    // ---------------------------

    return (
        <div className="flex flex-col gap-3">
            {/* Status bar */}
            <div className="flex items-center gap-2">
                {validationState === 'valid' && (
                    <Badge variant="secondary" className="gap-1">
                        <CheckCircle className="size-3" />
                        Valid JSON
                    </Badge>
                )}
                {validationState === 'json-error' && (
                    <Badge variant="destructive" className="gap-1">
                        <XCircle className="size-3" />
                        Invalid JSON
                    </Badge>
                )}
                {validationState === 'schema-error' && (
                    <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="size-3" />
                        Schema Error
                    </Badge>
                )}
                {validationState === 'idle' && (
                    <Badge variant="outline" className="gap-1">
                        Ready
                    </Badge>
                )}

                <div className="flex-1" />

                {!readOnly && (
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={
                            saving ||
                            validationState === 'json-error' ||
                            validationState === 'schema-error' ||
                            validationState === 'idle'
                        }
                    >
                        {saving && (
                            <Loader2 className="mr-1 size-3.5 animate-spin" />
                        )}
                        {saving ? 'Saving...' : 'Save Config'}
                    </Button>
                )}
            </div>

            {/* Editor */}
            <div
                ref={containerRef}
                className={cn(
                    'min-h-[200px] max-h-[min(500px,60vh)] overflow-auto rounded-md border border-border',
                    readOnly && 'opacity-75'
                )}
            />

            {/* Validation errors */}
            {errors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <ul className="list-inside list-disc space-y-0.5">
                        {errors.map((err, i) => (
                            <li key={i}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
