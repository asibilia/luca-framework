/**
 * skill-opt runner — optimize a target skill and STAGE the result.
 *
 * Usage:
 *   bun run.ts                                  # caveman, mock backend, no spend
 *   bun run.ts --task complexity                # classification, mock
 *   bun run.ts --task caveman --backend claude --eval-rollouts 3 --concurrency 6
 *
 * Nothing live is ever mutated: the best skill + report are written under
 * `staging/<task>/<runId>/`. Adoption (folding the candidate back into the
 * shipping skill) is a separate, explicit step.
 */
import { z } from 'zod'
import { BackendNameSchema, makeChat } from './backend.ts'
import { runLoop, type EpochRecord, type LoopResult } from './loop.ts'
import type { BaseItem, ScoredItem, Task } from './task.ts'
import type { Split } from './types.ts'
import { cavemanTask } from './tasks/caveman.ts'
import { complexityTask } from './tasks/complexity.ts'

type TaskName = 'caveman' | 'complexity'

// Tasks have heterogeneous item/ctx types; erase to a common shape at the
// registry boundary. Safe because the loop only ever feeds a task items it
// loaded from that same task.
type AnyTask = Task<BaseItem, unknown>
const TASKS: Record<TaskName, AnyTask> = {
    caveman: cavemanTask as unknown as AnyTask,
    complexity: complexityTask as unknown as AnyTask,
}

const ConfigSchema = z.object({
    task: z.enum(['caveman', 'complexity']).default('caveman'),
    backend: z.enum(BackendNameSchema).default('mock'),
    model: z.string().optional(),
    epochs: z.number().int().positive().default(5),
    editBudget: z.number().int().positive().default(3),
    minibatch: z.number().int().positive().default(4),
    evalRollouts: z.number().int().positive().default(1),
    concurrency: z.number().int().positive().default(6),
    gate: z.boolean().default(true),
})
type Config = z.infer<typeof ConfigSchema>

function parseArgs(argv: string[]): Config {
    const raw: Record<string, unknown> = {}
    const numeric: Record<string, string> = {
        epochs: 'epochs',
        'edit-budget': 'editBudget',
        minibatch: 'minibatch',
        'eval-rollouts': 'evalRollouts',
        concurrency: 'concurrency',
    }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg?.startsWith('--')) continue
        const key = arg.slice(2)
        const next = argv[i + 1]
        if (key === 'gate') {
            raw.gate = next !== 'off'
            i++
        } else if (numeric[key]) {
            raw[numeric[key]] = Number(next)
            i++
        } else if (['task', 'backend', 'model'].includes(key)) {
            raw[key] = next
            i++
        }
    }
    const parsed = ConfigSchema.safeParse(raw)
    if (!parsed.success) {
        console.error('Invalid arguments:', parsed.error.issues)
        process.exit(1)
    }
    return parsed.data
}

function runId(): string {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function renderReport<I extends BaseItem, Ctx>(
    cfg: Config,
    task: Task<I, Ctx>,
    result: LoopResult,
    id: string
): string {
    const delta = (a: number, b: number) => `${b - a >= 0 ? '+' : ''}${(b - a).toFixed(3)}`
    const epochRow = (e: EpochRecord) =>
        `| ${e.epoch} | ${e.appliedEdits.length} | ${e.currentValScore.toFixed(3)} | ${e.candidateValScore.toFixed(3)} | ${e.accepted ? '✅ accept' : '❌ reject'} |`

    const lines = [
        `# skill-opt run \`${id}\` — task: ${task.name}`,
        '',
        `- backend: **${cfg.backend}**${cfg.model ? ` (${cfg.model})` : ''}`,
        `- epochs: ${cfg.epochs} · edit budget: ${cfg.editBudget} · minibatch: ${cfg.minibatch} · eval-rollouts (k): ${cfg.evalRollouts} · gate: ${cfg.gate ? 'on' : 'off'}`,
        '',
        '## Held-out result (mean reward)',
        '',
        '| Split | Seed | Best | Δ |',
        '|-------|------|------|---|',
        `| VAL  | ${result.seedValScore.toFixed(3)} | ${result.bestValScore.toFixed(3)} | ${delta(result.seedValScore, result.bestValScore)} |`,
        `| TEST | ${result.seedTestScore.toFixed(3)} | ${result.bestTestScore.toFixed(3)} | ${delta(result.seedTestScore, result.bestTestScore)} |`,
        '',
    ]

    if (task.reportMetric) {
        const seedMap = new Map<Split, ScoredItem[]>([['test', result.seedTestScored]])
        const bestMap = new Map<Split, ScoredItem[]>([['test', result.bestTestScored]])
        lines.push(
            `**${task.reportMetric.label}** — seed: ${task.reportMetric.value(seedMap)} → best: ${task.reportMetric.value(bestMap)}`,
            ''
        )
    }

    lines.push(
        '## Epochs',
        '',
        '| Epoch | Edits | VAL before | VAL candidate | Gate |',
        '|-------|-------|-----------|---------------|------|',
        ...result.epochs.map(epochRow),
        '',
        `Accepted edits: ${result.epochs.filter((e) => e.accepted).reduce((n, e) => n + e.appliedEdits.length, 0)} · Rejected edits: ${result.rejected.length}`,
        ''
    )
    return lines.join('\n')
}

async function main(): Promise<void> {
    const cfg = parseArgs(Bun.argv.slice(2))
    const task = TASKS[cfg.task as TaskName]
    const id = runId()
    const dir = new URL(`./staging/${cfg.task}/${id}/`, import.meta.url)
    const cachePath = new URL(
        `./staging/${cfg.task}/.cache-${cfg.backend}.json`,
        import.meta.url
    ).pathname

    console.error(
        `[skill-opt] task=${cfg.task} backend=${cfg.backend} epochs=${cfg.epochs} k=${cfg.evalRollouts} gate=${cfg.gate ? 'on' : 'off'}`
    )
    if (cfg.backend === 'claude') {
        console.error('[skill-opt] WARNING: real Claude backend — this spends API budget.')
    }

    const chat = makeChat(cfg.backend, cfg.model)
    const seed = await task.seedSkill()
    const result = await runLoop({
        task,
        chat,
        epochs: cfg.epochs,
        editBudget: cfg.editBudget,
        minibatch: cfg.minibatch,
        gate: cfg.gate,
        evalRollouts: cfg.evalRollouts,
        concurrency: cfg.concurrency,
        cachePath,
        log: (m) => console.error(`[skill-opt] ${m}`),
    })

    await Bun.write(new URL('best-skill.md', dir).pathname, result.bestSkill)
    await Bun.write(new URL('seed-skill.md', dir).pathname, seed)
    await Bun.write(
        new URL('rejected-edits.jsonl', dir).pathname,
        result.rejected.map((e) => JSON.stringify(e)).join('\n')
    )
    await Bun.write(new URL('report.md', dir).pathname, renderReport(cfg, task, result, id))

    console.error('')
    console.error(
        `[skill-opt] done. VAL ${result.seedValScore.toFixed(3)} → ${result.bestValScore.toFixed(3)}, ` +
            `TEST ${result.seedTestScore.toFixed(3)} → ${result.bestTestScore.toFixed(3)}`
    )
    console.error(`[skill-opt] staged: packages/luca-tools/skill-opt/staging/${cfg.task}/${id}/`)
}

await main()
