/**
 * Reading a webview's HTML the way the owner sees it (#752), so tests
 * check words and not markup.
 *
 * - `htmlLines`: the visible text, one line per block (a paragraph, a
 *   list item, a heading, a `<br>`); inline tags such as `<strong>`,
 *   `<code>` and `<a>` don't break a line. Entities are decoded.
 * - `htmlButtons`: the text of every `<button>`.
 * - `scriptSources`: the `script-src` sources of the page's
 *   `Content-Security-Policy` meta tag, or null when it has none.
 */

const INLINE_TAG =
    /<\/?(?:a|abbr|b|cite|code|em|i|kbd|mark|q|s|small|span|strong|sub|sup|time|u)\b[^>]*>/gi

const BUTTON = /<button\b[^>]*>([\s\S]*?)<\/button>/gi

const CSP_META = /<meta\b[^>]*http-equiv=["']?Content-Security-Policy[^>]*>/i

const decode = (text: string): string =>
    text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&#x0*27;/gi, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')

const withoutHidden = (html: string): string =>
    html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '\n')

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** The page's visible text, one trimmed line per block, no empty lines. */
export const htmlLines = ({ html }: { html: string }): string[] =>
    decode(
        withoutHidden(html)
            .replace(INLINE_TAG, '')
            .replace(/<[^>]*>/g, '\n')
    )
        .split('\n')
        .map(tidy)
        .filter((line) => line !== '')

/** The visible text as one string, lines joined by a space. */
export const htmlText = ({ html }: { html: string }): string =>
    htmlLines({ html }).join(' ')

/** The text of every button, in order. */
export const htmlButtons = ({ html }: { html: string }): string[] =>
    [...withoutHidden(html).matchAll(BUTTON)].map((match) =>
        tidy(decode((match[1] ?? '').replace(/<[^>]*>/g, '')))
    )

/** The `script-src` sources of the page's Content Security Policy. */
export const scriptSources = ({ html }: { html: string }): string[] | null => {
    const meta = CSP_META.exec(html)
    if (meta === null) return null
    const content = /content="([^"]*)"/i.exec(meta[0])?.[1]
    if (content === undefined) return null
    const directive = decode(content)
        .split(';')
        .map((part) => part.trim().split(/\s+/))
        .find(([name]) => name === 'script-src')
    return directive === undefined ? null : directive.slice(1)
}
