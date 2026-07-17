/**
 * Chat backends. Two implementations:
 *
 * - `mock`   — deterministic, NO API spend. Proves the loop plumbing end to
 *              end and exercises both the accept and reject paths of the gate.
 * - `claude` — shells out to the local `claude` CLI in headless mode (`-p`),
 *              using the user's existing Claude Code auth. This spends real
 *              budget, so it is opt-in via `--backend claude`.
 *
 * A backend is just a `ChatFn`. The optional `stage` hint lets the mock branch
 * its deterministic behavior; real backends ignore it.
 */
export type ChatStage =
    | 'baseline'
    | 'candidate'
    | 'analyst'
    | 'judge'
    | 'classify'

export type ChatOpts = {
    system?: string
    user: string
    stage?: ChatStage
    /** Extra context the mock uses to shape deterministic output (skill body). */
    skill?: string
}

export type ChatFn = (opts: ChatOpts) => Promise<string>

export const BackendNameSchema = ['mock', 'claude'] as const
export type BackendName = (typeof BackendNameSchema)[number]

// ── claude CLI backend ──────────────────────────────────────────────────────

export function makeClaudeChat(model?: string): ChatFn {
    return async ({ system = '', user }) => {
        const prompt = system ? `${system}\n\n---\n\n${user}` : user
        const args = ['-p']
        if (model) args.push('--model', model)

        // Retry with backoff — a single flaky `claude -p` (transient error,
        // rate limit) must not abort a several-hundred-call run.
        let lastErr = ''
        for (let attempt = 1; attempt <= 4; attempt++) {
            const proc = Bun.spawn(['claude', ...args], {
                stdin: 'pipe',
                stdout: 'pipe',
                stderr: 'pipe',
            })
            proc.stdin.write(prompt)
            await proc.stdin.end()
            const [out, err, code] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
                proc.exited,
            ])
            if (code === 0 && out.trim()) return out.trim()
            lastErr = `exit ${code}: ${err.slice(0, 200) || '(empty stderr)'}`
            await Bun.sleep(600 * attempt)
        }
        throw new Error(`claude failed after 4 attempts: ${lastErr}`)
    }
}

// ── deterministic mock backend ──────────────────────────────────────────────

/** Stable non-negative hash (djb2) for deterministic mock behavior. */
function hash(text: string): number {
    let h = 5381
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
    }
    return h
}

function firstKeyword(question: string): string {
    const words = question
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    return words[0] ?? 'topic'
}

const STOPWORDS = new Set([
    'what',
    'why',
    'when',
    'where',
    'which',
    'does',
    'explain',
    'describe',
    'between',
    'difference',
    'should',
    'about',
])

/**
 * Deterministic backend. `candidate` compression tightens as the skill grows
 * (more guidance → shorter answers) but bottoms out at a floor; past the floor
 * the answer drops its keyword and the judge fails — so the loop climbs, then
 * hits a cliff the gate rejects. Analyst returns a deterministic single edit.
 */
export function makeMockChat(): ChatFn {
    return async ({ user, stage, skill = '' }) => {
        if (stage === 'analyst') {
            // Deterministic: append one compression rule keyed to the skill hash.
            const n = (hash(skill) % 5) + 1
            return JSON.stringify({
                reasoning: 'mock: tighten compression on the observed batch',
                edits: [
                    {
                        op: 'append',
                        content: `Mock rule ${n}: drop trailing clauses; keep the leading term.`,
                    },
                ],
            })
        }
        if (stage === 'judge') {
            // Substance preserved unless the candidate is the over-compressed
            // sentinel (all "X"). Parse the candidate straight from the prompt
            // the scorer built — no side channel needed.
            const parts = user.split('CANDIDATE ANSWER:')
            const cand = (parts[parts.length - 1] ?? '').trim()
            const overCompressed =
                cand.length === 0 || /^X+$/.test(cand.replace(/\s/g, ''))
            return JSON.stringify({
                pass: !overCompressed,
                reason: overCompressed
                    ? 'over-compressed; substance dropped'
                    : 'substance retained',
            })
        }
        if (stage === 'classify') {
            // Deterministic pseudo-classification for offline plumbing. Real
            // signal comes from --backend claude.
            const labels = ['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL']
            return labels[hash(user) % labels.length] ?? 'SIMPLE'
        }
        if (stage === 'baseline') {
            const kw = firstKeyword(user)
            const sentence = `The ${kw} works by combining several parts and handling each case explicitly. `
            return sentence.repeat(6).trim()
        }
        // candidate: compression is driven by how many optimization rules the
        // skill has accrued (each accepted edit appends one "Mock rule"). More
        // rules → tighter compression → higher reward, until it crosses the
        // floor and "over-compresses" (drops substance → the judge fails). This
        // gives the loop a real climb followed by a cliff the gate must reject.
        const kw = firstKeyword(user)
        const rules = (skill.match(/Mock rule/g) ?? []).length
        const keep = Math.max(0.1, 0.5 - rules * 0.09)
        const baseLen =
            6 *
            `The ${kw} works by combining several parts and handling each case explicitly. `
                .length
        const targetLen = Math.max(12, Math.round(baseLen * keep))
        const overCompressed = keep <= 0.14
        const body = overCompressed
            ? 'X'.repeat(targetLen)
            : `${kw}: combine parts, handle each case. `.repeat(12).slice(0, targetLen)
        return body.trim()
    }
}

export function makeChat(backend: BackendName, model?: string): ChatFn {
    return backend === 'claude' ? makeClaudeChat(model) : makeMockChat()
}
