/**
 * Formatting the stuck comments share: a clipped code fence for error text,
 * and counted words.
 */
import max from 'lodash/max'

/** Longest error text a comment or prompt quotes. */
const DETAIL_MAX = 3000

/** A code fence longer than any run of backticks in `text`. */
export const fenced = (text: string): string => {
    const longest = max((text.match(/`+/g) ?? []).map(({ length }) => length))
    const fence = '`'.repeat(Math.max(3, (longest ?? 0) + 1))
    const clipped =
        text.length > DETAIL_MAX
            ? `${text.slice(0, DETAIL_MAX)}\n... (clipped)`
            : text
    return `${fence}\n${clipped}\n${fence}`
}

export const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`
