import { useMemo, useState, type ReactNode } from 'react'

import type { PluginTheme } from '@getpaseo/plugin'
import {
    useRpc,
    useWorkspace,
    type PluginWorkspacePanelProps,
} from '@getpaseo/plugin/client'
import {
    Icon,
    ScrollView,
    copyText,
    useToast,
} from '@getpaseo/plugin/client/react-native'
import { ExternalLink } from '@getpaseo/plugin/client/ui'
import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import {
    DIMMED,
    MONO,
    lensColor,
    limitWaitText,
    runTitle,
    stageColor,
    statusColor,
    statusText,
    tokensText,
    percentText,
    usageColor,
    usageLineWaitText,
    useNow,
} from './board-look'

import { boardReadRpc } from '../shared/board-rpc'
import {
    ALL_STEPS_DONE,
    EMPTY_BOARD_TEXT,
    LOOP_CAP,
    POLL_MS,
    REFACTOR_SKIPS_STEPS,
    STEP_NAMES,
    currentStepText,
    foldRuns,
    planUsedText,
    showsFinalReview,
    stoppedText,
    type BoardState,
    type CurrentStep,
    type LensCard,
    type LensState,
    type NeedsYou,
    type RunSummary,
    type TicketCard,
    type TicketStage,
} from '../shared/board-state'

/**
 * The side panel: one run of this workspace, top to bottom. Plan usage, a
 * limit-wait banner, "Needs you" pinned on top, the tickets as a stack of
 * stages (Blocked → Building → Reviewing → Done → Skipped) with step dots,
 * then the final review's 5 lenses as a second stack. It polls `board.read`.
 */

type StackStage = Exclude<TicketStage, 'stuck'>

const TICKET_STAGES: {
    stage: StackStage
    title: string
    hint: string
    icon: string
    folded: boolean
}[] = [
    {
        stage: 'blocked',
        title: 'Blocked',
        hint: "waits on a ticket that isn't done",
        icon: 'Lock',
        folded: false,
    },
    {
        stage: 'building',
        title: 'Building',
        hint: 'tests, red check, code, checks',
        icon: 'Hammer',
        folded: false,
    },
    {
        stage: 'reviewing',
        title: 'Reviewing',
        hint: 'a fresh ticket review and its fix rounds',
        icon: 'ScanSearch',
        folded: false,
    },
    {
        stage: 'done',
        title: 'Done',
        hint: 'joined the run branch',
        icon: 'CircleCheck',
        folded: true,
    },
    {
        stage: 'skipped',
        title: 'Skipped',
        hint: 'left out of this run, stays open',
        icon: 'SkipForward',
        folded: true,
    },
]

const LENS_STAGES: { stage: LensState; title: string; icon: string }[] = [
    { stage: 'waiting', title: 'Waiting', icon: 'Clock' },
    { stage: 'reviewing', title: 'Reviewing', icon: 'ScanSearch' },
    { stage: 'fixing', title: 'Fixing', icon: 'Wrench' },
    { stage: 'clean', title: 'Clean', icon: 'CircleCheck' },
]

/** A card or stage key. */
type Key = string

type DotKind = 'done' | 'current' | 'todo' | 'skip' | 'stopped'

const makeStyles = ({
    theme,
    compact,
}: {
    theme: PluginTheme
    compact: boolean
}) => {
    const { colors } = theme
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.surface0 },
        content: { padding: compact ? 10 : 16, gap: 8 },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: compact ? 6 : 10,
        },
        title: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
        spacer: { flex: 1 },
        text: { color: colors.foreground, fontSize: 13 },
        muted: { color: colors.foregroundMuted, fontSize: 12 },
        mono: { color: colors.foregroundMuted, fontSize: 12, fontFamily: MONO },
        small: { color: colors.foregroundMuted, fontSize: 11 },
        pill: {
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 7,
            paddingVertical: 1,
            fontSize: 11,
            fontWeight: '700',
        },
        chip: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
        },
        chipOn: {
            borderColor: colors.accent,
            backgroundColor: colors.surface2,
        },
        banner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 1,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 5,
        },
        bannerText: { fontSize: 12, flexShrink: 1 },
        block: { gap: 6 },
        stageHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 6,
        },
        stageHeaderThin: { paddingVertical: 1, opacity: DIMMED },
        stageTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
        stageCount: {
            color: colors.foregroundMuted,
            fontSize: 12,
            fontFamily: MONO,
        },
        stageHint: {
            color: colors.foregroundMuted,
            fontSize: 11,
            flexShrink: 1,
        },
        stageBody: { gap: 6, paddingLeft: compact ? 0 : 8 },
        card: {
            backgroundColor: colors.surface1,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: compact ? 8 : 10,
            paddingVertical: compact ? 7 : 8,
            gap: 5,
        },
        cardStuck: { borderColor: colors.statusDanger, borderLeftWidth: 4 },
        cardPressed: { backgroundColor: colors.surface2 },
        cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        number: {
            color: colors.foregroundMuted,
            fontSize: 12,
            fontWeight: '700',
            fontFamily: MONO,
        },
        cardTitle: {
            color: colors.foreground,
            fontSize: 13,
            fontWeight: '600',
            flexShrink: 1,
        },
        tag: {
            color: colors.foregroundMuted,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 4,
            paddingHorizontal: 4,
            fontSize: 10,
        },
        dots: { flexDirection: 'row', alignItems: 'center' },
        dotCell: { flexDirection: 'row', alignItems: 'center' },
        link: { width: compact ? 7 : 10, height: 2 },
        dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
        dotCurrent: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
        dotSkip: { borderStyle: 'dashed' },
        stepLabel: { fontSize: 12, fontWeight: '600', marginLeft: 6 },
        counter: {
            borderWidth: 1,
            borderRadius: 5,
            paddingHorizontal: 5,
            fontSize: 11,
            fontFamily: MONO,
        },
        detail: {
            gap: 3,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingTop: 5,
        },
        label: {
            color: colors.foregroundMuted,
            fontSize: 12,
            fontWeight: '700',
        },
        replyRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 5,
        },
        reply: {
            color: colors.foreground,
            backgroundColor: colors.surface2,
            borderRadius: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
            fontSize: 12,
            fontFamily: MONO,
        },
        rule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
        reviewTitle: {
            color: colors.foreground,
            fontSize: 14,
            fontWeight: '700',
        },
        prLink: { color: colors.accent, fontSize: 12 },
    })
}

type MakeStyles = typeof makeStyles

type Styles = ReturnType<MakeStyles>

type Look = { theme: PluginTheme; styles: Styles }

const toggled = ({
    set,
    key,
}: {
    set: ReadonlySet<Key>
    key: string
}): Set<Key> => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
}

const dotKinds = ({ ticket }: { ticket: TicketCard }): DotKind[] =>
    STEP_NAMES.map((_, index) => {
        if (ticket.refactor && index < REFACTOR_SKIPS_STEPS) return 'skip'
        if (index < ticket.step) return 'done'
        if (index === ticket.step) {
            return ticket.stage === 'skipped' || ticket.stage === 'stuck'
                ? 'stopped'
                : 'current'
        }
        return 'todo'
    })

const stepLabel = ({ ticket }: { ticket: TicketCard }): string => {
    if (ticket.step >= ALL_STEPS_DONE) return 'all steps done'
    const name = STEP_NAMES[ticket.step]
    if (!name) return ticket.activity
    if (ticket.stage === 'stuck') return `stuck at ${name}`
    if (ticket.stage === 'skipped') return `stopped at ${name}`
    return name
}

const StepDots = ({ ticket, theme, styles }: { ticket: TicketCard } & Look) => {
    const kinds = dotKinds({ ticket })
    const { colors } = theme
    const highlight =
        ticket.stage === 'stuck' ? colors.statusDanger : colors.accent
    const labelColor =
        ticket.step >= ALL_STEPS_DONE
            ? colors.statusSuccess
            : kinds.includes('current')
              ? highlight
              : colors.foregroundMuted
    const described = STEP_NAMES.map(
        (name, index) => `${name} ${kinds[index] ?? ''}`
    ).join(', ')
    return (
        <View
            style={styles.dots}
            accessible
            accessibilityLabel={`Steps: ${described}`}
        >
            {kinds.map((kind, index) => {
                const reached = kind === 'done' || kind === 'current'
                const look =
                    kind === 'done'
                        ? [
                              styles.dot,
                              {
                                  backgroundColor: colors.statusSuccess,
                                  borderColor: colors.statusSuccess,
                              },
                          ]
                        : kind === 'current'
                          ? [
                                styles.dotCurrent,
                                {
                                    backgroundColor: highlight,
                                    borderColor: highlight,
                                },
                            ]
                          : kind === 'stopped'
                            ? [
                                  styles.dotCurrent,
                                  {
                                      backgroundColor: colors.surface2,
                                      borderColor: highlight,
                                  },
                              ]
                            : kind === 'skip'
                              ? [
                                    styles.dot,
                                    styles.dotSkip,
                                    { borderColor: colors.foregroundMuted },
                                ]
                              : [
                                    styles.dot,
                                    { borderColor: colors.foregroundMuted },
                                ]
                return (
                    <View key={STEP_NAMES[index]} style={styles.dotCell}>
                        {index > 0 ? (
                            <View
                                style={[
                                    styles.link,
                                    {
                                        backgroundColor: reached
                                            ? colors.statusSuccess
                                            : colors.border,
                                    },
                                ]}
                            />
                        ) : null}
                        <View style={look} />
                    </View>
                )
            })}
            <Text style={[styles.stepLabel, { color: labelColor }]}>
                {stepLabel({ ticket })}
            </Text>
        </View>
    )
}

const Counter = ({
    label,
    value,
    theme,
    styles,
}: { label: string; value: number } & Look) => {
    const color =
        value >= LOOP_CAP
            ? theme.colors.statusDanger
            : value > 0
              ? theme.colors.statusWarning
              : theme.colors.foregroundMuted
    return (
        <Text style={[styles.counter, { color, borderColor: color }]}>
            {label} {value}/{LOOP_CAP}
        </Text>
    )
}

/** A running step with its time, counting up by itself. */
const StepLine = ({
    step,
    prefix,
    styles,
}: {
    step: CurrentStep
    prefix: string
    styles: Styles
}) => {
    const now = useNow()
    return (
        <Text style={styles.muted} numberOfLines={1}>
            {prefix}
            {currentStepText({ step, now })}
        </Text>
    )
}

/** The exact replies; tap one to copy it. */
const Replies = ({
    replies,
    spec_number,
    styles,
}: {
    replies: string[]
    spec_number: number | null
    styles: Styles
}) => {
    const toast = useToast()
    const copy = async ({ reply }: { reply: string }) => {
        try {
            await copyText(reply)
            toast.show(`Copied "${reply}"`, { variant: 'success' })
        } catch {
            toast.error('Could not copy. Select the text and use Copy.')
        }
    }
    return (
        <View style={styles.replyRow}>
            <Text style={styles.label}>
                Reply on{' '}
                {spec_number === null
                    ? 'the spec issue'
                    : `spec issue #${spec_number}`}{' '}
                with
            </Text>
            {replies.map((reply) => (
                <Pressable
                    key={reply}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy the reply ${reply}`}
                    onPress={() => void copy({ reply })}
                >
                    <Text style={styles.reply} selectable>
                        {reply}
                    </Text>
                </Pressable>
            ))}
        </View>
    )
}

const NeedsYouCard = ({
    item,
    spec_number,
    theme,
    styles,
}: { item: NeedsYou; spec_number: number | null } & Look) => (
    <View style={[styles.card, styles.cardStuck]}>
        <View style={styles.cardTop}>
            <Icon
                name="OctagonAlert"
                size={14}
                color={theme.colors.statusDanger}
            />
            <Text
                style={[styles.cardTitle, { color: theme.colors.statusDanger }]}
            >
                {item.subject}
            </Text>
        </View>
        <Text style={styles.text}>{item.reason}</Text>
        {item.detail ? (
            <Text style={styles.muted} numberOfLines={8} selectable>
                {item.detail}
            </Text>
        ) : null}
        {item.tried.length > 0 ? (
            <>
                <Text style={styles.label}>Tried</Text>
                {item.tried.map((line, index) => (
                    <Text key={`${index}-${line}`} style={styles.muted}>
                        {index + 1}. {line}
                    </Text>
                ))}
            </>
        ) : null}
        <Replies
            replies={item.replies}
            spec_number={spec_number}
            styles={styles}
        />
    </View>
)

const StageHeader = ({
    title,
    hint,
    icon,
    count,
    color,
    folded,
    onPress,
    theme,
    styles,
}: {
    title: string
    hint: string
    icon: string
    count: number
    color: string
    folded: boolean | null
    onPress: (() => void) | null
} & Look) => {
    const empty = count === 0
    const tint = empty ? theme.colors.foregroundMuted : color
    const content = (
        <>
            <Icon name={icon} size={13} color={tint} />
            <Text style={[styles.stageTitle, { color: tint }]}>
                {title.toUpperCase()}
            </Text>
            <Text style={styles.stageCount}>{count}</Text>
            {empty || hint === '' ? null : (
                <Text style={styles.stageHint} numberOfLines={1}>
                    {hint}
                </Text>
            )}
            <View style={styles.spacer} />
            {folded === null || empty ? null : (
                <Icon
                    name={folded ? 'ChevronRight' : 'ChevronDown'}
                    size={13}
                    color={theme.colors.foregroundMuted}
                />
            )}
        </>
    )
    const style = [styles.stageHeader, empty ? styles.stageHeaderThin : null]
    if (!onPress || empty) return <View style={style}>{content}</View>
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${count}. ${folded ? 'Open' : 'Fold'} this stage`}
            onPress={onPress}
            style={style}
        >
            {content}
        </Pressable>
    )
}

const TicketDetail = ({
    ticket,
    state,
    styles,
}: {
    ticket: TicketCard
    state: BoardState
    styles: Styles
}) => {
    const kinds = dotKinds({ ticket })
    const waits = ticket.blockers.map((number) => {
        const blocker = state.tickets.find((card) => card.number === number)
        return `#${number} ${blocker ? blocker.stage : 'closed'}`
    })
    return (
        <View style={styles.detail}>
            <Text style={styles.muted}>
                steps:{' '}
                {STEP_NAMES.map(
                    (name, index) =>
                        `${name} ${kinds[index] === 'skip' ? '(not needed)' : (kinds[index] ?? '')}`
                ).join(' → ')}
            </Text>
            <Text style={styles.muted}>
                waits on: {waits.length > 0 ? waits.join(', ') : 'nothing'}
            </Text>
            {ticket.tests ? (
                <Text style={styles.muted}>
                    last tests:{' '}
                    {ticket.tests.failing > 0
                        ? `${ticket.tests.failing} of ${ticket.tests.total} failing`
                        : `${ticket.tests.total} passing`}
                </Text>
            ) : null}
            {ticket.findings ? (
                <Text style={styles.muted}>
                    findings: {ticket.findings.blocker} blocker ·{' '}
                    {ticket.findings.should_fix} should-fix ·{' '}
                    {ticket.findings.nit} nit
                </Text>
            ) : null}
            {ticket.review_fix_round > 0 ? (
                <Text style={styles.muted}>
                    review fix rounds: {ticket.review_fix_round}/{LOOP_CAP}
                </Text>
            ) : null}
            {Object.keys(ticket.agent_tokens).length > 0 ? (
                <Text style={styles.muted}>
                    tokens:{' '}
                    {Object.entries(ticket.agent_tokens)
                        .map(
                            ([role, tokens]) =>
                                `${role} ${tokensText({ tokens })}`
                        )
                        .join(' · ')}
                </Text>
            ) : null}
            {ticket.tried.length > 0 ? (
                <>
                    <Text style={styles.label}>Tried</Text>
                    {ticket.tried.map((line, index) => (
                        <Text key={`${index}-${line}`} style={styles.muted}>
                            {index + 1}. {line}
                        </Text>
                    ))}
                </>
            ) : null}
        </View>
    )
}

const TicketCardView = ({
    ticket,
    state,
    open,
    onToggle,
    theme,
    styles,
}: {
    ticket: TicketCard
    state: BoardState
    open: boolean
    onToggle: () => void
} & Look) => {
    const color = stageColor({ stage: ticket.stage, theme })
    const failing =
        ticket.tests &&
        ticket.tests.failing > 0 &&
        ticket.stage !== 'done' &&
        ticket.stage !== 'skipped'
            ? ticket.tests
            : null
    const blockers =
        ticket.findings && ticket.stage !== 'done' ? ticket.findings.blocker : 0
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ticket ${ticket.number}, ${ticket.stage}. ${open ? 'Hide' : 'Show'} details`}
            onPress={onToggle}
            style={({ pressed }) => [
                styles.card,
                pressed ? styles.cardPressed : null,
            ]}
        >
            <View style={styles.cardTop}>
                <Text style={styles.number}>#{ticket.number}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>
                    {ticket.title}
                </Text>
                {ticket.refactor ? (
                    <Text style={styles.tag}>refactor</Text>
                ) : null}
                <View style={styles.spacer} />
                <Text style={[styles.pill, { color, borderColor: color }]}>
                    {ticket.activity}
                </Text>
                <Icon
                    name={open ? 'ChevronDown' : 'ChevronRight'}
                    size={14}
                    color={theme.colors.foregroundMuted}
                />
            </View>
            <View style={styles.row}>
                <StepDots ticket={ticket} theme={theme} styles={styles} />
                <Text style={styles.text} numberOfLines={1}>
                    {ticket.role ?? ''}
                </Text>
            </View>
            {ticket.current_step ? (
                <StepLine
                    step={ticket.current_step}
                    prefix=""
                    styles={styles}
                />
            ) : null}
            <View style={styles.row}>
                <Counter
                    label="fix"
                    value={ticket.fix_round}
                    theme={theme}
                    styles={styles}
                />
                <Counter
                    label="review"
                    value={ticket.review_round}
                    theme={theme}
                    styles={styles}
                />
                <Text style={styles.mono}>
                    {tokensText({ tokens: ticket.tokens })} tokens
                </Text>
                {ticket.plan_used.length > 0 ? (
                    <Text style={styles.mono}>
                        plan:{' '}
                        {planUsedText({ used: ticket.plan_used, sign: '+' })}
                    </Text>
                ) : null}
                {failing ? (
                    <Text
                        style={[
                            styles.muted,
                            { color: theme.colors.statusDanger },
                        ]}
                    >
                        {failing.failing} of {failing.total} tests failing
                    </Text>
                ) : null}
                {blockers > 0 ? (
                    <Text
                        style={[
                            styles.muted,
                            { color: theme.colors.statusWarning },
                        ]}
                    >
                        {blockers} blocker from the ticket review
                    </Text>
                ) : null}
            </View>
            {open ? (
                <TicketDetail ticket={ticket} state={state} styles={styles} />
            ) : null}
        </Pressable>
    )
}

const findingsLine = ({ lens }: { lens: LensCard }): string | null => {
    const parts = [
        lens.findings.blocker > 0 ? `${lens.findings.blocker} blocker` : null,
        lens.findings.should_fix > 0
            ? `${lens.findings.should_fix} should-fix`
            : null,
        lens.findings.nit > 0 ? `${lens.findings.nit} nit` : null,
    ].filter((part) => part !== null)
    return parts.length > 0 ? parts.join(', ') : null
}

const LensCardView = ({ lens, theme, styles }: { lens: LensCard } & Look) => {
    const color = lensColor({ state: lens.state, theme })
    const findings = findingsLine({ lens })
    return (
        <View style={styles.card}>
            <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{lens.name}</Text>
                <View style={styles.spacer} />
                <Text style={[styles.pill, { color, borderColor: color }]}>
                    {lens.state}
                </Text>
            </View>
            {findings ? (
                <Text
                    style={[
                        styles.muted,
                        {
                            color:
                                lens.findings.blocker > 0
                                    ? theme.colors.statusDanger
                                    : theme.colors.statusWarning,
                        },
                    ]}
                >
                    {findings}
                </Text>
            ) : null}
        </View>
    )
}

const reviewLine = ({ state }: { state: BoardState }): string => {
    const review = state.final_review
    const open = state.tickets.filter(
        (ticket) => ticket.stage !== 'done' && ticket.stage !== 'skipped'
    ).length
    switch (review.state) {
        case 'waiting':
            return review.active
                ? 'Every ticket is done or skipped. It starts next.'
                : `Starts when every ticket is done or skipped (${open} still open).`
        case 'reviewing':
            return `Round ${review.round}: a fresh reviewer per lens reads the whole run branch.`
        case 'fixing':
            return `Fix round ${review.fix_round}/${LOOP_CAP}: the implementer fixes what the lenses found.`
        case 'stuck':
            return 'Stuck: it needs your reply (see Needs you).'
        case 'passed':
            return 'Passed.'
    }
}

const FinalReviewStack = ({
    state,
    theme,
    styles,
}: { state: BoardState } & Look) => {
    const review = state.final_review
    return (
        <View
            style={[styles.block, review.active ? null : { opacity: DIMMED }]}
        >
            <View style={styles.row}>
                <Icon
                    name="GitPullRequest"
                    size={15}
                    color={theme.colors.foreground}
                />
                <Text style={styles.reviewTitle}>Final review · 5 lenses</Text>
                <View style={styles.spacer} />
                <Counter
                    label="round"
                    value={review.round}
                    theme={theme}
                    styles={styles}
                />
                <Counter
                    label="fix"
                    value={review.fix_round}
                    theme={theme}
                    styles={styles}
                />
            </View>
            <Text style={styles.muted}>{reviewLine({ state })}</Text>
            {LENS_STAGES.map((entry) => {
                const lenses = review.lenses.filter(
                    (lens) => lens.state === entry.stage
                )
                return (
                    <View key={entry.stage} style={styles.block}>
                        <StageHeader
                            title={entry.title}
                            hint=""
                            icon={entry.icon}
                            count={lenses.length}
                            color={lensColor({ state: entry.stage, theme })}
                            folded={null}
                            onPress={null}
                            theme={theme}
                            styles={styles}
                        />
                        {lenses.length > 0 ? (
                            <View style={styles.stageBody}>
                                {lenses.map((lens) => (
                                    <LensCardView
                                        key={lens.name}
                                        lens={lens}
                                        theme={theme}
                                        styles={styles}
                                    />
                                ))}
                            </View>
                        ) : null}
                    </View>
                )
            })}
        </View>
    )
}

const Banner = ({
    icon,
    color,
    children,
    styles,
}: {
    icon: string
    color: string
    children: ReactNode
    styles: Styles
}) => (
    <View style={[styles.banner, { borderColor: color }]}>
        <Icon name={icon} size={13} color={color} />
        <Text style={[styles.bannerText, { color }]}>{children}</Text>
    </View>
)

const UsageLine = ({ state, theme, styles }: { state: BoardState } & Look) => {
    const { usage, usage_label } = state
    return (
        <View style={styles.row}>
            <Icon name="Gauge" size={13} color={theme.colors.foregroundMuted} />
            {usage ? (
                <Text style={styles.mono}>
                    {usage_label}: 5h{' '}
                    <Text
                        style={{
                            color: usageColor({
                                level: usage.five_hour_level,
                                theme,
                            }),
                        }}
                    >
                        {percentText({ percent: usage.five_hour_percent })}
                    </Text>{' '}
                    · week{' '}
                    <Text
                        style={{
                            color: usageColor({
                                level: usage.weekly_level,
                                theme,
                            }),
                        }}
                    >
                        {percentText({ percent: usage.weekly_percent })}
                    </Text>
                </Text>
            ) : (
                <Text style={styles.mono}>{usage_label}: no reading yet</Text>
            )}
        </View>
    )
}

/** A tab per recent run; the older ones stay folded behind one chip. */
const RunPicker = ({
    runs,
    selected,
    onPick,
    theme,
    styles,
}: {
    runs: RunSummary[]
    selected: string
    onPick: (run_id: string) => void
} & Look) => {
    const [showOlder, setShowOlder] = useState(false)
    const { shown, folded } = foldRuns({ runs, selected })
    return (
        <View style={styles.row}>
            {(showOlder ? [...shown, ...folded] : shown).map((run) => (
                <RunChip
                    key={run.run_id}
                    run={run}
                    on={run.run_id === selected}
                    onPick={onPick}
                    theme={theme}
                    styles={styles}
                />
            ))}
            {folded.length > 0 ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                        showOlder
                            ? 'Fold the older runs'
                            : `Show ${folded.length} older runs`
                    }
                    onPress={() => setShowOlder((open) => !open)}
                    style={styles.chip}
                >
                    <Text style={styles.small}>
                        {showOlder ? 'fold older' : `${folded.length} older`}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    )
}

const RunChip = ({
    run,
    on,
    onPick,
    theme,
    styles,
}: {
    run: RunSummary
    on: boolean
    onPick: (run_id: string) => void
} & Look) => (
    <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show run ${run.run_id}`}
        onPress={() => onPick(run.run_id)}
        style={[styles.chip, on ? styles.chipOn : null]}
    >
        <Text style={styles.small}>
            {run.spec_number === null ? 'demo' : `#${run.spec_number}`} ·{' '}
            <Text
                style={{
                    color: statusColor({ status: run.status, theme }),
                }}
            >
                {statusText({ status: run.status })}
            </Text>
            {run.needs_you > 0 ? ` · ${run.needs_you} need you` : ''}
        </Text>
    </Pressable>
)

const Section = ({
    children,
    styles,
}: {
    children: ReactNode
    styles: Styles
}) => <View style={styles.block}>{children}</View>

/** The workspace panel: the newest (or picked) run of this workspace. */
export const BoardPanel = ({
    theme,
    layout,
    workspaceId,
}: PluginWorkspacePanelProps) => {
    const readBoard = useRpc(boardReadRpc)
    const directory = useWorkspace(workspaceId, (found) => found.directory)
    const [picked, setPicked] = useState<Key | null>(null)
    const board = useQuery({
        queryKey: ['luca-board', workspaceId, directory, picked],
        queryFn: () =>
            readBoard({
                workspace_id: workspaceId,
                directory,
                run_id: picked,
            }),
        refetchInterval: POLL_MS,
    })
    const styles = useMemo(
        () => makeStyles({ theme, compact: layout.compact }),
        [theme, layout.compact]
    )
    const [openCards, setOpenCards] = useState<ReadonlySet<Key>>(
        () => new Set()
    )
    const [folded, setFolded] = useState<ReadonlySet<Key>>(
        () =>
            new Set(
                TICKET_STAGES.filter((entry) => entry.folded).map(
                    (entry) => entry.stage
                )
            )
    )
    const look = { theme, styles }
    const state = board.data?.selected ?? null

    if (!state) {
        return (
            <ScrollView
                style={styles.screen}
                contentContainerStyle={styles.content}
            >
                <Text style={styles.title}>Luca board</Text>
                <Text style={styles.muted}>
                    {board.isError
                        ? `Couldn't read the board: ${String(board.error)}`
                        : board.isPending
                          ? 'Loading…'
                          : EMPTY_BOARD_TEXT}
                </Text>
            </ScrollView>
        )
    }

    const { run } = state
    const runs = board.data?.runs ?? []
    const card = (ticket: TicketCard) => {
        const key = `ticket-${ticket.number}`
        return (
            <TicketCardView
                key={key}
                ticket={ticket}
                state={state}
                open={openCards.has(key)}
                onToggle={() => setOpenCards((set) => toggled({ set, key }))}
                {...look}
            />
        )
    }

    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={styles.content}
        >
            <View style={styles.row}>
                <Text style={styles.title}>Luca board</Text>
                <View style={styles.spacer} />
                <Text
                    style={[
                        styles.pill,
                        {
                            color: statusColor({ status: run.status, theme }),
                            borderColor: statusColor({
                                status: run.status,
                                theme,
                            }),
                        },
                    ]}
                >
                    {statusText({ status: run.status })}
                </Text>
            </View>
            {runs.length > 1 ? (
                <RunPicker
                    runs={runs}
                    selected={run.run_id}
                    onPick={setPicked}
                    {...look}
                />
            ) : null}
            <Text style={styles.text} numberOfLines={layout.compact ? 3 : 2}>
                {runTitle(run)}
                {run.branch ? (
                    <Text style={styles.muted}> · {run.branch}</Text>
                ) : null}
            </Text>
            {run.pr_url ? (
                <ExternalLink href={run.pr_url}>
                    <Text style={styles.prLink}>
                        Pull request{run.pr_number ? ` #${run.pr_number}` : ''}:{' '}
                        {run.pr_url}
                    </Text>
                </ExternalLink>
            ) : null}
            <UsageLine state={state} {...look} />
            {state.current_step ? (
                <StepLine
                    step={state.current_step}
                    prefix="Now: "
                    styles={styles}
                />
            ) : null}
            {state.run_tokens > 0 ? (
                <Text style={styles.mono}>
                    This run&apos;s tokens:{' '}
                    {tokensText({ tokens: state.run_tokens })} of its run budget{' '}
                    {tokensText({ tokens: state.run_budget_tokens })}
                </Text>
            ) : null}
            {state.run_plan_used.length > 0 ? (
                <Text style={styles.mono}>
                    This run used:{' '}
                    {planUsedText({ used: state.run_plan_used, sign: '' })}
                </Text>
            ) : null}
            {state.limit_wait ? (
                <Banner
                    icon="Hourglass"
                    color={theme.colors.statusWarning}
                    styles={styles}
                >
                    {limitWaitText({
                        window: state.limit_wait.window,
                        resets_at: state.limit_wait.resets_at,
                        now: Date.now(),
                    })}
                </Banner>
            ) : null}
            {state.usage_line_wait ? (
                <Banner
                    icon="Hourglass"
                    color={theme.colors.statusWarning}
                    styles={styles}
                >
                    {usageLineWaitText({
                        ...state.usage_line_wait,
                        now: Date.now(),
                    })}
                </Banner>
            ) : null}
            {run.stopped ? (
                <Banner
                    icon="OctagonX"
                    color={theme.colors.statusDanger}
                    styles={styles}
                >
                    {stoppedText(run.stopped)}
                </Banner>
            ) : null}
            {run.engine_ended && !run.engine_ended.ok ? (
                <Banner
                    icon="OctagonX"
                    color={theme.colors.statusDanger}
                    styles={styles}
                >
                    The engine stopped: {run.engine_ended.message}
                </Banner>
            ) : null}
            {run.refusal.length > 0 ? (
                <Banner
                    icon="Ban"
                    color={theme.colors.statusDanger}
                    styles={styles}
                >
                    Intake refused the run. {run.refusal.join(' ')}
                </Banner>
            ) : null}
            <Text style={styles.small}>
                Step dots: tests → red check → code → checks → review. Tap a
                card for details.
            </Text>

            <Section styles={styles}>
                <StageHeader
                    title="Needs you"
                    hint="stuck work waiting for your reply on the spec issue"
                    icon="OctagonAlert"
                    count={state.needs_you.length}
                    color={theme.colors.statusDanger}
                    folded={null}
                    onPress={null}
                    {...look}
                />
                {state.needs_you.length > 0 ? (
                    <View style={styles.stageBody}>
                        {state.needs_you.map((item) => (
                            <NeedsYouCard
                                key={item.key}
                                item={item}
                                spec_number={run.spec_number}
                                {...look}
                            />
                        ))}
                    </View>
                ) : null}
            </Section>

            {TICKET_STAGES.map((entry) => {
                const tickets = state.tickets.filter(
                    (ticket) => ticket.stage === entry.stage
                )
                const isFolded = folded.has(entry.stage)
                return (
                    <Section key={entry.stage} styles={styles}>
                        <StageHeader
                            title={entry.title}
                            hint={entry.hint}
                            icon={entry.icon}
                            count={tickets.length}
                            color={stageColor({ stage: entry.stage, theme })}
                            folded={isFolded}
                            onPress={() =>
                                setFolded((set) =>
                                    toggled({ set, key: entry.stage })
                                )
                            }
                            {...look}
                        />
                        {tickets.length > 0 && !isFolded ? (
                            <View style={styles.stageBody}>
                                {tickets.map(card)}
                            </View>
                        ) : null}
                    </Section>
                )
            })}

            {showsFinalReview({ state }) ? (
                <>
                    <View style={styles.rule} />
                    <FinalReviewStack state={state} {...look} />
                </>
            ) : null}

            <View style={styles.rule} />
            <Text style={styles.small}>
                {run.run_id} · {state.event_count} events · engine{' '}
                {run.engine_ended
                    ? run.engine_ended.ok
                        ? 'finished'
                        : 'stopped'
                    : 'running'}
            </Text>
            {state.latest ? (
                <Text style={styles.small} numberOfLines={2}>
                    latest: {state.latest}
                </Text>
            ) : null}
            {state.jev.asked > 0 ? (
                <Text style={styles.small}>
                    Jev, in shadow mode: {state.jev.asked} asked,{' '}
                    {state.jev.answered} answered, {state.jev.failed} without an
                    answer. The engine doesn't act on them.
                </Text>
            ) : null}
            {state.memory.searches > 0 || state.memory.learner !== 'waiting' ? (
                <Text style={styles.small}>
                    Memory: {state.memory.searches} searches (
                    {state.memory.search_errors} vault errors),{' '}
                    {state.memory.shown} shown. Learner: {state.memory.learner}
                    {state.memory.added +
                        state.memory.updated +
                        state.memory.refused +
                        state.memory.failed >
                    0
                        ? `; ${state.memory.added} added, ${state.memory.updated} updated, ${state.memory.refused} refused, ${state.memory.failed} failed`
                        : ''}
                    .
                </Text>
            ) : null}
            {state.messages.sent + state.messages.refused > 0 ? (
                <Text style={styles.small}>
                    Agent messages: {state.messages.sent} sent,{' '}
                    {state.messages.delivered} handed over,{' '}
                    {state.messages.refused} refused.
                </Text>
            ) : null}
            {state.shared_git_changed > 0 ? (
                <Text style={styles.small}>
                    Outside changes to the shared .git:{' '}
                    {state.shared_git_changed}. Other processes made them, not
                    the agents.
                </Text>
            ) : null}
        </ScrollView>
    )
}
