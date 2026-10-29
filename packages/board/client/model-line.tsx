/**
 * A card's model line (#630): the agent's model as a coloured tag, then
 * Clef's line saying why it got that model, from its `model_reason` and
 * its `agent_model` answer. A pick from Clef's answer shows a bar filled to
 * its confidence: green when sharp (at or over the config's
 * `models.confidence_bar`), orange when split. A tap on the line shows a
 * full sentence. An older journal, with no `model_reason`, shows the tag
 * only.
 */
import { Text, View } from 'react-native'

import { CONFIDENCE_COLORS, modelColor } from './board-look'
import type { Look } from './board-panel-styles'
import { CutLine } from './one-line'

import type { AgentModel } from '../shared/board-state'

/** Clef's line: its short text, its full sentence, and its bar, if any. */
type ClefLine = {
    short: string
    full: string
    /** The confidence its bar is filled to; `null` for no bar. */
    confidence: number | null
    sharp: boolean
}

/** "ticket-reviewer" → "ticket-reviewers". */
const plural = ({ role }: { role: string }): string => `${role}s`

const capital = ({ text }: { text: string }): string =>
    text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Clef's line for a model and its reason, judged against the bar; `null`
 * for an older journal's start, with no reason, or a reason the board
 * doesn't know.
 *
 * @example
 * clefLine({ model: { role: 'implementer', name: 'opus', reason: 'unsure', answer: { role: 'implementer', pick: 'sonnet', confidence: 0.36 } }, bar: 0.5 })
 * // { short: '0.36 split → stayed on opus', full: 'Clef picked sonnet but was only 0.36 sure (split: under 0.5), so Luca stayed on opus.', confidence: 0.36, sharp: false }
 */
export const clefLine = ({
    model,
    bar,
}: {
    model: AgentModel
    bar: number
}): ClefLine | null => {
    const { role, name, reason, answer } = model
    const confidence = answer?.confidence ?? null
    const pick = answer?.pick ?? 'no model'
    const sharp = confidence !== null && confidence >= bar
    const word = sharp ? 'sharp' : 'split'
    const sure = confidence?.toFixed(2) ?? ''
    const judged = `${word}: ${sharp ? 'at or over' : 'under'} ${bar}`
    const plain = { confidence: null, sharp: false }
    const picked = `${confidence === null ? 'clef' : `${sure} ${word}`} → ${name}`
    switch (reason) {
        case 'decision_model':
            return {
                short: picked,
                full:
                    confidence === null
                        ? `Clef picked ${name}, so Luca ran the ${role} on it.`
                        : `Clef picked ${name} and was ${sure} sure (${judged}), so Luca ran the ${role} on it.`,
                confidence,
                sharp,
            }
        case 'trial':
            return {
                short: `${picked} (trial)`,
                full:
                    confidence === null
                        ? `Clef picked ${name}, and Luca ran the ${role} on it in a model trial.`
                        : `Clef picked ${name} and was ${sure} sure (${judged}), and Luca ran the ${role} on it in a model trial.`,
                confidence,
                sharp,
            }
        case 'unsure':
            return {
                short: `${confidence === null ? 'unsure' : `${sure} ${word}`} → stayed on ${name}`,
                full:
                    confidence === null
                        ? `Clef picked ${pick} but didn't say how sure it was, so Luca stayed on ${name}.`
                        : sharp
                          ? `Clef picked ${pick}, which the ${role} can't run on, so Luca stayed on ${name}.`
                          : `Clef picked ${pick} but was only ${sure} sure (${judged}), so Luca stayed on ${name}.`,
                confidence,
                sharp,
            }
        case 'floor':
            return {
                short: `floor ${name} → ${name}`,
                full: `The ${role}'s model floor is ${name}, so it runs on ${name} whatever Clef picks.`,
                ...plain,
            }
        case 'after_failure':
            return {
                short: `a try failed → ${name}`,
                full: `The ${role} already failed a try on this ticket on a cheaper model, so Luca runs it on ${name}.`,
                ...plain,
            }
        case 'no_answer':
            return {
                short: `clef didn't answer → ${name}`,
                full: `Clef didn't answer (it was off, timed out, or failed), so Luca ran the ${role} on ${name}.`,
                ...plain,
            }
        case 'locked':
            return {
                short: `${plural({ role })} always run on ${name}`,
                full: `${capital({ text: plural({ role }) })} always run on ${name}: Clef doesn't pick their model.`,
                ...plain,
            }
        default:
            return null
    }
}

/** Clef's confidence as a small bar, filled to it. */
const ConfidenceBar = ({
    confidence,
    sharp,
    styles,
}: {
    confidence: number
    sharp: boolean
} & Pick<Look, 'styles'>) => {
    const now = Math.round(confidence * 100)
    return (
        <View
            accessibilityRole="progressbar"
            accessibilityLabel={`Clef's confidence, ${sharp ? 'sharp' : 'split'}`}
            accessibilityValue={{ min: 0, max: 100, now }}
            style={styles.confidence}
        >
            <View
                style={[
                    styles.confidenceFill,
                    {
                        width: `${now}%`,
                        backgroundColor: sharp
                            ? CONFIDENCE_COLORS.sharp
                            : CONFIDENCE_COLORS.split,
                    },
                ]}
            />
        </View>
    )
}

/** The model tag and Clef's line, on one line. */
export const ModelLine = ({
    model,
    bar,
    theme,
    styles,
}: {
    model: AgentModel
    bar: number
} & Look) => {
    const color = modelColor({ model: model.name, theme })
    const clef = clefLine({ model, bar })
    return (
        <View style={styles.line}>
            <Text
                style={[styles.tag, { color, borderColor: color }]}
                numberOfLines={1}
            >
                {model.name}
            </Text>
            {clef !== null && clef.confidence !== null ? (
                <ConfidenceBar
                    confidence={clef.confidence}
                    sharp={clef.sharp}
                    styles={styles}
                />
            ) : null}
            {clef ? (
                <CutLine
                    text={clef.short}
                    full={clef.full}
                    style={styles.muted}
                    styles={styles}
                />
            ) : null}
        </View>
    )
}
