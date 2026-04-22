'use client'

import { RefreshCw } from 'lucide-react'

import { QuickActions } from '~/components/home/quick-actions'
import { RecentActivity } from '~/components/home/recent-activity'
import { StatusCard } from '~/components/home/status-card'
import { PageContainer } from '~/components/layout/page-container'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { useHomeData } from '~/hooks/use-home-data'

/**
 * Home overview page.
 *
 * Workflow-centric dashboard showing current Luca state, recent session
 * activity, and quick navigation links to key Studio pages.
 *
 * Replaces the previous MuninnDB-centric dashboard with a focused view of
 * the active workflow: status card (full width), recent activity feed
 * (full width), and quick action cards (grid).
 */
export default function HomePage() {
    const { state, entries, loading, error, refresh } = useHomeData()

    return (
        <PageContainer
            title="Home"
            subtitle="Luca workflow overview"
            actions={
                <Button
                    variant="outline"
                    size="sm"
                    onClick={refresh}
                    disabled={loading}
                >
                    <RefreshCw
                        className={loading ? 'animate-spin' : undefined}
                    />
                    {loading ? 'Loading...' : 'Refresh'}
                </Button>
            }
        >
            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            <div className="space-y-6">
                {/* Workflow status card */}
                <StatusCard state={state} />

                <Separator />

                {/* Recent activity feed */}
                <RecentActivity entries={entries} />

                <Separator />

                {/* Quick navigation */}
                <QuickActions />
            </div>
        </PageContainer>
    )
}
