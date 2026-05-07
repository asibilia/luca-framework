# Plan: Phase A — Project Preferences Foundation

## Objective

Add `projectPreferences` Mastra tool, `luca-init` skill, Zod schema, and triage-bound sentinel so the framework reads project conventions from MuninnDB instead of hardcoded defaults. Establish the contract Phase B (branching) and Phase C (PR/release/commits) consume.

## Context

Tools cannot call MuninnDB (no MCP in TS). Tool manages local cache (`.planning/preferences.json`) + `preferencesSeeded` state flag. Skill/instruction prose handles MuninnDB I/O. Three design constraints (C1 seeded flag, C2 `fallback: true`, C3 `op_id`) prevent infinite-loop and concurrency hazards. Backward compat: `consult(fallback: true)` returns hardcoded defaults matching today's behavior.

Cross-package import direction: `luca-framework` already imports `@alecsibilia/luca-mastracode` (workspace:*). Therefore `sanitizeVaultName` is shared FROM mastracode; framework re-imports.

## Phases

### Phase 1: Foundation tracer slice

#### Wave 1: Schema + vault helper + loop-safe tool (tracer bullet)

- [ ] **Task 1.1.1**: Move/own `sanitizeVaultName` in mastracode. Create `src/state/vault.ts` exporting `sanitizeVaultName(name)` (regex `/[^a-z0-9-]/g` + trim collapsing) and `resolveProjectVault(): string` reading `.planning/config.json` → `muninn.vault`, applying sanitize, fallback `"default"`. Update `packages/luca-framework/src/utils/vault-setup.ts` to re-export from `@alecsibilia/luca-mastracode` (delete duplicate body, keep named export to preserve framework's API).
  - Files: `packages/luca-mastracode/src/state/vault.ts` (new), `packages/luca-mastracode/src/index.ts` (export), `packages/luca-framework/src/utils/vault-setup.ts` (re-export only)
  - Verification: unit test `vault.test.ts` covers missing config, valid vault, invalid chars stripped, fallback. Framework tests still pass (no signature change).
  - Dependencies: none

- [ ] **Task 1.1.2**: Create `src/state/project-preferences.ts` with `ProjectPreferencesSchema` (Zod, every field `.optional().default(...)`, `schemaVersion: z.literal(1).default(1)`, `SectionName = z.enum(['branching','commits','pr','release','tracker'])`, sections), `DEFAULT_PREFERENCES` constant matching `BRANCH_TYPES` from `ensure-feature-branch.ts:107-116` and current PR/release behavior, `loadProjectPreferences()` reading `.planning/preferences.json` via existing config-load template, `writeProjectPreferences()` via `atomicWrite()`. Add file-header comment: "Content is trusted; written verbatim into MuninnDB summaries by luca-init skill."
  - Files: `packages/luca-mastracode/src/state/project-preferences.ts` (new)
  - Verification: schema parses empty → defaults; `SectionName` enum exported; `DEFAULT_PREFERENCES.branching.types` equals current `BRANCH_TYPES` (assert in test).
  - Dependencies: 1.1.1

- [ ] **Task 1.1.3**: Create `src/tools/project-preferences.ts` with loop-safe `projectPreferencesTool`. Action enum: `['consult','consult-section','seed','update']` (drop `invalidate` per G-ARCH-004 until cache lands). `consult(fallback:bool)`: read `state.preferencesSeeded`; if `true` AND file present → return parsed; if `true` AND file missing → return `DEFAULT_PREFERENCES` (loop-safe per C1); if `false` AND file present → return parsed + set `preferencesSeeded:true`; if `false` AND file missing → return `DEFAULT_PREFERENCES` when `fallback:true` else `{success:true, preferences:null}`. `consult-section(section:SectionName, fallback)`: enum-validated subset; unknown section → `{success:false, message}`. `seed(payload)`: write file via `writeProjectPreferences`, set `preferencesSeeded:true` in luca-state, return `{success:true, muninnInstruction:string}` (instruction includes `op_id:"project-preferences:<vault>"`). `update(payload)`: deep-merge into existing file, preserve `preferencesSeeded`.
  - Files: `packages/luca-mastracode/src/tools/project-preferences.ts` (new)
  - Verification: deferred to Task 1.3.1 (full action coverage). `bunx tsc --noEmit` clean post-write.
  - Dependencies: 1.1.1, 1.1.2

#### Wave 2: Wire tool into manifest + sentinel skill

- [ ] **Task 1.2.1**: Register `projectPreferences` in `tool-manifest.ts` (key `project_preferences`, record_key `projectPreferences`). Permissions: triage `['consult','consult-section','seed','update']`; research/architect/execute/review/finalize/discuss `['consult','consult-section']`. Export from `src/tools/index.ts`.
  - Files: `packages/luca-mastracode/src/tools/tool-manifest.ts`, `packages/luca-mastracode/src/tools/index.ts`
  - Verification: snapshot test (or grep) confirms tool present in `MODE_PERMISSIONS` for all 7 modes; `bunx tsc --noEmit` clean.
  - Dependencies: 1.1.3

- [ ] **Task 1.2.2**: Create `skills/luca-init/SKILL.md` with frontmatter (name `luca-init`, description with trigger phrases). Body sections: (1) **Probe** filesystem heuristics (`git branch -r`, `git log --oneline -50`, `.changeset/config.json`, `package.json` scripts). (2) **Confirm** — read `state.oversight`; if `full-auto` skip ask_user (G-DX-003); else single `ask_user` with options `Approve`/`Edit section`/`Abort` (G-SCOPE-001 contract). On `Abort` write nothing and clear `preferencesSeeded`. (3) **Seed** — call `projectPreferences(action:"seed", payload:detected)` THEN call `mcp__muninn__muninn_remember(vault:<resolveProjectVault>, op_id:"project-preferences:<vault>", type:"project_preferences", entities:[{name:"<repo-id>",type:"project"}], tags:["preferences","project-config","luca","convention"], content:<JSON>, summary:<natural-language>)`.
  - Files: `packages/luca-mastracode/skills/luca-init/SKILL.md` (new)
  - Verification: `grep -q 'op_id.*project-preferences' SKILL.md` passes; frontmatter parses (yaml lint or skill-loader smoke).
  - Dependencies: 1.2.1

- [ ] **Task 1.2.3**: Inject sentinel into `src/instructions/triage.md` as new **Step 1.6: Project Preferences Sentinel** (between existing Step 1.5 Similar Task Lookup and Step 2 Classify Complexity). Body: "Call `projectPreferences(action:'consult', fallback:false)`. If `preferences === null` AND `state.preferencesSeeded !== true`, invoke `/luca-init` skill before continuing. Otherwise proceed to Step 2." Update `## Pipeline Context` cross-references if needed.
  - Files: `packages/luca-mastracode/src/instructions/triage.md`
  - Verification: grep finds new "Step 1.6: Project Preferences Sentinel" heading; existing Step 1.5 / Step 2 unchanged.
  - Dependencies: 1.2.1, 1.2.2

#### Wave 3: Tests + docs polish

- [ ] **Task 1.3.1**: Write `src/__tests__/project-preferences.test.ts` mirroring `workflow-state-actions.test.ts` (spyOn `lucaStore`, tmpdir + `process.chdir`). Cover ALL action branches: (a) consult-missing-fallback-false-seeded-false → null; (b) consult-missing-fallback-true-seeded-false → defaults; (c) **consult-missing-seeded-true → DEFAULT_PREFERENCES (NOT null)** — explicit C1 sentinel-loop test (G-DX-002); (d) consult-with-file → parsed; (e) seed writes file + sets `preferencesSeeded:true`; (f) update merges and preserves seeded flag; (g) consult-section valid → subset; (h) consult-section invalid → `{success:false}`; (i) schema migration v1 doc through schema returns same data.
  - Files: `packages/luca-mastracode/src/__tests__/project-preferences.test.ts` (new)
  - Verification: `bun test` passes; ≥9 test cases above present.
  - Dependencies: 1.1.3, 1.2.3

- [ ] **Task 1.3.2**: Update CLI docs: amend `packages/luca-framework/src/commands/init.ts` help text (final stdout block) to mention `/luca-init` skill as the next step for repo-level conventions. Grep root `README.md` for "luca init" and append a one-line pointer if the section exists.
  - Files: `packages/luca-framework/src/commands/init.ts`, `README.md` (conditional)
  - Verification: `bun run packages/luca-framework/src/commands/init.ts --help` (or equivalent) prints `/luca-init` mention; grep "/luca-init" returns the documented locations.
  - Dependencies: 1.2.2

- [ ] **Task 1.3.3**: Document `preferencesSeeded: boolean` as recognized luca-state key. Add inline JSDoc comment in `src/state/luca-store.ts` near line 113 listing the key alongside other recognized arbitrary keys.
  - Files: `packages/luca-mastracode/src/state/luca-store.ts` (comment only)
  - Verification: grep finds `preferencesSeeded` in luca-store.ts comment block.
  - Dependencies: 1.2.3

## Verification Criteria

- All tests pass (`bun test` in luca-mastracode)
- `bunx tsc --noEmit` clean across both packages
- Tool present in `MODE_PERMISSIONS` for triage with full set
- Sentinel-loop test (Task 1.3.1 case c) passes — proves C1 in tracer wave
- Fresh repo: triage detects missing prefs → invokes `/luca-init` (manual smoke)
- Existing repo (no prefs file, `preferencesSeeded:true` not set): consult `fallback:true` returns defaults equal to current `BRANCH_TYPES`
- `grep -q 'op_id.*project-preferences' SKILL.md` passes (C3)

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Sentinel infinite loop (P0, C1) | Tasks 1.1.3 (loop-safe consult) + 1.3.1 case (c) |
| Vault mismatch (P0) | Task 1.1.1 single helper, framework re-exports from mastracode |
| Cache staleness (P1) | `update` rewrites file (mtime advances); explicit `invalidate` deferred until cache lands |
| Schema evolution (P1) | Task 1.1.2 all-optional + `schemaVersion` |
| Execute-mode deadlock (P1) | Sentinel only in triage; `--auto` reads `state.oversight === full-auto` |
| Backward compat (P1) | `DEFAULT_PREFERENCES` matches today's behavior |
| Concurrent seed (P2, C3) | `op_id` in skill prose; verified by grep |
| Test gaps (P2) | Task 1.3.1 ≥9 cases incl. sentinel-loop |

## Architectural Quality Check

- **Depth**: tool is deep — 4 actions hide JSON I/O + state-flag coordination + MuninnDB instruction emission
- **Promotion**: `sanitizeVaultName`/`resolveProjectVault` tier 2 (mastracode shared, ≥2 callers); `loadProjectPreferences` tier 1 (inside schema module)
- **Concrete first**: dropped `invalidate` no-op stub (G-ARCH-004); single concrete file-backed implementation
- **Locality**: schema sections grouped in one module; sentinel in single file
- **Interface-first**: each task ships testable public surface; `consult` semantics fully defined in Wave 1 (G-DX-001 fixed)
