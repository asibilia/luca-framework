/**
 * trace-insights skill — LangSmith trace mining for luca-framework improvement.
 *
 * Periodically reads recent LangSmith traces of real Claude Code sessions
 * (captured by the langsmith-tracing plugin), aggregates them deterministically,
 * deep-reads a bounded set of outlier traces via subagents, and emits an
 * evidence-backed insight report. High-confidence actionable findings are
 * auto-logged as GitHub issues on luca-framework for user weigh-in.
 *
 * P1 scope (design: dad-xstate-migration session, 2026-07-16): Stages A–D +
 * GitHub issue feed. MuninnDB persistence (pitfall/pattern/metric/cursor
 * memories) is P2 and is explicitly FORBIDDEN in this version's scope guard.
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `# trace-insights Skill

Mine recent LangSmith traces of Claude Code sessions for evidence-backed insights into how the Luca framework can be improved — token waste, loops, failures, friction. A self-hosted, sampled, cheap alternative to LangSmith's Engine feature. Findings feed a markdown report and (unless \`--dry-run\`) auto-logged GitHub issues on the luca-framework repo for user weigh-in.

## Scope guard — read first

This skill is **read-only over LangSmith and the repository**, with exactly two permitted write surfaces:

1. Scratchpad files (fetched trace JSON, aggregation scripts, intermediate results).
2. \`gh issue create\` / \`gh label create\` on the **luca-framework** repo only, only with the \`trace-insights\` label, and only after the dedup search (Stage E).

The following operations are FORBIDDEN inside this skill (P1). Do not perform them under any circumstance:

- \`mcp__muninn__muninn_remember\`, \`mcp__muninn__muninn_remember_batch\`, \`mcp__muninn__muninn_evolve\`, \`mcp__muninn__muninn_forget\`, \`mcp__muninn__muninn_state\`, \`mcp__muninn__muninn_consolidate\` (MuninnDB persistence is P2)
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
| \`--since <window>\` | duration or ISO date | \`7d\` | \`^\\d+[dh]$\` or \`^\\d{4}-\\d{2}-\\d{2}\` |
| \`--repo <substring>\` | string | unset (**all repos**) | non-empty; matched against trace cwd metadata |
| \`--max-deep-reads <N>\` | integer | 8 | \`N >= 1 && N <= 24\` |
| \`--dry-run\` | boolean | false | report only; no GitHub issues created |
| \`--artifact\` | boolean | false | additionally publish the report as a private Artifact page |
| \`--project <name>\` | string | \`$CC_LANGSMITH_PROJECT\` | non-empty |

If validation fails, abort with a clear error message — do not silently continue with defaults.

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

## Summary to caller

After the report, print one block:

- Traces in window / deep-read / dropped
- Findings by confidence tier
- Issues created / deduped-skipped (or "dry-run: N would-be issues")
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

- LangSmith retention on the shortlived tier is ~14 days: run this at least biweekly (weekly recommended) or the tail of the window silently vanishes. Re-runs over an overlapping window are safe — the issue fingerprint dedup absorbs repeats. (An analysis cursor memory arrives in P2.)
- This skill records nothing to \`.luca/\` and is external to the pipeline.
- \`.luca/telemetry/*.jsonl\` remains the semantic pipeline record; \`/luca-telemetry-report\` covers it. A trace↔ledger join for per-phase dollar attribution is P3.
`

export const traceInsightsSkill = defineSkill({
    name: 'trace-insights',
    description: `Mine recent LangSmith traces of Claude Code sessions for evidence-backed Luca framework improvement insights: deterministic spend/reliability aggregation, bounded deep-reads of outlier traces via parallel subagents, an inline markdown report (optionally published as an Artifact), and auto-logged deduped GitHub issues on luca-framework for user weigh-in. Read-only over LangSmith; no MuninnDB writes (P1).

Use when user says "trace insights", "analyze traces", "mine langsmith", "langsmith review", "what do the traces say", or invokes \`/trace-insights\`.

Arguments: \`--since <7d|ISO>\` (default 7d), \`--repo <substring>\` (default all repos), \`--max-deep-reads <N>\` (default 8), \`--dry-run\`, \`--artifact\`, \`--project <name>\`.`,
    body: BODY,
})
