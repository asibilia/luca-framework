/**
 * Shared parsers for `luca state ...` Bash invocations.
 *
 * Promoted from `packages/luca-tools/src/hooks/{pipeline-guard,
 * continuation-messages}/handler.ts`, where {@link parseAdvanceCommand}
 * and {@link stripQuotes} were duplicated byte-identically. Centralizing
 * them here (audit ref CF11) gives both hook handlers — and any future
 * surface that needs to parse the same shape (e.g. a UserPromptSubmit
 * agent, a CLI wrapper) — a single source of truth.
 *
 * Design constraints:
 *  - PURE. No I/O, no globals.
 *  - The parsers are **lossy by design** — they target only the common-case
 *    shapes a Claude Code hook needs to recognize. Anything weirder
 *    (env-var indirection, command substitution, shell quoting that
 *    spans tokens) returns `null` and lets the call through to the CLI,
 *    which does the authoritative parse.
 */

/**
 * Strip a single layer of matching surrounding quotes (`"…"` or `'…'`).
 * Pure; returns the input unchanged when no quote-pair is found.
 */
export function stripQuotes(s: string): string {
    if (s.length >= 2) {
        const first = s[0]
        const last = s[s.length - 1]
        if (
            (first === '"' && last === '"') ||
            (first === "'" && last === "'")
        ) {
            return s.slice(1, -1)
        }
    }
    return s
}

/**
 * Parse `luca state advance <step>` (and `luca state advance --to-step
 * <step>` / `--to-step=<step>`) out of a Bash command string. Returns
 * the requested step name, or `null` if the command doesn't match.
 *
 * Why we accept multiple forms: citty (the CLI framework luca-cli uses)
 * accepts both positional and long-flag invocations. Real users type
 * either; the hook should catch both. We're conservative on shape — if
 * any tokenization edge case fails, we return `null` and let the call
 * through (failure-open). The CLI itself does the authoritative parse.
 *
 * We do NOT spawn a shell parser — Bash command parsing is full of edge
 * cases (quoting, expansion, command substitution). A regex-over-tokens
 * approach is good enough because the hook's job is only to catch the
 * common-case `luca state advance plan` form. Anything weirder (env-var
 * indirection, command substitution) bypasses the hook, and the CLI's
 * own validation catches it.
 */
export function parseAdvanceCommand(command: string): string | null {
    const trimmed = command.trim()
    // Quick reject so the regex only runs on plausible matches.
    if (
        !/\bluca\b/.test(trimmed) ||
        !/\bstate\b/.test(trimmed) ||
        !/\badvance\b/.test(trimmed)
    ) {
        return null
    }

    // Tokenize on whitespace; we don't need a full shell parser because
    // the hook fires before the call runs, so we're matching the literal
    // argv string from the harness.
    const tokens = trimmed.split(/\s+/)
    // Find the `luca` token (allowing for prefixes like `bun run`,
    // `npx`, env-var assignments).
    const lucaIdx = tokens.findIndex((t) => t === 'luca' || t.endsWith('/luca'))
    if (lucaIdx < 0) return null
    if (tokens[lucaIdx + 1] !== 'state') return null
    if (tokens[lucaIdx + 2] !== 'advance') return null

    // Positional: `luca state advance <step>`
    const next = tokens[lucaIdx + 3]
    if (next !== undefined && !next.startsWith('-')) {
        return stripQuotes(next)
    }

    // Long flag: `luca state advance --to-step <step>` or `--to-step=<step>`.
    for (let i = lucaIdx + 3; i < tokens.length; i++) {
        const tok = tokens[i] ?? ''
        if (tok === '--to-step') {
            const v = tokens[i + 1]
            if (v !== undefined) return stripQuotes(v)
            return null
        }
        if (tok.startsWith('--to-step=')) {
            return stripQuotes(tok.slice('--to-step='.length))
        }
    }

    return null
}
