import { useMemo } from 'react'

import type { PluginTheme } from '@getpaseo/plugin'
import type { PluginTimelineItemProps } from '@getpaseo/plugin/client'
import { Icon } from '@getpaseo/plugin/client/react-native'
import { ExternalLink } from '@getpaseo/plugin/client/ui'
import { StyleSheet, Text, View } from 'react-native'

import {
    MONO,
    clockText,
    limitHitText,
    limitUntilText,
    runTitle,
    stageColor,
    statusColor,
    statusText,
    toneColor,
    percentText,
    usageColor,
} from './board-look'

import type { EventRow, LimitRow, RunRow, StuckRow } from '../shared/board-rows'
import { currentStepText } from '../shared/board-state'

/**
 * The chat rows: a header row per run (updated in place), one row per
 * meaningful event, stuck rows with the exact reply, and a limit-wait row.
 */

const makeStyles = ({
    theme,
    compact,
}: {
    theme: PluginTheme
    compact: boolean
}) => {
    const { colors } = theme
    return StyleSheet.create({
        card: {
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 10,
            padding: compact ? 10 : 12,
            gap: 6,
            backgroundColor: colors.surface1,
            marginVertical: 4,
        },
        top: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
        },
        title: {
            color: colors.foreground,
            fontSize: 14,
            fontWeight: '700',
            flexShrink: 1,
        },
        spacer: { flex: 1 },
        status: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
        text: { color: colors.foreground, fontSize: 13 },
        muted: { color: colors.foregroundMuted, fontSize: 12 },
        mono: { color: colors.foregroundMuted, fontSize: 11, fontFamily: MONO },
        counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        count: {
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 7,
            paddingVertical: 1,
            fontSize: 11,
            fontWeight: '600',
        },
        event: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            paddingVertical: 3,
        },
        eventTime: {
            color: colors.foregroundMuted,
            fontSize: 11,
            fontFamily: MONO,
            width: 40,
            paddingTop: 2,
        },
        eventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
        eventText: { color: colors.foreground, fontSize: 13, flex: 1 },
        eventTag: {
            color: colors.foregroundMuted,
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 1,
            paddingTop: 3,
        },
        replyRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
        },
        reply: {
            color: colors.foreground,
            backgroundColor: colors.surface2,
            borderRadius: 4,
            paddingHorizontal: 6,
            paddingVertical: 1,
            fontSize: 12,
            fontFamily: MONO,
        },
        link: { color: colors.accent, fontSize: 13 },
    })
}

type MakeStyles = typeof makeStyles

type Styles = ReturnType<MakeStyles>

const useStyles = ({
    theme,
    compact,
}: {
    theme: PluginTheme
    compact: boolean
}): Styles => useMemo(() => makeStyles({ theme, compact }), [theme, compact])

const UsageText = ({
    usage,
    theme,
    styles,
}: {
    usage: NonNullable<RunRow['usage']>
    theme: PluginTheme
    styles: Styles
}) => (
    <Text style={styles.mono}>
        plan 5h{' '}
        <Text
            style={{
                color: usageColor({ level: usage.five_hour_level, theme }),
            }}
        >
            {percentText({ percent: usage.five_hour_percent })}
        </Text>{' '}
        · week{' '}
        <Text
            style={{ color: usageColor({ level: usage.weekly_level, theme }) }}
        >
            {percentText({ percent: usage.weekly_percent })}
        </Text>
    </Text>
)

/** The run's header row. */
export const RunRowCard = ({
    item,
    theme,
    layout,
}: PluginTimelineItemProps<RunRow>) => {
    const styles = useStyles({ theme, compact: layout.compact })
    const row = item.data
    const color = statusColor({ status: row.status, theme })
    return (
        <View style={[styles.card, { borderColor: color }]}>
            <View style={styles.top}>
                <Icon name="Kanban" size={14} color={theme.colors.foreground} />
                <Text style={styles.title}>Luca · {runTitle(row)}</Text>
                <View style={styles.spacer} />
                <Text style={[styles.status, { color }]}>
                    {statusText({ status: row.status }).toUpperCase()}
                </Text>
            </View>
            {row.counts.length > 0 ? (
                <View style={styles.counts}>
                    {row.counts.map(({ stage, count }) => {
                        const tint = stageColor({ stage, theme })
                        return (
                            <Text
                                key={stage}
                                style={[
                                    styles.count,
                                    { color: tint, borderColor: tint },
                                ]}
                            >
                                {count} {stage}
                            </Text>
                        )
                    })}
                </View>
            ) : null}
            {row.needs_you > 0 ? (
                <Text
                    style={[styles.text, { color: theme.colors.statusDanger }]}
                >
                    {row.needs_you} waiting on your reply on the spec issue
                </Text>
            ) : null}
            {row.current_steps.map(({ ticket, text, since }, index) => (
                <Text key={`${ticket ?? 'run'}-${index}`} style={styles.muted}>
                    {ticket === null ? 'Run' : `#${ticket}`}:{' '}
                    {currentStepText({
                        step: { text, since },
                        now: Date.now(),
                    })}
                </Text>
            ))}
            <Text style={styles.muted}>Final review: {row.final_review}</Text>
            {row.usage ? (
                <UsageText usage={row.usage} theme={theme} styles={styles} />
            ) : (
                <Text style={styles.mono}>plan usage: no reading yet</Text>
            )}
            {row.limit_wait ? (
                <Text
                    style={[
                        styles.muted,
                        { color: theme.colors.statusWarning },
                    ]}
                >
                    Limit wait: the run carries on by itself when the limit
                    resets.
                </Text>
            ) : null}
            {row.pr_url ? (
                <ExternalLink href={row.pr_url}>
                    <Text style={styles.link}>{row.pr_url}</Text>
                </ExternalLink>
            ) : null}
            {row.engine_ended ? (
                <Text
                    style={[
                        styles.muted,
                        {
                            color: row.engine_ended.ok
                                ? theme.colors.foregroundMuted
                                : theme.colors.statusDanger,
                        },
                    ]}
                >
                    The engine {row.engine_ended.ok ? 'finished' : 'stopped'}:{' '}
                    {row.engine_ended.message}
                </Text>
            ) : null}
            <Text style={styles.mono}>
                {row.run_id} · updated {clockText({ iso: row.updated_at })}
                {row.log_path ? ` · log ${row.log_path}` : ''}
            </Text>
        </View>
    )
}

/** One thing that happened in a run. */
export const EventRowLine = ({
    item,
    theme,
    layout,
}: PluginTimelineItemProps<EventRow>) => {
    const styles = useStyles({ theme, compact: layout.compact })
    const row = item.data
    return (
        <View style={styles.event}>
            <Text style={styles.eventTime}>{clockText({ iso: row.time })}</Text>
            <View
                style={[
                    styles.eventDot,
                    { backgroundColor: toneColor({ tone: row.tone, theme }) },
                ]}
            />
            <Text style={styles.eventText}>{row.text}</Text>
            <Text style={styles.eventTag}>LUCA</Text>
        </View>
    )
}

/** Stuck work, with the exact replies; resolved in place. */
export const StuckRowCard = ({
    item,
    theme,
    layout,
}: PluginTimelineItemProps<StuckRow>) => {
    const styles = useStyles({ theme, compact: layout.compact })
    const row = item.data
    const waiting = row.status === 'waiting'
    const color = waiting
        ? theme.colors.statusDanger
        : theme.colors.statusSuccess
    return (
        <View style={[styles.card, { borderColor: color, borderLeftWidth: 4 }]}>
            <View style={styles.top}>
                <Icon
                    name={waiting ? 'OctagonAlert' : 'CircleCheck'}
                    size={14}
                    color={color}
                />
                <Text style={[styles.title, { color }]}>{row.subject}</Text>
                <View style={styles.spacer} />
                <Text style={[styles.status, { color }]}>
                    {waiting ? 'NEEDS YOU' : 'RESOLVED'}
                </Text>
            </View>
            {waiting ? (
                <>
                    <Text style={styles.text}>{row.reason}</Text>
                    {row.detail ? (
                        <Text style={styles.muted} numberOfLines={6} selectable>
                            {row.detail}
                        </Text>
                    ) : null}
                    {row.tried.map((line, index) => (
                        <Text key={`${index}-${line}`} style={styles.muted}>
                            · {line}
                        </Text>
                    ))}
                    <View style={styles.replyRow}>
                        <Text style={styles.muted}>
                            Reply with a comment on{' '}
                            {row.spec_number === null
                                ? 'the spec issue'
                                : `spec issue #${row.spec_number}`}
                            :
                        </Text>
                        {row.replies.map((reply) => (
                            <Text key={reply} style={styles.reply} selectable>
                                {reply}
                            </Text>
                        ))}
                    </View>
                </>
            ) : (
                <Text style={styles.muted}>{row.resolution}</Text>
            )}
        </View>
    )
}

/** A limit wait; updated in place when it's over. */
export const LimitRowCard = ({
    item,
    theme,
    layout,
}: PluginTimelineItemProps<LimitRow>) => {
    const styles = useStyles({ theme, compact: layout.compact })
    const row = item.data
    const waiting = row.status === 'waiting'
    const color = waiting
        ? theme.colors.statusWarning
        : theme.colors.statusSuccess
    return (
        <View style={[styles.card, { borderColor: color }]}>
            <View style={styles.top}>
                <Icon name="Hourglass" size={14} color={color} />
                <Text style={[styles.title, { color }]}>
                    {waiting
                        ? limitHitText({ window: row.window })
                        : 'Limit wait over'}
                </Text>
                <View style={styles.spacer} />
                <Text style={[styles.status, { color }]}>
                    {waiting ? 'WAITING' : 'RESUMED'}
                </Text>
            </View>
            {row.usage ? (
                <UsageText usage={row.usage} theme={theme} styles={styles} />
            ) : null}
            <Text style={styles.muted}>
                {waiting
                    ? limitUntilText({
                          resets_at: row.resets_at,
                          now: Date.now(),
                      })
                    : 'The limit reset and the run carried on by itself.'}
            </Text>
        </View>
    )
}
