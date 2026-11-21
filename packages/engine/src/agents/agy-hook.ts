/**
 * Fail-closed hook bridge invoked by Antigravity (`agy`) via `--add-dir`
 * hooks (`SessionStart`, `PreToolUse`, `PreInvocation`) (#781).
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import {
    AgyHookStateSchema,
    checkAgyToolCall,
    type AgyHookState,
} from './agy-tool-rules'

export { AgyHookStateSchema, type AgyHookState }

export type AgyHookResult = {
    exit_code: number
    output: Record<string, unknown>
}

const StdinEnvelopeSchema = z.looseObject({
    hookEventName: z.string().optional(),
})

const PreToolUseStdinSchema = z.looseObject({
    hookEventName: z.literal('PreToolUse'),
    toolCall: z.looseObject({
        name: z.string().min(1),
        args: z.unknown().optional(),
    }),
})

const PreInvocationStdinSchema = z.looseObject({
    hookEventName: z.literal('PreInvocation'),
    invocationNum: z.unknown().optional(),
})

const STATE_READ_ERROR = 'Luca hook could not read guard state.'

/**
 * The file in the state directory where `PreInvocation` keeps this `agy`
 * process's turn count. The launcher removes it before each spawn
 * (`resetAgyTurnFiles`), so each process counts from zero.
 */
export const AGY_TURNS_FILE = 'turns.json'

/**
 * This process's turn count: the first `invocationNum` it saw (`baseline`)
 * and how many `PreInvocation` calls came before (`calls`).
 */
export const AgyTurnCountSchema = z.object({
    baseline: z.number().nullable().default(null),
    calls: z.number().int().min(0).default(0),
})

export type AgyTurnCount = z.infer<typeof AgyTurnCountSchema>

const readTurnCount = async ({
    state_dir,
}: {
    state_dir: string
}): Promise<AgyTurnCount> => {
    try {
        const text = await readFile(join(state_dir, AGY_TURNS_FILE), 'utf8')
        const parsed = AgyTurnCountSchema.safeParse(JSON.parse(text))
        if (parsed.success) return parsed.data
    } catch {
        // No count yet: this is the process's first invocation.
    }
    return AgyTurnCountSchema.parse({})
}

/**
 * How many turns this `agy` process has used before the current
 * invocation, and the count to keep for the next one.
 *
 * `agy` numbers invocations across a whole `--conversation`, so a follow-up
 * process (`turn_index > 0`) counts from the first `invocationNum` it sees
 * and gets its own `max_turns`, as a Claude follow-up does. A fresh
 * conversation (`turn_index === 0`) numbers from 0. A missing or malformed
 * `invocationNum` falls back to the hook's own count of calls, so the limit
 * never goes away.
 *
 * @example
 * turnsUsed({ invocation_num: 42, turn_index: 1, count: { baseline: 40, calls: 2 } })
 * // { used: 2, next: { baseline: 40, calls: 3 } }
 */
export const turnsUsed = ({
    invocation_num,
    turn_index,
    count,
}: {
    invocation_num: unknown
    turn_index: number
    count: AgyTurnCount
}): { used: number; next: AgyTurnCount } => {
    const calls = count.calls + 1
    if (
        typeof invocation_num !== 'number' ||
        !Number.isFinite(invocation_num)
    ) {
        return { used: count.calls, next: { ...count, calls } }
    }
    if (turn_index === 0) {
        return { used: invocation_num, next: { ...count, calls } }
    }
    const baseline = count.baseline ?? invocation_num
    return { used: invocation_num - baseline, next: { baseline, calls } }
}

/**
 * Returns the fail-closed response for `hook_event_name` when stdin or guard
 * state cannot be read or validated.
 */
export const failClosedForEvent = ({
    hook_event_name,
}: {
    hook_event_name: string | undefined
}): AgyHookResult => {
    if (hook_event_name === 'PreInvocation') {
        return {
            exit_code: 0,
            output: {
                terminationBehavior: 'terminate',
                injectSteps: [
                    { errorMessage: { userMessage: STATE_READ_ERROR } },
                ],
            },
        }
    }
    if (hook_event_name === 'SessionStart') {
        return { exit_code: 1, output: {} }
    }
    return {
        exit_code: 0,
        output: { decision: 'deny', reason: STATE_READ_ERROR },
    }
}

const recordDenial = async ({
    state_dir,
    tool_name,
    reason,
}: {
    state_dir: string
    tool_name: string
    reason: string
}): Promise<void> => {
    try {
        await appendFile(
            join(state_dir, 'denials.jsonl'),
            `${JSON.stringify({ tool_name, reason })}\n`
        )
    } catch {
        // Denial response still reaches stdout even if logging fails.
    }
}

const readHookState = async ({
    state_dir,
}: {
    state_dir: string | undefined
}): Promise<AgyHookState | null> => {
    if (typeof state_dir !== 'string' || state_dir.trim() === '') return null
    try {
        const text = await readFile(join(state_dir, 'state.json'), 'utf8')
        const parsed = AgyHookStateSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

/**
 * Pure async handler for one `agy` hook invocation (`SessionStart`,
 * `PreToolUse`, or `PreInvocation`). Fails closed on any malformed input,
 * missing `state_dir`, unreadable/invalid `state.json`, or guard exception.
 */
export const runAgyHook = async ({
    stdin_text,
    state_dir,
}: {
    stdin_text: string
    state_dir: string | undefined
}): Promise<AgyHookResult> => {
    let raw: unknown
    try {
        raw = JSON.parse(stdin_text)
    } catch {
        return failClosedForEvent({ hook_event_name: undefined })
    }
    const envelope = StdinEnvelopeSchema.safeParse(raw)
    if (!envelope.success) {
        return failClosedForEvent({ hook_event_name: undefined })
    }
    const hook_event_name = envelope.data.hookEventName
    const state = await readHookState({ state_dir })
    if (state === null || typeof state_dir !== 'string') {
        return failClosedForEvent({ hook_event_name })
    }

    if (hook_event_name === 'SessionStart') {
        return state.turn_index === 0
            ? {
                  exit_code: 0,
                  output: {
                      injectSteps: [
                          {
                              systemMessage: {
                                  systemMessage: state.instructions,
                              },
                          },
                      ],
                  },
              }
            : { exit_code: 0, output: {} }
    }

    if (hook_event_name === 'PreToolUse') {
        const parsed = PreToolUseStdinSchema.safeParse(raw)
        if (!parsed.success) {
            const reason = 'Luca hook received malformed PreToolUse payload.'
            await recordDenial({ state_dir, tool_name: 'unknown', reason })
            return { exit_code: 0, output: { decision: 'deny', reason } }
        }
        const tool_name = parsed.data.toolCall.name
        const tool_input = parsed.data.toolCall.args ?? {}
        try {
            const decision = checkAgyToolCall({ state, tool_name, tool_input })
            if (decision.allow) {
                return { exit_code: 0, output: { decision: 'allow' } }
            }
            await recordDenial({
                state_dir,
                tool_name,
                reason: decision.reason,
            })
            return {
                exit_code: 0,
                output: { decision: 'deny', reason: decision.reason },
            }
        } catch (error) {
            const reason = `Guard error: ${error instanceof Error ? error.message : String(error)}`
            await recordDenial({ state_dir, tool_name, reason })
            return { exit_code: 0, output: { decision: 'deny', reason } }
        }
    }

    if (hook_event_name === 'PreInvocation') {
        const parsed = PreInvocationStdinSchema.safeParse(raw)
        const { used, next } = turnsUsed({
            invocation_num: parsed.success
                ? parsed.data.invocationNum
                : undefined,
            turn_index: state.turn_index,
            count: await readTurnCount({ state_dir }),
        })
        try {
            await writeFile(
                join(state_dir, AGY_TURNS_FILE),
                JSON.stringify(next)
            )
        } catch {
            // An unwritten count only ever under-counts by this one call.
        }
        if (used >= state.max_turns) {
            try {
                await writeFile(join(state_dir, 'out-of-turns.flag'), '1\n')
            } catch {
                // Still terminate the session even if flag creation fails.
            }
            return {
                exit_code: 0,
                output: {
                    terminationBehavior: 'terminate',
                    injectSteps: [
                        {
                            errorMessage: {
                                userMessage: 'Turn limit reached.',
                            },
                        },
                    ],
                },
            }
        }
        return { exit_code: 0, output: {} }
    }

    return {
        exit_code: 0,
        output: {
            decision: 'deny',
            reason: `Unknown hook event: ${hook_event_name ?? 'missing'}.`,
        },
    }
}

if (import.meta.main) {
    let result: AgyHookResult
    try {
        const stdin_text = await Bun.stdin.text()
        result = await runAgyHook({
            stdin_text,
            state_dir: process.env.LUCA_AGY_STATE_DIR,
        })
    } catch {
        result = failClosedForEvent({ hook_event_name: undefined })
    }
    await Bun.write(Bun.stdout, `${JSON.stringify(result.output)}\n`)
    process.exit(result.exit_code)
}
