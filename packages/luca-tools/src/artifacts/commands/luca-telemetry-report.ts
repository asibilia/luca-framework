/**
 * luca-telemetry-report slash command — Aggregate .luca/telemetry/*.jsonl across recent runs and emit a markdown report.
 *
 * Ported from ~/.claude/commands/luca-telemetry-report.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /luca-telemetry-report

Activate the \`luca-telemetry-report\` skill to aggregate the per-run event logs under \`.luca/telemetry/*.jsonl\` across recent runs and emit a markdown report summarising step durations, model usage, and pipeline outcomes. Strictly read-only — it never mutates workflow state or writes into the \`.luca/\` contract.

Run the \`luca-telemetry-report\` skill now. Optional arguments (\`--runs <N>\` default 10, \`--since <ISO-date>\`, \`--vault <name>\`):

$ARGUMENTS
`

export const lucaTelemetryReportCommand = defineCommand({
    name: 'luca-telemetry-report',
    description:
        'Aggregate .luca/telemetry/*.jsonl across recent runs and emit a markdown report. Read-only — never mutates state.',
    body: BODY,
})
