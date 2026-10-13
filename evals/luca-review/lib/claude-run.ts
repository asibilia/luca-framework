import { z } from 'zod'

/** The model for every eval run. */
export const EVAL_MODEL = 'claude-opus-5-5'

/**
 * The flags for one headless `claude` run; the prompt goes in on stdin.
 * `--setting-sources project` loads only built-in skills plus the run
 * folder's own `.claude/skills/`, so each setup sees only its own skill.
 * `tools` null keeps Claude Code's default tools; [] gives none.
 */
export const claudeArgs = ({
    model,
    max_budget_usd,
    output_format,
    tools,
}: {
    model: string
    max_budget_usd: number
    output_format: 'stream-json' | 'json'
    tools: string[] | null
}): string[] => [
    '-p',
    '--model',
    model,
    '--setting-sources',
    'project',
    '--permission-mode',
    'bypassPermissions',
    '--output-format',
    output_format,
    ...(output_format === 'stream-json' ? ['--verbose'] : []),
    '--max-budget-usd',
    String(max_budget_usd),
    ...(tools === null ? [] : ['--tools', tools.join(',')]),
]

const InitSchema = z.object({
    type: z.literal('system'),
    subtype: z.literal('init'),
    session_id: z.string(),
    claude_code_version: z.string(),
    skills: z.array(z.string()).default([]),
})

const ResultSchema = z.object({
    type: z.literal('result'),
    is_error: z.boolean(),
    result: z.string().default(''),
    total_cost_usd: z.number().default(0),
})

const AssistantSchema = z.object({
    type: z.literal('assistant'),
    message: z.object({ content: z.array(z.unknown()) }),
})

const SkillCallSchema = z.object({
    type: z.literal('tool_use'),
    name: z.literal('Skill'),
    input: z.object({ skill: z.string() }),
})

/** What one `stream-json` run tells us. */
export type StreamSummary = {
    session_id: string | null
    claude_code_version: string
    skills: string[]
    skill_calls: string[]
    result_text: string
    is_error: boolean
    total_cost_usd: number
}

const parseLine = (line: string): unknown => {
    try {
        return JSON.parse(line)
    } catch {
        return null
    }
}

const parsedAll = <T>({
    schema,
    items,
}: {
    schema: z.ZodType<T>
    items: unknown[]
}): T[] =>
    items.flatMap((item) => {
        const parsed = schema.safeParse(item)
        return parsed.success ? [parsed.data] : []
    })

/** Reads a `stream-json` run's output. A stream with no result event counts as an error. */
export const parseStream = ({ text }: { text: string }): StreamSummary => {
    const events = text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map(parseLine)
    const init = parsedAll({ schema: InitSchema, items: events })[0]
    const result = parsedAll({ schema: ResultSchema, items: events }).at(-1)
    const skill_calls = parsedAll({
        schema: AssistantSchema,
        items: events,
    }).flatMap((event) =>
        parsedAll({
            schema: SkillCallSchema,
            items: event.message.content,
        }).map((call) => call.input.skill)
    )
    return {
        session_id: init?.session_id ?? null,
        claude_code_version: init?.claude_code_version ?? 'unknown',
        skills: init?.skills ?? [],
        skill_calls,
        result_text: result?.result ?? '',
        is_error: result === undefined ? true : result.is_error,
        total_cost_usd: result?.total_cost_usd ?? 0,
    }
}

/** Time to allow SIGTERM to work before sending SIGKILL. */
const KILL_GRACE_MS = 2_000

/** Time to wait for stream data after process exits. */
const DRAIN_GRACE_MS = 1_000

/**
 * Helper to read a stream incrementally, capturing all data even if cancelled.
 * Exposes text(), done promise, and cancel() method.
 */
const createStreamReader = (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder()
    const chunks: string[] = []
    let isCancelled = false

    const reader = stream.getReader()

    const donePromise = (async () => {
        try {
            while (!isCancelled) {
                const { done, value } = await reader.read()
                if (done) {
                    // Flush any remaining data from the decoder
                    const final = decoder.decode()
                    if (final) chunks.push(final)
                    break
                }
                if (value) {
                    chunks.push(decoder.decode(value, { stream: true }))
                }
            }
        } catch {
            // Ignore read errors - return what we have
        } finally {
            try {
                reader.releaseLock()
            } catch {
                // Already released
            }
        }
    })()

    return {
        text: () => chunks.join(''),
        done: donePromise,
        cancel: async () => {
            isCancelled = true
            try {
                await reader.cancel()
            } catch {
                // Swallow cancellation errors
            }
        },
    }
}

/**
 * Runs `claude` (or `command`) with `args` in `cwd`, the prompt on stdin.
 * Saves stdout to `out_file` and stderr beside it, as `<out_file>.stderr`.
 * Kills the run after `timeout_ms`, with escalation to SIGKILL after KILL_GRACE_MS.
 * Always writes both output files and returns all accumulated data.
 */
export const runClaude = async ({
    cwd,
    args,
    env,
    stdin_text,
    out_file,
    timeout_ms,
    command = 'claude',
}: {
    cwd: string
    args: string[]
    env: Record<string, string | undefined>
    stdin_text: string
    out_file: string
    timeout_ms: number
    command?: string
}): Promise<{ text: string; exit_code: number; wall_ms: number }> => {
    const started = performance.now()
    const proc = Bun.spawn([command, ...args], {
        cwd,
        env,
        stdin: new TextEncoder().encode(stdin_text),
        stdout: 'pipe',
        stderr: 'pipe',
    })

    const stdoutReader = createStreamReader(proc.stdout)
    const stderrReader = createStreamReader(proc.stderr)

    let sigTermTimer: NodeJS.Timeout | null = null
    let sigKillTimer: NodeJS.Timeout | null = null

    try {
        // Schedule SIGTERM at timeout_ms
        sigTermTimer = setTimeout(() => {
            try {
                proc.kill()
            } catch {
                // Process already dead
            }
        }, timeout_ms)

        // Schedule SIGKILL at timeout_ms + KILL_GRACE_MS for stubborn children
        sigKillTimer = setTimeout(() => {
            try {
                proc.kill('SIGKILL')
            } catch {
                // Process already dead
            }
        }, timeout_ms + KILL_GRACE_MS)

        // Wait for process to exit
        const exit_code = await proc.exited

        // Clear timers now that process has exited
        if (sigTermTimer) clearTimeout(sigTermTimer)
        if (sigKillTimer) clearTimeout(sigKillTimer)

        // Wait for streams to finish or DRAIN_GRACE_MS, whichever comes first
        // This handles cases where a background child holds a pipe open
        await Promise.race([
            Promise.all([stdoutReader.done, stderrReader.done]),
            new Promise((resolve) => setTimeout(resolve, DRAIN_GRACE_MS)),
        ])

        // Cancel readers to ensure they stop waiting
        await Promise.all([stdoutReader.cancel(), stderrReader.cancel()])

        const text = stdoutReader.text()
        const errors = stderrReader.text()

        await Bun.write(out_file, text)
        await Bun.write(`${out_file}.stderr`, errors)

        return {
            text,
            exit_code,
            wall_ms: Math.round(performance.now() - started),
        }
    } finally {
        // Ensure timers are cleared even if an error occurs
        if (sigTermTimer) clearTimeout(sigTermTimer)
        if (sigKillTimer) clearTimeout(sigKillTimer)
    }
}
