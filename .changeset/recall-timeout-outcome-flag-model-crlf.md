---
"@alecsibilia/luca": patch
---

Four backlog todos batched into one PR:

1. **Pre-invoke MuninnDB recall directive** — `SUBAGENT_SHARED_PREFIX` now includes a `## Pre-Invoke Memory Recall` section instructing subagents to query MuninnDB once at startup for relevant prior learnings. Hedged so non-MCP subagents (plan-reviewer, shadow-scanner) treat it as a no-op.
2. **Researcher hang-timeout** — `research.md` parallel-batch protocol now requires the orchestrator to capture `Date.now()` per spawn, compute elapsed time, and emit `record-subagent complete` with `outcome: "timeout"` for any researcher exceeding 60s. Synthesis proceeds with partial results when at least 3/5 researchers returned; otherwise the wave is marked STALLED.
3. **Outcome enum aggregator flag-list** — `skills/luca-telemetry-report/SKILL.md` Subagent Costs section now flags the full non-success terminal set: `crashed`, `killed`, `timeout` (hard failures) and `completed_no_usage`, `completed_partial_parse` (soft failures — subagent finished but usage telemetry malformed).
4. **Model-field CR/LF guard + stale-example fix** — `record-subagent` `model` field now enforces `/^[^\r\n\t]+$/` regex parity with `role` and `correlationId` (CWE-117 log-injection defense). `execute.md` example updated from stale `claude-opus-4-5` to canonical `anthropic/claude-opus-4-7`.

New regression tests: parametric guard over all 6 outcome enum values; model CR/LF rejection cases; pre-invoke recall presence in shared-prefix; total-prefix size guard (<4000 chars) to catch future bloat.
