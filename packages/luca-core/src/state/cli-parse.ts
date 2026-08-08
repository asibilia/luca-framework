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
 *  - NO new dependencies. `luca-core` depends only on `xstate` + `zod`,
 *    and it is imported by every package *and* by both hook cold-start
 *    paths — which run on every Bash tool call. `shell-quote` (used by
 *    the equivalent scan in `luca-cli`'s `handle-stage-gate-hook.ts`)
 *    would add module-load latency to that hot path, so the quote-aware
 *    tokenizer is inlined here instead.
 *  - Conservative on shape: anything the tokenizer can't resolve
 *    statically returns `null`/`[]` and lets the call through to the
 *    CLI, which does the authoritative parse.
 */

/**
 * Strip a single layer of matching surrounding quotes (`"…"` or `'…'`).
 * Pure; returns the input unchanged when no quote-pair is found.
 *
 * Retained as public API for callers that hold a raw argv fragment. The
 * parsers below no longer need it — {@link tokenizeCommand} removes
 * quoting as part of tokenization.
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
 * A tokenizer output element. `word` carries the *unquoted* literal text
 * of one shell word; `op` is any control operator (`&&`, `;`, `|`, `\n`,
 * redirects, subshell parens) and exists purely as an adjacency breaker
 * so `echo a` and `luca state advance plan` can't blur together.
 */
type Token =
    | { kind: 'word'; value: string; dynamic: boolean }
    | { kind: 'op' }

const OPERATOR_CHARS = new Set(['\n', ';', '&', '|', '(', ')', '<', '>'])

/**
 * Remove heredoc *bodies* from a (possibly multi-line) command.
 *
 * `luca state advance plan` sitting inside a `cat <<'EOF' … EOF` body is
 * document text, not an invocation, but a whitespace tokenizer can't tell
 * — newlines are just more whitespace. So bodies are dropped before
 * tokenization. The redirect line itself is kept (it may contain a real
 * command).
 *
 * Deliberately naive: a `<<` that appears inside quotes on the same line
 * can trigger a spurious skip. That errs toward *not* matching, which is
 * the fail-open direction this module is designed around.
 */
function stripHeredocBodies(command: string): string {
    if (!command.includes('<<')) return command
    const lines = command.split('\n')
    const kept: string[] = []
    let i = 0
    while (i < lines.length) {
        const line = lines[i] ?? ''
        kept.push(line)
        i += 1
        // `<<EOF`, `<<-EOF`, `<<'EOF'`, `<<"EOF"`, `<< EOF`. `<<<` (a
        // here-string) intentionally does not match: its payload is on
        // the same line and is handled by ordinary tokenization.
        const m = /<<-?[ \t]*(?:'([^']*)'|"([^"]*)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(
            line,
        )
        if (!m) continue
        const delimiter = m[1] ?? m[2] ?? m[3]
        if (!delimiter) continue
        while (i < lines.length) {
            const body = lines[i] ?? ''
            i += 1
            if (body.trim() === delimiter) break
        }
    }
    return kept.join('\n')
}

/**
 * Quote- and comment-aware shell tokenizer, scoped to what this module
 * needs: which literal words does the shell actually execute?
 *
 * Guarantees that matter to the callers:
 *  - A quoted span never splits. `"luca state advance plan"` is ONE word,
 *    so `echo "…"` and `git commit -m "…"` can't look like invocations.
 *  - `#` at word start starts a comment, killing the rest of the line.
 *  - Control operators become `op` tokens, breaking word adjacency, so a
 *    triplet scan can require the three words to be genuinely contiguous.
 *  - Words touched by unquoted `$` / `` ` `` expansion are flagged
 *    `dynamic`: their runtime value is unknowable here.
 */
function tokenizeCommand(command: string): Token[] {
    const input = stripHeredocBodies(command)
    const tokens: Token[] = []
    let current = ''
    let started = false
    let dynamic = false

    const flushWord = (): void => {
        if (started) {
            tokens.push({ kind: 'word', value: current, dynamic })
        }
        current = ''
        started = false
        dynamic = false
    }

    let i = 0
    const n = input.length
    while (i < n) {
        const c = input[i] as string

        if (c === '\\') {
            const next = input[i + 1]
            if (next === undefined) {
                i += 1
                continue
            }
            // A backslash-newline is a line continuation, not a literal.
            if (next !== '\n') {
                current += next
                started = true
            }
            i += 2
            continue
        }

        if (c === "'") {
            const end = input.indexOf("'", i + 1)
            if (end < 0) {
                // Unterminated quote — take the rest verbatim and stop.
                current += input.slice(i + 1)
                started = true
                i = n
                continue
            }
            current += input.slice(i + 1, end)
            started = true
            i = end + 1
            continue
        }

        if (c === '"') {
            i += 1
            while (i < n && input[i] !== '"') {
                const ch = input[i] as string
                if (ch === '\\' && i + 1 < n) {
                    current += input[i + 1] as string
                    i += 2
                    continue
                }
                if (ch === '$' || ch === '`') dynamic = true
                current += ch
                i += 1
            }
            started = true
            i += 1 // consume the closing quote (or run off the end)
            continue
        }

        if (c === '#' && !started) {
            const nl = input.indexOf('\n', i)
            i = nl < 0 ? n : nl
            continue
        }

        if (c === ' ' || c === '\t' || c === '\r') {
            flushWord()
            i += 1
            continue
        }

        if (OPERATOR_CHARS.has(c)) {
            flushWord()
            tokens.push({ kind: 'op' })
            i += 1
            continue
        }

        if (c === '$' || c === '`') {
            dynamic = true
        }
        current += c
        started = true
        i += 1
    }
    flushWord()
    return tokens
}

/** Does this word name the `luca` binary (bare, or path-qualified)? */
function isLucaBinary(token: Token): boolean {
    if (token.kind !== 'word' || token.dynamic) return false
    return token.value === 'luca' || token.value.endsWith('/luca')
}

/**
 * Given the index just past `luca state advance`, pull out the requested
 * step. Scans only to the end of the current simple command (stops at the
 * first `op`), so a later command's arguments can't leak in.
 *
 * Returns `null` when the step is absent or its value is only knowable at
 * runtime (`$STEP`, command substitution) — the fail-open case.
 */
function extractStep(tokens: Token[], start: number): string | null {
    let i = start
    // Positional form: `luca state advance <step>`.
    const first = tokens[i]
    if (first !== undefined && first.kind === 'word') {
        if (!first.value.startsWith('-')) {
            return first.dynamic || first.value === '' ? null : first.value
        }
    }

    // Long-flag form: `--to-step <step>` / `--to-step=<step>`.
    for (; i < tokens.length; i += 1) {
        const tok = tokens[i]
        if (tok === undefined || tok.kind === 'op') break
        if (tok.value === '--to-step') {
            const v = tokens[i + 1]
            if (v === undefined || v.kind !== 'word') return null
            return v.dynamic || v.value === '' ? null : v.value
        }
        if (tok.value.startsWith('--to-step=')) {
            const v = tok.value.slice('--to-step='.length)
            return tok.dynamic || v === '' ? null : v
        }
    }

    return null
}

/**
 * Find EVERY `luca state advance <step>` invocation in a Bash command
 * string and return the requested steps, in source order.
 *
 * This is the multi-advance-aware parser. The old whitespace-split
 * implementation used `findIndex`, so it only ever inspected the FIRST
 * `luca` token — the second advance in
 * `luca state advance plan && luca state advance idle` was invisible.
 *
 * Steps that can't be resolved statically (`$STEP`, command
 * substitution) are OMITTED rather than reported as a literal, since a
 * literal `$STEP` is never a valid pipeline step and would produce a
 * spurious `unknown-requested-step` verdict downstream.
 */
export function parseAllAdvanceCommands(command: string): string[] {
    // Quick reject so the tokenizer only runs on plausible matches.
    if (!command.includes('advance')) return []

    const tokens = tokenizeCommand(command)
    const steps: string[] = []
    for (let i = 0; i + 2 < tokens.length; i += 1) {
        const a = tokens[i]
        const b = tokens[i + 1]
        const c = tokens[i + 2]
        if (a === undefined || b === undefined || c === undefined) break
        // `b`/`c` must be plain words: an intervening `op` means the three
        // are not part of one simple command.
        if (b.kind !== 'word' || c.kind !== 'word') continue
        if (!isLucaBinary(a)) continue
        if (b.dynamic || b.value !== 'state') continue
        if (c.dynamic || c.value !== 'advance') continue

        const step = extractStep(tokens, i + 3)
        if (step !== null) steps.push(step)
        i += 2 // skip past the matched triplet
    }
    return steps
}

/**
 * Parse `luca state advance <step>` (and `luca state advance --to-step
 * <step>` / `--to-step=<step>`) out of a Bash command string. Returns
 * the FIRST requested step, or `null` if the command doesn't match.
 *
 * Why we accept multiple forms: citty (the CLI framework luca-cli uses)
 * accepts both positional and long-flag invocations. Real users type
 * either; the hook should catch both.
 *
 * ## What this deliberately does NOT match
 *
 * Text that merely *mentions* the command is not an invocation. All of
 * these return `null`:
 *
 *   echo "run luca state advance plan"    # quoted → one word
 *   git commit -m "fix: luca state ..."   # quoted → one word
 *   # luca state advance plan             # comment
 *   cat <<'EOF' … EOF                     # heredoc body
 *   luca state advance $STEP              # unresolvable at parse time
 *
 * The previous implementation matched all of them, because it split on
 * whitespace and was blind to quoting, comments, and heredocs. Since the
 * pipeline-guard hook exits 2 (hard block) on an unrecognised step, each
 * of those was a hard block on a command that does nothing to the
 * pipeline. Note in particular that `$STEP` used to be returned verbatim
 * and blocked — the old docstring claimed env-var indirection "bypasses
 * the hook", which was exactly backwards. It bypasses it now.
 *
 * ## Chained advances (decision on the multi-advance false negative)
 *
 * This function intentionally yields only the FIRST advance in a compound
 * command. Guarding the rest requires simulating the chain (each later
 * transition's legality depends on the earlier ones having succeeded),
 * and `luca state advance` already validates every transition
 * authoritatively — the hook is advisory and fails open by design. So the
 * hook's exit code for chained commands is unchanged by this rewrite.
 * {@link parseAllAdvanceCommands} exposes the full list for any caller
 * that wants to do the sequential simulation.
 */
export function parseAdvanceCommand(command: string): string | null {
    return parseAllAdvanceCommands(command)[0] ?? null
}
