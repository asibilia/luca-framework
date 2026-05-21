# Phase 198: MuninnDB Vault Routing Guard — Context

## Phase Goal

Add a global rule + PreToolUse prompt hook to prevent repo-specific memories from being saved to the default MuninnDB vault.

## Decisions

### 1. Global Rule — `~/.claude/rules/vault-guard.md`

**Decision:** Create a user-global rule file that reinforces vault routing before MuninnDB writes. This is advisory (LLM reads it as context) but always loaded for every project.

**Content approach:** Mirror the write routing heuristic from `.claude/rules/vault-routing.md` but in imperative form — "Before ANY muninn_remember call, resolve the repo vault from `.planning/config.json` and verify the vault parameter matches the concept prefix routing table."

**Location:** `~/.claude/rules/vault-guard.md` (user's home directory, cross-project). This is NOT a project rule — it's a global rule that applies everywhere Luca is used.

### 2. Prompt Hook — PreToolUse `type: "prompt"`

**Decision:** Add a `type: "prompt"` hook on `PreToolUse` matching `mcp__muninn__muninn_remember|mcp__muninn__muninn_remember_batch`.

**Why prompt over command:** A prompt hook uses LLM judgment to evaluate whether the vault parameter matches the concept prefix. This handles ambiguous cases and new concept prefixes without code changes. A command hook would need hardcoded prefix-to-vault mapping.

**Prompt content:** The hook prompt instructs the LLM to:

1. Read the `vault` and `concept` parameters from the pending tool call
2. Check concept prefix against the write routing table (repo-scoped prefixes → repo vault, cross-cutting prefixes → default vault)
3. Resolve the expected repo vault from `.planning/config.json` `muninn.vault` field
4. If misrouted: block with an error message explaining the correct vault
5. If correctly routed: allow the call to proceed

### 3. Init Wiring

**Decision:** Add the prompt hook to `packages/luca-framework/templates/hooks/settings-hooks.json` under the PreToolUse event. The `luca init` command already merges this template into the user's project-level settings.json.

**Dogfood:** The current repo's `.claude/settings.json` is generated output. After adding to the template, running `bun run build:all` will deploy it to `.claude/settings.json`. Do NOT edit `.claude/settings.json` directly.

### 4. Existing Hooks Compatibility

**Decision:** The new prompt hook is added as a separate entry in the PreToolUse array, alongside the existing Bash-matched command hooks (pre-commit-gate, pre-commit-drift-check). It uses a different matcher (`mcp__muninn__muninn_remember|mcp__muninn__muninn_remember_batch`) so there is no conflict.

## Deferred Ideas

- Command hook variant as a fallback for non-LLM environments (not needed now — all Luca consumers are LLM-powered)
- Recall-side validation hook (validate vault parameter on reads too) — separate phase if needed

## Scope

- 1 new global rule file (`~/.claude/rules/vault-guard.md`)
- 1 template modification (`templates/hooks/settings-hooks.json`)
- 1 todo move (pending → done)
- Generated output rebuild via `bun run build:all` (user runs manually)
