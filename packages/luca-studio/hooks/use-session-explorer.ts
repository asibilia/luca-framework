'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'

import type { MuninnEngram, MuninnEntityEngram } from '~/lib/muninn-types'
import { vaultAtom } from '~/stores/vault'

// -- Types -------------------------------------------------------------------

/** Parsed session metadata extracted from session:info engram content. */
export interface SessionInfo {
    /** Session identifier (derived from concept or content). */
    session_id: string
    /** Workflow type (e.g., "execute", "debug", "plan"). */
    workflow_type: string
    /** Phase identifier. */
    phase: string
    /** Session start timestamp (epoch seconds). */
    start_time: number
    /** Number of engrams associated with this session. */
    engram_count: number
    /** Git branch associated with the session. */
    branch: string
    /** GitHub issue number. */
    github_issue: string
    /** Session status (e.g., "active", "completed"). */
    status: string
    /** Full concept string from the engram. */
    concept: string
    /** Raw content from the engram. */
    content: string
}

/** Data returned by the useSessionExplorer hook. */
export interface SessionExplorerData {
    /** Parsed session list, sorted by start_time descending. */
    sessions: SessionInfo[]
    /** Loading state -- true during initial fetch or refresh. */
    loading: boolean
    /** Error message if the last fetch failed. */
    error: string | null
    /** Manual refresh trigger (no polling). */
    refresh: () => void
    /** Timestamp of last successful fetch. */
    lastUpdated: Date | null
    /** Fetch detail engrams for a specific session concept. */
    fetchSessionDetail: (
        sessionConcept: string
    ) => Promise<MuninnEntityEngram[]>
}

// -- Fetch helpers ------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init)
    if (res.status === 503) {
        throw createNotConfiguredError('MuninnDB not configured')
    }
    if (!res.ok) {
        throw new Error(`Fetch ${url} failed: ${res.status}`)
    }
    return res.json() as Promise<T>
}

function createNotConfiguredError(message: string): Error {
    const e = new Error(message)
    e.name = 'NotConfiguredError'
    return e
}

// -- Parsing helpers ----------------------------------------------------------

/**
 * Extract a value from structured session content text.
 *
 * Matches patterns like "Key: value" or "**Key:** value" in the content.
 */
function extractField(content: string, field: string): string {
    // Match "Field: value" or "**Field:** value" on a line
    const patterns = [
        new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i'),
        new RegExp(`${field}:\\s*(.+)`, 'i'),
    ]
    for (const pattern of patterns) {
        const match = content.match(pattern)
        if (match?.[1]) {
            return match[1].trim()
        }
    }
    return ''
}

/**
 * Parse a session engram into a SessionInfo object.
 *
 * Session engrams use concepts like "session:info", "session:findings",
 * "session:<session-id>". The emitter writes structured text with workflow,
 * phase, timestamp, and branch info into the content field.
 */
function parseSessionEngram(engram: MuninnEngram): SessionInfo {
    const content = engram.content

    // Extract session ID from concept (e.g., "session:abc123" -> "abc123")
    const colonIdx = engram.concept.indexOf(':')
    const conceptSuffix =
        colonIdx > 0
            ? engram.concept.slice(colonIdx + 1).trim()
            : engram.concept

    // Parse fields from content
    const workflowType =
        extractField(content, 'workflow') ||
        extractField(content, 'type') ||
        'unknown'
    const phase =
        extractField(content, 'phase') || extractField(content, 'Phase') || ''
    const branch =
        extractField(content, 'branch') || extractField(content, 'Branch') || ''
    const githubIssue =
        extractField(content, 'github_issue') ||
        extractField(content, 'issue') ||
        extractField(content, 'GitHub Issue') ||
        ''
    const status =
        extractField(content, 'status') ||
        extractField(content, 'Status') ||
        'unknown'

    return {
        session_id: conceptSuffix,
        workflow_type: workflowType,
        phase,
        start_time: engram.created_at,
        engram_count: 1,
        branch,
        github_issue: githubIssue,
        status,
        concept: engram.concept,
        content: engram.content,
    }
}

/**
 * Group session engrams by session concept prefix and merge counts.
 *
 * Multiple engrams may share the same session (e.g., "session:findings"
 * alongside "session:info"). Group them by the session concept root.
 */
function groupSessions(engrams: MuninnEngram[]): SessionInfo[] {
    const sessionMap = new Map<string, SessionInfo>()

    for (const engram of engrams) {
        // Use full concept as the session key for uniqueness
        const key = engram.concept

        const existing = sessionMap.get(key)
        if (existing) {
            existing.engram_count += 1
            // Use the earliest timestamp as start_time
            if (engram.created_at < existing.start_time) {
                existing.start_time = engram.created_at
            }
        } else {
            sessionMap.set(key, parseSessionEngram(engram))
        }
    }

    // Sort by start_time descending (most recent first)
    return Array.from(sessionMap.values()).sort(
        (a, b) => b.start_time - a.start_time
    )
}

// -- Hook --------------------------------------------------------------------

/**
 * React hook for MuninnDB session explorer data.
 *
 * Fetches session engrams from /api/muninn/engrams filtered by session
 * concept prefix. Parses session metadata from engram content and groups
 * by session. Follows the useMemory pattern: fetchingRef, Promise.allSettled,
 * manual refresh, no polling.
 *
 * @returns SessionExplorerData with sessions, refresh(), and loading state
 */
export function useSessionExplorer(): SessionExplorerData {
    const vault = useAtomValue(vaultAtom)
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    // Prevent double-fetch in React strict mode
    const fetchingRef = useRef(false)

    const fetchAll = useCallback(async () => {
        if (fetchingRef.current) return
        fetchingRef.current = true
        setLoading(true)
        setError(null)

        try {
            const v = encodeURIComponent(vault)
            const [sessionRes] = await Promise.allSettled([
                fetchJson<{ engrams: MuninnEngram[] }>(
                    `/api/muninn/engrams?vault=${v}&limit=200&type=session`
                ),
            ])

            // Check for 503 (MuninnDB not configured) -- degrade gracefully
            const notConfigured =
                sessionRes.status === 'rejected' &&
                sessionRes.reason instanceof Error &&
                sessionRes.reason.name === 'NotConfiguredError'

            if (notConfigured) {
                // Not an error state -- just empty results
                setSessions([])
                setLastUpdated(new Date())
            } else if (sessionRes.status === 'fulfilled') {
                const engrams = sessionRes.value.engrams ?? []

                // Filter to session-prefixed concepts
                const sessionEngrams = engrams.filter((e) =>
                    e.concept.startsWith('session:')
                )

                const grouped = groupSessions(sessionEngrams)
                setSessions(grouped)
                setLastUpdated(new Date())
            } else {
                // Fetch failed for non-503 reason
                const reason = sessionRes.reason
                setError(
                    reason instanceof Error
                        ? reason.message
                        : 'Failed to fetch session data'
                )
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to fetch session data'
            )
        } finally {
            setLoading(false)
            fetchingRef.current = false
        }
    }, [vault])

    // Initial fetch on mount
    useEffect(() => {
        void fetchAll()
    }, [fetchAll])

    const refresh = useCallback(() => {
        void fetchAll()
    }, [fetchAll])

    const fetchSessionDetail = useCallback(
        async (sessionConcept: string): Promise<MuninnEntityEngram[]> => {
            try {
                const response = await fetchJson<{
                    engrams: MuninnEntityEngram[]
                }>('/api/muninn/find-by-entity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vault,
                        entity_name: sessionConcept,
                    }),
                })
                return response.engrams ?? []
            } catch {
                // Silently degrade -- return empty on failure
                return []
            }
        },
        [vault]
    )

    return {
        sessions,
        loading,
        error,
        refresh,
        lastUpdated,
        fetchSessionDetail,
    }
}
