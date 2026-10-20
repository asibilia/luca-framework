/**
 * The side panel's styles: one `StyleSheet` made from the host theme, and
 * the `Look` (theme and styles) every piece of the panel takes.
 */
import type { PluginTheme } from '@getpaseo/plugin'
import { StyleSheet } from 'react-native'

import { DIMMED, MONO } from './board-look'

export const makeStyles = ({
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
        /** Fills the scroll area, so a tap on its blank part lands too. */
        fill: { flexGrow: 1 },
        /** The cards' scroll area, above the pinned status bar. */
        scroll: { flex: 1 },
        /** The status bar, pinned at the bottom of the panel. */
        statusBar: {
            flexShrink: 0,
            gap: 4,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            backgroundColor: colors.surface1,
            paddingHorizontal: compact ? 10 : 16,
            paddingVertical: 5,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: compact ? 6 : 10,
        },
        /** A row that stays on one line: its cut lines give way. */
        line: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: compact ? 6 : 10,
        },
        /** A part that never shrinks or gets cut: a number, tag or time. */
        fixed: { flexShrink: 0 },
        /** What holds a cut line: it gives way, down to nothing. */
        cut: { flexShrink: 1, minWidth: 0 },
        /** The bubble a tap on a cut line opens, with its full text. */
        bubble: {
            color: colors.foreground,
            backgroundColor: colors.surface2,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 5,
            fontSize: 12,
        },
        title: { color: colors.foreground, fontSize: 16, fontWeight: '700' },
        spacer: { flex: 1 },
        text: { color: colors.foreground, fontSize: 13 },
        muted: { color: colors.foregroundMuted, fontSize: 12 },
        mono: { color: colors.foregroundMuted, fontSize: 12, fontFamily: MONO },
        small: { color: colors.foregroundMuted, fontSize: 11 },
        pill: {
            flexShrink: 0,
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
            flexShrink: 0,
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
            flexShrink: 0,
            color: colors.foregroundMuted,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 4,
            paddingHorizontal: 4,
            fontSize: 10,
        },
        /** Clef's confidence bar, and its part filled to the confidence. */
        confidence: {
            flexShrink: 0,
            width: 28,
            height: 5,
            borderRadius: 3,
            overflow: 'hidden',
            backgroundColor: colors.surface2,
        },
        confidenceFill: { height: 5 },
        /** A running helper's line (#636), its left edge in its model's colour. */
        helperLine: { borderLeftWidth: 2, paddingLeft: 6 },
        dots: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
        dotCell: { flexDirection: 'row', alignItems: 'center' },
        link: { width: compact ? 7 : 10, height: 2 },
        dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
        dotCurrent: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
        dotSkip: { borderStyle: 'dashed' },
        stepLabel: { fontSize: 12, fontWeight: '600', marginLeft: 6 },
        /** A waiting card's amber bar, where a heartbeat would be. */
        waitBar: {
            flexShrink: 0,
            width: 28,
            height: 4,
            borderRadius: 2,
            opacity: 0.8,
        },
        /** A busy card's heartbeat, and each of its bars, standing on the bottom. */
        heartbeat: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            flexShrink: 0,
            height: 14,
            gap: 1,
        },
        heartbeatBar: { width: 2, borderRadius: 1 },
        counter: {
            flexShrink: 0,
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

export type Styles = ReturnType<MakeStyles>

export type Look = { theme: PluginTheme; styles: Styles }
