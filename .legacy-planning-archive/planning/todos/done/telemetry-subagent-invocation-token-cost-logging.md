---
title: "Telemetry: subagent invocation + token cost logging"
area: telemetry
created: 2026-05-12
priority: high
source: workflow-slim-down
---

## Task

Telemetry: subagent invocation + token cost logging

---
confidence: medium
externalResearch: false
priority: 1
---

# Context

Subagents dominate token spend. To validate the slim-down hypothesis (that
collapsing triage/research/architect saves significant tokens), we need
per-subagent telemetry across many runs.

## Scope

- Wrap subagent execution to capture: `{ runId, phase, agentType, startedAt, durationMs, inputTokens?, outputTokens?, success, errorClass? }`.
- Append to same `.planning/telemetry/<run-id>.jsonl` stream.
- If token counts unavailable from the harness, capture `tokensAvailable: false` so reports can flag the gap.
- Record both forked and non-forked subagents.

## Acceptance

- Every `subagent` tool call emits a telemetry record on completion.
- Failed subagents still emit a record with `success: false` + error classification.
- Tests verify event emission + schema.

## Depends on

- Phase-duration telemetry todo (shares JSONL writer + ROOT_WHITELIST_DIRS change).

