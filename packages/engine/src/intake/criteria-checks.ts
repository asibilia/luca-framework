import uniq from 'lodash/uniq'

/** The fix intake asks for when a criterion leaves text to guess. */
export const PIN_TEXT = 'pin the exact text'

/** The fix intake asks for when no agent can test a criterion. */
export const UNTESTABLE_TEXT =
    'no agent can check this; move it out of the acceptance criteria'

/** The fix intake asks for when a criterion describes what stays as it is. */
export const UNCHANGED_TEXT =
    "describes behaviour that doesn't change, so no test can fail first; move it out of the acceptance criteria (for example into the ticket's notes)"

/**
 * Text that leaves an agent to guess, caught anywhere in a criterion, inside
 * quotes and code spans too (#541).
 */
const PLACEHOLDERS: RegExp[] = [
    /<[^<>\n]+>/g,
    /\be\.g\./gi,
    /\betc\./gi,
    /\bTBD\b/g,
    /\bTODO\b/g,
    /\.\.\.|…/g,
    /(?<![\w'-])[NMXY](?![\w'-])/g,
]

/** Asks no agent can test, caught outside code spans only (#541). */
const UNTESTABLE_ASKS: RegExp[] = [
    /\bscreenshots?\b/gi,
    /\bchangesets?\b/gi,
    /\bADR[\s#-]*\d+/g,
]

/**
 * Phrases for behaviour that doesn't change, caught outside code spans only
 * (#653): no test can fail first on them.
 */
const UNCHANGED_PHRASES: RegExp[] = [
    /\bunchanged\b/gi,
    /\bstays? the same\b/gi,
    /\bas (?:today|before)\b/gi,
]

/** Inline code spans: a run of backticks up to the same run. */
const CODE_SPAN = /(`+)[\s\S]*?\1/g

/** Every match of `patterns` in `text`, in pattern order, once each. */
const found = ({
    text,
    patterns,
}: {
    text: string
    patterns: RegExp[]
}): string[] =>
    uniq(
        patterns.flatMap((pattern) =>
            [...text.matchAll(pattern)].map(([match]) => match)
        )
    )

/** `text` as a markdown code span, fenced past any backticks inside it. */
const asCode = (text: string): string => {
    const longest = Math.max(
        0,
        ...[...text.matchAll(/`+/g)].map(([run]) => run.length)
    )
    const fence = '`'.repeat(longest + 1)
    return longest === 0
        ? `${fence}${text}${fence}`
        : `${fence} ${text} ${fence}`
}

/**
 * Intake's problems with one ticket's acceptance criteria: a placeholder
 * anywhere in a criterion, an untestable ask (a screenshot, a changeset,
 * an ADR number) outside its code spans, or, outside its code spans, words
 * for behaviour that doesn't change ("unchanged", "stays the same", "as
 * today", "as before"), once per criterion. Each problem names the ticket,
 * quotes the criterion, and says what to do. Pure. Empty when all are clean.
 *
 * @example
 * criteriaProblems({ ticket: 12, criteria: [{ id: 'AC1', text: 'Retries N times' }] })
 * // ['Acceptance criterion AC1 of #12 leaves text to guess (`N`): pin the exact text. It reads: `Retries N times`']
 */
export const criteriaProblems = ({
    ticket,
    criteria,
}: {
    ticket: number
    criteria: { id: string; text: string }[]
}): string[] =>
    criteria.flatMap(({ id, text }) => {
        const named = `Acceptance criterion ${id} of #${ticket}`
        const quoted = `It reads: ${asCode(text)}`
        const placeholders = found({ text, patterns: PLACEHOLDERS })
        const prose = text.replace(CODE_SPAN, ' ')
        const asks = found({ text: prose, patterns: UNTESTABLE_ASKS })
        const unchanged =
            found({ text: prose, patterns: UNCHANGED_PHRASES }).length > 0
        return [
            ...(placeholders.length === 0
                ? []
                : [
                      `${named} leaves text to guess (${placeholders.map(asCode).join(', ')}): ${PIN_TEXT}. ${quoted}`,
                  ]),
            ...(asks.length === 0
                ? []
                : [
                      `${named} asks for ${asks.map(asCode).join(', ')}: ${UNTESTABLE_TEXT}. ${quoted}`,
                  ]),
            ...(unchanged ? [`${named} ${UNCHANGED_TEXT}. ${quoted}`] : []),
        ]
    })
