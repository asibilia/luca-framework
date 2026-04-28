---
'@alecsibilia/luca-framework': patch
'@alecsibilia/luca-mastracode': patch
---

docs: correct READMEs across the monorepo

- Rewrite `packages/luca-framework/README.md` (the npm-facing README) — replace fake `bun x create-luca` install command with the real `bun add -g @alecsibilia/luca-framework`, align the description with what the CLI actually does, and add a complete CLI Reference (`init`, `vault:init`, `run`, `doctor`, `version`).
- Fix root `README.md` tool count (10 → 11, added missing `confidenceJournal`), document the previously-missing `luca doctor` and `luca version` commands, and clarify the difference between global `luca run` and in-repo `bun run mastracode`.
- Replace `docs/README.md` with an index that matches actual file contents (most prior links pointed to non-existent docs).
- Update `packages/luca-studio/lib/README.md` to include the 6 files added since it was last updated (`compile-events.ts`, `file-watcher.ts`, `git-types.ts`, `muninn-helpers.ts`, `observation-helpers.ts`, `request-guards.ts`).
