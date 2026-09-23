/**
 * PROTOTYPE (tracer bullet, #334). One JSONL journal per run.
 * Every record: { ts, run_id, kind, ...data }. Written synchronously so a crash keeps what happened.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type Journal = {
  file: string
  runId: string
  write: (kind: string, data?: Record<string, unknown>) => void
}

const replacer = (_key: string, value: unknown) => {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
  if (typeof value === 'bigint') return value.toString()
  return value
}

export const createJournal = (file: string, runId: string): Journal => {
  mkdirSync(dirname(file), { recursive: true })
  const write = (kind: string, data: Record<string, unknown> = {}) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), run_id: runId, kind, ...data }, replacer)
    appendFileSync(file, line + '\n')
  }
  return { file, runId, write }
}
