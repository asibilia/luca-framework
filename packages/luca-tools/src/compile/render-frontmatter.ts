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
 * - Folded block scalars (`>`). We do emit LITERAL block scalars (`|`)
 *   for multi-line string values, because Claude Code's skill auto-
 *   trigger surface reads frontmatter `description` fields and matches
 *   trigger phrases like "Use when …" that authors place on a second
 *   paragraph. A JSON-escaped single-line scalar (`description: "Foo.\n\nUse when …"`)
 *   is technically valid YAML but is hard to read and the trigger
 *   phrase doesn't surface naturally. Literal block scalars round-trip
 *   the source string EXACTLY (including blank lines) — see
 *   `emitLiteralBlockScalar` below.
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
        // Multi-line strings: emit as a YAML literal block scalar (`|`)
        // so blank lines and intentional paragraph breaks survive. The
        // alternative (`JSON.stringify` to a double-quoted single line
        // with `\n` escapes) is technically valid YAML but loses
        // readability AND breaks Claude Code's skill auto-trigger
        // matching against multi-paragraph `description` fields.
        if (value.includes('\n')) {
            return emitLiteralBlockScalar(key, value, depth)
        }
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
 * Emit a multi-line string value as a YAML literal block scalar:
 *
 *   key: |
 *     first line
 *
 *     second paragraph after blank line
 *
 * Why literal (`|`) and not folded (`>`):
 *
 * The legacy hand-authored skill descriptions used `description: >`
 * (folded) with an intentional blank line separating the primary
 * description from the "Use when …" trigger paragraph. YAML's folded
 * scalar collapses single newlines to spaces but preserves blank lines
 * as a single `\n`. Round-tripping THAT precisely from a TS string
 * literal (where the author has already chosen where the newlines go)
 * requires literal block form — `|` preserves every newline character
 * exactly. Re-folding to `>` would require us to guess which newlines
 * were "soft" (line-wrapping artifacts) vs "hard" (semantic paragraph
 * breaks), and we don't have that information once the source is a JS
 * string.
 *
 * Chomp indicator:
 *
 * - Source ends with `\n` -> use `|` (default "clip": keep one trailing newline).
 * - Source does NOT end with `\n` -> use `|-` (strip all trailing newlines).
 *
 * This lets a TS string literal like `"a\n\nb"` round-trip through
 * YAML parse and re-emit without acquiring a spurious trailing newline.
 *
 * Indentation:
 *
 * Each content line is indented by `(depth + 1) * 2` spaces. Empty
 * lines in the source are emitted as truly empty lines (no trailing
 * indent whitespace) because YAML allows fewer-indented blank lines
 * inside a block scalar and trailing whitespace can confuse parsers
 * and editors.
 */
function emitLiteralBlockScalar(
    key: string,
    value: string,
    depth: number,
): string {
    const headerIndent = '  '.repeat(depth)
    const contentIndent = '  '.repeat(depth + 1)
    const endsWithNewline = value.endsWith('\n')
    const indicator = endsWithNewline ? '|' : '|-'
    // Strip any trailing newlines for splitting; the chomp indicator
    // (or its absence) tells YAML how to reconstruct them.
    const content = endsWithNewline
        ? value.slice(0, -1)
        : value
    const contentLines = content.split('\n').map((line) =>
        line === '' ? '' : `${contentIndent}${line}`
    )
    return [`${headerIndent}${key}: ${indicator}`, ...contentLines].join('\n')
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
 * Return true when a string can't be emitted bare in YAML 1.2 block
 * scalar context (the only context we use for top-level values).
 *
 * The list below is calibrated against the hand-written precedents in
 * `packages/luca-framework/.claude/agents/*.md` and
 * `packages/luca-framework/.claude/commands/*.md`, which use bare
 * strings for things like `description: Defines and
 * verifies code scaffolding, system architecture, and cleanliness.`
 * — commas, periods, and intra-word `<>`/`/` are all fine in block
 * scalar context. We only quote when YAML genuinely requires it.
 *
 * Quoting triggers:
 * - Empty string (otherwise `key: ` parses as null in YAML).
 * - Leading/trailing whitespace (would be stripped on parse).
 * - Contains a colon followed by space (`: ` — terminates a key/value).
 * - Contains a space-then-`#` (`  #` — starts a comment).
 * - Contains a newline, tab, or single/double quote.
 * - Starts with a YAML indicator that would change parse mode:
 *     `?` `-` (when followed by space — but bare `-foo` is fine, so
 *      we treat `-` as a trigger only when followed by whitespace or
 *      end-of-string), `:` `,` `[` `]` `{` `}` `#` `&` `*` `!` `|`
 *     `>` `'` `"` `%` `@` `` ` ``
 * - Looks like a YAML reserved literal: `null` `true` `false` `yes`
 *   `no` `on` `off` `~` (case-insensitive)
 * - Parses as a number — would round-trip as `number`, not `string`.
 *
 * Notes:
 * - We DO NOT quote on a bare comma in scalar context (commas are
 *   only YAML-special inside flow collections `[ ]` / `{ }`).
 * - We DO NOT quote on intra-string `<` or `>` (only leading `>` is
 *   a folded-scalar indicator).
 * - We DO NOT quote on a bare hash mark unless preceded by whitespace
 *   (YAML's comment-start rule).
 */
function needsQuoting(s: string): boolean {
    if (s.length === 0) return true
    if (/^\s|\s$/.test(s)) return true
    // Block scalar specials:
    if (s.includes(': ')) return true
    if (/\s#/.test(s)) return true
    if (/[\n\t\r'"]/.test(s)) return true
    // Leading indicator characters:
    if (/^[?,\[\]{}#&*!|>'"%@`]/.test(s)) return true
    // Leading `-` is only an indicator when followed by whitespace
    // (the YAML block-sequence-entry pattern). `-foo` or `--flag` are
    // legal plain scalars.
    if (/^-\s/.test(s) || s === '-') return true
    // Leading `:` likewise — only an issue when followed by space.
    if (/^:\s/.test(s) || s === ':') return true
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
