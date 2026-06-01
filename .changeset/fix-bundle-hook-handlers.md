---
"@alecsibilia/luca": patch
---

Fix every Claude Code hook firing `Cannot find module '@alecsibilia/luca-core/ledger'` in consumer projects (PreToolUse/PostToolUse errors on every tool call).

The umbrella build copied each hook handler (`pipeline-guard`, `continuation-messages`, `context-refresher`) verbatim into `dist/claude/.claude/hooks/<name>.ts`. Those handlers import private workspace packages (`@alecsibilia/luca-core/{ledger,orchestration,state}`) which are inlined into the umbrella's CLI bundle but are **not** present in a consumer's `node_modules`, so `luca init` laid down hooks that failed to resolve their imports on every fire (failing open, but noisy and non-functional).

The build now **bundles** each handler with `bun build --target bun` instead of copying it, inlining the luca-core dependencies so the emitted handler is self-contained and runs anywhere bun is available. Verified: bundled handlers carry zero bare `@alecsibilia/luca-core` imports and execute cleanly.
