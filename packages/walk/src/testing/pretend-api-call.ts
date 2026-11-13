/**
 * Taking a `gh api` call apart, for the pretend GitHub (#761): its method,
 * its endpoint and its fields, from `-f`/`-F` flags or a JSON body given
 * by `--input -`.
 */

export type Fields = Record<string, unknown>

const VALUED = new Set(['-X', '--method', '--jq', '-q', '-H', '--header'])
const FIELD_FLAGS = new Set(['-f', '-F', '--raw-field', '--field'])

/** A `-F` value as gh reads it: a number or a boolean when it looks like one. */
const typed = (raw: string): unknown =>
    /^-?\d+$/.test(raw)
        ? Number(raw)
        : raw === 'true' || raw === 'false'
          ? raw === 'true'
          : raw

/**
 * The method (`GET`, or `POST` when there are fields, unless `-X` says),
 * the endpoint without a leading slash, the fields, and whether the call
 * asked for `--slurp`.
 */
export const apiCall = ({
    args,
    input,
}: {
    args: string[]
    input?: string
}): { method: string; endpoint: string; fields: Fields; slurp: boolean } => {
    let method: string | null = null
    let endpoint = ''
    let from_input = false
    const fields: Fields = {}
    for (let at = 1; at < args.length; at += 1) {
        const arg = args[at] ?? ''
        if (arg === '-X' || arg === '--method') {
            method = (args[at + 1] ?? '').toUpperCase()
            at += 1
        } else if (FIELD_FLAGS.has(arg)) {
            const pair = args[at + 1] ?? ''
            const equals = pair.indexOf('=')
            const key = pair.slice(0, equals)
            const raw = pair.slice(equals + 1)
            const value = arg === '-F' || arg === '--field' ? typed(raw) : raw
            if (key.endsWith('[]')) {
                const list = (fields[key.slice(0, -2)] as unknown[]) ?? []
                fields[key.slice(0, -2)] = [...list, value]
            } else fields[key] = value
            at += 1
        } else if (arg === '--input') {
            from_input = true
            at += 1
        } else if (VALUED.has(arg)) {
            at += 1
        } else if (!arg.startsWith('-') && endpoint === '') {
            endpoint = arg
        }
    }
    if (from_input && input !== undefined && input.trim() !== '') {
        Object.assign(fields, JSON.parse(input) as Fields)
    }
    const has_fields = Object.keys(fields).length > 0
    return {
        method: method ?? (has_fields ? 'POST' : 'GET'),
        endpoint: endpoint.replace(/^\//, ''),
        fields,
        slurp: args.includes('--slurp'),
    }
}

/** A string value written in a GraphQL query, as `name: "..."`. */
export const inQuery = (query: string, name: string): string | undefined => {
    const found = new RegExp(`${name}\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(
        query
    )
    return found?.[1] === undefined
        ? undefined
        : (JSON.parse(found[1]) as string)
}
