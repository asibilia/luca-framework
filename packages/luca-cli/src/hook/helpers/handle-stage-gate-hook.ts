import { homedir as osHomedir, tmpdir } from 'node:os'

import {
    AUDIT_PATH_PATTERN,
    classifyWritePath,
    coarsePhaseOf,
    isToolAllowed,
    loadCurrentState,
    phasePathFor,
    resolveActiveSlug,
    STEP_ARTIFACTS,
    TMP_PATH_PATTERN,
    toLucaRelative,
    WAVE_FILE_RE,
    type LucaState,
    type PhaseFile,
    type StepArtifact,
    type ToolCategory,
    type WritePathClass,
} from '@alecsibilia/luca-core'
import { parse } from 'shell-quote'

import {
    classifyBashCommand,
    type BashCategory,
} from './classify-bash-command.ts'

import { lucaStateClaimOwnerTool } from '../../write-surface/handlers/luca-state-claim-owner.ts'

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
    /** Absolute OS-temp-dir prefixes treated as ephemeral scratch (allowed
     *  in any pipelineStep). Defaults to [`$TMPDIR`, `os.tmpdir()`]; tests
     *  pass an explicit dir. The universal `/tmp` and `/private/tmp` roots
     *  are always recognised regardless of this value. */
    tmpdirs?: string[]
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
 * /sbin/, legacy shared-tmp /tmp/luca-* payloads) are blocked
 * regardless of phase.
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
    // The Claude Code `session_id` (PreToolUse payload). The ONLY reliable
    // place this is visible — used to scope phase enforcement to the session
    // that owns the run. Absent in non-Claude-Code harnesses; treated as
    // "unknown owner" → conservative enforcement (see below).
    const sessionId =
        (parsed.session_id as string | undefined) ??
        (parsed.sessionId as string | undefined)

    const cwd = opts.cwd ?? process.cwd()
    // FAIL-CLOSED homedir resolution. `process.env.HOME` alone is a fail-OPEN
    // hole: with HOME unset (or empty — hence `||`, not `??`) `homedir` was
    // `undefined`, `classifyWritePath` skipped the home-deny step entirely, and
    // a Write to `~/.claude/settings.json` or `~/.luca/handoff/` classified as
    // ordinary `code` and was ALLOWED in EXECUTING. `os.homedir()` reads the
    // passwd database, so it still resolves when the environment does not.
    const homedir = opts.homedir || process.env.HOME || osHomedir()
    const tmpdirs =
        opts.tmpdirs ??
        [process.env.TMPDIR, tmpdir()].filter((d): d is string => Boolean(d))

    const state = await loadCurrentState({ cwd })

    // Ownership stamping (session-scoped gate). Only the orchestrator runs
    // `luca state advance`, so the session issuing it is, by definition, the
    // session driving the pipeline. Stamp it as the run owner — re-stamping
    // on every advance re-homes ownership when a new run starts in a
    // different session.
    //
    // The mutation is delegated to the `luca state claim-owner` write-surface
    // handler (NOT a direct `mutateState` call), so the invariant "state.json
    // is mutated solely through the luca write surface" holds — the hook is a
    // caller of the sanctioned surface, identical to how skills mutate state.
    //
    // Best-effort: a stamp failure (e.g. state.json absent on a brand-new
    // repo's first advance) must never break the gate, so it falls through to
    // conservative enforcement.
    if (
        toolName === 'Bash' &&
        sessionId &&
        state.ownerSessionId !== sessionId &&
        isStateAdvanceCommand(
            (toolInput as { command?: string } | undefined)?.command ?? ''
        )
    ) {
        try {
            await lucaStateClaimOwnerTool.handler({ sessionId }, { cwd })
            // Reflect the stamp in our in-memory copy so the bystander check
            // below sees the fresh owner (this advancing session IS the owner).
            state.ownerSessionId = sessionId
        } catch (err) {
            log(`stage-gate: owner stamp skipped (${(err as Error).message})`)
        }
    }

    // A bystander is a session that is NOT the pipeline owner — a separate
    // terminal doing out-of-workflow work in the same repo. We know the owner
    // only once it has been stamped AND we can see the incoming session id;
    // when either is unknown we fall through to normal enforcement
    // (conservative — never disable the gate for the real pipeline).
    const isBystander =
        Boolean(state.ownerSessionId) &&
        Boolean(sessionId) &&
        state.ownerSessionId !== sessionId

    const phase = coarsePhaseOf(state.pipelineStep)

    // ALWAYS-DENIED PATHS AND COMMANDS — EVERY PHASE, IDLE INCLUDED.
    //
    // This MUST run before the IDLE short-circuit below. When it ran after,
    // "blocked regardless of phase" (this file's docstring, and the
    // write-surface skill body) was false at `pipelineStep: 'idle'`: a native
    // `Write` to `<home>/.luca/handoff/x.json` returned `allow` outright, so an
    // agent could hand-forge a mailbox envelope with an id, `status:
    // 'accepted'` and `statusHistory` of its choosing — bypassing the
    // schema-validated `luca handoff` CLI that is the mailbox's core
    // invariant. The SessionStart handoff triage runs in exactly that state.
    //
    // Only the SECURITY FLOOR moves up here. The phase/tool matrix and the
    // `.luca/` artifact gate stay below, so IDLE remains permissive for
    // everything that is not always-denied.
    const alwaysDenied = alwaysDeniedReason(toolName, toolInput, {
        homedir,
        cwd,
        tmpdirs,
    })
    if (alwaysDenied) {
        const msg = `stage-gate BLOCK: ${alwaysDenied}`
        log(msg)
        return {
            exitCode: 2,
            toolName,
            toolInput,
            decision: 'block',
            reason: msg,
        }
    }

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

    if (isWriteTool(toolName)) {
        const targetPath = writeTargetOf(toolInput)
        if (!targetPath) {
            // Can't classify without a target. Allow conservatively —
            // shouldn't happen in real Claude Code/Antigravity invocations.
            log(`stage-gate: ${toolName} without file_path/path — allowing`)
            return { exitCode: 0, toolName, toolInput, decision: 'allow' }
        }
        // Claude Code passes an ABSOLUTE file_path, but the .luca/ contract
        // (and artifactPathGate, via phasePathFor) is repo-relative. Use the
        // shared `toLucaRelative` resolver — robust to `cwd` not being the
        // repo root (a subagent/harness cwd inside a subdir would otherwise
        // yield `../../.luca/…` and wrongly fail the gate). Denied checks
        // still run on the absolute original inside classifyWritePath.
        const relTarget = toLucaRelative(targetPath, cwd)
        const pc = classifyWritePath(targetPath, { homedir, cwd, tmpdirs })
        if (pc.class === 'denied') {
            // Unreachable in practice — `alwaysDeniedReason` above already
            // blocked this, in EVERY phase. Kept as defence in depth so the
            // classification never falls through to the matrix if the two
            // ever drift.
            pathBlockReason = `${toolName} to '${targetPath}' is always denied: ${pc.reason ?? 'forbidden path'}`
        } else if (pc.class === 'ephemeral') {
            // Inert ephemeral scratch (OS-temp file or .luca/tmp/previews/<name>):
            // a browser preview / screenshot / generated HTML that touches
            // neither the repo nor pipeline state. Allowed in ANY pipelineStep
            // — bypass the phase/tool matrix entirely (the always-denied path
            // rules above have already run).
            log(
                `stage-gate: ${toolName} to '${targetPath}' is ephemeral scratch — allowing`
            )
            return { exitCode: 0, toolName, toolInput, decision: 'allow' }
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
            // pc.class === 'code' | 'release-artifact' — a repo file (normal
            // project file, or a `.changeset/*.md` release note). Matrix decides.
            category = pathClassToToolCategory(pc.class)
        }
    } else if (isBashTool(toolName)) {
        const command = bashCommandOf(toolInput)
        const bashResult = classifyBashCommand(command)
        if (bashResult.category === 'denied') {
            // Defence in depth — see the note on the write-path branch above.
            pathBlockReason = `Bash command is always denied: ${
                bashResult.reason ?? 'forbidden command'
            }`
        } else {
            for (const target of bashResult.targetPaths) {
                const pc = classifyWritePath(target, { homedir, tmpdirs })
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

    // Session-scoped exemption: a non-owner ("bystander") session is doing
    // out-of-workflow work in a repo where a pipeline happens to be mid-run.
    // It must not inherit that pipeline's phase restrictions. Exempt it from
    // the phase/tool matrix — the always-denied path/command rules above have
    // ALREADY run and applied to every session, so this only relaxes the
    // phase-ordering matrix, not the security floor. `.luca/` artifact writes
    // are unaffected (handled by artifactPathGate, which returns earlier).
    if (isBystander) {
        log(
            `stage-gate: session ${sessionId} is not the run owner ` +
                `(${state.ownerSessionId}) — exempting ${toolName} ` +
                `(category=${category}) from the phase=${phase} matrix`
        )
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

/** Is this tool name a native file-write tool (Claude Code / Antigravity)? */
function isWriteTool(toolName: string | undefined): boolean {
    return (
        toolName === 'Edit' ||
        toolName === 'Write' ||
        toolName === 'NotebookEdit' ||
        toolName === 'replace' ||
        toolName === 'write_file'
    )
}

/** Is this tool name a shell-execution tool? */
function isBashTool(toolName: string | undefined): boolean {
    return (
        toolName === 'Bash' ||
        toolName === 'run_shell_command' ||
        toolName === 'run_command'
    )
}

/** The write target of a write-tool payload (`file_path` or `path`). */
function writeTargetOf(toolInput: unknown): string | undefined {
    const input = toolInput as
        | { file_path?: string; path?: string }
        | undefined
    return input?.file_path ?? input?.path
}

/** The command string of a shell-tool payload. */
function bashCommandOf(toolInput: unknown): string {
    return (toolInput as { command?: string } | undefined)?.command ?? ''
}

/**
 * The SECURITY FLOOR: evaluate the always-denied path / command rules that
 * apply in EVERY pipelineStep, IDLE included.
 *
 * Split out of the main classification block so it can run BEFORE the IDLE
 * short-circuit. It answers one question only — "is this call always denied?"
 * — and never consults the phase/tool matrix or the `.luca/` artifact gate,
 * both of which stay phase-scoped.
 *
 * @param toolName  the incoming tool name (may be undefined / non-write)
 * @param toolInput the raw tool payload
 * @param opts      homedir / cwd / tmpdirs, exactly as the main block passes
 *                  them to `classifyWritePath`
 * @returns the block reason, or `undefined` when nothing is always-denied
 */
function alwaysDeniedReason(
    toolName: string | undefined,
    toolInput: unknown,
    opts: { homedir?: string; cwd: string; tmpdirs: string[] }
): string | undefined {
    if (isWriteTool(toolName)) {
        const targetPath = writeTargetOf(toolInput)
        if (!targetPath) return undefined
        const pc = classifyWritePath(targetPath, opts)
        if (pc.class === 'denied') {
            return `${toolName} to '${targetPath}' is always denied: ${
                pc.reason ?? 'forbidden path'
            }`
        }
        return undefined
    }

    if (isBashTool(toolName)) {
        const bashResult = classifyBashCommand(bashCommandOf(toolInput))
        if (bashResult.category === 'denied') {
            return `Bash command is always denied: ${
                bashResult.reason ?? 'forbidden command'
            }`
        }
        for (const target of bashResult.targetPaths) {
            const pc = classifyWritePath(target, {
                homedir: opts.homedir,
                tmpdirs: opts.tmpdirs,
            })
            if (pc.class === 'denied') {
                return `Bash writes to denied path '${target}': ${
                    pc.reason ?? 'forbidden path'
                }`
            }
        }
    }

    return undefined
}

/**
 * Detect a `luca state advance` invocation anywhere in a (possibly compound)
 * bash command — the ownership signal for the session-scoped gate. Parses
 * with shell-quote (operators become non-string entries, so the `luca`,
 * `state`, `advance` word triplet stays contiguous in the string-token
 * stream even for `cd x && luca state advance …`). A parse failure is
 * treated as "not an advance" — the stamp is best-effort, never the gate's
 * security boundary.
 */
function isStateAdvanceCommand(command: string): boolean {
    if (!command.includes('advance')) return false
    let entries: ReturnType<typeof parse>
    try {
        entries = parse(command)
    } catch {
        return false
    }
    const toks = entries.filter((e): e is string => typeof e === 'string')
    for (let i = 0; i <= toks.length - 3; i += 1) {
        if (
            toks[i] === 'luca' &&
            toks[i + 1] === 'state' &&
            toks[i + 2] === 'advance'
        ) {
            return true
        }
    }
    return false
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
    // Sanctioned ephemeral CLI-handoff scratch: `.luca/tmp/<name>.{json,md}` is a
    // repo-scoped payload file bridging the LLM orchestrator and the `luca`
    // CLI (`--file`). It is NOT a pipeline artifact, so it is allowed in ANY
    // pipelineStep (including steps with no legal artifact). This replaces the
    // old shared global `/tmp/luca-*.json` paths that collided across repos.
    if (TMP_PATH_PATTERN.test(targetPath)) {
        return { kind: 'allow' }
    }

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
        case 'release-artifact':
            // `.changeset/<name>.md` — its own matrix column so FINALIZING
            // can author a changeset without opening 'code-write'.
            return 'release-artifact'
        case 'ephemeral':
            // Caller short-circuits 'ephemeral' to allow before this is
            // called — it has no phase/tool-matrix category.
            throw new Error('pathClassToToolCategory called with ephemeral')
        case 'denied':
            // Caller has already handled 'denied' before this is called.
            throw new Error('pathClassToToolCategory called with denied')
    }
}

export function bashCategoryToToolCategory(c: BashCategory): ToolCategory {
    switch (c) {
        case 'bash-readonly':
            return 'bash-readonly'
        case 'bash-stage':
            // `git add` — staging, not committing. Allowed in
            // EXECUTING/FINALIZING so finalize can stage the changeset it
            // authored; denied in PLANNING/REVIEWING.
            return 'bash-stage'
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
