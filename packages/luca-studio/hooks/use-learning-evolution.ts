'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useAtomValue } from 'jotai'

import type { MuninnEngram } from '~/lib/muninn-types'
import { vaultAtom } from '~/stores/vault'

// -- Category resolution (mirrors memory-entries.tsx hybrid strategy) --------

const KNOWN_CATEGORIES = new Set([
    'pattern',
    'decision',
    'pitfall',
    'preference',
])

const CATEGORY_DISPLAY: Record<string, { label: string; color: string }> = {
    pattern: { label: 'Patterns', color: 'success' },
    decision: { label: 'Decisions', color: 'info' },
    pitfall: { label: 'Pitfalls', color: 'warning' },
    preference: { label: 'Preferences', color: 'accent' },
    uncategorized: { label: 'Uncategorized', color: 'muted-foreground' },
}

/**
 * Resolve engram category using the hybrid mapping strategy.
 *
 * Order of precedence:
 * 1. memory_type field if it matches a known category
 * 2. Concept prefix (text before first `:`) if it matches a known category
 * 3. "uncategorized" as fallback
 */
function resolveCategory(engram: MuninnEngram): string {
    if (engram.memory_type && KNOWN_CATEGORIES.has(engram.memory_type)) {
        return engram.memory_type
    }

    const colonIndex = engram.concept.indexOf(':')
    if (colonIndex > 0) {
        const prefix = engram.concept.slice(0, colonIndex).toLowerCase().trim()
        if (KNOWN_CATEGORIES.has(prefix)) {
            return prefix
        }
    }

    return 'uncategorized'
}

// -- Fetch helpers -----------------------------------------------------------

function createNotConfiguredError(message: string): Error {
    const e = new Error(message)
    e.name = 'NotConfiguredError'
    return e
}

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

// -- Aggregation helpers -----------------------------------------------------

/** Summary statistics by category. */
export interface LearningStats {
    total: number
    patterns: number
    decisions: number
    pitfalls: number
    preferences: number
}

/** A single time period in the timeline. */
export interface TimelinePeriod {
    label: string
    counts: Record<string, number>
    total: number
}

/** A single row in the category breakdown. */
export interface CategoryBreakdownItem {
    category: string
    label: string
    color: string
    count: number
    percentage: number
}

/** Return type of the useLearningEvolution hook. */
export interface LearningEvolutionData {
    stats: LearningStats
    timeline: TimelinePeriod[]
    categoryBreakdown: CategoryBreakdownItem[]
    recentLearnings: MuninnEngram[]
    loading: boolean
    error: string | null
    lastUpdated: Date | null
    refresh: () => void
    configured: boolean
}

/**
 * Compute summary stats from categorized engrams.
 */
function computeStats(
    categoryCounts: Record<string, number>,
    total: number
): LearningStats {
    return {
        total,
        patterns: categoryCounts['pattern'] ?? 0,
        decisions: categoryCounts['decision'] ?? 0,
        pitfalls: categoryCounts['pitfall'] ?? 0,
        preferences: categoryCounts['preference'] ?? 0,
    }
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function formatDay(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

/**
 * Get the ISO week start (Monday) for a date.
 */
function getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1 // Monday = 0
    d.setDate(d.getDate() - diff)
    d.setHours(0, 0, 0, 0)
    return d
}

/**
 * Format a Date as a compact week label (e.g. "Mar 3").
 */
function formatWeekLabel(date: Date): string {
    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ]
    return `${months[date.getMonth()]} ${date.getDate()}`
}

/**
 * Build timeline data from engrams, grouped by day or week.
 *
 * Uses day granularity unless the date range exceeds 30 days,
 * in which case it auto-buckets into weekly periods.
 */
function buildTimeline(engrams: MuninnEngram[]): TimelinePeriod[] {
    if (engrams.length === 0) return []

    // Get date range
    const timestamps = engrams.map((e) => {
        const ts = e.created_at
        return ts < 1e12 ? ts * 1000 : ts
    })
    const minTs = Math.min(...timestamps)
    const maxTs = Math.max(...timestamps)
    const daySpan = (maxTs - minTs) / (1000 * 60 * 60 * 24)

    const useWeekly = daySpan > 30

    // Group engrams into buckets
    const buckets = new Map<string, Record<string, number>>()

    for (const engram of engrams) {
        const ts =
            engram.created_at < 1e12
                ? engram.created_at * 1000
                : engram.created_at
        const date = new Date(ts)
        const category = resolveCategory(engram)

        let key: string
        if (useWeekly) {
            const weekStart = getWeekStart(date)
            key = formatDay(weekStart)
        } else {
            key = formatDay(date)
        }

        const counts = buckets.get(key) ?? {}
        counts[category] = (counts[category] ?? 0) + 1
        buckets.set(key, counts)
    }

    // Sort keys chronologically and build timeline
    const sortedKeys = Array.from(buckets.keys()).sort()

    return sortedKeys.map((key) => {
        const counts = buckets.get(key) ?? {}
        const total = Object.values(counts).reduce((sum, c) => sum + c, 0)

        let label: string
        if (useWeekly) {
            const date = new Date(key + 'T00:00:00')
            label = formatWeekLabel(date)
        } else {
            // Compact day label: "Mar 3"
            const date = new Date(key + 'T00:00:00')
            label = formatWeekLabel(date)
        }

        return { label, counts, total }
    })
}

/**
 * Build category breakdown from categorized counts.
 */
function buildCategoryBreakdown(
    categoryCounts: Record<string, number>,
    total: number
): CategoryBreakdownItem[] {
    const categories = [
        'pattern',
        'decision',
        'pitfall',
        'preference',
        'uncategorized',
    ]

    const items: CategoryBreakdownItem[] = []

    for (const cat of categories) {
        const count = categoryCounts[cat] ?? 0
        if (count === 0) continue

        const display = CATEGORY_DISPLAY[cat]
        items.push({
            category: cat,
            label: display?.label ?? cat,
            color: display?.color ?? 'muted-foreground',
            count,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        })
    }

    // Sort by count descending
    items.sort((a, b) => b.count - a.count)

    return items
}

// -- Hook -------------------------------------------------------------------

/**
 * React hook for Learning Evolution page data.
 *
 * Fetches engrams from /api/muninn/engrams and produces aggregated data
 * for summary stats, timeline chart, category breakdown, and recent
 * learnings list. Uses the same resilient fetch pattern as use-memory.ts.
 *
 * @returns LearningEvolutionData with aggregated data and fetch state
 */
export function useLearningEvolution(): LearningEvolutionData {
    const vault = useAtomValue(vaultAtom)
    const [engrams, setEngrams] = useState<MuninnEngram[]>([])
    const [configured, setConfigured] = useState(true)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Prevent double-fetch in React strict mode
    const fetchingRef = useRef(false)

    const fetchAll = useCallback(async () => {
        if (fetchingRef.current) return
        fetchingRef.current = true
        setLoading(true)
        setError(null)

        try {
            const v = encodeURIComponent(vault)
            const [engramsRes] = await Promise.allSettled([
                fetchJson<{ engrams: MuninnEngram[] }>(
                    `/api/muninn/engrams?vault=${v}&limit=500`
                ),
            ])

            // Check for 503 (not configured)
            const notConfigured =
                engramsRes.status === 'rejected' &&
                engramsRes.reason instanceof Error &&
                engramsRes.reason.name === 'NotConfiguredError'

            if (notConfigured) {
                setConfigured(false)
            }

            if (engramsRes.status === 'fulfilled') {
                setEngrams(engramsRes.value.engrams ?? [])
                setLastUpdated(new Date())
            } else {
                setError(
                    engramsRes.reason instanceof Error
                        ? engramsRes.reason.message
                        : 'Failed to fetch learning data'
                )
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to fetch learning data'
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

    // Compute derived data from engrams
    const categoryCounts: Record<string, number> = {}
    for (const engram of engrams) {
        const cat = resolveCategory(engram)
        categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
    }

    const stats = computeStats(categoryCounts, engrams.length)
    const timeline = buildTimeline(engrams)
    const categoryBreakdown = buildCategoryBreakdown(
        categoryCounts,
        engrams.length
    )

    // Recent learnings: 20 most recent by created_at descending
    const recentLearnings = [...engrams]
        .sort((a, b) => {
            const aTs = a.created_at < 1e12 ? a.created_at * 1000 : a.created_at
            const bTs = b.created_at < 1e12 ? b.created_at * 1000 : b.created_at
            return bTs - aTs
        })
        .slice(0, 20)

    return {
        stats,
        timeline,
        categoryBreakdown,
        recentLearnings,
        loading,
        error,
        lastUpdated,
        refresh,
        configured,
    }
}
