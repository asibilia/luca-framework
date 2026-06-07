'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'

import { ShikiCodeBlock } from '~/components/shared/shiki-code-block'
import type { EntityDetail } from '~/lib/entity-route-helpers'
import { agentDraftAtom } from '~/stores/entity-atoms'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentPreviewProps = {
    /** Kebab-case agent name. */
    name: string
    /** Full agent detail from the API. */
    detail: EntityDetail
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Live compiled preview of an agent's configuration.
 *
 * Reads the agent's draft atom and generates a compiled markdown preview,
 * updating with a 300ms debounce after draft changes. Rendered inside the
 * DetailPanel when an agent is selected.
 *
 * @param name - Agent name for draft atom lookup.
 * @param detail - Full entity detail providing base values.
 *
 * @example
 * ```tsx
 * <AgentPreview name="lu-router" detail={agentDetail} />
 * ```
 */
export function AgentPreview({ name, detail }: AgentPreviewProps) {
    const draft = useAtomValue(agentDraftAtom(name))
    const [debouncedDraft, setDebouncedDraft] =
        useState<Record<string, unknown>>(draft)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Debounce draft changes by 300ms
    useEffect(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
        }
        timerRef.current = setTimeout(() => {
            setDebouncedDraft(draft)
        }, 300)
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
            }
        }
    }, [draft])

    // Generate compiled preview markdown from debounced draft
    const compiledPreview = useMemo(() => {
        const description =
            (debouncedDraft.description as string) || '(no description)'
        const enabled =
            debouncedDraft.enabled !== undefined
                ? String(debouncedDraft.enabled)
                : 'true'
        const modelTier =
            (debouncedDraft.modelTier as string) || '(not specified)'
        const purpose = (debouncedDraft.purpose as string) || '(not specified)'

        return [
            `# Preview: ${name}`,
            '',
            `**Domain:** ${detail.domain}`,
            `**Variable:** ${detail.metadata.varName}`,
            `**Type:** ${detail.metadata.configType}`,
            '',
            '## Current Draft State',
            '',
            `| Field | Value |`,
            `|---|---|`,
            `| Description | ${description} |`,
            `| Enabled | ${enabled} |`,
            `| Model Tier | ${modelTier} |`,
            `| Purpose | ${purpose} |`,
            '',
            '## Raw Config',
            '',
            '```typescript',
            detail.rawConfigText,
            '```',
        ].join('\n')
    }, [debouncedDraft, detail, name])

    return (
        <div className="p-4">
            <ShikiCodeBlock code={compiledPreview} language="markdown" />
        </div>
    )
}
