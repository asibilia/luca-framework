---
'@alecsibilia/luca-mastracode': patch
'@alecsibilia/luca-framework': patch
---

Upgrade default model from Claude Opus 4.6 to Claude Opus 4.7 across all model routing and mode configurations.

**Changed files:**
- `model-routing.ts` — `capable` tier now resolves to `anthropic/claude-opus-4-7`
- `modes/build.ts` — `resolveBuildModel()` and `defaultModelId`
- `modes/architect.ts` — `defaultModelId`
- `modes/execute.ts` — `defaultModelId`
