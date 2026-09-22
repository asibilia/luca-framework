/**
 * CLI command group: `luca budget`
 *
 * Read-only, advisory run-budget guard for #319. Models the read-only `gate`
 * leaf of `confidence.ts`.
 *
 * Leaves:
 *   - `budget check` — resolve the active run's wall/tool/cost signals against
 *     the per-complexity ceilings and print an advisory JSON verdict.
 *
 * Design (locked by the #319 implementation plan):
 *   - Wall-time is the ONE guaranteed trip wire, measured from the
 *     state-stamped `runStartedAt`. When `runStartedAt` is unset the command
 *     lazily stamps it (idempotent `mutateState` write under the state lock) so
 *     legacy/pre-existing runs get a baseline and the wall-time signal is never
 *     blind.
 *   - Tool-call count and session cost are STRICTLY best-effort, read from
 *     sidecars under `<cwd>/.claude/cache/`. A missing / malformed / stale
 *     (older than 5 min) sidecar omits that dimension entirely — it is never
 *     coerced into a halting 0.
 *   - The command ALWAYS exits 0 (advisory). The caller (Phase 2 loop wiring)
 *     branches on the printed `.status`.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
    ComplexityLevel,
    evaluateRunBudget,
    loadCurrentConfig,
    loadCurrentState,
    resolveBudgetLimits,
    resolveRunBudgetOverrides,
    type BudgetLimits,
    type RunBudgetVerdict,
} from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'
import { z } from 'zod'

import { rejectUnknownFlags } from './__helpers/run-handler.ts'

import { mutateState } from '../../write-surface/helpers/mutate-state.ts'

/** A sidecar is ignored when its timestamp is older than this. */
const STALE_SIDECAR_MS = 5 * 60 * 1000

/**
 * Tool-call sidecar (`.claude/cache/context-refresher-state.json`). Only
 * `toolCallCount` is load-bearing; the timestamp fields gate staleness. Schema
 * is permissive — unknown keys are ignored, `.safeParse` never throws.
 */
const ToolSidecarSchema = z.object({
    toolCallCount: z.number().nonnegative().finite(),
    updatedAt: z.string().optional(),
    lastFiredAt: z.string().optional(),
})

/**
 * Usage sidecar (`.claude/cache/luca-usage-signal.json`). Written by the
 * Phase-2 statusline bridge; absent in Phase 1, which is expected (the cost
 * dimension is simply omitted). `.finite()` rejects a sidecar `Infinity` that
 * would otherwise force a false `halt`.
 */
const UsageSidecarSchema = z.object({
    totalCostUsd: z.number().nonnegative().finite().optional(),
    updatedAt: z.string().optional(),
})

/**
 * Best-effort sidecar read: missing / unreadable / malformed → `undefined`
 * (never throws). Schema validation is `.safeParse`; a parse failure omits the
 * dimension rather than surfacing a partial/garbage value.
 */
async function readSidecar<T extends z.ZodTypeAny>(
    path: string,
    schema: T
): Promise<z.infer<T> | undefined> {
    if (!existsSync(path)) return undefined
    try {
        const raw = JSON.parse(await readFile(path, 'utf-8'))
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return undefined
        return parsed.data
    } catch {
        return undefined
    }
}

/**
 * A sidecar carrying a timestamp older than {@link STALE_SIDECAR_MS} is
 * presumed to belong to a prior run and its signal is dropped. A sidecar with
 * NO timestamp is accepted best-effort (not treated as stale).
 */
function isStale(timestamp: string | undefined): boolean {
    if (timestamp === undefined) return false
    const parsed = Date.parse(timestamp)
    if (Number.isNaN(parsed)) return true
    return Date.now() - parsed > STALE_SIDECAR_MS
}

const checkCommand = defineCommand({
    meta: {
        name: 'check',
        description:
            'Resolve the active run against its per-complexity budget ceilings ' +
            'and print an advisory JSON verdict ({ status, tripped, signals }) ' +
            'to stdout. Wall-time is the guaranteed trip wire (from a lazily ' +
            'stamped runStartedAt); tool-call and cost are best-effort. ' +
            'ALWAYS exits 0 — the caller branches on `.status`.',
    },
    args: {
        complexity: {
            type: 'string',
            description:
                'Optional complexity level (TRIVIAL | SIMPLE | MODERATE | ' +
                'COMPLEX | CRITICAL). Falls back to the state complexity, then ' +
                'to the default (COMPLEX-level) ceilings.',
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('budget check', cmd, rawArgs)
        const cwd = process.cwd()

        const state = await loadCurrentState({ cwd })

        // Resolve complexity: explicit flag (if a valid enum) → state → unset.
        const flagComplexity = ComplexityLevel.safeParse(args.complexity)
        const complexity = flagComplexity.success
            ? flagComplexity.data
            : state.complexity

        // Lazily stamp `runStartedAt` when unset OR unparseable — but ONLY when
        // a real state.json exists on disk. `mutateState` refuses a missing
        // file, so guard on presence and degrade gracefully rather than throw.
        // A garbage/tampered stamp that `Date.parse`es to NaN is treated as
        // unset: re-stamp it (same idempotent lazy path) rather than silently
        // reading `elapsed = 0` and blinding the wall-time trip wire.
        let runStartedAt = state.runStartedAt
        const stampNeeded =
            runStartedAt === undefined ||
            Number.isNaN(Date.parse(runStartedAt))
        const stateExists = existsSync(join(cwd, '.luca', 'state.json'))
        if (stateExists && stampNeeded) {
            try {
                const nowIso = new Date().toISOString()
                const stamped = await mutateState(cwd, (s) => {
                    const existing = s.runStartedAt
                    const valid =
                        existing !== undefined &&
                        !Number.isNaN(Date.parse(existing))
                    return valid ? s : { ...s, runStartedAt: nowIso }
                })
                runStartedAt = stamped.runStartedAt
            } catch {
                // Best-effort: a failed stamp (lock contention, missing file)
                // must never fail the advisory check.
            }
        }

        // Wall-time baseline. With no parseable stamp (state missing / a stamp
        // still unparseable after the failed re-stamp) elapsed is 0 → the
        // wall-clock dimension reads ok, the minimal-verdict degrade path.
        const parsedStart =
            runStartedAt !== undefined ? Date.parse(runStartedAt) : Number.NaN
        const elapsedMs = Number.isNaN(parsedStart)
            ? 0
            : Math.max(0, Date.now() - parsedStart)

        // Best-effort sidecars under .claude/cache/.
        const cacheDir = join(cwd, '.claude', 'cache')
        const toolSidecar = await readSidecar(
            join(cacheDir, 'context-refresher-state.json'),
            ToolSidecarSchema
        )
        const usageSidecar = await readSidecar(
            join(cacheDir, 'luca-usage-signal.json'),
            UsageSidecarSchema
        )

        // Tool-call dimension — omitted when absent or stale.
        const toolCallCount =
            toolSidecar !== undefined &&
            !isStale(toolSidecar.updatedAt ?? toolSidecar.lastFiredAt)
                ? toolSidecar.toolCallCount
                : undefined

        // Cost dimension — omitted when absent or stale.
        const usageFresh =
            usageSidecar !== undefined && !isStale(usageSidecar.updatedAt)
        const costUsd = usageFresh ? usageSidecar.totalCostUsd : undefined

        // Limits = per-complexity ceilings merged with config overrides (which
        // win). Overrides come from the opaque .luca/config.json `budget`
        // section via a `.safeParse` (parse failure → no overrides).
        const baseLimits = resolveBudgetLimits({ complexity })
        const overrides = resolveRunBudgetOverrides(
            await loadCurrentConfig({ cwd })
        )
        const limits: BudgetLimits = { ...baseLimits, ...overrides }

        const verdict: RunBudgetVerdict = evaluateRunBudget({
            elapsedMs,
            ...(toolCallCount !== undefined ? { toolCallCount } : {}),
            ...(costUsd !== undefined ? { costUsd } : {}),
            limits,
        })

        process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`)
        // Advisory: ALWAYS exit 0, even on a `halt` verdict. No explicit exit
        // call — citty resolves the run cleanly with a 0 status.
    },
})

export const budgetCommand = defineCommand({
    meta: {
        name: 'budget',
        description:
            'Advisory run-budget guard: check wall/tool/cost signals against ' +
            'per-complexity ceilings (always exit 0).',
    },
    subCommands: {
        check: checkCommand,
    },
})
