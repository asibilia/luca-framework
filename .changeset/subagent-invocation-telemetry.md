---
"@alecsibilia/luca-mastracode": patch
---

Add subagent invocation telemetry (`subagent.invoke` / `subagent.complete` kinds).

- New `record-subagent` workflowState action with Zod-validated schema (role, correlationId, tokens, durationMs, success, model)
- `clampTokens` helper: non-finite/negative/>10M values coerced to null; zero preserved
- Prose instrumentation in all 5 spawn-site instruction files (execute, architect, research, review, finalize)
- `shared-prefix.ts`: subagents self-report usage via `<!-- usage: {...} -->` comment
- Length caps on role (64), correlationId (128), model (64) to preserve PIPE_BUF atomicity
- 8 new tests (record-subagent action) + 5 presence-scan tests (subagent-telemetry-prose.test.ts)
