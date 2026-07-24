/**
 * CLI command: `luca code` — launch Claude Code under a chosen model provider.
 *
 * Provider selection is flag-driven so arbitrary args can be forwarded verbatim
 * to the underlying binary (`claude` / `ollama`). We hand-parse `rawArgs` rather
 * than declaring citty args for the same reason `runner.ts` does: the trailing
 * tokens are the spawned binary's argv, not ours.
 *
 *   luca code --openai [args...]   bridge gateway + launch (this pkg's main)
 *   luca code --ollama [args...]   `ollama launch claude --model glm-5.2:cloud`
 *   luca code --claude [args...]   plain `claude`  (also the default: `luca code`)
 *
 * Exit semantics mirror `luca-code`'s `mapExitCode`: `130` (Ctrl-C) → `0`,
 * `null` (signaled, no code) → `1`; a missing binary → `127`.
 */
import { defineCommand } from 'citty'

import { main as runLucaCode } from '@alecsibilia/luca-code'

/** The three providers selectable from the CLI. */
type Provider = 'openai' | 'ollama' | 'claude'

/**
 * Scan `rawArgs` for the first provider flag, remove that one token, and return
 * the provider plus the remaining args (forwarded untouched to the binary).
 *
 * No flag → `claude` (the default). Only the first matching flag is consumed; a
 * second provider flag is forwarded as an ordinary arg (the binary decides).
 */
function consumeProviderFlag(rawArgs: string[]): {
    provider: Provider
    rest: string[]
} {
    const flags: Provider[] = ['openai', 'ollama', 'claude']
    for (const flag of flags) {
        const idx = rawArgs.indexOf(`--${flag}`)
        if (idx >= 0) {
            const rest = [...rawArgs.slice(0, idx), ...rawArgs.slice(idx + 1)]
            return { provider: flag, rest }
        }
    }
    return { provider: 'claude', rest: rawArgs }
}

/**
 * Map a child exit code to a process exit code (mirrors `luca-code`'s
 * `mapExitCode`): `130` (SIGINT) → `0`, `null` (signaled, no code) → `1`,
 * anything else passes through.
 */
function mapExitCode(code: number | null): number {
    if (code === null) return 1
    if (code === 130) return 0
    return code
}

/**
 * Spawn a binary with inherited stdio and return its mapped exit code.
 * Returns `127` when the binary is not on PATH.
 */
async function spawnBinary({
    args,
    binaryName,
}: {
    args: string[]
    binaryName: string
}): Promise<number> {
    const exe = typeof Bun !== 'undefined' ? Bun.which(binaryName) : null
    if (!exe) return 127
    const proc = Bun.spawn({
        cmd: [exe, ...args],
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
    })
    return mapExitCode(await proc.exited)
}

export const codeCommand = defineCommand({
    meta: {
        name: 'code',
        description:
            'Launch Claude Code under a chosen model provider ' +
            '(--openai / --ollama / --claude). Defaults to --claude.',
    },
    async run({ rawArgs }) {
        const { provider, rest } = consumeProviderFlag(rawArgs)

        let code: number
        if (provider === 'openai') {
            // Delegate into the luca-code bridge's full gateway + launch flow.
            // The bridge surfaces its own errors on stderr and returns an exit
            // code; propagate it.
            code = await runLucaCode(['claude', ...rest])
        } else if (provider === 'ollama') {
            // Fixed model per spec; forwarded args follow it.
            code = await spawnBinary({
                args: ['launch', 'claude', '--model', 'glm-5.2:cloud', ...rest],
                binaryName: 'ollama',
            })
        } else {
            // `claude` (default) — plain Claude Code, no gateway.
            code = await spawnBinary({ args: rest, binaryName: 'claude' })
        }

        process.exit(code)
    },
})