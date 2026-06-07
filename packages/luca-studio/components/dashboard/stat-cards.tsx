'use client'

import {
    Brain,
    Database,
    Network,
    Shield,
    BookOpen,
    Lightbulb,
    GitPullRequest,
    AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '~/components/ui/card'
import type { DashboardStats } from '~/hooks/use-dashboard'
import { formatBytes } from '~/lib/format'

/**
 * Stat card configuration for the dashboard overview grid.
 */
const STAT_CARDS: Array<{
    key: keyof DashboardStats
    label: string
    icon: LucideIcon
    colorVar: string
    format: (v: number | null) => string
    href: string
}> = [
    {
        key: 'engram_count',
        label: 'Engrams',
        icon: Brain,
        colorVar: 'var(--color-chart-2)',
        format: (v) => (v ?? 0).toLocaleString(),
        href: '/memory',
    },
    {
        key: 'coherence_score',
        label: 'Coherence',
        icon: Shield,
        colorVar: 'var(--color-success)',
        format: (v) => (v !== null ? `${(v * 100).toFixed(1)}%` : '--'),
        href: '/memory?tab=health',
    },
    {
        key: 'learning_total',
        label: 'Learnings',
        icon: BookOpen,
        colorVar: 'var(--color-info)',
        format: (v) => (v ?? 0).toLocaleString(),
        href: '/memory?tab=learning',
    },
    {
        key: 'entity_count',
        label: 'Entities',
        icon: Network,
        colorVar: 'var(--color-warning)',
        format: (v) => (v ?? 0).toLocaleString(),
        href: '/memory?tab=graph',
    },
    {
        key: 'storage_bytes',
        label: 'Storage',
        icon: Database,
        colorVar: 'var(--color-muted-foreground)',
        format: (v) => formatBytes(v ?? 0),
        href: '/memory?tab=health',
    },
]

/**
 * Learning category mini-cards for the dashboard.
 */
const CATEGORY_CARDS: Array<{
    key: keyof DashboardStats
    label: string
    icon: LucideIcon
    colorVar: string
}> = [
    {
        key: 'patterns',
        label: 'Patterns',
        icon: Lightbulb,
        colorVar: 'var(--color-success)',
    },
    {
        key: 'decisions',
        label: 'Decisions',
        icon: GitPullRequest,
        colorVar: 'var(--color-info)',
    },
    {
        key: 'pitfalls',
        label: 'Pitfalls',
        icon: AlertTriangle,
        colorVar: 'var(--color-warning)',
    },
]

/**
 * Dashboard overview stat cards.
 *
 * Renders a responsive grid of metric cards with icons, values,
 * and links to the relevant detail pages.
 */
export function DashboardStatCards({ stats }: { stats: DashboardStats }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STAT_CARDS.map((card) => {
                const Icon = card.icon
                const rawValue = stats[card.key]
                const value =
                    typeof rawValue === 'number' || rawValue === null
                        ? rawValue
                        : Number(rawValue)

                return (
                    <a key={card.key} href={card.href} className="group">
                        <Card className="transition-colors group-hover:ring-primary/30">
                            <CardContent className="flex items-center gap-3">
                                <div
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                                    style={{
                                        backgroundColor: `color-mix(in oklab, ${card.colorVar} 15%, transparent)`,
                                    }}
                                >
                                    <Icon
                                        className="h-4 w-4"
                                        style={{ color: card.colorVar }}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-mono text-xs uppercase tracking-wider text-muted-foreground">
                                        {card.label}
                                    </p>
                                    <p
                                        className="font-mono text-xl font-bold"
                                        style={{ color: card.colorVar }}
                                    >
                                        {card.format(value)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </a>
                )
            })}
        </div>
    )
}

/**
 * Learning category breakdown cards for the dashboard.
 *
 * Compact row showing pattern/decision/pitfall counts.
 */
export function DashboardCategoryCards({ stats }: { stats: DashboardStats }) {
    return (
        <div className="grid gap-3 lg:grid-cols-3">
            {CATEGORY_CARDS.map((card) => {
                const Icon = card.icon
                const value = stats[card.key] as number

                return (
                    <Card key={card.key} size="sm">
                        <CardContent className="flex items-center gap-2">
                            <Icon
                                className="h-4 w-4 shrink-0"
                                style={{ color: card.colorVar }}
                            />
                            <span className="font-mono text-xs text-muted-foreground">
                                {card.label}
                            </span>
                            <span
                                className="ml-auto font-mono text-sm font-bold"
                                style={{ color: card.colorVar }}
                            >
                                {value}
                            </span>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
