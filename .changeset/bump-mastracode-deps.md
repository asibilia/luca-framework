---
'@alecsibilia/luca-framework': patch
---

Bump `luca-mastracode` runtime dependencies to their latest releases in the workspace catalog.

Picks up the `claude-opus-4-7` sampling-parameter fix in `@ai-sdk/anthropic@3.0.71` (transitive via `mastracode`), which strips the harness's default `temperature: 1` before calling the Anthropic API. Without this, Opus 4.7 rejects requests with a 400 (`temperature is deprecated for this model`).

Upgraded catalog entries:

- `@mastra/core`: `^1.26.0` → `^1.28.0`
- `@mastra/libsql`: `^1.8.1` → `^1.9.0`
- `@mastra/memory`: `^1.15.1` → `^1.17.1`
- `mastracode`: `^0.15.0` → `^0.15.2`
