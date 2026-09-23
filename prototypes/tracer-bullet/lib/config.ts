/**
 * PROTOTYPE (tracer bullet, #334). Fixed settings for the tracer. Throwaway.
 */
import { realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const REPO_SLUG = 'asibilia/luca-framework'

/** Claude only. Never a Fable model (it can bill per token in the SDK). */
export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-5-5',
} as const

export type Mode = keyof typeof MODELS

/** Same effort level for every agent (#339). */
export const EFFORT = 'high' as const

export const TEST_GLOB = '**/*.test.ts'

export const LIMITS = {
  redRounds: 3,
  gateRuns: 3,
  reviewRounds: 3,
  badTestBounces: 1,
  messagesPerAgentPerTicket: 5,
  runNotesShown: 10,
} as const

export const PROTO_DIR = resolve(import.meta.dir, '..')
export const RUNS_DIR = join(PROTO_DIR, 'runs')
/** Canonical path (macOS /tmp is a symlink to /private/tmp). */
export const TMP_ROOT = join(realpathSync('/tmp'), 'luca-tracer')
export const HOME = process.env.HOME ?? ''

/** Localhost services an agent must never reach (experiment 1d). */
export const LOCAL_SERVICES = {
  muninn: 'http://127.0.0.1:8750/mcp',
  paseo: 'http://127.0.0.1:6767/',
} as const

export const assertClaudeModel = (model: string) => {
  if (/fable/i.test(model)) throw new Error(`Refusing Fable model ${model}`)
  if (!/^claude-(opus|haiku|sonnet)-/.test(model)) throw new Error(`Unexpected model ${model}`)
}

export const makeRunId = (prefix: string) => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6)}`
}
