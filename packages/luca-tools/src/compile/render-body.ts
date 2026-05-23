/**
 * render-body — shared markdown body assembly for compiled artifacts.
 *
 * D1 (locked design): the v13 hand-rewrite dropped vertical-slice
 * planning guidance, TDD guidance, telemetry instrumentation, and the
 * rule/postmortem/claim-verify invocations from the agent prompts. The
 * factories (D-1) capture all of that declaratively as
 * `guidance` flags, `telemetryHooks[]`, and `pipelineInvocations[]`.
 *
 * The COMPILER'S job (this file) is to expand those declarations into a
 * deterministic, well-formed markdown prelude that prefixes the
 * subagent / mode-agent's own `instructions` body. That way:
 *
 *   - When D-3 ports the subagents from luca-mastracode, it doesn't need
 *     to re-write the dropped guidance into every body — it just flips
 *     the matching flags / hooks on the definition.
 *   - When the parity audit (Phase G) checks for restored content, it
 *     can look for the canonical prelude blocks emitted here.
 *   - When the prelude prose needs to evolve, we change it ONCE here
 *     and every agent body picks it up on recompile.
 *
 * EMISSION ORDER (subagents + mode-agents share this prelude):
 *   1. The agent's own instructions body (verbatim).
 *   2. A `## Guidance` block if any guidance flags are set.
 *   3. A `## Pipeline Invocations` block if any are declared.
 *   4. A `## Telemetry` block if any hooks are declared.
 *
 * Why instructions come FIRST: the agent's own prose sets the role and
 * the task. The prelude blocks are cross-cutting reminders attached at
 * the bottom — they don't define what the agent IS, only how it MUST
 * behave when it runs. Putting them at the top would bury the role.
 *
 * Idempotent for a given input. No timestamps, no random ids.
 */
import type {
    PipelineInvocation,
    SubagentGuidance,
    TelemetryHook,
} from '../define/index.ts'

/**
 * Input to the body renderer. Mirrors the fields that appear on both
 * `AgentDefinition` and `SubagentDefinition` — the D1 restoration
 * vocabulary is identical across the two. We accept a narrow shape so
 * the caller (the agent/subagent emitter) can pass a destructured
 * slice without coupling this file to either schema directly.
 */
export interface BodyRenderInput {
    /** The agent's own instruction body — verbatim, trusted. */
    instructions: string
    /** Guidance flags (all four are always present thanks to the schema's `.prefault({})`). */
    guidance: SubagentGuidance
    /** Telemetry hooks declared on the agent. */
    telemetryHooks: readonly TelemetryHook[]
    /** Pipeline invocations declared on the agent. */
    pipelineInvocations: readonly PipelineInvocation[]
}

/**
 * Render the full markdown body for an agent or subagent artifact.
 *
 * Stable bytes: same input → same output. The compiler relies on this
 * for idempotence.
 */
export function renderBody(input: BodyRenderInput): string {
    const sections: string[] = [normalizeTrailing(input.instructions)]
    const guidancePrelude = renderGuidancePrelude(input.guidance)
    if (guidancePrelude) sections.push(guidancePrelude)
    const invocationPrelude = renderPipelineInvocationPrelude(
        input.pipelineInvocations,
    )
    if (invocationPrelude) sections.push(invocationPrelude)
    const telemetryPrelude = renderTelemetryPrelude(input.telemetryHooks)
    if (telemetryPrelude) sections.push(telemetryPrelude)
    return sections.join('\n\n') + '\n'
}

/**
 * Render a `## Guidance` block from the subagent's guidance flags. If
 * no flags are set, returns the empty string (the caller skips the
 * section).
 *
 * Why a block instead of per-flag inline prose: the §3 parity audit
 * needs a single textual fingerprint per agent — finding "## Guidance"
 * tells it the restoration ran. A block also lets us link future
 * documentation (`docs/guidance/*.md`) from one place.
 */
function renderGuidancePrelude(guidance: SubagentGuidance): string {
    const items: string[] = []
    if (guidance.verticalSlice) {
        items.push(
            '- **Vertical-slice planning.** Decompose work into thin end-to-end ' +
                'slices that exercise every layer (UI → API → data) rather than ' +
                'horizontal waves by layer. Each slice should be independently ' +
                'verifiable.',
        )
    }
    if (guidance.tdd) {
        items.push(
            '- **Test-driven development.** Write the failing test first, then ' +
                'the implementation that turns it green. Refactor only with a ' +
                'green suite. Tests are intentionally absent in this repo today ' +
                '(see CLAUDE.md / no-tests rule); the TDD discipline still ' +
                'applies when re-introduced.',
        )
    }
    if (guidance.selfVerify) {
        items.push(
            '- **Self-verification.** Re-read files before editing. Verify ' +
                'every assumption with a concrete tool call (Read, Grep, Glob, ' +
                'or a CLI invocation) before acting on it. Do not infer file ' +
                'state from memory or prior context.',
        )
    }
    if (guidance.antiSycophancy) {
        items.push(
            '- **Anti-sycophancy.** Every APPROVE verdict must cite specific ' +
                'evidence — a file path, a diff hunk, a test name, an audit ' +
                'finding. Bare approvals are reviewer failure modes; the ' +
                'review counts as not-yet-done until evidence is on the ' +
                'record.',
        )
    }
    if (items.length === 0) return ''
    return ['## Guidance', '', ...items].join('\n')
}

/**
 * Render a `## Pipeline Invocations` block from the declared
 * invocations. Each invocation maps to a concrete subsystem the agent
 * should call at the right pipeline boundary. The prose explains WHAT
 * the call is and WHEN to make it — the underlying CLI surface is the
 * single source of truth for argument shape, so we don't hard-code
 * argv here.
 */
function renderPipelineInvocationPrelude(
    invocations: readonly PipelineInvocation[],
): string {
    if (invocations.length === 0) return ''
    const lines: string[] = ['## Pipeline Invocations', '']
    // Stable order: the order they appear in the declaration. The author
    // controls intent ordering; we don't re-sort.
    for (const inv of invocations) {
        lines.push(`- ${describeInvocation(inv)}`)
    }
    return lines.join('\n')
}

/**
 * One-line description per invocation kind. Keep these stable — the
 * parity audit and the postmortem reports key off this prose.
 */
function describeInvocation(inv: PipelineInvocation): string {
    switch (inv) {
        case 'rule-run':
            return (
                '**Run repo-local rule packs.** Invoke `luca rules run` ' +
                'against the current diff before declaring the work ' +
                'complete. Findings at `must-fix` severity block progression; ' +
                '`should-fix` / `nit` are recorded but non-blocking.'
            )
        case 'claim-verify':
            return (
                '**Verify claims.** When you assert that a file changed, a ' +
                'test passed, or a behavior was observed, route the claim ' +
                'through `luca claim-verify` so the verification record is ' +
                'on the durable log. Do not rely on prose-only assertions.'
            )
        case 'postmortem-generate':
            return (
                '**Generate a postmortem.** At phase close, emit a postmortem ' +
                'via `luca retro postmortem` capturing pitfalls, decisions, ' +
                'and patterns. Pitfalls route to the `default` MuninnDB vault ' +
                'so they cross-pollinate to future projects.'
            )
        case 'confidence-log':
            return (
                '**Log confidence on the decision.** Emit a `luca confidence ' +
                'log` entry whenever you make a structural decision: ' +
                'confidence level (high|medium|low), category, decision, ' +
                'alternatives considered, reasoning, risk, and the files ' +
                'touched.'
            )
        case 'muninn-recall':
            return (
                '**Pre-invoke MuninnDB recall.** Before planning or making a ' +
                'non-trivial decision, recall relevant prior patterns, ' +
                'decisions, and pitfalls from the repo vault AND the ' +
                '`default` vault. Merge by score and surface the top ' +
                'matches in your reasoning.'
            )
    }
}

/**
 * Render a `## Telemetry` block from the declared hooks. Each hook
 * names a symbolic pipeline point at which the agent should emit a
 * telemetry event via the `luca telemetry emit` CLI (or the matching
 * MCP tool when available).
 *
 * Why declarative: the v13 hand-rewrite dropped these emissions
 * silently. Naming them by symbolic point lets a single compiler
 * change re-emit them consistently across all agents.
 */
function renderTelemetryPrelude(
    hooks: readonly TelemetryHook[],
): string {
    if (hooks.length === 0) return ''
    const lines: string[] = ['## Telemetry', '']
    for (const hook of hooks) {
        lines.push(`- ${describeTelemetryHook(hook)}`)
    }
    return lines.join('\n')
}

/**
 * One-line description per telemetry hook. Phrasing tells the agent
 * WHEN to emit and WHAT the symbolic event name is. Argument shape is
 * defined by the telemetry CLI, not here.
 */
function describeTelemetryHook(hook: TelemetryHook): string {
    switch (hook) {
        case 'phase-start':
            return (
                '`phase-start` — emit at the moment the agent enters a new ' +
                'phase. Carries the phase id and the run id.'
            )
        case 'phase-end':
            return (
                '`phase-end` — emit at the moment the agent declares a phase ' +
                'closed (regardless of outcome). Carries the phase id, the ' +
                'outcome, and the run id.'
            )
        case 'wave-start':
            return (
                '`wave-start` — emit at the start of each execution wave. ' +
                'Carries the wave index and the phase id.'
            )
        case 'wave-end':
            return (
                '`wave-end` — emit at the end of each execution wave. Carries ' +
                'the wave index, the outcome, and any failure-count summary.'
            )
        case 'subagent-start':
            return (
                '`subagent-start` — emit when the agent spawns a subagent ' +
                'via the Task tool. Carries the subagent id and the spawn ' +
                'reason.'
            )
        case 'subagent-end':
            return (
                '`subagent-end` — emit when a spawned subagent returns. ' +
                'Carries the subagent id, the outcome, and the result ' +
                'summary.'
            )
        case 'verification-start':
            return (
                '`verification-start` — emit at the start of the verification ' +
                'harness for the phase. Carries the phase id.'
            )
        case 'verification-end':
            return (
                '`verification-end` — emit at the end of the verification ' +
                'harness for the phase. Carries the phase id, the outcome, ' +
                'and the failure-count summary.'
            )
    }
}

/**
 * Ensure the agent's own instruction body doesn't carry trailing
 * whitespace or a trailing newline that would skew the section joins.
 * We trim the right side only — leading whitespace is preserved
 * because the author may legitimately indent the first line.
 */
function normalizeTrailing(s: string): string {
    return s.replace(/\s+$/u, '')
}
