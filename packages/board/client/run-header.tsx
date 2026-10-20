/**
 * The top of the side panel: the title and status, the run tabs, the run's
 * title and pull request, plan usage, what the engine is doing now, the
 * run's tokens and plan used, and the banners (a repo wait, a limit wait, a
 * version note, a stop, the engine ending, intake refusing the run).
 */
import type { PluginWorkspacePanelProps } from '@getpaseo/plugin/client'
import { ExternalLink } from '@getpaseo/plugin/client/ui'
import { Text, View } from 'react-native'

import {
    limitWaitText,
    runTitle,
    statusColor,
    statusText,
    tokensText,
    usageLineWaitText,
    useNow,
} from './board-look'
import { Banner, StepLine } from './board-panel-parts'
import type { Look } from './board-panel-styles'
import { noLife } from './engine-life'
import { RepoWaitBanner } from './repo-wait-banner'
import { RunPicker } from './run-picker'
import { UsageLine } from './usage-line'

import {
    planUsedText,
    stoppedText,
    type BoardState,
    type RunSummary,
} from '../shared/board-state'

export const RunHeader = ({
    state,
    runs,
    setPicked,
    layout,
    theme,
    styles,
}: {
    state: BoardState
    runs: RunSummary[]
    setPicked: (run_id: string) => void
    layout: PluginWorkspacePanelProps['layout']
} & Look) => {
    const { run } = state
    const look = { theme, styles }
    // With no sign of life (#635), the step's time and the repo wait's stop.
    const lifeless = noLife({ state, now: useNow() })
    return (
        <>
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
                    at={lifeless?.at ?? null}
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
            {state.repo_wait && run.engine_ended === null ? (
                <RepoWaitBanner
                    wait={state.repo_wait}
                    lifeless={lifeless}
                    {...look}
                />
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
            {run.version_note ? (
                <Banner
                    icon="Info"
                    color={theme.colors.statusWarning}
                    styles={styles}
                >
                    {run.version_note}
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
        </>
    )
}
