---
"@alecsibilia/luca-mastracode": patch
---

Refactor luca-mastracode internal module layout from the DX audit. No behavior changes — pure mechanical extraction.

`src/index.ts` had grown to 1,869 lines containing nine distinct concerns despite the convention that `index.ts` should only re-export. The entry point is now a 62-line shim (executable boot sequence + public API barrel), with implementation split across:

- `branding.ts` — `loadBranding`, `resolveLucaVersion`
- `rules-loader.ts` — alwaysApply rule frontmatter parsing/loading
- `agent-constraints.ts` — `CORE_OPERATING_RULES`, `HARD_CONSTRAINTS`, `RECENCY_REMINDERS`, `getAgentConstraints`
- `create-static-agent.ts` — Mode agent factory
- `install-bundled-assets.ts` — `installSlashCommands` / `installSkills` / `installRules`
- `continuation-messages.ts` — `buildContinuationMessage`
- `mastracode-config.ts` — Settings path + pack-model resolution
- `tui-text-helpers.ts` — ANSI / grapheme / visible-width helpers
- `launch.ts` — `main()` orchestration + monkey-patches

Two oversized tools were also split:

- `tools/run-checks.ts` (484 → 169 lines) → `check-runner.ts` (subprocess execution), `check-parsers.ts` (fingerprinting), `check-convergence.ts` (iteration state tracking)
- `tools/repo-cleanup.ts` (315 → 197 lines) → `cleanup-report.ts` (shadow-scan output validation), `cleanup-fixes.ts` (delete/move/gitignore remediations)

Finally, the four duplicate-named module pairs (`confidence-journal`, `session-ledger`, `verification-result`, `shadow-scanner`) now carry 2-line header comments on the wrapper file pointing back to the data layer, so it's instantly obvious which side owns the schemas vs. the tool/subagent definition.
