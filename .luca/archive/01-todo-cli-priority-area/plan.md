---
id: 01-todo-cli-priority-area
title: "First-class priority/area on luca todo CLI + unknown-flag rejection"
complexity: SIMPLE
req: REQ-01
waves: 4
tasks: 9
criteria: 24
revision: 3
verification_gate: "bunx --bun tsc --noEmit"
---

# Plan: 01-todo-cli-priority-area

## Objective
Add optional `priority`/`area` fields end-to-end (TodoSchema → handlers → todo CLI), reject unknown flags loudly across ALL write-surface leaves, fix 7 prose-drift sites, backfill 9 pai-review todos. Per context.md decisions 1–4; gate = `bunx --bun tsc --noEmit` only, NEVER `bun test`.

## Wave 1 — foundations (parallel, independent)

### Task 1.1: TodoSchema priority/area fields
- **Goal**: Two optional fields on TodoSchema; exported TodoPriority type. No schemaVersion bump.
- **Files**: `packages/luca-core/src/todos/schemas.ts` (re-exports via `todos/index.ts:2`, `src/index.ts:10` already cover)
- **Steps**: Add `priority: z.enum(['low','medium','high','critical']).optional()` and `area: z.string().max(60).optional()` to TodoSchema (lines 43-56); export `TodoPriority` type (z.infer of the enum) per schema-first convention. Do NOT touch `schemas.test.ts`.
- **Verification**:
  - ac-01: `bunx --bun tsc --noEmit` passes.
  - ac-02: `grep -n "TodoPriority" packages/luca-core/src/todos/schemas.ts` shows exported type; grep shows both `priority` and `area` optional fields in TodoSchema.

### Task 1.2: rejectUnknownFlags helper
- **Goal**: Exported helper in run-handler.ts that scans citty `rawArgs` and throws on undeclared `--flags`.
- **Files**: `packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts`
- **Steps**: Export `rejectUnknownFlags(command: string, cmd, rawArgs: string[])` using rawArgs token scan (NOT key-diff): extract `--flag` tokens, strip `--no-` negation prefix, split `--flag=value`, stop at bare `--`; build allowed set from declared `cmd.args` keys plus both camelCase and kebab-case alias variants of each (citty auto-aliases multi-word flags), plus citty built-ins `help`/`version` and their aliases. On unknown flag, exit with error naming the flag and command (match existing run-handler error style).
- **Verification**:
  - ac-03: `bunx --bun tsc --noEmit` passes.
  - ac-04: `grep -n "export function rejectUnknownFlags" packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts` matches; source visibly handles `--no-`, `=value`, `--`, and allows `help`/`version`.

## Wave 2 — surface integration + prose (2.1 → 2.2 sequenced; 2.3/2.4/2.5 parallel)

> Runtime probes (ac-08, ac-09, ac-10b, ac-12) MUST invoke the NEW code: run from source (`bun packages/luca-cli/bin/... <cmd>` or repo script) or `bun run build` + relink first — stale linked `luca` probes old behavior.
### Task 2.1: todo handlers accept priority/area (deps: 1.1)
- **Goal**: add/update handler inputSchemas pass new fields through to `TodoSchema.parse`; update docs warn full-replace.
- **Files**: `packages/luca-cli/src/write-surface/handlers/luca-todo-add.ts` (inputSchema lines 12-49, parse line 79), `packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts` (inputSchema lines 14-34, parse line 83)
- **Steps**: Add optional `priority` (same enum) + `area` to both inputSchemas; include in the Todo object built for `TodoSchema.parse`. Add one-line warning to update flag descriptions: update is full-replace — omitted body/source/metadata are dropped, re-send full payload.
- **Verification**:
  - ac-05: `bunx --bun tsc --noEmit` passes.
  - ac-06: grep shows `priority` and `area` in both handler inputSchemas; grep "full-replace" (or equivalent warning text) in luca-todo-update.ts.

### Task 2.2: todo CLI flags + list surface + todo-group reject wiring (deps: 1.1, 1.2, 2.1 — runs AFTER 2.1)
- **Goal**: `--priority`/`--area` declared on add, update, AND list; rejectUnknownFlags wired into todo leaves.
- **Files**: `packages/luca-cli/src/commands/write-surface/todo.ts`, `packages/luca-cli/src/write-surface/handlers/luca-todo-list.ts`
- **Steps**: On add+update declare `--priority` as citty `type: 'enum'`, `options: ['low','medium','high','critical']` (first repo use of citty enums) and `--area` string; pass through to handlers; mirror the full-replace warning in the update CLI arg descriptions (--help text), not only the handler inputSchema. On listCommand (todo.ts lines 94-104, currently status+limit only) declare the SAME two flags, add both as optional fields to luca-todo-list.ts inputSchema (lines 7-18 — Zod strips unknown keys, so schema fields are required for forwarding) and extend the post-recall filter description mirroring `--status` (lines 35-37). Widen the three todo leaf `run({ args })` signatures to `run({ args, rawArgs, cmd })` and call `rejectUnknownFlags` first.
- **Verification**:
  - ac-07: `bunx --bun tsc --noEmit` passes.
  - ac-08: source-run CLI `todo add --help` lists `--priority` with enum options and `--area`; `todo update --help` shows full-replace warning.
  - ac-09: `luca todo add --title x --bogus-flag y` exits non-zero naming `--bogus-flag`; `--priority wrong` rejected by citty enum.
  - ac-10: grep shows `--area`/`--priority` filter hints in luca-todo-list.ts instruction text.
  - ac-10b: source-run `luca todo list --area x --priority high` exits 0 and the emitted instruction description names both filters.

### Task 2.3: wire rejectUnknownFlags into remaining write-surface leaves (deps: 1.2)
- **Goal**: Every non-todo write-surface leaf rejects unknown flags (decision 1: all groups, not just todo).
- **Files**: `packages/luca-cli/src/commands/write-surface/{branch,checks,confidence,phase,pr-review,preferences,repo,roadmap,state,verification,workflow}.ts`
- **Steps**: In each leaf `run()` that takes args, widen signature to `({ args, rawArgs, cmd })` and call `rejectUnknownFlags(<command>, cmd, rawArgs)` first. Arg-less leaves (e.g. phase.ts read-only runs, preferences/roadmap/state read leaves) get the same call with their context if they accept flags; skip leaves with zero declared args only if rawArgs unavailable.
- **Verification**:
  - ac-11: `bunx --bun tsc --noEmit` passes.
  - ac-12: `grep -rln "rejectUnknownFlags" packages/luca-cli/src/commands/write-surface/*.ts | wc -l` ≥ 12 (todo.ts + 11 leaf files import it; helper lives in `__helpers/`, not matched by this glob); source-run `luca state read --bogus` exits non-zero.

### Task 2.4: prose drift — skills (independent)
- **Goal**: Skill prose matches the real CLI surface.
- **Files**: `packages/luca-tools/src/artifacts/skills/todo-add/index.ts`, `skills/note/index.ts`, `skills/session-plan/index.ts`, `skills/gh-issue-triage/index.ts`
- **Steps**: todo-add:35 flags now real — keep, and delete stale "Todo File Format" frontmatter block (~lines 51-59). note:113,144,158-159 — confirm flag prose matches enum. session-plan:34-35 — remove phantom `--format json`, describe real `luca todo list` output. gh-issue-triage:66-79,92 — migrate `--metadata-file` priority/area JSON to first-class `--priority`/`--area` flags; note legacy `metadata.priority` may coexist on old engrams (harmless).
- **Verification**:
  - ac-13: `bunx --bun tsc --noEmit` passes.
  - ac-14: grep finds no "Todo File Format" in todo-add skill, no `--format json` in session-plan todo-list prose, no `metadata-file`-based priority/area instructions in gh-issue-triage; AND grep shows first-class `--priority`/`--area` flags present in gh-issue-triage prose (lines ~66-79).

### Task 2.5: prose drift — modes + commands (independent)
- **Goal**: research mode and todo-check command prose surface priority/area.
- **Files**: `packages/luca-tools/src/artifacts/modes/research.ts` (line 257), `packages/luca-tools/src/artifacts/commands/todo-check.ts` (lines 26, 34)
- **Steps**: research.ts:257 — confirm/align `--area`/`--priority` flag prose with real enum. todo-check.ts — add priority/area to field list (line 26) and render line (line 34).
- **Verification**:
  - ac-15: `bunx --bun tsc --noEmit` passes.
  - ac-16: grep shows `priority` and `area` in todo-check.ts field list and render line.

## Wave 3 — backfill (deps: all wave 2 code tasks)

### Task 3.1: backfill 9 pai-review todos [ORCHESTRATOR-ONLY at execute — subagents lack MCP]
- **Goal**: Existing pai-review todos carry first-class priority/area; `[priority: X | area: Y]` body line removed.
- **Files**: none (MuninnDB writes via `luca todo update` + MCP)
- **Steps**: Orchestrator: refresh CLI first (`bun run build` / `release:local`, or invoke from source) so new flags exist. Recall each `todo:*` engram with source `pai-framework-review` (9 expected); parse `[priority: X | area: Y]` from body first line; re-send FULL payload via `luca todo update` — title/body/status/source unchanged, body with that line stripped, plus `--priority`/`--area`. Never send partial — update is full-replace.
- **Verification**:
  - ac-17: recall of pai-review todos shows top-level priority+area on all 9 and no `[priority:` line remaining in bodies.

## Wave 4 — review fixes (cycle 2; deps: waves 1-3 landed)

### Task 4.1: SEC-01 + SEC-02 — area injection fix + schema charset constraint
- **Goal**: No free-form interpolation into instructionForAgent; `area` constrained to kebab-tag at schema source of truth. (Full detail: audits/security-auditor.md.)
- **Files**: `packages/luca-cli/src/write-surface/handlers/luca-todo-list.ts` (line 57), `packages/luca-core/src/todos/schemas.ts` (line 55), add/update/list handler inputSchemas if they declare `area` independently
- **Steps**: SEC-01 [MUST-FIX]: wrap the interpolated value as `JSON.stringify(args.area)` in the filter description (a raw `"` currently escapes quoting = instruction injection, violating build-muninn-instruction.ts:45-49). SEC-02: TodoSchema.area gains kebab-tag regex mirroring TodoIdSchema (`/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`, keep `.max(60)`); propagate same constraint to handler inputSchema `area` fields. All 10 backfilled areas already kebab-safe — no data migration.
- **Verification**:
  - ac-18: `bunx --bun tsc --noEmit` passes.
  - ac-19: grep shows `JSON.stringify` at the area interpolation in luca-todo-list.ts; grep shows kebab regex on `area` in schemas.ts and in the handler inputSchemas declaring area.
  - ac-20: source-run `luca todo list --area 'x"y'` is rejected by schema validation OR emitted instruction shows the value safely JSON-stringified (no bare `"` breaking the quoting).

### Task 4.2: AR-01 + warning consolidation — enum single-source + dedupe full-replace prose
- **Goal**: One source of truth for the priority enum; full-replace warning stated once, complete, with real per-field descriptions.
- **Files**: `packages/luca-cli/src/commands/write-surface/todo.ts` (lines ~58/121/188), `packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts`
- **Steps**: AR-01: replace the 3 hard-coded `['low','medium','high','critical']` arrays with `TodoPriority.options` imported from `@alecsibilia/luca-core`. DX/SIMP: move the full warning ONCE to the update command meta/description — "Update is full-replace — omitted optional fields (body, source, metadata, priority, area) are dropped; re-send the full payload" — restore real per-field descriptions on body/source/metadata/priority/area with at most a terse "(dropped if omitted)" suffix; same trim in update handler inputSchema descriptions.
- **Verification**:
  - ac-21: `bunx --bun tsc --noEmit` passes.
  - ac-22: `grep -c "TodoPriority.options" packages/luca-cli/src/commands/write-surface/todo.ts` == 3; grep finds no hard-coded priority array literal in todo.ts.
  - ac-23: grep count of "full-replace" warning in todo.ts + luca-todo-update.ts reduced to one full statement per file (≤2 total), and the statement lists priority+area.
  - ac-24: source-run `todo update --help` shows command-level warning once and per-field descriptions restored.

**Deferred (do NOT plan here)**: `--status` enum convergence (AR-02/DX-02) — file follow-up todo.

## Risks & Mitigations
- citty alias edge cases → rawArgs scan + alias allowlist incl. help/version (Task 1.2; ac-09, ac-12, ac-04).
- Backfill clobbering bodies → full-payload resend (Task 3.1); stale linked CLI → rebuild step (Task 3.1).
- Area injection regression → JSON.stringify at interpolation + schema regex (Task 4.1, ac-19/ac-20).
