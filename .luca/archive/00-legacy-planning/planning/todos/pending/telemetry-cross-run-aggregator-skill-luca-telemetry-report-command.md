---
title: "Telemetry: cross-run aggregator skill + /luca-telemetry-report command"
area: telemetry
created: 2026-05-12
priority: medium
source: workflow-slim-down
---

## Task

Telemetry: cross-run aggregator skill + /luca-telemetry-report command

---
confidence: medium
externalResearch: false
priority: 3
---

# Context

The capstone of Wave 1. Without aggregation, the JSONL stream is data-rich but
unreadable. This skill reads `.planning/telemetry/*.jsonl` across all runs and
outputs the report we'll use to make slim-down decisions.

## Scope

- New skill `skills/luca-telemetry-report/SKILL.md` + `commands/luca-telemetry-report.md`.
- Aggregate dimensions:
  - Avg + p50/p95 wave duration per phase
  - Top-N token-consuming subagents
  - Recall hit rate + verified-tier hit %
  - Review iteration convergence histogram (1-iter / 2-iter / 3+-iter %)
  - Total tokens per run (when available)
  - Phase-skip rate (skipResearch=true frequency)
- Output: markdown report to `.planning/telemetry/REPORT-<ISO>.md`.
- Flags: `--since <ISO>`, `--last N` (last N runs), `--phase <name>`.

## Acceptance

- Skill runs against a populated telemetry dir, produces a non-empty markdown report.
- `tokensAvailable: false` records get a "data gap" footnote, not silent skip.
- Tests verify report structure with fixture JSONL.

## Depends on

- All four prior telemetry todos.

## Ships as

End of Wave 1. After this lands, we wait, accumulate data, then revisit Wave 2.

