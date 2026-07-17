/**
 * trace-insights skill — LangSmith trace mining for luca-framework improvement.
 *
 * Periodically reads recent LangSmith traces of real Claude Code sessions
 * (captured by the langsmith-tracing plugin), aggregates them deterministically,
 * deep-reads a bounded set of outlier traces via subagents, and emits an
 * evidence-backed insight report. High-confidence actionable findings are
 * auto-logged as GitHub issues on luca-framework for user weigh-in.
 *
 * P2 scope (design: dad-xstate-migration session, 2026-07-16): Stages A–E plus
 * Stage F — MuninnDB persistence (pitfall/pattern insight memories with
 * recall-then-evolve dedup, a metric:trace-report-<date> JSON digest, and a
 * remember-latest-wins analysis cursor powering the new `--since auto`
 * default). Destructive/administrative MuninnDB tools (muninn_forget,
 * muninn_state, muninn_consolidate) remain FORBIDDEN in the scope guard.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# trace-insights Skill

Mine recent LangSmith traces of Claude Code sessions for evidence-backed insights into how the Luca framework can be improved — token waste, loops, failures, friction. A self-hosted, sampled, cheap alternative to LangSmith's Engine feature. Findings feed a markdown report and (unless \`--dry-run\`) auto-logged GitHub issues on the luca-framework repo for user weigh-in.

## Scope guard — read first

This skill is **read-only over LangSmith and the repository**, with exactly three permitted write surfaces:

1. Scratchpad files (fetched trace JSON, aggregation scripts, intermediate results).
2. \`gh issue create\` / \`gh label create\` on the **luca-framework** repo only, only with the \`trace-insights\` label, and only after the dedup search (Stage E).
3. Bounded MuninnDB writes — \`mcp__muninn__muninn_remember\` / \`mcp__muninn__muninn_evolve\` only, only for the concepts named in the Stage F routing table, only via the Stage F procedure, and never under \`--dry-run\`.

The following operations are FORBIDDEN inside this skill. Do not perform them under any circumstance:

- \`mcp__muninn__muninn_forget\`, \`mcp__muninn__muninn_state\`, \`mcp__muninn__muninn_consolidate\` — destructive/administrative MuninnDB surfaces stay out of scope
- Any MuninnDB write outside the Stage F routing table (no \`session:*\`, no \`brain:*\`, no free-form concepts)
- Any \`luca\` CLI write/mutation command (\`luca state advance\`, \`luca todo add\`, \`luca workflow reset\`, …)
- Any \`Write\` under \`.luca/\`
- Any PATCH/POST that mutates LangSmith data (runs, feedback, annotations) — the LangSmith API is queried read-only

**Secret handling — load-bearing.** \`CC_LANGSMITH_API_KEY\` must NEVER be echoed, printed, interpolated into logged command strings, or written to any file. Reference it only as \`$CC_LANGSMITH_API_KEY\` inside curl \`-H "x-api-key: ..."\` headers. If any tool output accidentally contains a key fragment (\`lsv2_\`), do not re-emit it.

**Privacy — load-bearing.** Traces cover ALL repos the user works in (personal and work). Evidence quotes in the report and in GitHub issues are capped at 300 characters per quote, must be scanned for secrets/credentials before inclusion, and must never include full prompt or file-content payloads. GitHub issues are public-ish surfaces: describe patterns, not proprietary content.

## Preconditions

Verify these environment variables are set (they are configured by the langsmith-tracing plugin setup in \`~/.claude/settings.json\`):

- \`CC_LANGSMITH_API_KEY\` — LangSmith API key
- \`CC_LANGSMITH_PROJECT\` — trace project name (e.g. \`Claude Code\`)

If either is missing, abort with a message pointing at the langsmith-tracing plugin README (env setup section). Also verify \`gh auth status\` succeeds when issue logging will run (skip this check under \`--dry-run\`).

## Arguments + pre-flight validation

| Flag | Type | Default | Validation |
|---|---|---|---|
| \`--since <window>\` | \`auto\`, duration, or ISO date | \`auto\` | \`auto\`, \`^\\d+[dh]$\`, or \`^\\d{4}-\\d{2}-\\d{2}\` |
| \`--repo <substring>\` | string | unset (**all repos**) | non-empty; matched against trace cwd metadata |
| \`--max-deep-reads <N>\` | integer | 8 | \`N >= 1 && N <= 24\` |
| \`--dry-run\` | boolean | false | report only; no GitHub issues created; no MuninnDB writes (including the cursor) |
| \`--artifact\` | boolean | false | additionally publish the report as a private Artifact page |
| \`--project <name>\` | string | \`$CC_LANGSMITH_PROJECT\` | non-empty |

If validation fails, abort with a clear error message — do not silently continue with defaults.

\`--since auto\` resolves the window from the analysis cursor (Stage F3): the window starts at the cursor's \`lastAnalyzedUntil\` minus a 1-hour trailing overlap. When no cursor exists or it fails validation, fall back to a \`7d\` window. The cursor READ is permitted under \`--dry-run\` — only writes are suppressed.

Default scope is **all repos** deliberately: every repo the user works in runs the Luca framework, so every trace is evidence. \`--repo\` narrows when investigating one codebase.

## Stage A — Fetch & aggregate (deterministic, no LLM reads)

### A1. Resolve the project

\`\`\`bash
curl -sS -G "https://api.smith.langchain.com/api/v1/sessions" \\
  --data-urlencode "name=$CC_LANGSMITH_PROJECT" \\
  -H "x-api-key: $CC_LANGSMITH_API_KEY"
\`\`\`

Capture \`id\` (the session/project id) and \`tenant_id\` (used for trace URLs). If the array is empty, abort: no such project.

### A2. Page root runs for the window

\`POST https://api.smith.langchain.com/api/v1/runs/query\` with body:

\`\`\`json
{
  "session": ["<project-id>"],
  "is_root": true,
  "filter": "gt(start_time, \\"<window-start-ISO>\\")",
  "select": ["id", "name", "status", "start_time", "end_time", "error",
             "total_tokens", "prompt_tokens", "completion_tokens",
             "total_cost", "extra"],
  "limit": 100
}
\`\`\`

Page via the response's \`cursors.next\` field (pass it back as \`"cursor"\`) until exhausted. Write all pages to a scratchpad file — never inline megabytes of JSON into context.

### A3. Aggregate with a script

Write and run a small script (Bun or python3) over the scratchpad JSON that computes, with zero LLM reading:

- **Repo attribution**: derive repo from \`extra.metadata.repo\` when present (P4 enrichment), else from \`extra.metadata.cwd\` collapsed to \`/Users/<user>/<dir>/<repo>\` (first four path segments). Apply the \`--repo\` filter here.
- **Spend**: cost and tokens per day and per repo; totals; top-10 most expensive root runs; cache-heavy ratio (prompt_tokens vs completion_tokens skew).
- **Turn shape**: wall-clock duration p50/p90/p99; token p50/p90/p99.
- **Reliability**: status counts (success/error/pending); error taxonomy from the \`error\` field; pending runs older than 1h (orphaned — likely hook crashes or interrupted sessions).
- **Session grouping**: group roots by \`extra.metadata.thread_id\` (session id); flag sessions with many turns and monotonically growing token counts (context-bloat signature).

Print the aggregate as compact JSON + a human-readable digest. This stage costs no LLM tokens beyond reading the digest.

### A4. Child-run smells (bounded)

For the top candidate traces only (see Stage B pool, not all traces), fetch child runs:

\`\`\`json
{ "session": ["<project-id>"], "trace": "<trace-id>",
  "select": ["id", "name", "run_type", "status", "error", "start_time", "end_time",
             "total_tokens", "extra"], "limit": 100 }
\`\`\`

From child names/sequences compute per-trace: tool-call distribution, subagent count, compaction events (\`ls_agent_type == "compaction"\` in child metadata), loop signature (≥8 consecutive same-name tool runs), and error children.

## Stage B — Outlier selection

Build a ranked candidate pool from the Stage A aggregates:

1. Every errored root run (hard evidence, always in)
2. Root runs with \`total_cost\` > p90
3. Root runs with \`total_tokens\` > p90
4. Root runs with wall-clock > p90
5. Traces with ≥2 compaction events in one session
6. Traces with a loop signature (repeated-identical-tool-call runs)

Rank by \`(severity × cost)\` where errors rank above cost outliers at equal cost. **Dedup by session (\`thread_id\`)** — at most 2 traces per session so one pathological session cannot consume the whole budget. Truncate the pool to \`--max-deep-reads\`. Log what was dropped and why (no silent caps).

## Stage C — Deep-read fan-out

Spawn one **read-only subagent per selected trace, in parallel** (a single message with multiple Agent calls; Explore or general-purpose type). Each subagent prompt must include:

- The trace id, project id, and the root-run summary line from Stage A
- The exact curl recipes from Stage A (child-run query + \`GET /api/v1/runs/<id>\` for single-run detail), with the secret-handling rule restated
- **Truncation directive**: when fetching run inputs/outputs, keep only the first 2,000 and last 2,000 characters of any field. NEVER fetch or read full multi-million-token LLM payloads — read child run *names, sequences, errors, and token counts*; sample content only where a finding needs a quote.
- The finding schema. Each subagent returns 0–3 findings as JSON:

\`\`\`json
{ "category": "prompt-bloat | tool-friction | loop | error | cost-hotspot | ux-friction | skill-defect",
  "summary": "<one sentence>",
  "evidence": "<≤300 chars, secret-scanned>",
  "trace_url": "https://smith.langchain.com/o/<tenant_id>/projects/p/<project_id>/r/<trace_id>",
  "repo": "<repo>",
  "luca_surface": "<skill/agent/hook/rule/CLI surface if attributable, else null>",
  "suggested_change": "<concrete framework change>",
  "confidence": "high | medium | low" }
\`\`\`

\`luca_surface\` is the payoff — push each subagent to attribute the pattern to a concrete Luca artifact (a skill body, an agent prompt, a hook, a rule, a CLI command) whenever the trace shows Luca pipeline activity.

## Stage D — Synthesis & report

Merge findings across subagents; dedupe near-identical findings (same category + same luca_surface + same failure shape) keeping the strongest evidence; rank by \`(frequency × cost impact × confidence)\`.

Emit the report **inline** as markdown with these sections:

### Executive Summary
3–6 sentences: window analyzed, spend, the headline finding, and what to change first.

### Spend & Trends
Per-repo and per-day cost/token table; top-5 most expensive turns with trace links; cache-heavy ratio note.

### Reliability
Error rate, error taxonomy, orphaned/pending runs.

### Behavior Smells
Compaction frequency, loop signatures, context-bloat sessions — counts with one-line examples.

### Top Findings
One subsection per finding: category, evidence quote, trace link, affected repo, confidence.

### Recommended Framework Changes
Ranked, each tagged with its \`luca_surface\` target and the finding(s) it resolves. This section is the input to GitHub issue creation.

### Appendix
Raw aggregate digest, pool selection log (what was deep-read, what was dropped), failure modes encountered.

If \`--artifact\` was passed: load the \`artifact-design\` skill, write the report as an HTML page to the scratchpad, and publish it via the Artifact tool (private by default) with a stable title \`Trace Insights — <window>\`. The inline markdown report is still emitted — the artifact is an addition, never a replacement.

## Stage E — GitHub issue feed (skipped under \`--dry-run\`)

For each **high-confidence** finding with a non-null \`luca_surface\`:

1. Compute a stable fingerprint: \`<category>/<luca_surface-slug>/<summary-slug>\` (kebab-case, ≤80 chars).
2. **Dedup search — mandatory before every create**: \`gh issue list --repo <luca-framework> --label trace-insights --state all --search "<fingerprint>" --json number,title\`. If any issue matches the fingerprint, do NOT create a duplicate — note the existing issue number in the report (optionally add a comment with the new evidence if the finding recurred with new data).
3. Ensure the \`trace-insights\` label exists (\`gh label create trace-insights --repo <luca-framework> --color 5319E7 --description "Auto-logged by /trace-insights" || true\`).
4. Create: \`gh issue create --repo <luca-framework> --label trace-insights\` with:
   - Title: \`[trace-insights] <summary>\`
   - Body: finding category, evidence quote (≤300 chars, secret-scanned), trace URL(s), affected repo(s), suggested change, confidence, and a final line \`Fingerprint: <fingerprint>\` (this line is what the dedup search matches).

Medium/low-confidence findings and findings without a \`luca_surface\` go in the report only — never as issues. Under \`--dry-run\`, render the would-be issues as a table in the report instead.

The issues are the **user weigh-in surface**: accepted ones get pulled into the backlog via the existing \`/gh-issue-triage\` flow; rejected ones get closed (and their fingerprint keeps them from being re-filed).

## Stage F — Memory persistence (skipped under \`--dry-run\`)

Persist the run's durable outputs to MuninnDB. Runs AFTER the report and the issue feed. Resolve \`<repo_vault>\` from \`.luca/config.json\` → \`muninn.vault\`, falling back to \`"default"\`. Under \`--dry-run\` this stage is skipped entirely — zero MuninnDB writes, cursor included (the pre-flight cursor READ for \`--since auto\` still happens).

### Vault routing table (binding — the ONLY writable concepts)

| Concept | Vault | Content |
|---|---|---|
| \`pitfall:trace-<fingerprint>\` | \`default\` (cross-cutting) | Recurring failure/friction insight from a finding |
| \`pattern:trace-<fingerprint>\` | \`default\` (cross-cutting) | Validated positive approach observed in traces |
| \`metric:trace-report-<date>\` | \`<repo_vault>\` | Compact JSON run digest, one per run |
| \`metric:trace-insights-cursor\` | \`<repo_vault>\` | Analysis cursor JSON (remember-latest-wins) |

Any MuninnDB write outside this table violates the scope guard.

### F1. Insight memories (recall-then-evolve dedup)

For each **high-confidence** finding, derive a distinctive, stable fingerprint-derived concept slug — \`pitfall:trace-<fingerprint>\` for failure/friction findings, \`pattern:trace-<fingerprint>\` for validated positive approaches — where \`<fingerprint>\` is the Stage E fingerprint (\`<category>/<luca_surface-slug>/<summary-slug>\`) kebab-cased with \`/\` → \`-\`.

**Dedup search — mandatory before every insight write**: \`mcp__muninn__muninn_recall({ vault: "default", context: ["<the finding's natural-language summary, NOT its slug>"], mode: "balanced", limit: 5 })\` and inspect whether any returned engram's \`concept\` exactly equals the target concept.

- If a returned engram's concept matches AND it is a **FLAT** engram: capture its \`id\` (ULID) and \`mcp__muninn__muninn_evolve(id, new_content)\` it — increment the occurrence count and append the latest evidence quote + trace URL. Evolve is safe for flat engrams only.
- Otherwise (no match): create it via \`mcp__muninn__muninn_remember({ vault: "default", concept: "<slug>", content: <summary + evidence + trace URL + suggested change> })\`.

This dedup is **best-effort, NOT guaranteed** — MuninnDB has no concept lookup, and on a vault with no/weak embedder the recall can miss an existing engram, in which case a re-run will create a duplicate. The distinctive fingerprint-derived slugs are the mitigation: duplicates stay identifiable for later consolidation (outside this skill — \`muninn_consolidate\` is forbidden here).

### F2. Run digest

Persist one memory per run to the repo vault: \`mcp__muninn__muninn_remember({ vault: <repo_vault>, concept: "metric:trace-report-<date>", content: <compact JSON digest> })\` where \`<date>\` is the run's ISO date (\`YYYY-MM-DD\`). The digest is compact JSON, **never full report prose**: window analyzed, trace count, spend totals, error rate, finding fingerprints, and GitHub issue numbers created/deduped.

### F3. Analysis cursor (remember-latest-wins)

The analysis cursor is a single MuninnDB memory in the repo vault — concept \`metric:trace-insights-cursor\`, with a JSON content body:

\`\`\`json
{
  "schemaVersion": 1,
  "lastAnalyzedUntil": "<ISO-timestamp>",
  "seenTraceIds": ["<trace-id>", "..."],
  "updatedAt": "<ISO-timestamp>"
}
\`\`\`

Field semantics:

- \`schemaVersion\` — literal \`1\`; bump on any shape change.
- \`lastAnalyzedUntil\` — end of the analyzed window (ISO). The next \`--since auto\` run starts here minus the 1-hour trailing overlap so boundary traces are not missed.
- \`seenTraceIds\` — trace ids whose \`start_time\` falls within the trailing overlap window ONLY (bounded — NEVER an all-time seen set). The next run skips these already-analyzed boundary traces.
- \`updatedAt\` — set to the current ISO timestamp immediately before persisting.

**Read (pre-flight, when \`--since auto\`)**: \`mcp__muninn__muninn_recall({ vault: <repo_vault>, context: ["metric:trace-insights-cursor"], mode: "recent", limit: 1 })\` and parse the latest one's JSON content as the cursor state — latest wins. Validate: \`schemaVersion === 1\`, \`lastAnalyzedUntil\` parses as an ISO timestamp, \`seenTraceIds\` an array of strings. On a parse/validation failure treat the cursor as corrupt: seed a fresh state, fall back to a \`7d\` window, and log a warning in the report. Do not abort — re-scanning is safer than propagating a corrupt cursor.

**Write (last, only on success)**: write the cursor only AFTER the report, the issue feed, and all F1/F2 writes complete — a fresh \`mcp__muninn__muninn_remember({ vault: <repo_vault>, concept: "metric:trace-insights-cursor", content: JSON.stringify(cursor) })\` each run. Remember-latest-wins: do NOT \`muninn_evolve\` the cursor (evolve is reserved for F1 insight recurrence); the latest cursor memory wins on the next recall. If the run fails partway, skip the cursor write so the next \`--since auto\` run re-covers the window.

**Vault pinning**: the cursor lives in the invoking repo's vault (\`<repo_vault>\` resolves from that repo's \`.luca/config.json\`) — running this skill from a different repo resolves a different vault and silently starts a fresh cursor there.

## Summary to caller

After the report, print one block:

- Traces in window / deep-read / dropped
- Findings by confidence tier
- Issues created / deduped-skipped (or "dry-run: N would-be issues")
- Memories created / evolved + cursor advanced-to timestamp (or "dry-run: memory persistence skipped")
- A one-line headline, e.g. \`"142 traces, 8 deep-read, 3 findings, 2 issues filed"\`

## Failure Modes

| Failure | Cause | Skill behavior |
|---|---|---|
| \`CC_LANGSMITH_API_KEY\` / \`CC_LANGSMITH_PROJECT\` unset | Plugin not configured | Abort with pointer to plugin env setup |
| Sessions lookup returns \`[]\` | Wrong project name | Abort, list available project names is NOT possible read-safely — report the name tried |
| 401 from API | Expired/revoked key | Abort; tell user to rotate key in settings.json |
| 429 from API | Rate limit | Back off (sleep 30s), retry once per request, then continue with partial data and say so |
| Zero root runs in window | Quiet week / plugin recently installed | Emit a short empty report; no subagents, no issues |
| Trace expired (shortlived tier) | Window older than retention (~14d) | Note the truncated window in the report; recommend ≤ biweekly cadence |
| \`gh\` unauthenticated | No GitHub CLI auth | Complete Stages A–D; render Stage E as would-be issues + a warning |
| Subagent returns malformed findings | Model drift | Discard that subagent's output, log under Appendix failure modes, continue |
| Artifact publish fails | CSP/size issue | Keep the inline report; note the failure |

## Notes

- LangSmith retention on the shortlived tier is ~14 days: run this at least biweekly (weekly recommended) or the tail of the window silently vanishes. \`--since auto\` + the analysis cursor (Stage F3) keep successive runs contiguous automatically. Re-runs over an overlapping window are safe — the issue fingerprint dedup absorbs repeats on the GitHub side, and the Stage F1 recall-then-evolve path folds recurring insights into their existing engrams instead of duplicating them (best-effort).
- This skill records nothing to \`.luca/\` and is external to the pipeline. Its only persistent state — the analysis cursor — lives in MuninnDB.
- \`.luca/telemetry/*.jsonl\` remains the semantic pipeline record; \`/luca-telemetry-report\` covers it. A trace↔ledger join for per-phase dollar attribution is P3.
`

export const traceInsightsSkill = defineSkill({
    name: 'trace-insights',
    description: `Mine recent LangSmith traces of Claude Code sessions for evidence-backed Luca framework improvement insights: deterministic spend/reliability aggregation, bounded deep-reads of outlier traces via parallel subagents, an inline markdown report (optionally published as an Artifact), auto-logged deduped GitHub issues on luca-framework for user weigh-in, and bounded MuninnDB persistence (pitfall/pattern insight memories with recall-then-evolve dedup, a metric run digest, and a remember-latest-wins analysis cursor). Read-only over LangSmith.

Use when user says "trace insights", "analyze traces", "mine langsmith", "langsmith review", "what do the traces say", or invokes \`/trace-insights\`.

Arguments: \`--since <auto|Nd/Nh|ISO>\` (default auto — resume from the analysis cursor, 7d fallback), \`--repo <substring>\` (default all repos), \`--max-deep-reads <N>\` (default 8), \`--dry-run\`, \`--artifact\`, \`--project <name>\`.`,
    body: BODY,
})
