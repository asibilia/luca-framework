import uniq from 'lodash/uniq'

/** The fix intake asks for when a criterion leaves text to guess. */
export const PIN_TEXT = 'pin the exact text'

/** The fix intake asks for when no agent can test a criterion. */
export const UNTESTABLE_TEXT =
    'no agent can check this; move it out of the acceptance criteria'

/**
 * Text that leaves an agent to guess, caught anywhere in a criterion, inside
 * quotes and code spans too (#541).
 */
const PLACEHOLDERS: RegExp[] = [
    /<[^<>\n]+>/g,
    /\be\.g\./gi,
    /\betc\b\.?/gi,
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
 * anywhere in a criterion, or an untestable ask (a screenshot, a changeset,
 * an ADR number) outside its code spans. Each problem names the ticket,
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
        const asks = found({
            text: text.replace(CODE_SPAN, ' '),
            patterns: UNTESTABLE_ASKS,
        })
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
        ]
    })
