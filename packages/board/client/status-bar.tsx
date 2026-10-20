/**
 * The status bar (#633): one line pinned at the bottom of the side panel,
 * below the scrolling cards, such as
 * "4/10 joined · 2·1 agents · 3.1M/15M tok · week 42% · latest 2s ago".
 * Each agent count is in its model's color. A tap shows it all in words.
 */
import { Fragment } from 'react'

import { Text, View } from 'react-native'

import { modelColor, percentText, tokensText, useNow } from './board-look'
import type { Look } from './board-panel-styles'
import { BubbleScope, CutLine, useBubbles } from './one-line'

import { elapsedText, type BoardState } from '../shared/board-state'

/** The models first in the bar, in this order; any other comes after. */
const MODEL_ORDER = ['opus', 'sonnet', 'haiku']

/**
 * The agents in a turn and their running helpers, counted per model, in
 * `MODEL_ORDER`.
 *
 * @example
 * agentsPerModel({ state }) // [{ model: 'opus', count: 2 }, { model: 'sonnet', count: 1 }]
 */
const agentsPerModel = ({
    state,
}: {
    state: BoardState
}): { model: string; count: number }[] => {
    const counts = new Map<string, number>()
    const count = (name: string | null) => {
        const model = (name ?? 'unknown').toLowerCase()
        counts.set(model, (counts.get(model) ?? 0) + 1)
    }
    for (const agent of state.live_agents) {
        count(agent.model)
        // Running helpers count too (#636), on their own model.
        for (const helper of agent.helpers) {
            if (!helper.done) count(helper.model)
        }
    }
    const rank = (model: string) => {
        const found = MODEL_ORDER.indexOf(model)
        return found === -1 ? MODEL_ORDER.length : found
    }
    return [...counts.entries()]
        .map(([model, count]) => ({ model, count }))
        .sort(
            (left, right) =>
                rank(left.model) - rank(right.model) ||
                left.model.localeCompare(right.model)
        )
}

/** Tokens, short, with no ".0": 15000000 → "15M", 3100000 → "3.1M". */
const shortTokens = ({ tokens }: { tokens: number }): string =>
    tokensText({ tokens }).replace(/\.0(?=[kM]$)/, '')

export const StatusBar = ({
    state,
    theme,
    styles,
}: { state: BoardState } & Look) => {
    const bubbles = useBubbles()
    const now = useNow()
    const joined = state.tickets.filter((card) => card.stage === 'done').length
    const total = state.tickets.length
    const models = agentsPerModel({ state })
    const used = shortTokens({ tokens: state.run_tokens })
    const budget = shortTokens({ tokens: state.run_budget_tokens })
    const week = state.usage?.weekly_percent ?? null
    const age =
        state.latest_at === null
            ? null
            : elapsedText({ ms: now - Date.parse(state.latest_at) })

    const head = `${joined}/${total} joined · `
    const counts =
        models.length === 0
            ? '0'
            : models.map(({ count }) => String(count)).join('·')
    const tail = [
        ' agents',
        `${used}/${budget} tok`,
        `week ${percentText({ percent: week })}`,
        `latest ${age === null ? '–' : `${age} ago`}`,
    ].join(' · ')
    const full = [
        `${joined} of ${total} tickets joined`,
        models.length === 0
            ? 'no agents running'
            : `agents running: ${models.map(({ model, count }) => `${count} on ${model}`).join(', ')}`,
        `${used} of the run's ${budget} tokens`,
        week === null
            ? 'no plan reading yet this week'
            : `plan ${week}% used this week`,
        age === null ? 'no event yet' : `latest event ${age} ago`,
    ].join(' · ')

    return (
        <View style={styles.statusBar}>
            <BubbleScope bubbles={bubbles} styles={styles}>
                <CutLine
                    text={`${head}${counts}${tail}`}
                    full={full}
                    style={styles.mono}
                    styles={styles}
                >
                    {head}
                    {models.length === 0
                        ? counts
                        : models.map(({ model, count }, index) => (
                              <Fragment key={model}>
                                  {index > 0 ? '·' : ''}
                                  <Text
                                      style={{
                                          color: modelColor({ model, theme }),
                                      }}
                                  >
                                      {String(count)}
                                  </Text>
                              </Fragment>
                          ))}
                    {tail}
                </CutLine>
            </BubbleScope>
        </View>
    )
}
