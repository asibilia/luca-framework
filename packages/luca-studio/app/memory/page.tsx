'use client'

import { Suspense, useCallback, useRef } from 'react'

import { RefreshCw } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

import { PageContainer } from '~/components/layout/page-container'
import { BrowseTab } from '~/components/memory/tabs/browse-tab'
import { GraphTab } from '~/components/memory/tabs/graph-tab'
import { HealthTab } from '~/components/memory/tabs/health-tab'
import { LearningTab } from '~/components/memory/tabs/learning-tab'
import { SearchTab } from '~/components/memory/tabs/search-tab'
import { LoadingSkeleton } from '~/components/shared/loading-skeleton'
import { Button } from '~/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'

/** Valid tab values for the Memory page. */
const VALID_TABS = ['browse', 'graph', 'search', 'health', 'learning'] as const
type MemoryTab = (typeof VALID_TABS)[number]

/** Tab display metadata. */
const TAB_META: Record<MemoryTab, { label: string }> = {
    browse: { label: 'Browse' },
    graph: { label: 'Graph' },
    search: { label: 'Search' },
    health: { label: 'Health' },
    learning: { label: 'Learning' },
}

/**
 * Resolves the active tab from the URL search param.
 *
 * @param raw - Raw query parameter value
 * @returns A valid MemoryTab, defaulting to "browse"
 */
function resolveTab(raw: string | null): MemoryTab {
    if (raw && VALID_TABS.includes(raw as MemoryTab)) {
        return raw as MemoryTab
    }
    return 'browse'
}

/**
 * MuninnDB Memory page with five-tab interface.
 *
 * Uses conditional rendering (mount/unmount) for each tab so only the
 * active tab's hooks fetch data. Tab state is URL-driven via the
 * `?tab=` search parameter for bookmarking and deep-linking.
 *
 * Tabs:
 * - Browse: Original six-section dashboard (session, health, recall, timeline, brain, graph mini)
 * - Graph: Full Knowledge Graph Explorer (absorbed from /knowledge-graph)
 * - Search: Semantic Search interface (absorbed from /semantic-search)
 * - Health: Vault Health deep-dive (absorbed from /vault)
 * - Learning: Pattern/decision/pitfall tracking (absorbed from /learning)
 */
function MemoryPageInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const activeTab = resolveTab(searchParams.get('tab'))

    // Mutable ref for the active tab's refresh function
    const refreshRef = useRef<(() => void) | null>(null)

    const handleTabChange = useCallback(
        (value: string) => {
            // Clear old tab's refresh ref before switching
            refreshRef.current = null
            router.replace(`/memory?tab=${value}`, { scroll: false })
        },
        [router]
    )

    const handleRefresh = useCallback(() => {
        refreshRef.current?.()
    }, [])

    return (
        <PageContainer
            title="Memory"
            subtitle="MuninnDB Memory Observability"
            actions={
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                        <RefreshCw />
                        Refresh
                    </Button>
                </div>
            }
        >
            <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList variant="line" className="mb-6">
                    {VALID_TABS.map((tab) => (
                        <TabsTrigger key={tab} value={tab}>
                            {TAB_META[tab].label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* Conditional rendering: only the active tab is mounted */}
            {activeTab === 'browse' && <BrowseTab onRefreshRef={refreshRef} />}
            {activeTab === 'graph' && <GraphTab onRefreshRef={refreshRef} />}
            {activeTab === 'search' && <SearchTab onRefreshRef={refreshRef} />}
            {activeTab === 'health' && <HealthTab onRefreshRef={refreshRef} />}
            {activeTab === 'learning' && (
                <LearningTab onRefreshRef={refreshRef} />
            )}
        </PageContainer>
    )
}

/**
 * Memory page entry point.
 *
 * Wraps the inner page in a Suspense boundary required by Next.js
 * when using useSearchParams() in a client component.
 */
export default function MemoryPage() {
    return (
        <Suspense
            fallback={
                <PageContainer
                    title="Memory"
                    subtitle="MuninnDB Memory Observability"
                >
                    <LoadingSkeleton variant="card" />
                </PageContainer>
            }
        >
            <MemoryPageInner />
        </Suspense>
    )
}
