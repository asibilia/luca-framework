#!/usr/bin/env bun
/**
 * Sums up one eval round and decides whether setup B ships:
 *
 *   bun evals/luca-review/report.ts --round r1
 *
 * Reads every run's `out/row.json` under `<evals root>/<round>/`. Takes
 * `caught` and `false_blockers` from `out/grade.json` when there is one, so
 * a person's corrections to a grade count. A run folder with no
 * `out/row.json` (a run that died part-way) counts as an invalid run, so it
 * shows under "Runs left out" and its case can't drop out of the decision
 * unseen. Adds the trigger test when both `triggers-A.json` and
 * `triggers-B.json` exist; a short file (the trigger run stopped early)
 * is filled out with invalid results. Writes and prints
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
    TriggersSchema,
    type Row,
} from './lib/case-schema'
import { reportText } from './lib/decide'
import { caughtShare } from './lib/grade'
import {
    caseIds,
    completeTriggerResults,
    parseRunFolder,
    unfinishedRow,
} from './lib/run-checks'
import { CASES_DIR, EVAL_DIR, evalsRoot } from './lib/workspace'

const { values } = parseArgs({ options: { round: { type: 'string' } } })
const round = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .parse(values.round)
const round_dir = join(evalsRoot(), round)
const readJson = (path: string): unknown =>
    JSON.parse(readFileSync(path, 'utf8'))

if (!existsSync(round_dir)) {
    throw new Error(`no round ${round} in ${evalsRoot()}`)
}
const case_ids = caseIds({ cases_dir: CASES_DIR })
const rows: Row[] = readdirSync(round_dir)
    .filter((name) => parseRunFolder({ name }) !== null)
    .flatMap((name) => {
        const out = join(round_dir, name, 'out')
        if (!existsSync(join(out, 'row.json'))) {
            const unfinished = unfinishedRow({ name, case_ids })
            return unfinished === null ? [] : [unfinished]
        }
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
const prompts = TriggersSchema.parse(readJson(join(EVAL_DIR, 'triggers.json')))
const triggerResults = (arm: 'A' | 'B') =>
    completeTriggerResults({
        results: z.array(TriggerResultSchema).parse(readJson(triggerFile(arm))),
        triggers: prompts,
    })
const triggers =
    existsSync(triggerFile('A')) && existsSync(triggerFile('B'))
        ? { a: triggerResults('A'), b: triggerResults('B') }
        : null

const text = reportText({ round, rows, triggers })
await Bun.write(join(EVAL_DIR, 'results', `${round}.md`), text)
console.log(text)
