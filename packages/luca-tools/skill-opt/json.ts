/**
 * Tolerant JSON extraction from an LLM response — strips ```json fences and
 * falls back to the first balanced `{...}` object if the whole string is not
 * valid JSON. Returns `null` when nothing parseable is found.
 */
export function extractJson(text: string): unknown | null {
    const trimmed = text.trim()

    const direct = tryParse(trimmed)
    if (direct !== null) return direct

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced?.[1]) {
        const parsed = tryParse(fenced[1].trim())
        if (parsed !== null) return parsed
    }

    const start = trimmed.indexOf('{')
    if (start === -1) return null
    let depth = 0
    for (let i = start; i < trimmed.length; i++) {
        const ch = trimmed[i]
        if (ch === '{') depth++
        else if (ch === '}') {
            depth--
            if (depth === 0) {
                return tryParse(trimmed.slice(start, i + 1))
            }
        }
    }
    return null
}

function tryParse(candidate: string): unknown | null {
    try {
        return JSON.parse(candidate)
    } catch {
        return null
    }
}
