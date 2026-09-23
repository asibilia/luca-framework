/**
 * PROTOTYPE (tracer bullet, #334). Run a command, capture output, with a timeout.
 */
import { HOME } from './config'

export type ShellResult = {
  cmd: string
  cwd: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
}

export const run = async (
  cmd: string[],
  opts: { cwd: string; timeoutMs?: number; env?: Record<string, string | undefined> },
): Promise<ShellResult> => {
  const started = Date.now()
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    env: opts.env ?? process.env,
  })
  let timedOut = false
  const timer = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true
        proc.kill('SIGKILL')
      }, opts.timeoutMs)
    : undefined
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (timer) clearTimeout(timer)
  return { cmd: cmd.join(' '), cwd: opts.cwd, exitCode, stdout, stderr, durationMs: Date.now() - started, timedOut }
}

export const runOk = async (
  cmd: string[],
  opts: { cwd: string; timeoutMs?: number; env?: Record<string, string | undefined> },
): Promise<ShellResult> => {
  const r = await run(cmd, opts)
  if (r.exitCode !== 0) throw new Error(`${r.cmd} failed (exit ${r.exitCode}) in ${r.cwd}: ${tail(r.stderr || r.stdout, 2000)}`)
  return r
}

export const tail = (s: string, n = 4000) => (s.length > n ? '[...]' + s.slice(-n) : s)

/**
 * A minimal environment: no API keys, no parent-session control variables, no other secrets.
 * The engine's own process env carries OPENAI_API_KEY, MuninnDB keys, and the parent Claude
 * session's messaging socket, so agents and gates never get process.env as-is.
 */
export const cleanEnv = (extra: Record<string, string> = {}): Record<string, string> => {
  const keep = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM']
  const env: Record<string, string> = {}
  for (const k of keep) {
    const v = process.env[k]
    if (v !== undefined) env[k] = v
  }
  if (!env.HOME) env.HOME = HOME
  for (const banned of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']) delete env[banned]
  return { ...env, ...extra }
}
