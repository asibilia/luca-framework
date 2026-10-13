#!/usr/bin/env bun
/**
 * Sums up one eval round and decides whether setup B ships:
 *
 *   bun evals/luca-review/report.ts --round r1
 *
 * Reads every run's `out/row.json` under `<evals root>/<round>/`. Takes
 * `caught` and `false_blockers` from `out/grade.json` when there is one, so
 * a person's corrections to a grade count. Adds the trigger test when both
 * `triggers-A.json` and `triggers-B.json` exist. Writes and prints
 * `evals/luca-review/results/<round>.md`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import {
    GradeSchema,
    RowSchema,
    TriggerResultSchema,
    type Row,
} from './lib/case-schema'
import { reportText } from './lib/decide'
import { caughtShare } from './lib/grade'
import { EVAL_DIR, evalsRoot } from './lib/workspace'

const { values } = parseArgs({ options: { round: { type: 'string' } } })
const round = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .parse(values.round)
const round_dir = join(evalsRoot(), round)
const readJson = (path: string): unknown =>
    JSON.parse(readFileSync(path, 'utf8'))

const rows: Row[] = readdirSync(round_dir)
    .filter((name) => /^[1-9][ABC][0-9]+$/.test(name))
    .flatMap((name) => {
        const out = join(round_dir, name, 'out')
        if (!existsSync(join(out, 'row.json'))) return []
        const row = RowSchema.parse(readJson(join(out, 'row.json')))
        if (!existsSync(join(out, 'grade.json')) || row.invalid_reason !== null)
            return [row]
        const grade = GradeSchema.parse(readJson(join(out, 'grade.json')))
        return [
            {
                ...row,
                caught: caughtShare({ grade }),
                false_blockers: grade.false_blockers.length,
            },
        ]
    })

const triggerFile = (arm: 'A' | 'B') => join(round_dir, `triggers-${arm}.json`)
const triggers =
    existsSync(triggerFile('A')) && existsSync(triggerFile('B'))
        ? {
              a: z.array(TriggerResultSchema).parse(readJson(triggerFile('A'))),
              b: z.array(TriggerResultSchema).parse(readJson(triggerFile('B'))),
          }
        : null

const text = reportText({ round, rows, triggers })
await Bun.write(join(EVAL_DIR, 'results', `${round}.md`), text)
console.log(text)
