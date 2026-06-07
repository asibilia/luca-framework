import { EVENT_TYPES } from '~/lib/constants'
import type { EventTypeName } from '~/lib/constants'

/**
 * Color-coded badge for event types.
 *
 * Maps event type strings to themed colors defined in globals.css.
 */
export function EventBadge({ eventType }: { eventType: string }) {
    const config = EVENT_TYPES[eventType as EventTypeName]
    const label = config?.label ?? eventType
    const colorVar = config?.color ?? 'muted-foreground'

    return (
        <span
            className="inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-xs"
            style={{
                borderColor: `var(--color-${colorVar})`,
                color: `var(--color-${colorVar})`,
            }}
        >
            {label}
        </span>
    )
}
