'use client'

import { SessionCard } from '~/components/sessions/session-card'
import { EmptyState } from '~/components/shared/empty-state'
import { ErrorBoundary } from '~/components/shared/error-boundary'
import { Badge } from '~/components/ui/badge'
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardAction,
} from '~/components/ui/card'
import type { SessionInfo } from '~/hooks/use-session-explorer'
import type { MuninnEntityEngram } from '~/lib/muninn-types'

/**
 * Renders a list of workflow sessions as collapsible cards.
 *
 * Displays a count header, renders a SessionCard for each session,
 * and shows an EmptyState when no sessions are available.
 * Each SessionCard is wrapped in an ErrorBoundary for resilience.
 *
 * @param sessions - Array of parsed session metadata objects
 * @param onFetchDetail - Callback passed to each card for detail expansion
 */
export function SessionList({
    sessions,
    onFetchDetail,
}: {
    sessions: SessionInfo[]
    onFetchDetail: (concept: string) => Promise<MuninnEntityEngram[]>
}) {
    if (sessions.length === 0) {
        return (
            <EmptyState
                title="No Sessions"
                message="MuninnDB session data will appear here once workflows are executed."
            />
        )
    }

    const count = sessions.length

    return (
        <Card
            role="region"
            aria-label="Session explorer"
            className="flex flex-col"
        >
            <CardHeader className="border-b">
                <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Sessions
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                    Workflow Session History
                </CardDescription>
                <CardAction>
                    <Badge variant="outline" className="font-mono text-xs">
                        {count} {count === 1 ? 'session' : 'sessions'}
                    </Badge>
                </CardAction>
            </CardHeader>
            <div className="max-h-[36rem] overflow-y-auto">
                {sessions.map((session) => (
                    <ErrorBoundary
                        key={session.concept}
                        name={`Session:${session.session_id}`}
                    >
                        <SessionCard
                            session={session}
                            onFetchDetail={onFetchDetail}
                        />
                    </ErrorBoundary>
                ))}
            </div>
        </Card>
    )
}
