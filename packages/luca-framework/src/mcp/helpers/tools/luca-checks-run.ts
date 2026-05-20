import { z, type ToolDescriptor } from '../../schemas.ts'

const commandSchema = z.object({
    argv: z
        .array(z.string().min(1))
        .min(1)
        .describe(
            'Argv array passed directly to the spawn. First element is the executable, remaining elements are arguments. No shell interpolation.',
        ),
    label: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Optional human-friendly label for this command in the summary output. Defaults to the argv joined by spaces.',
        ),
})

const inputSchema = z.object({
    commands: z
        .array(commandSchema)
        .min(1)
        .describe(
            'Ordered list of commands to run sequentially. Each command runs only if the previous one is still within budget; failures do NOT stop the sequence.',
        ),
    timeout_ms: z
        .number()
        .int()
        .min(100)
        .max(600_000)
        .default(90_000)
        .describe(
            'Per-command timeout in milliseconds (range 100–600000, default 90000). On timeout the process is killed (SIGTERM then SIGKILL) and reported as timedOut=true.',
        ),
})

interface CommandResult {
    label: string
    argv: string[]
    ok: boolean
    exitCode: number | null
    timedOut: boolean
    stdout: string
    stderr: string
}

interface RunResult {
    passed: boolean
    summary: CommandResult[]
}

const MAX_OUTPUT_BYTES = 16 * 1024 // 16 KiB per stream, truncated tail

function truncate(buf: string): string {
    if (buf.length <= MAX_OUTPUT_BYTES) return buf
    const head = buf.slice(0, MAX_OUTPUT_BYTES / 2)
    const tail = buf.slice(-MAX_OUTPUT_BYTES / 2)
    return `${head}\n…[truncated ${buf.length - MAX_OUTPUT_BYTES} bytes]…\n${tail}`
}

async function runOne(
    argv: string[],
    label: string,
    cwd: string,
    timeoutMs: number,
): Promise<CommandResult> {
    const [cmd, ...rest] = argv
    if (!cmd) {
        // Schema prevents this, but guard at the runtime boundary.
        return {
            label,
            argv,
            ok: false,
            exitCode: null,
            timedOut: false,
            stdout: '',
            stderr: 'empty argv',
        }
    }

    const proc = Bun.spawn([cmd, ...rest], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
    })

    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        try {
            proc.kill('SIGTERM')
        } catch {
            // ignored — proc may have exited already
        }
        // Fallback SIGKILL if the process refuses to die.
        setTimeout(() => {
            if (proc.exitCode === null) {
                try {
                    proc.kill('SIGKILL')
                } catch {
                    // ignored
                }
            }
        }, 250)
    }, timeoutMs)

    let exitCode: number | null = null
    let stdoutText = ''
    let stderrText = ''
    try {
        const [code, stdout, stderr] = await Promise.all([
            proc.exited,
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ])
        exitCode = code
        stdoutText = truncate(stdout)
        stderrText = truncate(stderr)
    } finally {
        clearTimeout(timer)
    }

    return {
        label,
        argv,
        ok: !timedOut && exitCode === 0,
        exitCode,
        timedOut,
        stdout: stdoutText,
        stderr: stderrText,
    }
}

/**
 * Run verification commands (typecheck, tests, lint, …) in the project
 * sandbox. Each command runs sequentially under a strict per-command
 * timeout — on timeout the child process is killed (SIGTERM → SIGKILL)
 * to prevent the orphan-process freeze observed on 2026-03-06.
 *
 * Only callable in `execute` and `checks` pipelineSteps. The result
 * payload is structured so the verifier and harness can post-process
 * without re-parsing freeform shell output.
 */
export const lucaChecksRunTool: ToolDescriptor<z.infer<typeof inputSchema>> = {
    name: 'luca_checks_run',
    description:
        'Run verification commands (typecheck/tests/lint) sequentially with per-command timeout and SIGTERM/SIGKILL cleanup. Returns structured summary per command. Only callable in execute/checks phases.',
    inputSchema,
    allowedPhases: ['execute', 'checks'],
    async handler(args, ctx) {
        const results: CommandResult[] = []
        for (const cmd of args.commands) {
            const label = cmd.label ?? cmd.argv.join(' ')
            const r = await runOne(
                cmd.argv,
                label,
                ctx.cwd,
                args.timeout_ms,
            )
            results.push(r)
        }

        const passed = results.every((r) => r.ok)
        const payload: RunResult = { passed, summary: results }

        return {
            content: [
                { type: 'text', text: JSON.stringify(payload, null, 2) },
            ],
            isError: !passed,
        }
    },
}
