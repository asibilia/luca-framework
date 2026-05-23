/**
 * render-frontmatter — deterministic YAML frontmatter emitter.
 *
 * Claude Code artifacts (agent.md, command.md, SKILL.md) all open with a
 * YAML frontmatter block delimited by `---` lines. The compiler MUST be
 * idempotent — re-running it produces identical bytes — which means the
 * frontmatter has to come out in a stable shape: same key order, same
 * string-escape rules, same handling of arrays.
 *
 * We don't pull in a YAML library for this. The Claude Code frontmatter
 * surface is small and well-defined: scalar values (string, number,
 * boolean), arrays of scalars (e.g. allowed-tools), and the occasional
 * nested object (e.g. `cognition: { default_tier: T0 }`). A hand-rolled
 * emitter is simpler, faster, and — most importantly — fully under our
 * control for determinism.
 *
 * NON-GOALS:
 * - Round-tripping arbitrary YAML.
 * - Anchors, tags, multi-document streams.
 * - Multi-line block scalars (folded `>` / literal `|`). If a string
 *   contains a newline we quote it and emit `\n` as an escape. Bodies
 *   live BELOW the frontmatter; we don't need block scalars up here.
 *
 * Stability contract:
 * - Keys in the input object are emitted in the order they appear in the
 *   caller's array. Callers pass an ordered list of `[key, value]` pairs
 *   so the order is explicit, never alphabetic-by-accident.
 * - Empty arrays are OMITTED rather than emitted as `[]`. Empty maps
 *   likewise. This matches the existing hand-written precedents in
 *   `.claude/agents/*.md` — frontmatter only carries fields the runtime
 *   reads.
 * - `undefined` values are skipped. `null` is rejected — the caller
 *   should omit the key instead, since YAML `null` semantics drift
 *   between parsers.
 */

/**
 * A frontmatter value. We accept exactly what the Claude Code surface
 * needs: primitives, arrays of primitives, and one level of nested
 * record (for the `cognition: { ... }` style block).
 */
export type FrontmatterScalar = string | number | boolean
export type FrontmatterValue =
    | FrontmatterScalar
    | FrontmatterScalar[]
    | Record<string, FrontmatterScalar | FrontmatterScalar[]>

/**
 * An ordered key/value pair. Callers build an array of these — the order
 * of the array is the emission order. We use a tuple list instead of a
 * `Record` because object key order in JS is technically insertion-
 * preserving but mixing in integer-looking keys can scramble it; an
 * explicit array eliminates that whole class of footgun.
 */
export type FrontmatterEntry = readonly [key: string, value: FrontmatterValue]

/**
 * Render a YAML frontmatter block (including the surrounding `---`
 * fences and a trailing newline). Idempotent for a given input.
 *
 * @param entries - ordered key/value pairs to emit
 * @returns the frontmatter block as a string, terminated by `\n`
 */
export function renderFrontmatter(
    entries: readonly FrontmatterEntry[],
): string {
    const lines: string[] = ['---']
    for (const [key, value] of entries) {
        if (value === undefined) continue
        // Skip empty arrays/maps so we don't pollute the frontmatter
        // with [] / {} when the field is simply not in use.
        if (Array.isArray(value) && value.length === 0) continue
        if (
            isPlainRecord(value) &&
            Object.keys(value).length === 0
        ) {
            continue
        }
        lines.push(emitKeyValue(key, value, 0))
    }
    lines.push('---', '')
    return lines.join('\n')
}

/**
 * Emit one `key: value` line (or block, for arrays/records) at the
 * given indentation depth. Returns the rendered text WITHOUT a trailing
 * newline — the caller joins lines with `\n`.
 */
function emitKeyValue(
    key: string,
    value: FrontmatterValue,
    depth: number,
): string {
    const indent = '  '.repeat(depth)
    if (typeof value === 'string') {
        return `${indent}${key}: ${formatScalar(value)}`
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return `${indent}${key}: ${String(value)}`
    }
    if (Array.isArray(value)) {
        // Compact inline form: `key: [a, b, c]`. The Claude Code
        // hand-written precedents use both inline and block forms;
        // inline keeps the output compact and identical regardless of
        // array length.
        const items = value.map(formatScalar).join(', ')
        return `${indent}${key}: [${items}]`
    }
    // Nested record (one level deep). Emit as a block:
    //   key:
    //     subkey: value
    //     subkey: value
    const subLines: string[] = [`${indent}${key}:`]
    for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue === undefined) continue
        subLines.push(emitKeyValue(subKey, subValue, depth + 1))
    }
    return subLines.join('\n')
}

/**
 * Format a scalar value for YAML emission.
 *
 * Decisions:
 * - Numbers and booleans: emit bare. Their `String()` representation is
 *   already YAML-safe.
 * - Strings: quote only when necessary (contains a YAML-special
 *   character, leading/trailing whitespace, or matches a reserved
 *   keyword). Otherwise emit bare. This matches the hand-written
 *   precedents (`name: code-architect`, no quotes).
 *
 * We always emit double-quoted strings when we DO quote, because they
 * support `\n` / `\"` escapes — single-quoted YAML strings have no
 * escape mechanism and would force us to emit literal newlines.
 */
function formatScalar(value: FrontmatterScalar): string {
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    const s = value
    if (needsQuoting(s)) {
        return JSON.stringify(s)
    }
    return s
}

/**
 * Return true when a string can't be emitted bare in YAML 1.2 flow
 * context (the only context we use). The list below is intentionally
 * conservative — when in doubt, quote.
 *
 * Quoting triggers:
 * - Empty string (otherwise `key: ` parses as null in YAML).
 * - Leading/trailing whitespace (would be stripped on parse).
 * - Contains any of: `: # & * ! | > ' " % @ \` ` ` , [ ] { } \n \t \r
 * - Starts with: `?` `-` `:` `,` `[` `]` `{` `}` `#` `&` `*` `!` `|` `>` `'` `"` `%` `@` `` ` ``
 * - Looks like a YAML reserved literal: `null` `true` `false` `yes`
 *   `no` `on` `off` `~` (case-insensitive)
 * - Parses as a number — would round-trip as `number`, not `string`.
 */
function needsQuoting(s: string): boolean {
    if (s.length === 0) return true
    if (/^\s|\s$/.test(s)) return true
    if (/[:#&*!|>'"%@`,\[\]{}\n\t\r]/.test(s)) return true
    if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return true
    const reserved = new Set([
        'null',
        'true',
        'false',
        'yes',
        'no',
        'on',
        'off',
        '~',
    ])
    if (reserved.has(s.toLowerCase())) return true
    // Looks like a number? (`1`, `1.5`, `-3`, `1e9`) — quote to keep it a
    // string. This is a deliberate over-approximation; YAML's number
    // grammar is more permissive but matching it exactly isn't worth it.
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return true
    return false
}

/**
 * Type guard for the nested-record variant of FrontmatterValue. Used to
 * detect the empty-map case so we can skip it.
 */
function isPlainRecord(
    value: FrontmatterValue,
): value is Record<string, FrontmatterScalar | FrontmatterScalar[]> {
    if (value === null) return false
    if (typeof value !== 'object') return false
    if (Array.isArray(value)) return false
    return true
}
