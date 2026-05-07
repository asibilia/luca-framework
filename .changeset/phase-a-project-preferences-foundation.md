---
"@alecsibilia/luca-mastracode": minor
"@alecsibilia/luca-framework": patch
---

Project preferences foundation: consult conventions instead of hardcoded defaults

## What's new

- **projectPreferences Mastra tool** — actions: `consult`, `consult-section`, `seed`, `update` for reading and seeding project conventions (branching strategy, commit convention, PR title format, release tool, issue tracker kind) to local cache.
- **luca-init skill** — probing wizard that runs on first triage when preferences not yet seeded. Detects branching/commit/release conventions from git history, asks user to confirm, seeds to local cache and MuninnDB.
- **ProjectPreferencesSchema (Zod)** — structured type with sections: branching (types, template, default, guarded branches), commits (convention, scopes), pr (titleFormat, baseBranch), release (tool, versionBump), tracker (kind, issuePrefix). All fields optional with sensible defaults.
- **Triage sentinel (Step 1.6)** — new early step in triage mode calls `projectPreferences(action: 'consult', fallback: false)`. If prefs missing and `preferencesSeeded !== true`, invokes `/luca-init` skill. Otherwise proceeds to complexity classification.
- **Vault helper** — moved `sanitizeVaultName()` to shared mastracode package, both packages import from there. `resolveProjectVault()` reads vault name from config with fallback.

## Key design decisions

1. **Loop-safe consult**: after successful seed, `preferencesSeeded: true` flag ensures that if the on-disk preferences file is removed or unparseable, consult returns `DEFAULT_PREFERENCES` instead of `null`, preventing infinite re-init loops.
2. **Tool vs skill division**: Tool manages local cache and `preferencesSeeded` state flag (TS layer). Skill handles all MuninnDB I/O and user interaction (agent layer), since tools cannot invoke MCP.
3. **Backward compat**: `DEFAULT_PREFERENCES.branching.types` matches existing `BRANCH_TYPES` array from ensure-feature-branch.ts; `consult(fallback: true)` returns these defaults when no prefs file exists, so existing repos continue to work.
4. **Security**: all free-form preference fields (branching template, commit scopes, PR title format, etc.) that flow into agent instructions are validated against allowlist regex (alphanumeric + whitespace + structural punctuation, max 64 chars). Prevents prompt injection from malicious git history in cloned repos.

## Files changed

New:
- `packages/luca-mastracode/src/state/vault.ts` — vault resolution helpers
- `packages/luca-mastracode/src/state/project-preferences.ts` — schema, defaults, load/write
- `packages/luca-mastracode/src/tools/project-preferences.ts` — consult/seed/update actions
- `packages/luca-mastracode/skills/luca-init/SKILL.md` — detection and seeding skill
- `packages/luca-mastracode/src/__tests__/project-preferences.test.ts` — comprehensive test coverage including sentinel-loop safety

Modified:
- `packages/luca-framework/src/utils/vault-setup.ts` — re-export sanitizeVaultName from mastracode
- `packages/luca-mastracode/src/tools/tool-manifest.ts` — register projectPreferences with mode-scoped permissions
- `packages/luca-mastracode/src/tools/index.ts` — export projectPreferences tool
- `packages/luca-mastracode/src/instructions/triage.md` — inject Step 1.6 sentinel
- `packages/luca-mastracode/src/state/luca-store.ts` — add preferencesSeeded field to LucaWorkflowState
- `packages/luca-framework/src/commands/init.ts` — document /luca-init skill in help text
- `README.md` — add /luca-init reference

## Review notes

Phase A passed 2 code review iterations:
- Iteration 1: 5 MUST-FIX findings (prompt-injection hardening, type safety, runtime scope guard). All resolved in commit 5443aad92.
- Iteration 2: clean gate, all MUST-FIX verified resolved, no regressions.

Tests: 133/133 pass, tsc clean, rule gate clean. Phase B (branching policy refactor) and Phase C (PR/release/commit conventions) build on this foundation.
