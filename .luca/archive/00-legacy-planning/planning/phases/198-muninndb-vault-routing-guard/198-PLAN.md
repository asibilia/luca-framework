---
phase: 198
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 198 Plan 1: MuninnDB Vault Routing Guard

## Objective

Prevent repo-specific MuninnDB memories from being misrouted to the default vault by adding two complementary safeguards: a global rule that reinforces vault routing before writes, and a PreToolUse prompt hook that intercepts and validates muninn_remember tool calls at runtime.

> Appetite: Small (50,000 token ceiling)

## Context

@.claude/rules/vault-routing.md — Write routing heuristic (source of truth for concept prefix -> vault mapping)
@packages/luca-framework/templates/hooks/settings-hooks.json — Template for luca init hook deployment
@scripts/build-compile.ts — Build pipeline that merges canonical hooks into settings.json
@.planning/phases/198-muninndb-vault-routing-guard/198-CONTEXT.md — Phase decisions
@.planning/phases/198-muninndb-vault-routing-guard/RESEARCH.md — Hook pipeline trace and Option B recommendation
@.planning/todos/pending/muninndb-vault-routing-guard.md — Todo to move to done/

## Tasks

### Wave 1: Create Artifacts (sequential within wave)

#### 1. Create global vault-guard rule

**Type:** auto
**TDD:** false
**Depends on:** none

Create `~/.claude/rules/vault-guard.md` — a user-global rule that reinforces vault routing before any MuninnDB write. This is advisory (LLM reads it as context) but always loaded for every project.

**Content requirements:**

- Imperative format: "Before ANY `muninn_remember` or `muninn_remember_batch` call, you MUST..."
- Include the full write routing table from vault-routing.md (concept prefix -> target vault)
- Include vault resolution steps (read `.planning/config.json` `muninn.vault` field, fallback to `LUCA_MUNINN_VAULT` env var, fallback to `"default"`)
- Include explicit examples of correct vs incorrect routing
- Include a note that this rule mirrors `vault-routing.md` and must be manually kept in sync
- Use the same markdown structure as existing global rules (no frontmatter — global rules do not use frontmatter)

**File to create:**

- `~/.claude/rules/vault-guard.md`

**Verification:**

- File exists at `~/.claude/rules/vault-guard.md`
- Contains the full write routing table with all concept prefixes
- Contains vault resolution steps
- Contains both correct and incorrect examples
- Contains sync reminder referencing vault-routing.md

#### 2. Add PreToolUse prompt hook to settings-hooks.json template

**Type:** auto
**TDD:** false
**Depends on:** none

Add a new entry to the `PreToolUse` array in `packages/luca-framework/templates/hooks/settings-hooks.json`. This is a `type: "prompt"` hook (not `type: "command"`) that fires when `mcp__muninn__muninn_remember` or `mcp__muninn__muninn_remember_batch` is about to be called.

**Hook JSON structure:**

```json
{
  "matcher": "mcp__muninn__muninn_remember|mcp__muninn__muninn_remember_batch",
  "hooks": [
    {
      "type": "prompt",
      "prompt": "<vault routing validation prompt>"
    }
  ]
}
```

**Prompt content requirements:**
The prompt instructs the LLM to:

1. Read the `vault` and `concept` parameters from the pending muninn_remember tool call
2. Resolve the expected repo vault: read `.planning/config.json` field `muninn.vault` (if the file exists); fall back to env var `LUCA_MUNINN_VAULT`; fall back to `"default"`
3. Check concept prefix against write routing table:
   - Repo-scoped prefixes (`session:*`, `brain:project-*`, `metric:*`, `version:*`, `milestone:*`) MUST target the repo vault, NOT `"default"` (unless the repo vault IS `"default"`)
   - Cross-cutting prefixes (`pattern:*`, `pitfall:*`, `preference:*`, `brain:user-*`, `procedure:*`, `process:*`) MUST target `"default"`
4. If misrouted: respond with an error message explaining the correct vault and block the call
5. If correctly routed (or if vault resolution falls back to `"default"` making both vaults the same): allow the call to proceed

**File to edit:**

- `packages/luca-framework/templates/hooks/settings-hooks.json`

**Verification:**

- The PreToolUse array contains a new entry with matcher `mcp__muninn__muninn_remember|mcp__muninn__muninn_remember_batch`
- The hook type is `"prompt"` (not `"command"`)
- The prompt contains the write routing table
- The prompt contains vault resolution logic
- The prompt contains block/allow decision criteria
- Existing PreToolUse hooks (Bash matcher) are not modified
- JSON is valid (parseable)

#### 3. Add prompt hook to build-compile.ts post-merge step

**Type:** auto
**TDD:** false
**Depends on:** 2

The dogfood path generates `.claude/settings.json` from the canonical hook registry, which only supports `type: "command"` hooks. The prompt hook must be injected after the canonical hooks are merged.

In `scripts/build-compile.ts`, after Step 3 (where `existingSettings.hooks` is populated from the settings hooks fragment), add the vault-guard prompt hook to the `PreToolUse` array if it is not already present. This ensures the dogfood `.claude/settings.json` includes the prompt hook even though the canonical registry cannot represent it.

**Implementation approach:**

- After line 121 (where `existingSettings` is fully assembled with hooks and statusLine), before writing to `claudeEntries`:
  - Parse the hooks object
  - Find or create the `PreToolUse` array
  - Check if a vault-guard prompt hook already exists (by checking for matcher containing `muninn_remember`)
  - If not present, append the vault-guard prompt hook entry (same JSON as in settings-hooks.json)
  - This is a hardcoded addition, clearly commented as bypassing the canonical registry

**Important:** The prompt text must be identical between settings-hooks.json (Task 2) and this injection. Extract it as a constant string or duplicate it with a clear `// SYNC:` comment linking both locations.

**File to edit:**

- `scripts/build-compile.ts`

**Verification:**

- The code adds the vault-guard prompt hook to PreToolUse after canonical hooks merge
- A comment explains that this bypasses the canonical registry (which lacks prompt hook support)
- The prompt text matches what was added to settings-hooks.json in Task 2
- TypeScript type-checks (`bunx --bun tsc --noEmit`)

### Wave 2: Cross-Reference and Cleanup

#### 4. Add sync reminder to vault-routing rule source

**Type:** auto
**TDD:** false
**Depends on:** 1

Add a note at the bottom of the vault-routing rule **source file** (`src/rules/general/vault-routing.rule.ts`) documenting the dependency: "The global rule `~/.claude/rules/vault-guard.md` mirrors the Write Routing Heuristic table above. If the table changes, update the global rule manually."

**IMPORTANT:** Do NOT edit `.claude/rules/vault-routing.md` — it is generated output. Edit the TypeScript source file instead.

**File to edit:**

- `src/rules/general/vault-routing.rule.ts`

**Verification:**

- `src/rules/general/vault-routing.rule.ts` contains the sync reminder text in its content string
- The note specifies that manual sync is required when the write routing table changes
- TypeScript type-checks (`bunx --bun tsc --noEmit`)

#### 5. Move todo from pending to done

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3

Move `.planning/todos/pending/muninndb-vault-routing-guard.md` to `.planning/todos/done/muninndb-vault-routing-guard.md`.

**Files to move:**

- `.planning/todos/pending/muninndb-vault-routing-guard.md` -> `.planning/todos/done/muninndb-vault-routing-guard.md`

**Verification:**

- File no longer exists at `.planning/todos/pending/muninndb-vault-routing-guard.md`
- File exists at `.planning/todos/done/muninndb-vault-routing-guard.md`
- Content is unchanged

## Verification

1. **Global rule exists:** `~/.claude/rules/vault-guard.md` is present and contains the write routing table
2. **Template updated:** `packages/luca-framework/templates/hooks/settings-hooks.json` is valid JSON with the new PreToolUse prompt hook entry
3. **Build pipeline updated:** `scripts/build-compile.ts` injects the vault-guard prompt hook into the dogfood settings.json
4. **Type-check passes:** `bunx --bun tsc --noEmit` succeeds with no new errors
5. **Cross-reference:** vault-routing.md notes the vault-guard.md dependency
6. **Todo moved:** pending -> done
7. **Manual post-session step:** User must run `bun run build:all` after this session to regenerate `.claude/settings.json` with the new prompt hook (do NOT run during session -- crashes Claude Code)

## Success Criteria

- Repo-scoped concept prefixes (`session:*`, `brain:project-*`, `metric:*`, `version:*`, `milestone:*`) trigger a vault validation check before the MuninnDB write proceeds
- Cross-cutting concept prefixes (`pattern:*`, `pitfall:*`, `preference:*`, `brain:user-*`, `procedure:*`, `process:*`) are validated to target the `"default"` vault
- Both safeguards (rule + hook) are deployed for new projects via `luca init` and for dogfood via `bun run build:all`
- No existing hooks or build pipeline behavior is broken

## Output Specification

- `~/.claude/rules/vault-guard.md` — New global rule (user home directory, cross-project)
- `packages/luca-framework/templates/hooks/settings-hooks.json` — Modified template with prompt hook
- `scripts/build-compile.ts` — Modified build script with prompt hook injection
- `src/rules/general/vault-routing.rule.ts` — Modified with sync reminder (source file, not generated output)
- `.planning/todos/done/muninndb-vault-routing-guard.md` — Moved from pending

## Constraints

- Do NOT run `bun run build:all` during this session (crashes Claude Code)
- Do NOT create test files (no-tests rule)
- Do NOT edit `.claude/settings.json` directly (generated file)
- Do NOT modify the canonical hook registry schema (out of scope for SIMPLE phase)
