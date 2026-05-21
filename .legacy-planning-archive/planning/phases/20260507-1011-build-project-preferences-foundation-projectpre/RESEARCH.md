# Research: Phase A — Project Preferences Foundation

## Summary

New `projectPreferences` Mastra tool + `luca-init` skill + Zod schema. Codebase has clear patterns for tool/skill addition and config-loading. Three architectural debts (no vault TS helper, no shared mode prefix, no sentinel template) require new patterns. Critical risks are sentinel infinite loop (entity-index lag) and vault mismatch — both mitigated via `preferencesSeeded` state flag, `fallback: true` consult mode, and `op_id` on seed.

## Scope

**Mastracode package** at `packages/luca-mastracode/`:
- New tool file: `src/tools/project-preferences.ts`
- Tool registration: `src/tools/tool-manifest.ts` (TOOL_MANIFEST + add to MODE_PERMISSIONS via inversion)
- Tool export: `src/tools/index.ts`
- New schema/loader: `src/state/project-preferences.ts` (Zod schema + `loadProjectPreferences()` helper)
- New helper (fixes D1 debt): `src/state/vault.ts` exposing `resolveProjectVault()` reading `.planning/config.json → muninn.vault`, fallback `"default"`, sanitized via existing `sanitizeVaultName()` (`packages/luca-framework/src/utils/vault-setup.ts:108-114` — duplicate or share)
- New skill: `packages/luca-mastracode/skills/luca-init/SKILL.md`
- Sentinel injection: `src/instructions/triage.md` (only triage triggers init); `src/subagents/shared-prefix.ts` (subagent reminder if needed)
- Tests: `src/__tests__/project-preferences.test.ts` following `workflow-state-actions.test.ts` mocking pattern

**Framework package** at `packages/luca-framework/`:
- CLI docs: `src/commands/init.ts` (or sibling) updated to mention `/luca-init` skill
- Existing `vault-init` flow may need cross-reference

**Cross-package**: `.planning/luca-state.json` schema in `src/state/luca-store.ts:113` already accepts arbitrary keys → add `preferencesSeeded: boolean` without schema change

**Blast radius**: triage instruction only (sentinel binding). Phase B/C consult callers added later (out of Phase A scope).

## Architecture

**Tool pattern** (canonical example: `manage-todos.ts`):
```ts
export const projectPreferencesTool = createTool({
  id: 'project-preferences',
  description: '...',
  inputSchema: z.object({
    action: z.enum(['consult', 'consult-section', 'seed', 'update']),
    section: z.string().optional(),
    fallback: z.boolean().optional(),
    payload: z.unknown().optional(),
  }),
  outputSchema: z.object({ success: z.boolean(), preferences: z.unknown().optional(), message: z.string().optional() }),
  execute: async (inputData) => { switch(action) { ... } },
})
```
- Flat `z.object` (NOT `z.discriminatedUnion` — Anthropic API rejects, see `workflow-state.ts:246-254`)
- Per-action `z.literal('action')` schemas + `parseAction()` helper for strict validation (`workflow-state.ts:391-403`)
- Error shape: `{ success: false, message: string }` (preferred convention used by 8+ tools)

**Tools cannot call MuninnDB** (no MCP client in TS layer). Tool actions return *instructions* the agent executes — OR the tool reads/writes config files only. This forces a design choice: see Open Question #1.

**Manifest registration** (`tool-manifest.ts:59-235`): add entry with `record_key: 'projectPreferences'` + `modes: { ... }`. `MODE_PERMISSIONS` auto-inverts. `buildModeTools()` narrows action enum so LLM cannot see disallowed actions.

**Skill loading**: `installSkills()` in `install-bundled-assets.ts` symlinks `packages/luca-mastracode/skills/` → `<cwd>/.mastracode/skills/`. New skill auto-discovered, no registration step.

**Instruction assembly**: mode instructions = `src/instructions/<mode>.md` + state-context appended in `buildXxxInstructions()`. Subagent shared prefix in `shared-prefix.ts` (subagents only; modes have no shared prefix — D2 debt).

## Patterns

**Config-load template** (replicate for `loadProjectPreferences()`):
```ts
// pattern: src/state/shadow-scanner.ts:156-167 + src/integration/branding.ts:18-33
const configPath = CONFIG_PATH()
if (!existsSync(configPath)) return Schema.parse({})
try {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
  return Schema.parse(raw.section ?? {})
} catch { return Schema.parse({}) }
```

**Naming**:
- File: `project-preferences.ts` (kebab-case)
- Tool ID: `'project-preferences'`
- Export: `projectPreferencesTool`
- Manifest key: `project_preferences`, record_key: `projectPreferences`
- Schema: `ProjectPreferencesSchema`, type `ProjectPreferences = z.infer<typeof ProjectPreferencesSchema>`

**Zod schema rules** (Risk 4 mitigation): every field `.optional().default(...)`; embed `schemaVersion: z.literal(1).default(1)`; never overwrite on re-seed (merge).

**Skill SKILL.md** (`gh-prepare`/`bug-diagnose` pattern):
```yaml
---
name: luca-init
description: >
  Repo-probing wizard that seeds projectPreferences in MuninnDB.
  Use when user says "init luca", "set up preferences", or invokes /luca-init.
  Auto-invoked when projectPreferences.consult returns null.
---
```
Body: H2 phases — Probe (filesystem-first per grill-me principle), Confirm with user (ask_user), Seed via mcp__muninn__muninn_remember.

**MuninnDB calls in skill prose**:
```
mcp__muninn__muninn_remember(
  vault: "<repo_vault>",  // resolve from .planning/config.json muninn.vault, fallback "default"
  op_id: "project-preferences:<repo_vault>",  // C3: idempotency
  type: "project_preferences",
  entities: [{ name: "<repo-id>", type: "project" }],
  tags: ["preferences", "project-config", "luca", "convention"],
  content: "<JSON of ProjectPreferencesSchema>",
  summary: "<natural-language summary for semantic match>"
)
```

**Probing heuristics** (luca-init wizard):
- Branching: scan `git branch -r` for prefix patterns (feat/, feature/, ENG-*, PT-*)
- Commits: read recent `git log --oneline -50` for conventional commit format
- PR/release: read `.changeset/config.json`, look for prior PR titles via `gh pr list`
- Tracker: detect Linear/Jira/GitHub from issue refs in commits
- Always show detected → require user confirmation (Risk 9 mitigation)

## Dependencies

- `@mastra/core` — `createTool` (verify version in package.json before coding)
- `zod` — schemas
- pnpm monorepo
- MuninnDB integration mode: **(c) tool-call passthrough** — agent calls `mcp__muninn__*`, code does NOT
- Skill loading: symlink at `installSkills()` startup; published-package mechanics same

## Risks

**P0 CRITICAL**:
1. **Sentinel infinite loop** — entity index update after `muninn_remember` not synchronous. seed → consult → null → re-seed loop. Mitigation: persist `preferencesSeeded: true` to `luca-state.json` (existing `[key:string]: unknown`); sentinel checks state BEFORE MuninnDB call. In-process flag + 200ms backoff retry.
2. **Vault mismatch** — 16 prose duplications; divergence permanently breaks consult. Mitigation: single `resolveProjectVault()` TS helper used by both seed and consult sides.

**P1 HIGH**:
3. **Cache staleness** — session cache + mid-session update. Mitigation: file-mtime cache-bust via `stat()`; explicit `invalidate` action; `update` invalidates internally.
4. **Schema evolution** — new fields cause Zod parse errors on old memories → silent overwrite. Mitigation: all fields `.optional().default(...)`; `schemaVersion`; merge-on-seed never replace.
5. **Auto-invocation in execute mode** — interactive wizard deadlocks headless run. Mitigation: `consult(fallback: true)` returns hardcoded defaults; sentinel binds ONLY to triage entry. Phase B/C always pass `fallback: true`.
6. **Backward compat** — existing repos no prefs. Mitigation: `consult(fallback: true)` returns defaults matching current hardcoded behavior (e.g., `BRANCH_TYPES` from `ensure-feature-branch.ts:107-116`). Triage announces wizard option once.

**P2**:
7. **Concurrent seed race** — Mitigation: `op_id: "project-preferences:<vault>"` on `muninn_remember` (pattern: `postmortem.ts:425`).
8. **Test coverage** — Mitigation: mock `mcp__muninn__*` per `workflow-state-actions.test.ts` pattern; cover all 4 actions, sentinel short-circuit, schema migration.

**P3-P4** (low): probing misclassification (advisory + confirm), vault path traversal (`sanitizeVaultName` exists), perf (session cache solves).

## Recommendations

1. **Three design constraints (must encode in PLAN.md):**
   - **C1**: `luca-state.json` carries `preferencesSeeded: boolean`. Sentinel checks state first.
   - **C2**: `consult` accepts `fallback: true` → returns hardcoded defaults. Only triage uses `fallback: false`.
   - **C3**: `seed` uses `op_id: "project-preferences:<vault>"`.

2. **Extract `resolveProjectVault()` TS helper** as part of Phase A — pays down D1 debt, eliminates Risk 2 root cause. Place in `src/state/vault.ts`.

3. **Tool action surface**: `consult`, `consult-section`, `seed`, `update`, `invalidate`. (Add `invalidate` for Risk 3.)

4. **Schema location**: `src/state/project-preferences.ts` (NOT inline — schema is shared with skill prose and Phase B/C tools).

5. **Sentinel binding**: triage instruction only. Append directive to `triage.md` instructing agent to call `projectPreferences(action: "consult", fallback: false)` at step 1.5; if null, invoke `/luca-init` skill before proceeding. Phase B/C inject `fallback: true` consult prose into their instructions.

6. **Skill behavior**: probe filesystem first (grill-me principle); show detected defaults; require user confirmation (single `ask_user` call with options); seed with `op_id`. Add `--auto` mode for CI/headless.

7. **Tests**: mirror `workflow-state-actions.test.ts`; cover all actions + sentinel + schema migration v1→v2 simulation.

8. **Tool defines BUT does not call MuninnDB**: tool's `consult`/`seed`/`update` actions read/write `.planning/config.json` cache + return MuninnDB instruction strings the agent executes via MCP. OR — alternate design — tool only manages session cache + state flag, and skill/instruction prose handles all MuninnDB I/O. Architect must pick. (See Open Question #1.)

## Open Questions

1. **Tool ↔ MuninnDB boundary**: tools cannot call MCP. Two designs:
   - (a) Tool actions return prose instructions agent executes (`consult` returns "call mcp__muninn__muninn_find_by_entity(...)"). Tool does no MuninnDB I/O.
   - (b) All MuninnDB I/O lives in skill/instruction prose; tool only manages local cache (`.planning/config.json` mirror) + state flag.
   - **Recommendation**: (b). Simpler, testable, cache-coherent. Tool reads/writes a JSON file under `.planning/`; skill/instruction prose syncs to MuninnDB.

2. **Where preferences persist**: MuninnDB only? OR `.planning/preferences.json` cache + MuninnDB? OR new section in `.planning/config.json`?
   - **Recommendation**: dedicated `.planning/preferences.json` (mirrors MuninnDB content; serves as authoritative cache; survives MuninnDB outages). Sync on `seed`/`update`.

3. **Mastra/zod versions** — verify in `packages/luca-mastracode/package.json` before architect plan finalizes. Did not retrieve in this research pass.

4. **CLI command name for init** — `luca init` already exists (vault setup). Skill is `/luca-init` (different surface). Confirm naming doesn't collide in user mental model.

5. **Should `loadMuninnVault()` helper consolidation also rewrite the 16 prose duplications?** — out of Phase A scope (separate todo); Phase A only adds the helper for new tool's use.
