#!/usr/bin/env bun
/**
 * The trigger test: does a setup's skill start on the prompts it should,
 * and not on the ones it shouldn't?
 *
 *   bun evals/luca-review/run-triggers.ts --round r1 --arm A|B
 *
 * Each prompt in triggers.json goes to a fresh `claude -p` that has only
 * the Skill tool and only that setup's skill, so it can start the skill
 * but do nothing else. Saves `<evals root>/<round>/triggers-<arm>.json`.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import { TriggersSchema, type TriggerResult } from './lib/case-schema'
import {
    EVAL_MODEL,
    claudeArgs,
    parseStream,
    runClaude,
} from './lib/claude-run'
import { EVAL_DIR, evalsRoot, installSkill, skillSource } from './lib/workspace'

const ArgsSchema = z.object({
    round: z.string().regex(/^[a-z0-9-]+$/),
    arm: z.enum(['A', 'B']),
})

const { values } = parseArgs({
    options: { round: { type: 'string' }, arm: { type: 'string' } },
})
const args = ArgsSchema.parse(values)

const triggers = TriggersSchema.parse(
    await Bun.file(join(EVAL_DIR, 'triggers.json')).json()
)
const results: TriggerResult[] = []
for (const [index, trigger] of triggers.entries()) {
    const root = join(evalsRoot(), args.round, `t${args.arm}${index + 1}`)
    if (existsSync(root))
        throw new Error(`${root} already exists: use a new round`)
    const ws = join(root, 'ws')
    await mkdir(ws, { recursive: true })
    const skill_name = await installSkill({
        skill_dir: skillSource({ arm: args.arm }),
        ws,
    })
    const run = await runClaude({
        cwd: ws,
        args: claudeArgs({
            model: EVAL_MODEL,
            max_budget_usd: 2,
            output_format: 'stream-json',
            tools: ['Skill'],
        }),
        env: process.env,
        stdin_text: trigger.prompt,
        out_file: join(root, 'stream.jsonl'),
        timeout_ms: 5 * 60_000,
    })
    const summary = parseStream({ text: run.text })
    const invalid_reason =
        summary.session_id === null
            ? 'claude started no session'
            : skill_name !== null && !summary.skills.includes(skill_name)
              ? `the ${skill_name} skill did not load`
              : null
    const triggered =
        skill_name !== null && summary.skill_calls.includes(skill_name)
    results.push({
        prompt: trigger.prompt,
        should_trigger: trigger.should_trigger,
        triggered,
        invalid_reason,
    })
    console.log(
        `${args.arm} ${index + 1}: ${invalid_reason ?? (triggered ? 'started' : 'did not start')} (${trigger.should_trigger ? 'should' : 'should not'})`
    )
}
await Bun.write(
    join(evalsRoot(), args.round, `triggers-${args.arm}.json`),
    `${JSON.stringify(results, null, 2)}\n`
)
