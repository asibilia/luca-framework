import type { PluginTheme } from '@getpaseo/plugin'
import { Platform } from 'react-native'

import type { Tone } from '../shared/board-rows'
import type {
    LensState,
    RunStatus,
    TicketStage,
    UsageLevel,
} from '../shared/board-state'

/**
 * Colors and words shared by the side panel and the chat rows, so both views
 * match. Every color comes from the host theme.
 */

export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })

/** Opacity for dimmed parts: empty stages, the final review before it starts. */
export const DIMMED = 0.45

/** Plan usage color: green below 60%, yellow 60–85%, red above 85%. */
export const usageColor = ({
    level,
    theme,
}: {
    level: UsageLevel
    theme: PluginTheme
}): string => {
    switch (level) {
        case 'ok':
            return theme.colors.statusSuccess
        case 'warn':
            return theme.colors.statusWarning
        case 'high':
            return theme.colors.statusDanger
    }
}

export const stageColor = ({
    stage,
    theme,
}: {
    stage: TicketStage
    theme: PluginTheme
}): string => {
    switch (stage) {
        case 'building':
        case 'reviewing':
            return theme.colors.accent
        case 'stuck':
            return theme.colors.statusDanger
        case 'done':
            return theme.colors.statusSuccess
        case 'blocked':
        case 'skipped':
            return theme.colors.foregroundMuted
    }
}

export const lensColor = ({
    state,
    theme,
}: {
    state: LensState
    theme: PluginTheme
}): string => {
    switch (state) {
        case 'waiting':
            return theme.colors.foregroundMuted
        case 'reviewing':
            return theme.colors.accent
        case 'fixing':
            return theme.colors.statusWarning
        case 'clean':
            return theme.colors.statusSuccess
    }
}

export const toneColor = ({
    tone,
    theme,
}: {
    tone: Tone
    theme: PluginTheme
}): string => {
    switch (tone) {
        case 'info':
            return theme.colors.accent
        case 'success':
            return theme.colors.statusSuccess
        case 'warning':
            return theme.colors.statusWarning
        case 'danger':
            return theme.colors.statusDanger
    }
}

export const statusColor = ({
    status,
    theme,
}: {
    status: RunStatus
    theme: PluginTheme
}): string => {
    switch (status) {
        case 'done':
            return theme.colors.statusSuccess
        case 'stuck':
        case 'refused':
        case 'ended_with_error':
            return theme.colors.statusDanger
        case 'limit_wait':
            return theme.colors.statusWarning
        case 'starting':
        case 'intake':
        case 'building':
        case 'final_review':
            return theme.colors.accent
        case 'nothing_to_do':
            return theme.colors.foregroundMuted
    }
}

/** A run status in words. */
export const statusText = ({ status }: { status: RunStatus }): string => {
    switch (status) {
        case 'starting':
            return 'starting'
        case 'intake':
            return 'intake'
        case 'building':
            return 'building'
        case 'final_review':
            return 'final review'
        case 'limit_wait':
            return 'limit wait'
        case 'done':
            return 'done'
        case 'refused':
            return 'refused'
        case 'nothing_to_do':
            return 'nothing to do'
        case 'stuck':
            return 'stuck'
        case 'ended_with_error':
            return 'engine stopped'
    }
}

/** 1234 → "1.2k". */
export const tokensText = ({ tokens }: { tokens: number }): string =>
    tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)

const two = ({ value }: { value: number }) => String(value).padStart(2, '0')

/** An ISO time as local "hh:mm", or the text itself when it isn't a time. */
export const clockText = ({ iso }: { iso: string }): string => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return `${two({ value: date.getHours() })}:${two({ value: date.getMinutes() })}`
}

/** When a limit resets, e.g. "17:00 (in 1h 20m)". */
export const resetsText = ({
    resets_at,
    now,
}: {
    resets_at: string | null
    now: number
}): string => {
    if (!resets_at) return 'unknown'
    const at = new Date(resets_at).getTime()
    if (Number.isNaN(at)) return resets_at
    const minutes = Math.max(0, Math.round((at - now) / 60_000))
    const left =
        minutes >= 60
            ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
            : `${minutes}m`
    return `${clockText({ iso: resets_at })} (in ${left})`
}

/** "Spec #10 · Add CSV export", or "Demo run" before the engine names one. */
export const runTitle = ({
    spec_number,
    spec_title,
    demo,
}: {
    spec_number: number | null
    spec_title: string | null
    demo: boolean
}): string => {
    const spec =
        spec_number === null
            ? demo
                ? 'Demo run'
                : 'Run'
            : `${demo ? 'Demo · ' : ''}Spec #${spec_number}`
    return spec_title ? `${spec} · ${spec_title}` : spec
}
