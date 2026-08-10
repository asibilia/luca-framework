/**
 * luca-telemetry-report slash command — Aggregate MuninnDB recall quality from
 * .luca/telemetry/*.jsonl across recent runs and emit a markdown report.
 *
 * Ported from ~/.claude/commands/luca-telemetry-report.md (user copy canonical) (E-6).
 */
import { defineCommand } from '../../define/command.ts'

const BODY = `# /luca-telemetry-report

Activate the \`luca-telemetry-report\` skill to aggregate MuninnDB **recall quality** from the per-run logs under \`.luca/telemetry/*.jsonl\` across recent runs — per-mode hit/miss rates, verified-tier hit rate, and recalled-memory → outcome utilization. Strictly read-only — it never mutates workflow state or writes into the \`.luca/\` contract.

Spend, latency, and subagent attribution are NOT here — those live in LangSmith traces; run \`/trace-insights\` instead.

Run the \`luca-telemetry-report\` skill now. Optional arguments (\`--runs <N>\` default 10, \`--since <ISO-date>\`, \`--vault <name>\`):

$ARGUMENTS
`

export const lucaTelemetryReportCommand = defineCommand({
    name: 'luca-telemetry-report',
    description:
        'Aggregate MuninnDB recall quality from .luca/telemetry/*.jsonl across recent runs and emit a markdown report. Read-only — never mutates state.',
    body: BODY,
})
