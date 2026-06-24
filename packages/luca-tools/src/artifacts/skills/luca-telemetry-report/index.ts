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
- \`recall.utilization\` — post-hoc tie of a run's recalled memory IDs to that run's outcome valence (carries \`meta.recalledIds\`, \`meta.outcome\` ∈ {positive|negative|neutral}, \`meta.step\` ∈ {verify|review})
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

**EXCLUDE \`pr-outcomes.jsonl\` from the run-file set — load-bearing correctness directive.** The file \`.luca/telemetry/pr-outcomes.jsonl\` (the fixed synthetic-runId PR-outcome log, runId \`pr-outcomes\`) is **NOT a pipeline run** — it is a flat outcome log keyed by PR number, appended on every PR merge/revert (so its mtime is frequently high). Immediately after the \`find\` discovery and **BEFORE** the mtime sort, the \`--runs N\` slice, the Run Inventory table, and the "runs aggregated" count, remove the literal filename \`pr-outcomes.jsonl\` from the discovered file set. If you skip this, the high-mtime PR-outcome log can evict a real run from the \`--runs N\` window, emit a bogus Run Inventory row (null complexity/oversight, no phases), and inflate the run count. There are NO exceptions: \`pr-outcomes.jsonl\` never appears as a run.

Sort the **remaining** files by file mtime descending. Take the first \`--runs N\` files. If \`--since <ISO>\` is supplied, filter further by reading the first non-empty JSONL line and dropping files whose first \`ts\` is older than the threshold.

\`pr-outcomes.jsonl\` is instead read **SEPARATELY** as the dedicated source for the \`### PR Outcomes\` section (Step 4), independently of the \`--runs\` window — read the whole file regardless of how many runs the \`--runs N\` slice selected.

## Step 3: Streaming aggregation pass

For each selected file, stream lines (small files, ≤ a few MB each — a full read is fine). For each line:

1. \`JSON.parse\` defensively. On a parse error: increment \`failures.parse++\`, continue.
2. Validate the line has \`v:1\` and a \`kind\` string. On a miss: \`failures.schema++\`, continue.
3. Dispatch to the per-kind accumulator:
   - \`phase.*\` / \`wave.*\`: sum \`durationMs\` into \`byPhase[phase]\` / \`byWave[wave]\` buckets
   - \`mode.*\`: sum into \`byStep[from|to]\`
   - \`subagent.*\`: tally \`byRole[role]\` with input/output token sums; pair \`invoke\`/\`complete\` by \`meta.correlationId\` for orchestrator-side duration (preferred over a null harness \`durationMs\`). **Cost compute (per \`subagent.complete\`):** look up the per-model input and output rates from the **Model rate table** below by **substring-matching** the record's \`meta.model\` string (test for \`opus\`/\`sonnet\`/\`haiku\` as substrings — the emitted \`meta.model\` carries version suffixes that drift, so never match on full equality). If no substring matches, use the fallback/unknown row's rate AND increment an \`unknownModel\` tally (and count the call under an unknown-model flag). Then compute \`callCost = (meta.inputTokens × inputRate) + (meta.outputTokens × outputRate)\`. Accumulate \`callCost\` into: the call's own per-call cost, a cross-run \`totalCost\`, a per-role \`costByRole[meta.role]\`, and (for Task 1.1.3 below) the executor/structure cost buckets. The literal fields \`inputTokens\` and \`outputTokens\` are the token sources — read them from \`meta.inputTokens\` / \`meta.outputTokens\`; if either is missing or non-finite, treat it as 0 for the cost math and rely on the existing soft-failure flag (\`completed_no_usage\`) to surface the gap.
   - \`subagent.*\` **role attribution (Task 1.1.3):** bucket both tokens AND cost by \`meta.role\`. The **executor bucket** collects only records where \`meta.role === "executor"\`. The **structure bucket** collects **every other role** (reviewer / verifier / learner / fix / research / plan / plan-review / architect / triage / etc.). Any unknown, missing, or future role string defaults to the **structure** bucket — a conservative, documented choice so executor cost is never overstated. Maintain \`tokensByBucket[executor|structure]\` and \`costByBucket[executor|structure]\`.
   - \`recall.hit\` / \`recall.miss\`: tally hit/miss/verifiedCount per \`meta.callerMode\`
   - \`recall.utilization\`: for each record read \`meta.recalledIds\` (array of concept ULIDs), \`meta.outcome\` (\`positive\`|\`negative\`|\`neutral\`), and \`meta.step\` (\`verify\`|\`review\`). For every ULID in \`meta.recalledIds\`, increment a cross-run \`byRecalledId[ulid][outcome]\` tally (keyed also by \`meta.step\` so verify vs review scope is distinguishable). Skip records missing \`meta.recalledIds\` or with an out-of-range \`meta.outcome\` (tally under \`failures.schema\`).
   - \`review.iteration\`: collect the verdict/mustFixCount/perspectives series
   - \`classifier.override\`: tally \`byOverrideSource[meta.source]\` (count of classifier overrides, broken down by override-source)
   - \`signal.satisfaction\`: tally \`bySatisfactionSource[meta.source]\` with \`meta.valence\` breakdown (count of satisfaction signals + valence breakdown by source)
   - \`signal.failure-dump\`: tally \`failureDumpCount\` (count of failure-dump signals)
   - \`pr.outcome\`: for each \`pr.outcome\` record (these live in \`pr-outcomes.jsonl\`, NOT in a per-run \`<runId>.jsonl\`), keyed by \`meta.prNumber\`, tally the merged-vs-reverted result from \`meta.result\` (\`merged\` | \`reverted\`) and collect \`meta.reviewRounds\` and \`meta.timeToMergeMs\`. **\`pr-outcomes.jsonl\` is NOT a pipeline run** — it is a flat outcome log keyed by PR number, so do **NOT** apply any duration/phase/wave math to it (no \`byPhase\`/\`byWave\`/\`*.end\` ts-gap fallback). It contributes only to the PR Outcomes section below.
4. If \`durationMs === null\` for a \`*.end\` record, attempt a **ts-gap fallback** — find the matching \`*.start\` event with the same phase/slug/wave/runId, compute \`Date.parse(end.ts) - Date.parse(start.ts)\`. Only apply when both \`Date.parse\` calls return finite non-negative deltas. If the fallback fails, leave \`null\` and tally under \`failures.unknownDuration\`.

Memory note: aggregators are **per-run scoped** — release per-run accumulators between files. Cross-run totals are written to a separate top-level accumulator.

### Model rate table

**Operator-editable defaults — verify against current pricing before trusting cost output.** These are placeholder per-token rates (USD), NOT authoritative; edit them in-line to match your account's actual model pricing. Rates are dollars per single token (i.e. per-million-token price ÷ 1,000,000).

| Model (substring match) | Input $/token | Output $/token |
|---|---|---|
| \`opus\` | 0.000015 | 0.000075 |
| \`sonnet\` | 0.000003 | 0.000015 |
| \`haiku\` | 0.0000008 | 0.000004 |
| _fallback / unknown_ | 0.000003 | 0.000015 |

Matching is **substring** on the record's \`meta.model\` string (case-insensitive contains \`opus\` / \`sonnet\` / \`haiku\`), because emitted model identifiers carry version/date suffixes that drift across releases. A model string matching none of the three rows uses the **fallback / unknown** rate AND is counted under the \`unknownModel\` tally so unpriced traffic is visible rather than silently mispriced. The fallback rate intentionally mirrors the mid-tier (sonnet) so an unknown model is neither free nor wildly over-counted — but treat any non-zero \`unknownModel\` count as a signal to add the missing row.

## Step 4: Build the markdown report

Render the report sections below:

### Run Inventory
Table: runId | start ts | end ts | complexity | oversight | total durationMs | phases | waves

### Step Durations
Per-step totals across the pipeline (\`triage\` / \`research\` / \`discuss\` / \`architect\` / \`plan\` / \`plan-review\` / \`execute\` / \`checks\` / \`verify\` / \`review\` / \`learn\` / \`milestone\`). Show mean + p50 + p95 across the selected runs. Flag any step where >20% of records have \`durationMs:null\`.

### Subagent Costs
Per-role breakdown: invocations, input/output token sums, mean tokens/call. List the top 5 most expensive single calls. Flag rows where \`success:false\` or \`outcome\` is in \`{crashed, killed, timeout, completed_no_usage, completed_partial_parse}\` (any non-clean terminal state — only \`completed\` is fully successful). When grouping, treat \`crashed\`/\`killed\`/\`timeout\` as hard failures and \`completed_no_usage\`/\`completed_partial_parse\` as soft failures (the subagent finished but usage telemetry is missing or malformed).

### Cost Summary
Per-role and total cost derived from the **Model rate table** (Step 3 cost compute). Table: role | invocations | input tokens | output tokens | cost (USD, from \`costByRole\`). Add a TOTAL row (\`totalCost\`). List the top 5 most expensive single calls by \`callCost\`. If \`unknownModel > 0\`, print a caveat line naming the count and reminding the operator that those calls were priced at the fallback rate — the absolute cost figures are approximate and only as accurate as the operator-edited rate table.

### Cost per Outcome
Two cost-efficiency ratios over the selected runs, both built from \`totalCost\`:

- **cost / phases-completed** — \`totalCost / phasesCompleted\`, where \`phasesCompleted\` is the count of \`phase.end\` records (equivalently the number of distinct completed phases in the existing \`byPhase\` tally). This is the average dollar cost to carry one phase to completion.
- **cost / first-pass-success** — \`totalCost / firstPassCount\`. A phase counts as a **first-pass** success when, and only when, its per-phase \`review.iteration\` series contains **exactly ONE** entry whose verdict is \`APPROVED\` and there is **no subsequent fix / re-execute re-entry** — i.e. \`count == 1 && verdict == APPROVED\` for that phase's review-iteration series. Derive this **purely** from the per-phase \`review.iteration\` series collected in Step 3 (verdict + iteration count); there is **no** separate verify telemetry kind to query for it. A phase that needed two or more review iterations, or whose single iteration was not \`APPROVED\`, is not a first-pass success.

**Divide-by-zero guard:** if \`phasesCompleted == 0\` render the cost / phases-completed ratio as \`n/a\`; if \`firstPassCount == 0\` render the cost / first-pass ratio as \`n/a\`. Never emit \`Infinity\` or \`NaN\`.

### PR Outcomes
Pull-request outcome KPIs built from the \`pr.outcome\` records (in \`pr-outcomes.jsonl\`, keyed by \`meta.prNumber\`). Report:

- **merge rate** — \`merged / total\`, where \`merged\` is the count of \`pr.outcome\` records with \`meta.result === "merged"\` and \`total\` is all \`pr.outcome\` records. Apply the divide-by-zero guard (\`total == 0\` → \`n/a\`, never \`NaN\`).
- **average review-rounds** — the mean of \`meta.reviewRounds\` across the \`pr.outcome\` records (skip records where it is missing/non-finite).
- **median time-to-merge** — the median of \`meta.timeToMergeMs\` across merged \`pr.outcome\` records (skip records where it is missing/non-finite). Report it as a human-readable duration alongside the raw ms.

**run → PR join (the join key).** A \`pr.outcome\` record alone cannot be tied back to the pipeline run that produced the PR — \`pr-outcomes.jsonl\` carries no \`runId\`. The bridge is the \`pr.created\` record: \`pr.created\` records live in each run's \`<runId>.jsonl\`, carry the originating run's id as the top-level \`runId\` field, and carry the PR number as \`meta.prNumber\`. Build a join map by reading every \`pr.created\` record across the selected runs and indexing \`meta.prNumber → runId\` (the originating run). Then JOIN \`pr.created\`(\`meta.prNumber\`, \`runId\`=origin-run) ⋈ \`pr.outcome\`(\`meta.prNumber\`) on \`meta.prNumber\` to correlate a merge/revert outcome back to its originating run's cost (\`totalCost\` / \`costByRole\`) and first-pass KPIs. Surface this correlation at the **aggregate level now** (e.g. merge rate vs cost); the \`meta.prNumber → runId\` map laid down here is what enables the **per-run join** in a later phase. If a \`pr.outcome\` has no matching \`pr.created\` (PR opened outside a tracked run), report it under the unjoined tail and do not crash.

### Structure vs Executor Attribution
The split of token + dollar spend between productive code-writing work and pipeline scaffolding, from the Step 3 \`tokensByBucket\` / \`costByBucket\` accumulators. Two buckets:

- **executor** — records where \`meta.role === "executor"\` (the agents that write production code).
- **structure** — every other \`meta.role\` (reviewer, verifier, learner, fix, research, plan, plan-review, architect, triage, …) plus any unknown / missing / future role string, which defaults here conservatively.

Table: bucket | tokens | cost (USD) | % of total tokens | % of total cost. The executor-vs-structure ratio shows how much spend goes to making changes versus orchestrating/checking them. Document inline that the bucketing is a heuristic keyed on the \`meta.role\` string and that unrecognized roles fall into **structure** by design.

### Recall Stats
Per-mode hit-rate (hit / (hit+miss)). Verified-tier hit-rate (sum(verifiedCount) / sum(resultCount)). Flag modes with a hit-rate < 0.4.

### Recall Utilization
A recalled-ID → outcome-valence correlation built from \`recall.utilization\` records (\`byRecalledId\`). For each recalled memory (by concept ULID), tabulate how often it was in scope when the run's outcome was \`positive\` vs \`negative\` vs \`neutral\`, split by \`meta.step\` (verify | review). Table: recalled ULID | step | positive | negative | neutral. Sort by net valence (positive − negative) descending so the memories most associated with good outcomes surface first.

This correlation is **post-hoc / statistical**, aggregated by runId + step (MVP) — it is NOT a per-memory utility score and does not imply causation. A memory appears here only because it was recalled in a run whose outcome was later recorded; co-occurrence is not attribution.

If no \`recall.utilization\` records exist across the selected runs, this section reports "no utilization data yet" and is otherwise skipped — the skill stays read-only and fail-tolerant (see Failure Modes), so absence is never an error.

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
| No \`recall.utilization\` records | Runs predate utilization telemetry, or none emitted | Recall Utilization section reports "no utilization data yet"; do not crash |
| \`recall.utilization\` missing \`meta.recalledIds\` / bad \`meta.outcome\` | Malformed utilization record | Increment \`failures.schema\`, skip the record, continue |

## Notes

- The skill does **not** write any state file. Re-runs are idempotent over the same input set (deterministic).
- The skill is external to the pipeline — it records nothing.
`

export const lucaTelemetryReportSkill = defineSkill({
    name: 'luca-telemetry-report',
    description: `Cross-run aggregator over \`.luca/telemetry/*.jsonl\`. Reads per-run JSONL telemetry records (phase/wave/step/subagent/recall/review events), aggregates streaming-style, and emits a markdown report inline. Read-only over the telemetry dir; no MuninnDB writes, no state mutation.

Use when user says "telemetry report", "aggregate telemetry", "show telemetry summary", "luca-telemetry-report", or invokes \`/luca-telemetry-report\`.

Arguments: \`--runs <N>\` (default 10), \`--since <ISO-date>\`, \`--vault <name>\`.`,
    body: BODY,
})
