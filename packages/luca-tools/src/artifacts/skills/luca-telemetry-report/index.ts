/**
 * luca-telemetry-report skill — Cross-run aggregator over `.luca/telemetry/*.jsonl`. Reads per-run JSONL telemetry records (phase/wave/step/subagent/recall/review events), aggregates streaming-style, and emits a markdown report inline. Read-only over the telemetry dir; no MuninnDB writes, no state mutation.
 *
 * Ported from ~/.claude/skills/luca-telemetry-report/SKILL.md (current user copy) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# luca-telemetry-report Skill

Aggregate Luca pipeline telemetry across recent runs. Emits a single markdown report covering: run inventory, step durations, subagent costs, recall hit/miss, review-iteration convergence, cross-run trends.

## Scope guard — read first

This skill is **read-only over the telemetry directory**. It does not mutate workflow state and does not call any MuninnDB write API — it aggregates telemetry already on disk.

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

Known \`kind\` values:

- \`phase.start\` / \`phase.end\` — outer-loop phase boundaries
- \`wave.start\` / \`wave.end\` — inner-loop wave boundaries (execute step)
- \`mode.start\` / \`mode.end\` — pipeline step transitions
- \`subagent.invoke\` / \`subagent.complete\` — subagent dispatch boundaries
- \`recall.hit\` / \`recall.miss\` — MuninnDB recall outcomes
- \`review.iteration\` — review-step emit
- \`classifier.override\` — manual override of an automated classifier decision (carries \`meta.source\` for the override origin)
- \`signal.satisfaction\` — user/reviewer satisfaction signal (carries \`meta.valence\` and \`meta.source\`); summarize as a count plus valence breakdown by source
- \`signal.failure-dump\` — captured failure-dump signal; summarize as a count

Treat the union as **open**: the aggregator must tolerate unknown kinds (count them under "Unknown kinds" rather than crash).

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
3. Resolve the telemetry dir as \`.luca/telemetry/\`. **\`existsSync\` guard**: if the dir is absent (no runs yet), short-circuit to Step 7 and emit an empty report citing "no telemetry recorded yet".

## Step 2: Enumerate JSONL files

The \`.luca/\` contract stores telemetry as flat per-run files (\`.luca/telemetry/<runId>.jsonl\`, no subdirectories). Enumerate them with:

\`\`\`bash
find .luca/telemetry -maxdepth 1 -name '*.jsonl' -print 2>/dev/null
\`\`\`

Use \`find\`, NOT a shell glob — it handles an empty dir gracefully. Each file is one run.

Sort by file mtime descending. Take the first \`--runs N\` files. If \`--since <ISO>\` is supplied, filter further by reading the first non-empty JSONL line and dropping files whose first \`ts\` is older than the threshold.

## Step 3: Streaming aggregation pass

For each selected file, stream lines (small files, ≤ a few MB each — a full read is fine). For each line:

1. \`JSON.parse\` defensively. On a parse error: increment \`failures.parse++\`, continue.
2. Validate the line has \`v:1\` and a \`kind\` string. On a miss: \`failures.schema++\`, continue.
3. Dispatch to the per-kind accumulator:
   - \`phase.*\` / \`wave.*\`: sum \`durationMs\` into \`byPhase[phase]\` / \`byWave[wave]\` buckets
   - \`mode.*\`: sum into \`byStep[from|to]\`
   - \`subagent.*\`: tally \`byRole[role]\` with input/output token sums; pair \`invoke\`/\`complete\` by \`meta.correlationId\` for orchestrator-side duration (preferred over a null harness \`durationMs\`)
   - \`recall.*\`: tally hit/miss/verifiedCount per \`meta.callerMode\`
   - \`review.iteration\`: collect the verdict/mustFixCount/perspectives series
   - \`classifier.override\`: tally \`byOverrideSource[meta.source]\` (count of classifier overrides, broken down by override-source)
   - \`signal.satisfaction\`: tally \`bySatisfactionSource[meta.source]\` with \`meta.valence\` breakdown (count of satisfaction signals + valence breakdown by source)
   - \`signal.failure-dump\`: tally \`failureDumpCount\` (count of failure-dump signals)
4. If \`durationMs === null\` for a \`*.end\` record, attempt a **ts-gap fallback** — find the matching \`*.start\` event with the same phase/slug/wave/runId, compute \`Date.parse(end.ts) - Date.parse(start.ts)\`. Only apply when both \`Date.parse\` calls return finite non-negative deltas. If the fallback fails, leave \`null\` and tally under \`failures.unknownDuration\`.

Memory note: aggregators are **per-run scoped** — release per-run accumulators between files. Cross-run totals are written to a separate top-level accumulator.

## Step 4: Build the markdown report

Render 6 sections:

### Run Inventory
Table: runId | start ts | end ts | complexity | oversight | total durationMs | phases | waves

### Step Durations
Per-step totals across the pipeline (\`triage\` / \`research\` / \`discuss\` / \`architect\` / \`plan\` / \`plan-review\` / \`execute\` / \`checks\` / \`verify\` / \`review\` / \`learn\` / \`milestone\`). Show mean + p50 + p95 across the selected runs. Flag any step where >20% of records have \`durationMs:null\`.

### Subagent Costs
Per-role breakdown: invocations, input/output token sums, mean tokens/call. List the top 5 most expensive single calls. Flag rows where \`success:false\` or \`outcome\` is in \`{crashed, killed, timeout, completed_no_usage, completed_partial_parse}\` (any non-clean terminal state — only \`completed\` is fully successful). When grouping, treat \`crashed\`/\`killed\`/\`timeout\` as hard failures and \`completed_no_usage\`/\`completed_partial_parse\` as soft failures (the subagent finished but usage telemetry is missing or malformed).

### Recall Stats
Per-mode hit-rate (hit / (hit+miss)). Verified-tier hit-rate (sum(verifiedCount) / sum(resultCount)). Flag modes with a hit-rate < 0.4.

### Review Convergence
Per-run review-iteration count, mustFixCount trajectory, time-to-APPROVED (sum of \`review.iteration\` durationMs). Flag runs that hit \`maxReviewIterations\`.

### Cross-Run Trends
For each numeric metric above, compute the trend over the selected runs (oldest first, newest last). Use delta arrows: up, down, flat.

End with a "Failure Modes" subsection enumerating parse/schema/unknownDuration counts and listing any unknown \`kind\` values seen.

## Step 5: Emit the report

Emit the markdown report **inline** in your response to the user. Do NOT write a file — the \`.luca/\` contract permits only \`<runId>.jsonl\` files under \`telemetry/\`, so a report \`.md\` there would violate the contract. The skill is read-only; the report is its output, not an artifact.

## Step 6: Summary to caller

After the report, print:

- Counts: runs aggregated, total records parsed, failures (parse/schema/unknownDuration)
- Classifier overrides: total count of \`classifier.override\` records, with a breakdown by override-source (\`byOverrideSource\`)
- A one-line headline, e.g. \`"10 runs, 7 phases avg, p95 step.execute=18m, 3 classifier overrides"\`

## Step 7: Done

The skill exits. No further actions. The user invokes it again with different \`--runs\` / \`--since\` / \`--vault\` to explore.

## Failure Modes

| Failure | Cause | Skill behavior |
|---|---|---|
| \`.luca/telemetry/\` absent | No pipeline runs yet | Short-circuit to Step 7 with an empty report |
| JSONL parse error on a line | Corrupted record (mid-write crash) | Increment \`failures.parse\`, continue |
| Schema mismatch (\`v\` field missing) | Pre-v:1 record (none expected; v:1 is current) | Increment \`failures.schema\`, continue |
| \`durationMs:null\` on a \`*.end\` record | Aborted run or NaN guard fired | Attempt the ts-gap fallback (Step 3); else tally and continue |
| \`--vault\` unresolvable | Vault not in \`.luca/config.json\` | Continue with the supplied vault name; the report uses it as-is |
| Unknown \`kind\` value | Future telemetry kind added post-skill | Tally under "Unknown kinds" in the Failure Modes section; do not crash |

## Notes

- The skill does **not** write any state file. Re-runs are idempotent over the same input set (deterministic).
- The skill is external to the pipeline — it records nothing.
`

export const lucaTelemetryReportSkill = defineSkill({
    name: "luca-telemetry-report",
    description: `Cross-run aggregator over \`.luca/telemetry/*.jsonl\`. Reads per-run JSONL telemetry records (phase/wave/step/subagent/recall/review events), aggregates streaming-style, and emits a markdown report inline. Read-only over the telemetry dir; no MuninnDB writes, no state mutation.

Use when user says "telemetry report", "aggregate telemetry", "show telemetry summary", "luca-telemetry-report", or invokes \`/luca-telemetry-report\`.

Arguments: \`--runs <N>\` (default 10), \`--since <ISO-date>\`, \`--vault <name>\`.`,
    body: BODY,
})
