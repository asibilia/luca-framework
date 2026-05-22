/**
 * CLI command group: `luca rules`
 *
 * Repo-local rule packs (`.luca/rules/*.ts`). Wires the luca-core rule engine
 * to the CLI — closing §3 functional gaps #5 (repo-local rule engine) and #6
 * (recurrence-driven rule promotion).
 *
 *   - `luca rules list`    — list the discovered rules
 *   - `luca rules run`     — run every rule, report findings
 *   - `luca rules gate`    — run every rule, exit 1 on any must-fix finding
 *   - `luca rules suggest` — surface recurring postmortem pitfalls as draft rules
 */
import { defineCommand } from 'citty'
import { join } from 'pathe'

import {
    analyzeRun,
    detectRecurringPitfalls,
    discoverAndRun,
    listRuns,
    loadRules,
    renderSuggestedRulesMarkdown,
} from '@alecsibilia/luca-core'
import type { RuleRunReport } from '@alecsibilia/luca-core'

import { gatherRunArtifacts } from './__helpers/gather-run-artifacts.ts'
import { logger } from '../utils/logger.ts'

/** Print a discover/run report: counts, load + execution errors, findings. */
function reportFindings(report: RuleRunReport): void {
    logger.info(
        `Discovered ${report.rulesFilesDiscovered} rule file(s), ` +
            `loaded ${report.rulesLoaded} rule(s).`
    )
    for (const e of report.loadErrors) {
        logger.error(`load error in ${e.file}: ${e.message}`)
    }
    for (const e of report.executionErrors) {
        logger.error(
            `rule '${e.ruleId}' failed${e.path ? ` on ${e.path}` : ''}: ${e.message}`
        )
    }
    for (const f of report.findings) {
        const loc =
            f.line !== undefined
                ? `${f.path || '<repo>'}:${f.line}`
                : f.path || '<repo>'
        logger.info(`  ${f.severity}  ${loc}  ${f.summary}`)
    }
    if (report.findings.length === 0) {
        logger.success('No rule findings.')
    } else {
        logger.warn(`${report.findings.length} rule finding(s).`)
    }
}

const listCommand = defineCommand({
    meta: {
        name: 'list',
        description: 'List the rules discovered under .luca/rules/.',
    },
    async run() {
        const { rules, filesDiscovered, loadErrors } = await loadRules({
            rulesDir: join(process.cwd(), '.luca', 'rules'),
        })
        for (const e of loadErrors) {
            logger.error(`load error in ${e.file}: ${e.message}`)
        }
        if (rules.length === 0) {
            logger.info(
                `No rules found (${filesDiscovered} file(s) under .luca/rules/).`
            )
            return
        }
        for (const r of rules) {
            logger.info(`${r.id}  [${r.severity}]  ${r.description}`)
        }
    },
})

const runCommand = defineCommand({
    meta: {
        name: 'run',
        description: 'Run every repo-local rule pack and report its findings.',
    },
    async run() {
        reportFindings(await discoverAndRun({ repoRoot: process.cwd() }))
    },
})

const gateCommand = defineCommand({
    meta: {
        name: 'gate',
        description:
            'Run every rule; exit non-zero if any must-fix finding is produced.',
    },
    async run() {
        const report = await discoverAndRun({ repoRoot: process.cwd() })
        reportFindings(report)
        const mustFix = report.findings.filter(
            (f) => f.severity === 'must-fix'
        )
        if (mustFix.length > 0) {
            logger.error(
                `${mustFix.length} must-fix finding(s) — rule gate failed.`
            )
            process.exitCode = 1
        }
    },
})

const suggestCommand = defineCommand({
    meta: {
        name: 'suggest',
        description:
            'Surface postmortem pitfalls that recurred across runs as draft rules.',
    },
    args: {
        threshold: {
            type: 'string',
            description: 'Distinct-run recurrence threshold (default 3).',
        },
    },
    run({ args }) {
        const cwd = process.cwd()
        const reports = listRuns({ cwd }).map((r) =>
            analyzeRun(gatherRunArtifacts({ cwd, runId: r.runId }))
        )
        const threshold =
            args.threshold !== undefined &&
            Number.isFinite(Number(args.threshold))
                ? Number(args.threshold)
                : undefined
        const recurrence = detectRecurringPitfalls({ reports, threshold })
        process.stdout.write(
            `${renderSuggestedRulesMarkdown(recurrence)}\n`
        )
    },
})

export const rulesCommand = defineCommand({
    meta: {
        name: 'rules',
        description: 'Repo-local rule packs (.luca/rules/).',
    },
    subCommands: {
        list: listCommand,
        run: runCommand,
        gate: gateCommand,
        suggest: suggestCommand,
    },
})
