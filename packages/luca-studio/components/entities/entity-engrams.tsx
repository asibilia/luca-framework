'use client'

import orderBy from 'lodash/orderBy'

import { EmptyState } from '~/components/shared/empty-state'
import { formatDateTime } from '~/lib/format'

/**
 * Entity engrams list component.
 *
 * Displays all engrams associated with an entity, sorted by created_at
 * descending (most recent first).
 *
 * @param engrams - Array of engram summaries from MuninnEntity.engrams
 */
export function EntityEngrams({
    engrams,
}: {
    engrams: Array<{ id: string; concept: string; created_at: string }>
}) {
    if (engrams.length === 0) {
        return <EmptyState message="No engrams found for this entity" />
    }

    const sorted = orderBy(engrams, 'created_at', 'desc')

    return (
        <div>
            <p className="font-mono text-xs text-muted-foreground mb-3">
                {engrams.length} engram{engrams.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-0">
                {sorted.map((engram) => (
                    <div
                        key={engram.id}
                        className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0"
                    >
                        <p className="font-mono text-sm font-medium text-foreground">
                            {engram.concept}
                        </p>
                        <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-muted-foreground/60">
                                {engram.id}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                                {formatDateTime(engram.created_at)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
