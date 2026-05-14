---
name: luca-telemetry-report
description: >
  Cross-run aggregator over `.planning/telemetry/*.jsonl`. Reads per-run
  JSONL telemetry records (phase/wave/mode/subagent/recall/review events),
  aggregates streaming-style, and emits a markdown report at
  `.planning/telemetry/report-<ISO>.md`. Read-only over the telemetry dir;
  no MuninnDB writes, no workflowState mutation.

  Use when user says "telemetry report", "aggregate telemetry", "show
  telemetry summary", "luca-telemetry-report", or invokes
  `/luca-telemetry-report`.

  Arguments: `--runs <N>` (default 10), `--since <ISO-date>`, `--vault <name>`, `--no-archive` (exclude `archive/` subdir; archive is included by default).
---

# luca-telemetry-report Skill

Aggregate Luca pipeline telemetry across recent runs. Emits a single markdown report covering: run inventory, mode durations, subagent costs, recall hit/miss, review-iteration convergence, cross-run trends.

## Scope guard — read first

This skill is **read-only over the telemetry directory**. It does not mutate state, does not call MuninnDB write APIs, and does not call `workflowState` (no recording — the skill is itself external to the pipeline).

<!-- forbidden-tools-list-start -->

The following tools are FORBIDDEN inside this skill. Do not call them under any circumstance.

- `workflowState` (any action)
- `mcp__muninn__muninn_remember`
- `mcp__muninn__muninn_remember_batch`
- `mcp__muninn__muninn_forget`
- `mcp__muninn__muninn_evolve`
- `mcp__muninn__muninn_state`
- `mcp__muninn__muninn_consolidate`

The skill aggregates telemetry already on disk. If a record is malformed, log it in the report's "Failure Modes" section and continue.

<!-- forbidden-tools-list-end -->

## TelemetryRecord v:1 contract (canonical)

Every JSONL line conforms to the v:1 contract:

```
{ v:1, ts:ISO8601, runId, kind, phase, slug, wave, complexity, oversight, durationMs:number|null, meta:{} }
```

Known `kind` values:

- `phase.start` / `phase.end` — outer-loop phase boundaries
- `wave.start` / `wave.end` — inner-loop wave boundaries (execute mode)
- `mode.start` / `mode.end` — pipeline mode transitions (switch-mode, re-enter-pipeline)
- `subagent.invoke` / `subagent.complete` — subagent dispatch boundaries
- `recall.hit` / `recall.miss` — MuninnDB recall outcomes
- `review.iteration` — luca:5-review save-review-results emit

Treat the union as **open**: aggregator must tolerate unknown kinds (count them under "Unknown kinds" rather than crash).

## Arguments + pre-flight validation

| Flag | Type | Default | Validation |
|---|---|---|---|
| `--runs N` | integer | 10 | `N >= 1 && N <= 1000` |
| `--since <ISO>` | string | unset | `^\d{4}-\d{2}-\d{2}` (date-only or full ISO accepted) |
| `--vault <name>` | string | unset | `^[a-z0-9_-]+$`, max 64 chars |
| `--no-archive` | flag | unset | boolean — when set, exclude `.planning/telemetry/archive/` from enumeration |

If validation fails, abort with a clear error message — do not silently continue with defaults.

## Step 1: Pre-flight + scope resolve

1. Parse and validate arguments above.
2. Read `.planning/config.json` if present. If `--vault` was supplied, override the config value; otherwise use `muninn.vault` field, fallback `"default"`.
3. Resolve telemetry dir from `.planning/telemetry/`. **`existsSync` guard**: if the dir is absent (no runs yet), short-circuit to Step 7 and emit an empty report citing "no telemetry recorded yet".

## Step 2: Enumerate JSONL files

By default, enumerate **both** the active run dir and the `archive/` subdir so cross-run aggregation includes historical runs that `reset-pipeline` archived. This is critical: without archive inclusion the report would only see runs from the current session.

Use:

```bash
# default: include archive (cross-run aggregation needs history)
find .planning/telemetry -maxdepth 2 -name '*.jsonl' -print 2>/dev/null

# when --no-archive is set: root-level only (current/in-flight runs)
find .planning/telemetry -maxdepth 1 -name '*.jsonl' -print 2>/dev/null
```

NOT shell glob — handles empty dir and nested subdirs gracefully. Each file = one run; `archive/<runId>.jsonl` files are treated identically to root-level `<runId>.jsonl` files. Pass `--no-archive` to restrict to in-flight runs only (e.g. for debugging a live session).

Sort by file mtime descending. Take the first `--runs N` files. If `--since <ISO>` is supplied, filter further by reading the first non-empty JSONL line and dropping files whose first `ts` is older than the threshold.

## Step 3: Streaming aggregation pass

For each selected file, stream lines via `readFileSync` + `.split('\n')` (small files, ≤few MB each — full read is fine). For each line:

1. `JSON.parse` defensively. On parse error: increment `failures.parse++`, continue.
2. Validate the line has `v:1` and a `kind` string. On miss: `failures.schema++`, continue.
3. Dispatch to per-kind accumulator:
   - `phase.*` / `wave.*`: sum durationMs into `byPhase[phase]` / `byWave[wave]` buckets
   - `mode.*`: sum into `byMode[from|to]`
   - `subagent.*`: tally `byRole[role]` with input/output token sums; pair `invoke`/`complete` by `meta.correlationId` for orchestrator-side duration (preferred over null harness durationMs)
   - `recall.*`: tally hit/miss/verifiedCount per `meta.callerMode`
   - `review.iteration`: collect verdict/mustFixCount/perspectives series
4. If `durationMs === null` for a `*.end` record, attempt **ts-gap fallback** — find the matching `*.start` event with same phase/slug/wave/runId, compute `Date.parse(end.ts) - Date.parse(start.ts)`. Only apply when both `Date.parse` calls return finite non-negative deltas. If fallback fails, leave `null` and tally under `failures.unknownDuration`.

Memory note: aggregators are **per-run scoped** — release per-run accumulators between files. Cross-run totals are written to a separate top-level accumulator.

## Step 4: Build markdown report

Render 6 sections:

### Run Inventory
Table: runId | start ts | end ts | complexity | oversight | total durationMs | phases | waves

### Mode Durations
Per-mode totals (`triage` / `research` / `architect` / `execute` / `review` / `finalize`). Show mean + p50 + p95 across selected runs. Flag any mode where >20% of records have `durationMs:null`.

### Subagent Costs
Per-role breakdown: invocations, input/output token sums, mean tokens/call. List top 5 most expensive single calls. Flag rows where `success:false` or `outcome` in `{crashed, killed}`.

### Recall Stats
Per-mode hit-rate (hit / (hit+miss)). Verified-tier hit-rate (sum(verifiedCount) / sum(resultCount)). Flag modes with hit-rate < 0.4.

### Review Convergence
Per-run review iteration count, mustFixCount trajectory, time-to-APPROVED (sum of review.iteration durationMs). Flag runs that hit `maxReviewIterations`.

### Cross-Run Trends
For each numeric metric above, compute trend over selected runs (oldest first, newest last). Use delta arrows: up, down, flat.

End with a "Failure Modes" subsection enumerating parse/schema/unknownDuration counts and listing any unknown `kind` values seen.

## Step 5: Write report

Compute output path:

```
const now = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = `.planning/telemetry/report-${now}.md`
```

Write atomically. Do not overwrite an existing file with the same name (the dashes-for-colons substitution effectively gives ms-resolution uniqueness, but check `existsSync` defensively and append a `-1`, `-2`, etc. counter if needed).

## Step 6: Summary to caller

Print to stdout:

- Report path
- Counts: runs aggregated, total records parsed, failures (parse/schema/unknownDuration)
- One-line headline: e.g. `"10 runs, 7 phases avg, p95 mode.execute=18m"`

## Step 7: Done

The skill exits. No further actions. The user invokes again with different `--runs` / `--since` / `--vault` to explore.

## Failure Modes

| Failure | Cause | Skill behavior |
|---|---|---|
| `.planning/telemetry/` absent | No pipeline runs yet | Short-circuit to Step 7 with empty report |
| JSONL parse error on a line | Corrupted record (mid-write crash) | Increment `failures.parse`, continue |
| Schema mismatch (`v` field missing) | Pre-v:1 record (none expected; v:1 is current) | Increment `failures.schema`, continue |
| `durationMs:null` on `*.end` | Aborted run or NaN guard fired | Attempt ts-gap fallback (Step 3); else tally and continue |
| `--vault` unresolvable | Vault not in `.planning/config.json` | Continue with supplied vault name; report uses it as-is |
| Output path collision | Two invocations within same ms | Append numeric suffix `-1`/`-2`/... |
| Unknown `kind` value | Future telemetry kind added post-skill | Tally under "Unknown kinds" in Failure Modes section; do not crash |

## Notes

- The skill does **not** read JSONL inside `.planning/telemetry/archive/` — those are archived prior runs. If a future need arises, expose a `--include-archive` flag.
- The skill does **not** write any state file. Re-runs are idempotent over the same input set (deterministic).
- The skill does **not** call `record-recall` or `record-subagent` — it is external to the pipeline.
