# Trace-Insights Weekly Cadence Runbook

> **Status:** Active
> **Audience:** Operators running `/trace-insights` on a schedule
> **Related:** `packages/luca-tools/src/artifacts/skills/trace-insights/` (skill), `packages/luca-cli/src/init/helpers/enrich-trace-metadata.ts` (capture-side enrichment)

This runbook documents the weekly `/trace-insights` cadence: how to set up
the scheduled routine, how to inspect and disable it, and the guardrails
that keep it cheap and within trace-retention limits.

Creating the routine is a **post-merge operator step** — it is performed
by hand in Claude Code, not by the repo pipeline (a live `/schedule`
routine cannot be created or verified from CI).

---

## Prerequisites

- `TRACE_TO_LANGSMITH: "true"` in the `env` block of `~/.claude/settings.json`
  (the global trace gate).
- Per-repo metadata enrichment in place: `luca init` (Step 5) merges
  `repo` + `luca_version` into the target repo's
  `.claude/settings.local.json` `CC_LANGSMITH_METADATA` whenever the gate
  is on. This is what makes traces attributable per repo — re-run
  `luca init` in a repo if its traces show up without a `repo` key.
- A LangSmith project receiving traces (verify a few recent runs exist
  before scheduling — Stage A of the skill needs data to analyze).

## Setting up the weekly routine (operator step)

From a Claude Code session:

```
/schedule create "trace-insights weekly" --cron "0 9 * * 1" --prompt "/trace-insights"
```

- **Cadence: weekly.** See [Guardrails](#guardrails) — weekly keeps every
  analysis window comfortably inside short-lived trace retention.
- Pick a working hour you are around (the example above is Monday 09:00)
  so Stage C escalations can be reviewed the same day.
- One routine per operator machine is enough; the skill analyzes traces
  across every repo that enriches its metadata.

## Inspecting the routine

```
/schedule list                      # confirm the routine exists + next fire time
/schedule show "trace-insights weekly"   # cron, prompt, run history
```

After each run, review the skill's output summary. Stage A–B findings are
aggregate metadata reads; Stage C output flags specific traces worth a
deep dive.

## Disabling or removing the routine

To pause or permanently disable the cadence:

```
/schedule pause "trace-insights weekly"    # temporary — keeps the definition
/schedule delete "trace-insights weekly"   # permanent removal
```

Disable the cadence when tracing is turned off globally (set
`TRACE_TO_LANGSMITH` to anything other than `"true"`, or remove it) —
otherwise the weekly run wastes a Stage A pass over an empty window.

## Guardrails

- **Cadence vs retention:** short-lived traces are retained for roughly
  14 days. A weekly run (< ~14d between runs) guarantees every trace is
  seen by at least one analysis window before it expires. Do NOT stretch
  the cadence beyond two weeks — traces would silently age out unseen.
- **Per-run cost:** Stage A and Stage B are metadata/aggregate reads —
  effectively free. Stage C spawns ≈ 8 subagents for deep trace analysis;
  expect low single-digit dollars per run when Stage C triggers. Weekly,
  that is a bounded, predictable spend.
- **Cost spike?** If a run costs noticeably more, check whether Stage C
  is triggering on every window — that usually means a recurring problem
  pattern worth fixing at the source rather than re-analyzing weekly.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Traces missing `repo` / `luca_version` | Repo never re-ran `luca init` after enrichment shipped | Re-run `luca init` in that repo (gate must be on) |
| No traces in the window | `TRACE_TO_LANGSMITH` gate off, or no sessions ran | Verify the `env` block in `~/.claude/settings.json`; pause the routine if tracing is intentionally off |
| Enrichment skipped with a parse warning | Malformed `.claude/settings.local.json` in the repo | Repair the JSON by hand, then re-run `luca init` (enrichment fails open and never rewrites unparseable files) |
