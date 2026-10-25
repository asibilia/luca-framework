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

/**
 * `count` and `word`, with `s` past one; a word ending in a consonant and
 * `y` ends in `ies` instead.
 *
 * @example
 * plural(2, 'fix round') // '2 fix rounds'
 * plural(3, 'failed try') // '3 failed tries'
 */
export const plural = (count: number, word: string): string => {
    if (count === 1) return `${count} ${word}`
    return /[^aeiou]y$/.test(word)
        ? `${count} ${word.slice(0, -1)}ies`
        : `${count} ${word}s`
}
