# Plan: budget noun classifier registration + registry-completeness test

## Objective

Register `budget` (and the 5 other unregistered nouns + confidence verb drift, per D1 close-all-gaps) in the stage-gate bash classifier so `luca budget check` classifies `luca-write` instead of falling through to `bash-mutate`, and add a registry-completeness test binding cli.ts subCommands to the classifier sets so this drift class fails CI instead of recurring silently.

## Context

- Gap verified live: this very planning session had `bun test` + compound commands stage-gate-blocked as bash-mutate in `pipelineStep=plan` — same mechanism that blocks `luca budget check` today.
- Anchors (verified): classifier sets at `packages/luca-cli/src/hook/helpers/classify-bash-command.ts` — LUCA_TOPLEVEL_READ :216, LUCA_TOPLEVEL_WRITE :223, LUCA_READ_VERBS :234, LUCA_NOUN_VERBS :248 (confidence :264 has only `log`); all module-private (0 `export const` in file). cli.ts subCommands map :20-108 inside `defineCommand` (budget :95, graph :32, statusline :36, start/stop/status :42-44); import side-effect-free (lazy thunks).
- Existing behavioral test: `classify-bash-command.test.ts` (25 test blocks / 49 assertions) — must stay green.
- All decisions locked by context.md D1 + AI technical calls; do not re-litigate.

## Phases

### Phase 1: classifier registration + completeness test

#### Wave 1: registry edits (parallel, disjoint files)

- [ ] **Task 1.1.1**: Update `classify-bash-command.ts` registries: add `budget: new Set(['check'])` to LUCA_NOUN_VERBS with comment (budget check lazily stamps `runStartedAt` into state.json → genuine write; mirrors `snapshot` luca-write precedent; `check` deliberately NOT in LUCA_READ_VERBS); expand `confidence` to `new Set(['log', 'read', 'summary', 'render', 'gate'])`; add `'graph'`, `'status'` to LUCA_TOPLEVEL_READ; add `'statusline'`, `'start'`, `'stop'` to LUCA_TOPLEVEL_WRITE; add `'summary'`, `'render'`, `'gate'` to LUCA_READ_VERBS; export the three registry consts (LUCA_NOUN_VERBS, LUCA_TOPLEVEL_READ, LUCA_TOPLEVEL_WRITE). Do NOT touch the `hook` exclusion comment (:221-222), telemetry's TOPLEVEL_READ placement (:213-216 deliberate), or READONLY_COMMANDS (`start` there is Windows — unrelated path).
  - Files: packages/luca-cli/src/hook/helpers/classify-bash-command.ts
  - Verification: ac-01, ac-02, ac-10
  - Dependencies: none

- [ ] **Task 1.1.2**: In `cli.ts`, hoist the subCommands object literal into an exported const `CLI_SUBCOMMANDS` (typed via citty's `SubCommandsDef` or `satisfies`), then pass it as `subCommands: CLI_SUBCOMMANDS` in `defineCommand`. No behavior change — same lazy thunks, import stays side-effect-free.
  - Files: packages/luca-cli/src/cli.ts
  - Verification: ac-03, ac-10
  - Dependencies: none

#### Wave 2: tests (parallel, disjoint files; needs Wave 1 exports)

- [ ] **Task 1.2.1**: New `classify-bash-command-registry.test.ts` importing `CLI_SUBCOMMANDS` + the three exported registry sets. Invariant 1: every cli.ts noun ∈ keys(LUCA_NOUN_VERBS) ∪ LUCA_TOPLEVEL_READ ∪ LUCA_TOPLEVEL_WRITE ∪ `DELIBERATELY_UNCLASSIFIED` (`new Set(['hook'])`, commented as the sole documented exclusion). Invariant 2: for every LUCA_NOUN_VERBS noun present in CLI_SUBCOMMANDS, registered verb set EQUALS `Object.keys((await thunk()).subCommands)` (equality — both drift directions); Invariant 3 (converse): every LUCA_NOUN_VERBS key exists in CLI_SUBCOMMANDS (dead entries).
  - Files: packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts
  - Verification: ac-08, ac-09, ac-09.1, ac-10
  - Dependencies: 1.1.1, 1.1.2

- [ ] **Task 1.2.2**: Add behavioral cases to existing `classify-bash-command.test.ts`: `luca budget check` → `luca-write`; `luca confidence read` → `bash-readonly`; `luca graph` → `bash-readonly`; `luca confidence summary` → `bash-readonly`; `luca confidence gate` → `bash-readonly`; `luca confidence render` → `bash-readonly`. No existing case modified or removed.
  - Files: packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts
  - Verification: ac-04, ac-05, ac-06, ac-07, ac-11
  - Dependencies: 1.1.1

## Deliverables

- **D1**: `budget` classified `luca-write` — /lu loop's `luca budget check` unblocked in PLANNING/REVIEWING → ac-01, ac-04, ac-07
- **D2**: All 6 registry gaps + confidence verb drift closed (graph, status, statusline, start, stop; confidence 5 verbs; summary/render/gate read-classified) → ac-05, ac-06, ac-08, ac-11
- **D3**: Registry-completeness test binding cli.ts ↔ classifier (exclusion set pinned to {hook}) → ac-02, ac-03, ac-08, ac-09, ac-09.1
- **D4**: Green gates — typecheck + both bounded test files → ac-07, ac-08, ac-10

Every D maps to ≥1 verification criterion; every explicit ask in the phase goal/request appears as exactly one D.

## Verification Criteria

All probes verified falsifiable pre-plan: every grep literal below has 0 matches in today's tree.

- **ac-01**: `grep -F "budget: new Set(['check'])" packages/luca-cli/src/hook/helpers/classify-bash-command.ts` exits 0
- **ac-02**: `grep -cE "^export const (LUCA_NOUN_VERBS|LUCA_TOPLEVEL_READ|LUCA_TOPLEVEL_WRITE)" packages/luca-cli/src/hook/helpers/classify-bash-command.ts` prints exactly `3`
- **ac-03**: `grep -F "export const CLI_SUBCOMMANDS" packages/luca-cli/src/cli.ts` exits 0
- **ac-04**: `grep -F "luca budget check" packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts` exits 0
- **ac-05**: `grep -F "luca confidence read" packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts` exits 0
- **ac-06**: `grep -F "luca graph" packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts` exits 0
- **ac-07**: `timeout 120 bun test packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts` exits 0 (bun test exits non-zero on any failure)
- **ac-08**: `timeout 120 bun test packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts` exits 0 (bun test exits non-zero on any failure)
- **ac-09**: `grep -F "DELIBERATELY_UNCLASSIFIED" packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts` exits 0
- **ac-09.1**: `grep -F "new Set(['hook'])" packages/luca-cli/src/hook/helpers/classify-bash-command-registry.test.ts` exits 0 (pins the exclusion set to exactly {hook} — invariant-1 pass then proves all 6 nouns registered)
- **ac-10**: `bunx --bun tsc --noEmit` exits 0
- **ac-11**: `grep -F "luca confidence gate" packages/luca-cli/src/hook/helpers/classify-bash-command.test.ts` exits 0

### Anti-criteria (regression guards)

- **anti-01**: MUST NOT — edit packages/luca-core: `git status --porcelain packages/luca-core/` output EMPTY
- **anti-02**: MUST NOT — edit packages/luca-tools: `git status --porcelain packages/luca-tools/` output EMPTY
- **anti-03**: MUST NOT — break or remove existing classifier tests: ac-07's run reports ≥25 pass, 0 fail (baseline 25 test blocks / 49 assertions pre-phase)
- **anti-04**: MUST NOT — register `hook` in any classifier set: `grep -cF "'hook'" packages/luca-cli/src/hook/helpers/classify-bash-command.ts` prints `0`

## Risks & Mitigations

- **Stage gate blocks `bun test` during EXECUTING?** No — bash-mutate is allowed in EXECUTING (verified live: block occurred only in plan step). Executor runs bounded tests normally.
- **Hoisting subCommands changes citty behavior** — mitigation: pure object hoist, same thunks; ac-10 typecheck + ac-07/ac-08 runtime imports catch breakage.
- **Registry test import pulls side effects** — research verified cli.ts import runs only manifest resolveVersion (read-only); no .luca/ writes.
- **`grep -F "luca confidence read"` could pre-exist** — verified 0 matches today; all probe literals checked falsifiable.

## Decisions

- 2026-07-19 — `render` added to LUCA_READ_VERBS alongside summary/gate (all three stdout-only reporters; per context.md AI-owned call).
- 2026-07-19 — cli.ts export shape: hoist subCommands literal to named `CLI_SUBCOMMANDS` const rather than exporting `main` (smaller surface; test needs only the map).
- 2026-07-19 — Exclusion-set pinning probe (ac-09.1) added so the completeness test cannot pass by dumping nouns into DELIBERATELY_UNCLASSIFIED.
