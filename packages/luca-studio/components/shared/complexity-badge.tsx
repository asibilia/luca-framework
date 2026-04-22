import { COMPLEXITY_LEVELS } from '~/lib/constants'
import { cn } from '~/lib/utils'

// -- Types --------------------------------------------------------------------

/** Valid complexity level keys. */
type ComplexityLevel = keyof typeof COMPLEXITY_LEVELS

/** Size variants controlling padding and font size. */
type BadgeSize = 'sm' | 'md' | 'lg'

/** Props for the ComplexityBadge component. */
interface ComplexityBadgeProps {
    /** Complexity level to display. */
    level: ComplexityLevel
    /** Size variant. Defaults to "sm". */
    size?: BadgeSize
    /** When true, appends the tier label in parentheses (e.g., "MODERATE (standard)"). */
    showTier?: boolean
    /** Additional CSS classes. */
    className?: string
}

// -- Constants ----------------------------------------------------------------

/**
 * Complexity level to Tailwind color class mapping.
 *
 * Maps each level's semantic color token to concrete bg/text Tailwind classes.
 * Uses low-opacity backgrounds with full-opacity text for readability.
 */
const LEVEL_COLORS: Record<ComplexityLevel, { bg: string; text: string }> = {
    TRIVIAL: {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
    },
    SIMPLE: {
        bg: 'bg-green-500/15',
        text: 'text-green-600 dark:text-green-400',
    },
    MODERATE: {
        bg: 'bg-blue-500/15',
        text: 'text-blue-600 dark:text-blue-400',
    },
    COMPLEX: {
        bg: 'bg-amber-500/15',
        text: 'text-amber-600 dark:text-amber-400',
    },
    CRITICAL: {
        bg: 'bg-red-500/15',
        text: 'text-red-600 dark:text-red-400',
    },
}

/** Size variant classes for padding and font. */
const SIZE_CLASSES: Record<BadgeSize, string> = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-2.5 py-1 text-sm',
}

// -- Component ----------------------------------------------------------------

/**
 * Color-coded badge for displaying task complexity levels.
 *
 * Renders a rounded badge with the complexity level name in uppercase,
 * colored according to the level's severity. Optionally shows the
 * associated tier label (lightweight, standard, thorough).
 *
 * Uses the COMPLEXITY_LEVELS constant from lib/constants.ts as the
 * source of truth for level metadata (label, color, tier).
 *
 * This is a server component (no "use client" directive) since it
 * requires no client-side interactivity.
 *
 * @param level - One of TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL
 * @param size - Badge size variant: "sm" (default), "md", "lg"
 * @param showTier - When true, appends tier in parentheses
 * @param className - Additional CSS classes
 *
 * @example
 * ```tsx
 * <ComplexityBadge level="MODERATE" />
 * // Renders: blue badge with "MODERATE"
 *
 * <ComplexityBadge level="CRITICAL" size="lg" showTier />
 * // Renders: red large badge with "CRITICAL (thorough)"
 * ```
 */
export function ComplexityBadge({
    level,
    size = 'sm',
    showTier = false,
    className,
}: ComplexityBadgeProps) {
    const meta = COMPLEXITY_LEVELS[level]
    const colors = LEVEL_COLORS[level] ?? LEVEL_COLORS.MODERATE
    const sizeClass = SIZE_CLASSES[size]

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full font-medium uppercase tracking-wide',
                colors.bg,
                colors.text,
                sizeClass,
                className
            )}
        >
            {level}
            {showTier && meta?.tier && (
                <span className="ml-1 normal-case opacity-70">
                    ({meta.tier})
                </span>
            )}
        </span>
    )
}
