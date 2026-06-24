/**
 * compile — top-level orchestrator for the luca-tools artifact compiler.
 *
 * Takes a list of `Artifact` objects (the D-1 discriminated union) and
 * an output root directory, dispatches each artifact to its per-kind
 * emitter, then merges all hook slices into a single
 * `<outputRoot>/.claude/settings.json` file.
 *
 * Determinism + idempotence guarantees (from the D-2 task contract):
 *
 *   1. Same input + same outputRoot -> same bytes on disk. No
 *      timestamps, no random ids.
 *   2. Re-running the compiler twice produces identical bytes.
 *   3. Emission ORDER is stable: artifacts are processed in the order
 *      they appear in the input. Hook events in settings.json are
 *      emitted in HOOK_EVENT_ORDER below — a fixed sequence, not
 *      insertion order — so different artifact orderings still
 *      produce the same settings.json bytes as long as the hooks
 *      themselves are the same set.
 *
 * Per the D-2 task constraints, the compiler does NOT write into the
 * repo's tracked `.claude/` or `skills/` while developing. The default
 * outputRoot is opaque to this module — the caller (the CLI in
 * `bin/compile.ts`) decides where to point it. D-4 will point it at
 * the host repo's actual artifact directories.
 */
import { join } from 'node:path'

import { emitAgent } from './emit-agent.ts'
import { emitCommand } from './emit-command.ts'
import { emitHook, type HookEmitSlice } from './emit-hook.ts'
import { emitRule } from './emit-rule.ts'
import { emitSkill } from './emit-skill.ts'
import { emitSubagent } from './emit-subagent.ts'
import { ensureDir, type EmitResult, writeFileBytes } from './emit-util.ts'

import {
    type Artifact,
    isAgent,
    isCommand,
    isHook,
    isRule,
    isSkill,
    isSubagent,
} from '../define/index.ts'

/**
 * Result of a compile run. `paths` is in the same order the input
 * artifacts were processed. `counts` is a quick summary keyed by
 * artifact kind. `settingsPath` is the path to the merged settings
 * file when hooks were present, or `null` otherwise.
 */
export interface CompileReport {
    counts: Record<Artifact['kind'], number>
    paths: EmitResult[]
    settingsPath: string | null
}

/**
 * Fixed order for hook events in the emitted settings.json. We don't
 * rely on input-artifact order because that would let two callers with
 * the same hook set produce different bytes. The list mirrors the
 * Claude Code documentation's lifecycle ordering.
 */
const HOOK_EVENT_ORDER: ReadonlyArray<HookEmitSlice['event']> = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'Notification',
    'SubagentStop',
    'Stop',
    'PreCompact',
    'SessionEnd',
]

/**
 * Compile a manifest of artifacts to disk under `outputRoot`. Returns
 * the report. Throws if any emitter throws.
 *
 * @param artifacts - the Define* objects to compile
 * @param outputRoot - directory the emitters write under; created if missing
 */
export async function compile(
    artifacts: readonly Artifact[],
    outputRoot: string
): Promise<CompileReport> {
    await ensureDir(outputRoot)
    const paths: EmitResult[] = []
    const hookSlices: HookEmitSlice[] = []
    const counts: Record<Artifact['kind'], number> = {
        agent: 0,
        subagent: 0,
        command: 0,
        skill: 0,
        hook: 0,
        rule: 0,
    }

    for (const art of artifacts) {
        if (isAgent(art)) {
            const result = await emitAgent(art, outputRoot)
            paths.push(result)
            counts.agent += 1
        } else if (isSubagent(art)) {
            const result = await emitSubagent(art, outputRoot)
            paths.push(result)
            counts.subagent += 1
        } else if (isCommand(art)) {
            const result = await emitCommand(art, outputRoot)
            paths.push(result)
            counts.command += 1
        } else if (isSkill(art)) {
            const result = await emitSkill(art, outputRoot)
            paths.push(result)
            counts.skill += 1
        } else if (isHook(art)) {
            const slice = await emitHook(art, outputRoot)
            hookSlices.push(slice)
            paths.push({ path: slice.path, kind: slice.kind })
            counts.hook += 1
        } else if (isRule(art)) {
            const result = await emitRule(art, outputRoot)
            paths.push(result)
            counts.rule += 1
        } else {
            // Defensive: the discriminated union should be exhaustive,
            // but if a new kind is added without updating this switch
            // we want a clear runtime error rather than silent skip.
            const exhaustive: never = art
            throw new Error(
                `compile: unhandled artifact kind ${JSON.stringify(exhaustive)}`
            )
        }
    }

    let settingsPath: string | null = null
    if (hookSlices.length > 0) {
        settingsPath = await writeSettings(hookSlices, outputRoot)
    }

    return { counts, paths, settingsPath }
}

/**
 * Merge hook slices into a `<outputRoot>/.claude/settings.json` file.
 * Returns the absolute path written.
 *
 * Merge strategy:
 *
 *  - For each event in HOOK_EVENT_ORDER, collect the slices that
 *    declared that event, IN INPUT ORDER. Then within each event the
 *    individual hook entries are appended in input order.
 *  - We DO NOT attempt to merge entries that share a matcher. The
 *    hand-written precedent (luca-framework's `.claude/settings.json`)
 *    has multiple entries with the same matcher (e.g. two PostToolUse
 *    entries on `Edit|Write`) and that's a legal shape — each entry
 *    is an independent hook configuration.
 *  - The emitted JSON is pretty-printed with two-space indentation to
 *    match the hand-written precedent, then terminated with a single
 *    trailing newline.
 *
 * Determinism note: HOOK_EVENT_ORDER guarantees the OUTER event order
 * is fixed. Within each event, the INNER entry order is the input
 * order — same input -> same bytes, two callers passing the same
 * hooks in the same order get the same file.
 */
async function writeSettings(
    slices: readonly HookEmitSlice[],
    outputRoot: string
): Promise<string> {
    const hooksBlock: Record<string, HookEmitSlice['entry'][]> = {}
    for (const event of HOOK_EVENT_ORDER) {
        const entries = slices
            .filter((s) => s.event === event)
            .map((s) => s.entry)
        if (entries.length > 0) {
            hooksBlock[event] = entries
        }
    }
    const settings = { hooks: hooksBlock }
    const json = JSON.stringify(settings, null, 2) + '\n'
    const path = join(outputRoot, '.claude', 'settings.json')
    await writeFileBytes(path, json)
    return path
}

// Re-export the per-kind emitters too, so callers that want to compile
// one artifact at a time (e.g. for tests or per-file partial builds)
// can do so without going through the top-level dispatch.
export { emitAgent } from './emit-agent.ts'
export { emitCommand } from './emit-command.ts'
export { emitHook } from './emit-hook.ts'
export { emitRule } from './emit-rule.ts'
export { emitSkill } from './emit-skill.ts'
export { emitSubagent } from './emit-subagent.ts'

export type { EmitResult } from './emit-util.ts'
export type { HookEmitSlice, HookSettingsEntry } from './emit-hook.ts'

// Re-export the Artifact union from the local namespace so consumers
// (including the bin CLI) can grab everything from `./compile` without
// having to also reach into `../define`. This is purely ergonomic;
// the canonical source remains `./define/artifact.ts`.
export type { Artifact, RuleArtifact } from '../define/index.ts'
