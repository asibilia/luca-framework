import {
    AUDIT_PATH_PATTERN,
    classifyWritePath,
    coarsePhaseOf,
    isToolAllowed,
    loadCurrentState,
    phasePathFor,
    resolveActiveSlug,
    STEP_ARTIFACTS,
    WAVE_FILE_RE,
    type LucaState,
    type PhaseFile,
    type StepArtifact,
    type ToolCategory,
    type WritePathClass,
} from '@alecsibilia/luca-core'

import { isAbsolute, relative } from 'node:path'

import {
    classifyBashCommand,
    type BashCategory,
} from './classify-bash-command.ts'

export interface HandleStageGateHookOptions {
    /** Raw JSON string read from PreToolUse stdin. */
    stdin: string
    log?: (msg: string) => void
    /** Project root. Defaults to process.cwd() so the hook works in real
     *  invocations; tests pass a temp dir. */
    cwd?: string
    /** User home directory (for detecting absolute paths under ~/.claude/
     *  or ~/.luca/). Defaults to process.env.HOME. */
    homedir?: string
}

export interface HandleStageGateHookResult {
    /** Exit code returned to Claude Code. 0 = allow, 2 = block with stderr. */
    exitCode: number
    toolName?: string
    toolInput?: unknown
    decision?: 'allow' | 'block'
    /** Reason text on block. */
    reason?: string
}

/**
 * Stage-gate hook handler — enforcement live.
 *
 * Reads the current pipelineStep from .luca/state.json, classifies the
 * tool call into a ToolCategory, looks up the stage-tool matrix, and
 * exits 2 to block any tool call disallowed in the current phase.
 *
 * IDLE is permissive (no enforcement). Other phases apply the matrix from
 * decision:luca-stage-tool-matrix-2026-05-19. Always-denied paths
 * (.git/, ~/.claude/, ~/.luca/, /etc/, /usr/, /var/, /System/, /bin/,
 * /sbin/) are blocked regardless of phase.
 */
export async function handleStageGateHook(
    opts: HandleStageGateHookOptions
): Promise<HandleStageGateHookResult> {
    const log = opts.log ?? (() => {})

    if (!opts.stdin.trim()) {
        log('stage-gate: empty stdin — allowing')
        return { exitCode: 0, decision: 'allow' }
    }

    let parsed: Record<string, unknown>
    try {
        parsed = JSON.parse(opts.stdin) as Record<string, unknown>
    } catch (err) {
        // Failure to parse hook input is a soft error — allow rather than
        // block (we'd rather miss a check than break Claude Code on a
        // schema drift).
        log(
            `stage-gate: could not parse stdin as JSON — allowing (${
                (err as Error).message
            })`
        )
        return { exitCode: 0, decision: 'allow' }
    }

    // Accept both snake_case and camelCase keys.
    const toolName =
        (parsed.tool_name as string | undefined) ??
        (parsed.toolName as string | undefined)
    const toolInput =
        (parsed.tool_input as unknown) ?? (parsed.toolInput as unknown)

    const cwd = opts.cwd ?? process.cwd()
    const homedir = opts.homedir ?? process.env.HOME

    const state = await loadCurrentState({ cwd })
    const phase = coarsePhaseOf(state.pipelineStep)

    // IDLE: no enforcement.
    if (phase === 'IDLE') {
        log(
            `stage-gate: pipelineStep=idle (phase=IDLE) — allowing ${
                toolName ?? '(unknown tool)'
            }`
        )
        return { exitCode: 0, toolName, toolInput, decision: 'allow' }
    }

    // Classify the tool call into a ToolCategory + collect any always-denied
    // path violations.
    let category: ToolCategory | undefined
    let pathBlockReason: string | undefined

    if (
        toolName === 'Edit' ||
        toolName === 'Write' ||
        toolName === 'NotebookEdit'
    ) {
        const targetPath = (toolInput as { file_path?: string } | undefined)
            ?.file_path
        if (!targetPath) {
            // Can't classify without a target. Allow conservatively —
            // shouldn't happen in real Claude Code invocations.
            log(`stage-gate: ${toolName} without file_path — allowing`)
            return { exitCode: 0, toolName, toolInput, decision: 'allow' }
        }
        // Claude Code passes an ABSOLUTE file_path, but the .luca/ contract
        // (and artifactPathGate, via phasePathFor) is repo-relative. Pass cwd
        // to classifyWritePath so it normalizes for the .luca/ check, and feed
        // the relative form to the gate. Denied checks still run on the
        // absolute original inside classifyWritePath.
        const relTarget = isAbsolute(targetPath)
            ? relative(cwd, targetPath)
            : targetPath
        const pc = classifyWritePath(targetPath, { homedir, cwd })
        if (pc.class === 'denied') {
            pathBlockReason = `${toolName} to '${targetPath}' is always denied: ${pc.reason ?? 'forbidden path'}`
        } else if (
            pc.class === 'planning-general' ||
            pc.class === 'planning-audit'
        ) {
            // v13 artifact-path gate: a .luca/ write in a non-IDLE phase
            // (IDLE already returned permissively above). Allow ONLY the
            // exact legal artifact for the current pipelineStep; block
            // every other .luca/ write — including .luca/ root files,
            // which are mutated solely through the `luca` CLI.
            const gate = artifactPathGate(relTarget, state.pipelineStep, state)
            if (gate.kind === 'block') {
                const msg = `stage-gate BLOCK: ${toolName} ${gate.reason} (pipelineStep=${state.pipelineStep})`
                log(msg)
                return {
                    exitCode: 2,
                    toolName,
                    toolInput,
                    decision: 'block',
                    reason: msg,
                }
            }
            // Gate allows the artifact write — short-circuit, do not run
            // the coarse matrix (which would, e.g., block planning-general
            // in REVIEWING even for the legal audit-step artifact).
            log(
                `stage-gate: ${toolName} to '${targetPath}' is the legal artifact for ` +
                    `pipelineStep=${state.pipelineStep} — allowing`
            )
            return { exitCode: 0, toolName, toolInput, decision: 'allow' }
        } else {
            // pc.class === 'code' — normal project file. Matrix decides.
            category = pathClassToToolCategory(pc.class)
        }
    } else if (toolName === 'Bash') {
        const command =
            (toolInput as { command?: string } | undefined)?.command ?? ''
        const bashResult = classifyBashCommand(command)
        if (bashResult.category === 'denied') {
            pathBlockReason = `Bash command is always denied: ${
                bashResult.reason ?? 'forbidden command'
            }`
        } else {
            for (const target of bashResult.targetPaths) {
                const pc = classifyWritePath(target, { homedir })
                if (pc.class === 'denied') {
                    pathBlockReason = `Bash writes to denied path '${target}': ${
                        pc.reason ?? 'forbidden path'
                    }`
                    break
                }
            }
            if (!pathBlockReason) {
                category = bashCategoryToToolCategory(bashResult.category)
            }
        }
    } else {
        // Other tools (Read, Grep, Glob, Task, etc.) — read-only, allow.
        log(
            `stage-gate: ${toolName ?? '(unknown)'} is not write-class — allowing`
        )
        return { exitCode: 0, toolName, toolInput, decision: 'allow' }
    }

    // Always-denied path or always-denied bash command → block.
    if (pathBlockReason) {
        const msg = `stage-gate BLOCK: ${pathBlockReason}`
        log(msg)
        return {
            exitCode: 2,
            toolName,
            toolInput,
            decision: 'block',
            reason: msg,
        }
    }

    if (!category) {
        // Defensive: shouldn't reach here.
        log('stage-gate: could not classify tool — allowing')
        return { exitCode: 0, toolName, toolInput, decision: 'allow' }
    }

    // Matrix lookup
    const allowed = isToolAllowed({ phase, category })
    if (!allowed) {
        const msg =
            `stage-gate BLOCK: ${toolName} (category=${category}) is not allowed in phase=${phase} ` +
            `(pipelineStep=${state.pipelineStep})`
        log(msg)
        return {
            exitCode: 2,
            toolName,
            toolInput,
            decision: 'block',
            reason: msg,
        }
    }

    log(
        `stage-gate: ${toolName} (category=${category}) allowed in phase=${phase}`
    )
    return { exitCode: 0, toolName, toolInput, decision: 'allow' }
}

/**
 * The set of `StepArtifact` keys that are also `PhaseFile` keys, i.e. map
 * to a single fixed canonical path via `phasePathFor`. The two synthetic
 * keys `'execute/wave'` and `'audits/*'` are parameterised and handled
 * separately (a wave-file regex and `AUDIT_PATH_PATTERN`).
 */
const FIXED_PHASE_FILE_ARTIFACTS = new Set<StepArtifact>([
    'research',
    'context',
    'plan',
    'plan-review',
    'verify',
    'learn',
    'confidence',
    'execute/summary',
    'execute/progress',
])

/** Result of the artifact-path gate. */
type ArtifactGateDecision =
    | { kind: 'allow' }
    | { kind: 'block'; reason: string }

/**
 * Artifact-path gate (v13 write-surface, Phase C).
 *
 * Decides whether a native `Write`/`Edit`/`NotebookEdit` to a `.luca/`
 * path is permitted in the current pipelineStep. This is the channel that
 * makes the agent's native `Write` tool the safe way to author `.luca/`
 * artifact files.
 *
 * The rule: in any non-IDLE phase, a `.luca/` write is allowed ONLY when
 * its path is exactly a legal artifact for the active `pipelineStep`
 * (computed from `STEP_ARTIFACTS` + `phasePathFor`), or — for the `review`
 * step — a per-reviewer audit file matched by `AUDIT_PATH_PATTERN`.
 * EVERY other `.luca/` write is blocked, including writes to `.luca/`
 * root files (`state.json`, `config.json`, `roadmap.md`, `ledger.jsonl`)
 * which are mutated only through the `luca` CLI.
 *
 * IDLE is handled by the caller (fully permissive — the gate never runs).
 *
 * @param targetPath  `.luca/`-relative write target (guaranteed to start
 *                     with `.luca/` — the caller only invokes the gate for
 *                     paths `classifyWritePath` put in a `planning-*` class).
 * @param pipelineStep the active workflow step
 * @param state        current workflow state (for slug resolution)
 */
function artifactPathGate(
    targetPath: string,
    pipelineStep: LucaState['pipelineStep'],
    state: LucaState
): ArtifactGateDecision {
    const legalArtifacts = STEP_ARTIFACTS[pipelineStep]

    // A step that produces no freeform phase artifact: block every .luca/
    // write outright. (Its structured mutations, if any, route through the
    // luca CLI, not a raw Write.)
    if (legalArtifacts.length === 0) {
        return {
            kind: 'block',
            reason:
                `write to '${targetPath}' is not permitted in pipelineStep='${pipelineStep}' — ` +
                `this step produces no freeform .luca/ artifact (structured mutations go through the 'luca' CLI)`,
        }
    }

    // Resolve the active phase slug so we can compute canonical paths.
    const resolved = resolveActiveSlug(state)
    if (!resolved.ok) {
        return {
            kind: 'block',
            reason:
                `write to '${targetPath}' cannot be validated — ${resolved.error} ` +
                `(no active phase slug, so no legal artifact path can be computed)`,
        }
    }
    const { slug } = resolved

    // Compute every legal canonical path for this step and test for an
    // exact match. Audit files are parameterised per-reviewer, so they are
    // matched by AUDIT_PATH_PATTERN (scoped to the active slug) rather than
    // a fixed path.
    const legalPaths: string[] = []
    for (const artifact of legalArtifacts) {
        if (artifact === 'audits/*') {
            // Per-reviewer audit file: .luca/phases/<slug>/audits/<reviewer>.md
            // AUDIT_PATH_PATTERN already encodes the canonical shape; also
            // require the slug segment to match the ACTIVE slug.
            if (
                AUDIT_PATH_PATTERN.test(targetPath) &&
                targetPath.startsWith(`.luca/phases/${slug}/audits/`)
            ) {
                return { kind: 'allow' }
            }
            continue
        }
        if (artifact === 'execute/wave') {
            // Per-wave detail file: .luca/phases/<slug>/execute/waves/NN.md
            const waveDir = `.luca/phases/${slug}/execute/waves/`
            if (targetPath.startsWith(waveDir)) {
                const filename = targetPath.slice(waveDir.length)
                if (WAVE_FILE_RE.test(filename)) {
                    return { kind: 'allow' }
                }
            }
            continue
        }
        // Fixed PhaseFile artifact — exactly one canonical path.
        if (FIXED_PHASE_FILE_ARTIFACTS.has(artifact)) {
            legalPaths.push(phasePathFor(slug, artifact as PhaseFile))
        }
    }

    if (legalPaths.includes(targetPath)) {
        return { kind: 'allow' }
    }

    return {
        kind: 'block',
        reason:
            `write to '${targetPath}' is not the legal artifact for pipelineStep='${pipelineStep}'. ` +
            `Allowed for this step: ${describeLegalArtifacts(legalArtifacts, legalPaths, slug)}`,
    }
}

/** Build a human-readable list of the paths legal for the current step. */
function describeLegalArtifacts(
    legalArtifacts: StepArtifact[],
    fixedPaths: string[],
    slug: string
): string {
    const parts = [...fixedPaths]
    for (const a of legalArtifacts) {
        if (a === 'audits/*') {
            parts.push(`.luca/phases/${slug}/audits/<reviewer>.md`)
        } else if (a === 'execute/wave') {
            parts.push(`.luca/phases/${slug}/execute/waves/NN.md`)
        }
    }
    return parts.length > 0 ? parts.join(', ') : '(none)'
}

function pathClassToToolCategory(c: WritePathClass): ToolCategory {
    switch (c) {
        case 'code':
            return 'code-write'
        case 'planning-general':
            return 'planning-write-general'
        case 'planning-audit':
            return 'planning-write-audit'
        case 'denied':
            // Caller has already handled 'denied' before this is called.
            throw new Error('pathClassToToolCategory called with denied')
    }
}

function bashCategoryToToolCategory(c: BashCategory): ToolCategory {
    switch (c) {
        case 'bash-readonly':
            return 'bash-readonly'
        case 'bash-mutate':
            return 'bash-mutate'
        case 'bash-commit':
            return 'bash-commit'
        case 'luca-write':
            // v13 write-surface: a `luca <noun> <write-verb>` invocation.
            // The matrix allows `luca-write` in every non-IDLE phase; the
            // CLI self-enforces each verb's per-step phase precondition.
            return 'luca-write'
        case 'denied':
            throw new Error('bashCategoryToToolCategory called with denied')
    }
}
