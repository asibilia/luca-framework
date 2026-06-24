# Pre-Mortem Risk Brief — Phase 2

**Complexity:** SIMPLE | **Risks:** LOW

1. **z.function() TypeScript compatibility** — `guard` and `executeStep` use `z.function()` which has limited TypeScript inference. Mitigation: exact code provided in todos; typecheck will catch issues.
2. **Barrel export completeness** — index.ts must re-export all 25+ schemas and types. Mitigation: todos provide exact export lists; verify with `bunx --bun tsc --noEmit`.
3. **Import path .ts extension** — barrel uses `.ts` extension in from paths. Mitigation: project uses `verbatimModuleSyntax` + bundler moduleResolution; .ts imports are correct.
