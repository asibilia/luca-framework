---
"@alecsibilia/luca-mastracode": minor
"@alecsibilia/luca-framework": minor
---

Refactor: zero-footprint bundled assets — commands/skills are now symlinked from the package instead of copied into the user's repo, and rules are read directly from the package with no install step at all.

**Before**: every fresh `luca run` copied ~60 framework files (commands/, skills/, rules/) into the user's `.mastracode/` directory. Updates required re-running luca to propagate.

**After**: only 2 symlinks land in `.mastracode/` (commands → `<pkg>/commands`, skills → `<pkg>/skills`). Rules read from `<pkg>/rules/` directly via the `rules-loader.ts` fallback. Updates are automatic via `npm update -g`.

- `installRules()` removed entirely — `loadAlwaysApplyRules()` already falls back to the bundled rules dir when `.mastracode/rules/` doesn't exist
- `installSlashCommands()` and `installSkills()` rewritten to use `symlinkSync` with idempotent re-runs and migration from legacy real-directory installs
- Windows: uses `'junction'` symlink type for directories (no admin/Developer Mode required)
- Failure modes wrapped with `console.warn` so install errors don't abort startup

Toward zero-footprint bundled assets (#213). Upstream limitations that prevent fully eliminating the symlinks are tracked in #173.
