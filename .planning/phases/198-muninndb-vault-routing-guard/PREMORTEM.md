# Phase 198: Pre-Mortem Risk Brief

**Complexity:** SIMPLE | **Appetite:** Small

## Risks

### 1. Prompt hook type unsupported by canonical registry (HIGH)

The hook build pipeline (`canonicalHookRegistry`, `config-generators.ts`, `platform-adapters.ts`) only generates `type: "command"` entries. A `type: "prompt"` hook has no schema field, no adapter path, and no code path in `generateClaudeHooksConfigFromCanonical()`.

**Mitigation:** Before writing any hook code, trace the full generation pipeline from `canonicalHookRegistry` through `config-generators.ts` to `.claude/settings.json`. Either extend `CanonicalHookSchema` to support `type: "prompt"` or add the prompt hook entry directly to the settings-hooks.json template with a clear comment that it bypasses the canonical registry.

### 2. Template vs canonical registry scope ambiguity (MEDIUM)

`.claude/settings.json` contains hooks NOT present in `settings-hooks.json` (snapshot-sync, session-compact-restore, etc.). The template is not the sole source — the canonical registry generates additional hooks. Editing only the template may result in the prompt hook being overwritten.

**Mitigation:** Verify the actual generation pipeline before choosing the insertion point. If the canonical registry is the true source, the hook must be added there.

### 3. Global rule staleness (LOW)

The global rule at `~/.claude/rules/vault-guard.md` mirrors the write routing table from `vault-routing.md`. No drift-check covers user-global files. If the routing table changes, the global rule becomes stale.

**Mitigation:** Document in the rule file that it mirrors vault-routing.md and must be manually kept in sync. Add a reminder comment in vault-routing.md noting the global rule dependency.

## Plan Constraints

- Trace the hook generation pipeline BEFORE deciding where to inject the prompt hook
- Do NOT run `bun run build:all` during the session (crashes Claude Code)
- Include manual verification step for user to run after session
