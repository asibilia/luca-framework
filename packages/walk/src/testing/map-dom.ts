/**
 * Small HTML query helpers for Map panel tests (#800): inspect elements
 * and `data-*` attributes without assuming specific tag names or
 * attribute ordering.
 */

export type TagMatch = {
    tag: string
    attrs: string
    start: number
    end: number
    self_closing: boolean
}

export type FoundElement = TagMatch & { html: string }

export const stripScriptsAndStyles = ({ html }: { html: string }): string =>
    html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')

export const attrOf = ({
    attrs,
    name,
}: {
    attrs: string
    name: string
}): string | null => {
    const match = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`).exec(attrs)
    return match?.[1] ?? match?.[2] ?? null
}

const openingTags = ({ html }: { html: string }): TagMatch[] => {
    const tags: TagMatch[] = []
    const pattern = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^>]*)?)(\/?)>/g
    for (const match of html.matchAll(pattern)) {
        const start = match.index ?? 0
        tags.push({
            tag: match[1] ?? '',
            attrs: match[2] ?? '',
            start,
            end: start + match[0].length,
            self_closing: match[3] === '/',
        })
    }
    return tags
}

const elementSlice = ({
    html,
    tag_match,
}: {
    html: string
    tag_match: TagMatch
}): string => {
    if (tag_match.self_closing) {
        return html.slice(tag_match.start, tag_match.end)
    }
    const name = tag_match.tag
    const pattern = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'gi')
    pattern.lastIndex = tag_match.end
    let depth = 1
    let match = pattern.exec(html)
    while (match !== null) {
        if (match[1] === '/') {
            depth -= 1
            if (depth === 0) {
                return html.slice(
                    tag_match.start,
                    match.index + match[0].length
                )
            }
        } else if (match[2] !== '/') {
            depth += 1
        }
        match = pattern.exec(html)
    }
    return html.slice(tag_match.start, tag_match.end)
}

export const findElements = ({
    html,
    where,
}: {
    html: string
    where: (tag_match: TagMatch) => boolean
}): FoundElement[] => {
    const clean = stripScriptsAndStyles({ html })
    return openingTags({ html: clean })
        .filter(where)
        .map((tag_match) => ({
            ...tag_match,
            html: elementSlice({ html: clean, tag_match }),
        }))
}

export const boxOf = ({
    html,
    stop_id,
}: {
    html: string
    stop_id: string
}): FoundElement | undefined =>
    findElements({
        html,
        where: (el) =>
            attrOf({ attrs: el.attrs, name: 'data-stop-id' }) === stop_id &&
            attrOf({ attrs: el.attrs, name: 'data-state' }) !== null,
    })[0]

export const panelOf = ({
    html,
    stop_id,
}: {
    html: string
    stop_id: string
}): FoundElement | undefined =>
    findElements({
        html,
        where: (el) =>
            attrOf({ attrs: el.attrs, name: 'data-panel-for' }) === stop_id,
    })[0]
