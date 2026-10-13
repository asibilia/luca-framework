/**
 * The manual smoke run: one tiny ticket built end to end by real Claude
 * agents (Opus 5.5, every guard on), in a throwaway repo with the in-memory
 * tracker. It uses your Claude plan, so run it by hand, once, before a
 * release. It is never part of `bun test`.
 *
 * ```bash
 * bun packages/engine/scripts/smoke-run.ts
 * ```
 *
 * It prints each agent's tokens and rate-limit readings, the run's result,
 * and where the journal is. The temp folder is kept so the run can be read
 * afterwards; delete it when done.
 */
import { realpathSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createClaudeLauncher } from '../src/agents/claude-launcher'
import { ticketIssue } from '../src/testing/intake-fixtures'
import {
    createPracticeRepo,
    PRACTICE_ENGINE_CONFIG,
} from '../src/testing/practice-repo'

const root = await mkdtemp(join(realpathSync(tmpdir()), 'luca-smoke-'))
console.log(`Smoke run folder: ${root}`)

const practice = await createPracticeRepo({
    root,
    // No shell redirect in the type check, so it is one plain command.
    config: {
        ...PRACTICE_ENGINE_CONFIG,
        checks: {
            ...PRACTICE_ENGINE_CONFIG.checks,
            types: 'bun build src/index.ts --target=bun',
        },
    },
})

const started = Date.now()
const launcher = createClaudeLauncher({})
// Sessions stay open for follow-ups; close them all however the run ends.
const { action, tracker, records } = await practice
    .run({
        launcher,
        ticket: ticketIssue({
            number: 11,
            title: 'Add isEven',
            what_to_build:
                'Add `isEven({ value }: { value: number }): boolean` in `src/is-even.ts`, ' +
                'and export it from `src/index.ts`. Test it with bun:test in `src/is-even.test.ts`.',
            criteria: ['isEven is true for 4', 'isEven is false for 7'],
        }),
    })
    .finally(() => launcher.closeAll())

for (const record of records) {
    if (record.kind === 'agent_session') {
        const { session } = record.content
        console.log(
            JSON.stringify({
                role: record.content.role,
                model: session.model,
                api_key_source: session.api_key_source,
                turns: session.num_turns,
                seconds: Math.round(session.duration_ms / 1000),
                usage: session.usage,
                list_price_usd: session.total_cost_usd,
                guard_denials: session.guard_denials.length,
                permission_denials: session.permission_denials.length,
                rate_limits: session.rate_limit_events,
            })
        )
    }
    if (
        record.kind === 'agent_failed' ||
        record.kind === 'run_stopped' ||
        record.kind === 'ticket_stuck'
    ) {
        console.log(JSON.stringify({ kind: record.kind, ...record.content }))
    }
}

console.log(
    JSON.stringify({
        action,
        pull_requests: tracker.pullRequests(),
        minutes: Math.round((Date.now() - started) / 6000) / 10,
        journal: practice.journal.file,
    })
)
