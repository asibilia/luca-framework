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

/**
 * Runs `claude` (or `command`) with `args` in `cwd`, the prompt on stdin.
 * Saves stdout to `out_file` and stderr beside it, as `<out_file>.stderr`.
 * Kills the run after `timeout_ms`.
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
    let timer: NodeJS.Timeout | null = null
    const timeoutPromise = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
            proc.kill()
            resolve()
        }, timeout_ms)
    })
    const streamsPromise = Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])
    const [text, errors] = await Promise.race([
        streamsPromise,
        timeoutPromise.then(() => ['', ''] as [string, string]),
    ])
    const exit_code = await proc.exited
    if (timer) clearTimeout(timer)
    await Bun.write(out_file, text)
    await Bun.write(`${out_file}.stderr`, errors)
    return { text, exit_code, wall_ms: Math.round(performance.now() - started) }
}
