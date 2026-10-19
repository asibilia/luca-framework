/**
 * The small pieces the panel's sections share: a fix-loop counter, a running
 * step with its time, a stage header, a banner, and a section.
 */
import type { ReactNode } from 'react'

import { Icon } from '@getpaseo/plugin/client/react-native'
import { Pressable, Text, View } from 'react-native'

import { useNow } from './board-look'
import type { Look, Styles } from './board-panel-styles'
import { CutLine, useCloseBubble } from './one-line'

import {
    LOOP_CAP,
    currentStepText,
    type CurrentStep,
} from '../shared/board-state'

export const Counter = ({
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
        <Text
            style={[styles.counter, { color, borderColor: color }]}
            numberOfLines={1}
        >
            {label} {value}/{LOOP_CAP}
        </Text>
    )
}

/** A running step with its time, counting up by itself, on one line. */
export const StepLine = ({
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
        <CutLine
            text={`${prefix}${currentStepText({ step, now })}`}
            style={styles.muted}
            styles={styles}
        />
    )
}

export const StageHeader = ({
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
    const closeBubble = useCloseBubble()
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
            onPress={() => {
                closeBubble()
                onPress()
            }}
            style={style}
        >
            {content}
        </Pressable>
    )
}

export const Banner = ({
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

export const Section = ({
    children,
    styles,
}: {
    children: ReactNode
    styles: Styles
}) => <View style={styles.block}>{children}</View>
