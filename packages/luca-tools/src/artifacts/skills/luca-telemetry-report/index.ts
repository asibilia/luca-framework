/**
 * luca-telemetry-report skill — Cross-run recall-quality aggregator over `.luca/telemetry/*.jsonl`.
 *
 * NARROWED with the telemetry sink. This skill used to aggregate the full
 * pipeline event stream (step durations, subagent costs, PR outcomes, review
 * convergence, classifier overrides). Those kinds retired in favour of
 * LangSmith traces (spend/latency/subagent spans — see `/trace-insights`) and
 * `.luca/ledger.jsonl` (mode transitions, re-entries, fix-loop counters).
 *
 * What survives here is the one thing neither replacement can see: MuninnDB
 * recall quality. Recall happens inside an MCP tool call; a trace records that
 * the call happened, never whether the recalled engrams were any good.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# luca-telemetry-report Skill

Aggregate MuninnDB **recall quality** across recent Luca runs. Emits a single markdown report covering: run inventory, per-mode recall hit/miss rates, verified-tier hit rate, and recalled-memory → outcome utilization.

## Scope — read this first

\`.luca/telemetry/<runId>.jsonl\` is a **minimal sink**. It carries only the recall family:

- \`recall.hit\` / \`recall.miss\` — MuninnDB recall outcomes per mode
- \`recall.utilization\` — post-hoc tie of a run's recalled memory IDs to that run's outcome valence

Everything else moved:

| Want | Look here |
|---|---|
| Spend, latency, subagent spans, cost per outcome | LangSmith traces — run \`/trace-insights\` |
| Mode transitions, pipeline re-entries, fix-loop counters | \`.luca/ledger.jsonl\` |
| Low-confidence ratio, first-pass verify rate | \`luca telemetry kpi --json\` |

Do NOT report on retired kinds. Historical logs may still contain them (the reader is forward-compatible by contract); tally any non-recall kind under "Legacy kinds" and move on.

## Scope guard

This skill is **read-only over the telemetry directory**. It does not mutate workflow state and does not call any MuninnDB write API.

The following operations are FORBIDDEN inside this skill. Do not perform them under any circumstance:

- Any \`luca\` CLI write/mutation command (\`luca state advance\`, \`luca roadmap create\`, \`luca workflow reset\`, \`luca confidence log\`, \`luca todo add/update\`, \`luca repo cleanup-apply\`, \`luca preferences write\`, \`luca checks run\`)
- Any \`Write\` to a \`.luca/\` phase artifact file (research, context, plan, plan-review, summary, wave, verify, audit, learn)
- \`mcp__muninn__muninn_remember\`, \`mcp__muninn__muninn_remember_batch\`
- \`mcp__muninn__muninn_forget\`, \`mcp__muninn__muninn_evolve\`
- \`mcp__muninn__muninn_state\`, \`mcp__muninn__muninn_consolidate\`

If a record is malformed, log it in the report's "Failure Modes" section and continue.

## TelemetryRecord v:1 contract (canonical)

Every JSONL line conforms to the v:1 contract:

\`\`\`
{ v:1, ts:ISO8601, runId, kind, phase, slug, wave, complexity, oversight, durationMs:number|null, meta:{} }
\`\`\`

Treat the \`kind\` union as **open**: tolerate unknown and legacy kinds (count them under "Legacy kinds" rather than crash).

## Arguments + pre-flight validation

| Flag | Type | Default | Validation |
|---|---|---|---|
| \`--runs N\` | integer | 10 | \`N >= 1 && N <= 1000\` |
| \`--since <ISO>\` | string | unset | \`^\\d{4}-\\d{2}-\\d{2}\` (date-only or full ISO accepted) |
| \`--vault <name>\` | string | unset | \`^[a-z0-9_-]+$\`, max 64 chars |

If validation fails, abort with a clear error message — do not silently continue with defaults.

## Step 1: Pre-flight + scope resolve

1. Parse and validate the arguments above.
2. Read \`.luca/config.json\` if present. If \`--vault\` was supplied, override the config value; otherwise use the \`muninn.vault\` field, fallback \`"default"\`.
3. Resolve the telemetry dir as \`.luca/telemetry/\`. **\`existsSync\` guard**: if the dir is absent (no runs yet), short-circuit to Step 6 and emit an empty report citing "no recall telemetry recorded yet".

## Step 2: Enumerate JSONL files

The \`.luca/\` contract stores telemetry as flat per-run files (\`.luca/telemetry/<runId>.jsonl\`, no subdirectories). Enumerate them with:

\`\`\`bash
find .luca/telemetry -maxdepth 1 -name '*.jsonl' -print 2>/dev/null
\`\`\`

Use \`find\`, NOT a shell glob — it handles an empty dir gracefully. Each file is one run.

Sort the files by file mtime descending. Take the first \`--runs N\` files. If \`--since <ISO>\` is supplied, filter further by reading the first non-empty JSONL line and dropping files whose first \`ts\` is older than the threshold.

**Legacy \`pr-outcomes.jsonl\`.** Old repos may still carry a \`.luca/telemetry/pr-outcomes.jsonl\` — the retired synthetic PR-outcome log. It is **NOT a pipeline run**. Remove the literal filename from the discovered set immediately after the \`find\`, BEFORE the mtime sort and the \`--runs N\` slice, or its frequently-touched mtime can evict a real run from the window. It contributes to nothing in this report.

## Step 3: Streaming aggregation pass

For each selected file, stream lines (small files — a full read is fine). For each line:

1. \`JSON.parse\` defensively. On a parse error: increment \`failures.parse++\`, continue.
2. Validate the line has \`v:1\` and a \`kind\` string. On a miss: \`failures.schema++\`, continue.
3. Dispatch to the per-kind accumulator:
   - \`recall.hit\` / \`recall.miss\`: tally hit/miss per \`meta.callerMode\`, and sum \`meta.resultCount\` + \`meta.verifiedCount\` for the verified-tier rate. Bucket by the record's \`complexity\` where present.
   - \`recall.utilization\`: read \`meta.recalledIds\` (array of concept ULIDs), \`meta.outcome\` (\`positive\`|\`negative\`|\`neutral\`), and \`meta.step\` (\`verify\`|\`review\`). For every ULID in \`meta.recalledIds\`, increment a cross-run \`byRecalledId[ulid][outcome]\` tally (keyed also by \`meta.step\` so verify vs review scope is distinguishable). Skip records missing \`meta.recalledIds\` or with an out-of-range \`meta.outcome\` (tally under \`failures.schema\`).
   - **anything else**: increment \`legacyKinds[kind]\` and continue. Do NOT attempt duration, cost, or subagent math — those producers no longer exist.

Memory note: aggregators are **per-run scoped** — release per-run accumulators between files. Cross-run totals are written to a separate top-level accumulator.

## Step 4: Build the markdown report

Render the report sections below:

### Run Inventory
Table: runId | first ts | last ts | complexity | oversight | recall records

### Recall Stats
Per-mode hit-rate (hit / (hit+miss)). Verified-tier hit-rate (sum(verifiedCount) / sum(resultCount)). Flag modes with a hit-rate < 0.4 — that is the actionable signal this report exists for.

Apply a divide-by-zero guard everywhere: a mode with zero records renders \`n/a\`, never \`NaN\`.

### Recall Utilization
A recalled-ID → outcome-valence correlation built from \`recall.utilization\` records (\`byRecalledId\`). For each recalled memory (by concept ULID), tabulate how often it was in scope when the run's outcome was \`positive\` vs \`negative\` vs \`neutral\`, split by \`meta.step\` (verify | review). Table: recalled ULID | step | positive | negative | neutral. Sort by net valence (positive − negative) descending so the memories most associated with good outcomes surface first.

This correlation is **post-hoc / statistical**, aggregated by runId + step (MVP) — it is NOT a per-memory utility score and does not imply causation. A memory appears here only because it was recalled in a run whose outcome was later recorded; co-occurrence is not attribution.

If no \`recall.utilization\` records exist across the selected runs, this section reports "no utilization data yet" and is otherwise skipped — the skill stays read-only and fail-tolerant, so absence is never an error.

### Cross-Run Trends
For each numeric metric above, compute the trend over the selected runs (oldest first, newest last). Use delta arrows: up, down, flat.

End with a "Failure Modes" subsection enumerating parse/schema counts and listing any legacy or unknown \`kind\` values seen with their counts.

## Step 5: Emit the report

Emit the markdown report **inline** in your response to the user. Do NOT write a file — the \`.luca/\` contract permits only \`<runId>.jsonl\` files under \`telemetry/\`, so a report \`.md\` there would violate the contract. The skill is read-only; the report is its output, not an artifact.

Close with a pointer: cost, latency, and subagent attribution live in LangSmith — run \`/trace-insights\` for those.

## Step 6: Summary to caller

After the report, print:

- Counts: runs aggregated, total recall records parsed, failures (parse/schema)
- A one-line headline, e.g. \`"10 runs, recall hit-rate 0.62, verified-tier 0.41, 2 modes below 0.4"\`

## Step 7: Done

The skill exits. No further actions. The user invokes it again with different \`--runs\` / \`--since\` / \`--vault\` to explore.

## Failure Modes

| Failure | Cause | Skill behavior |
|---|---|---|
| \`.luca/telemetry/\` absent | No pipeline runs yet | Short-circuit with an empty report |
| JSONL parse error on a line | Corrupted record (mid-write crash) | Increment \`failures.parse\`, continue |
| Schema mismatch (\`v\` field missing) | Pre-v:1 record (none expected; v:1 is current) | Increment \`failures.schema\`, continue |
| A retired kind (\`phase.start\`, \`signal.satisfaction\`, \`pr.outcome\`, …) | Record predates the sink narrowing | Tally under "Legacy kinds"; do not report on it |
| \`--vault\` unresolvable | Vault not in \`.luca/config.json\` | Continue with the supplied vault name; the report uses it as-is |
| No \`recall.utilization\` records | Runs predate utilization telemetry, or none emitted | Recall Utilization section reports "no utilization data yet"; do not crash |
| \`recall.utilization\` missing \`meta.recalledIds\` / bad \`meta.outcome\` | Malformed utilization record | Increment \`failures.schema\`, skip the record, continue |

## Notes

- The skill does **not** write any state file. Re-runs are idempotent over the same input set (deterministic).
- The skill is external to the pipeline — it records nothing.
`

export const lucaTelemetryReportSkill = defineSkill({
    name: 'luca-telemetry-report',
    description: `Cross-run MuninnDB recall-quality aggregator over \`.luca/telemetry/*.jsonl\`. Reads the retained \`recall.hit\` / \`recall.miss\` / \`recall.utilization\` records, aggregates streaming-style, and emits a markdown report inline. Read-only over the telemetry dir; no MuninnDB writes, no state mutation. For spend, latency, and subagent attribution use \`/trace-insights\` (LangSmith) instead.

Use when user says "recall quality", "telemetry report", "recall hit rate", "luca-telemetry-report", or invokes \`/luca-telemetry-report\`.

Arguments: \`--runs <N>\` (default 10), \`--since <ISO-date>\`, \`--vault <name>\`.`,
    body: BODY,
})
