# Research: 01-todo-cli-priority-area

**Phase:** 01-todo-cli-priority-area (SIMPLE) · **REQ:** REQ-01 (milestone v13.0.0-pai-learnings)
**Dimension:** implementation · **Date:** 2026-06-10
**Origin:** PAI v5.0.0 review — contract-drift bug (`research:pai-framework-review`, `01KTSDXPE2B2SVZTPQVN4K9FY8`); backlog todo `todo:first-class-area-and-priority-on-luca-todo-cli-unknown-flag`

## Summary

The change is well-contained: `TodoSchema` has exactly three production consumers (add/update/list handlers in luca-cli), and adding two optional fields is backward-compatible with all stored todos and the existing test file. citty 0.2.2 (the version luca-cli resolves) parses with `strict: false` and silently merges unknown flags into the parsed args object, but it exposes `rawArgs` and `cmd` in the run context — and natively supports `type: 'enum'` args with built-in rejection of invalid values, which the repo doesn't use anywhere yet.

## Key Findings

### 1. TodoSchema consumers (HIGH)

- Schema source: `packages/luca-core/src/todos/schemas.ts:43-56`, re-exported via `packages/luca-core/src/todos/index.ts:2` and `packages/luca-core/src/index.ts:10`.
- Production consumers that `TodoSchema.parse(...)`: only two —
  - `packages/luca-cli/src/write-surface/handlers/luca-todo-add.ts:79` (its own `inputSchema` at lines 12-49 needs the new fields)
  - `packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts:83` (inputSchema at lines 14-34)
- `luca-todo-list.ts` imports only `TODO_CONCEPT_PREFIX`/`TodoStatus` (line 1) — no schema parse; only its instruction prose mentions TodoSchema (line 37). A priority filter would mirror the existing post-recall status-filter pattern (lines 35-37).
- Prose-only references (update wording, nothing breaks): `packages/luca-tools/src/artifacts/commands/todo-check.ts:26,34` (field list and render line — natural place to surface priority/area) and `packages/luca-tools/src/artifacts/skills/gh-issue-triage/index.ts:27`.
- `packages/luca-mastracode/src/state/todos.ts` is a **separate legacy frontmatter-file todo system** with its own `area`/`priority` fields (lines 42-45, 170-177) — it does NOT import `TodoSchema` and needs no change. Don't confuse the two.
- Adding optional fields is non-breaking for existing MuninnDB-stored todos (they parse fine without the fields). No `schemaVersion` bump needed.

### 2. citty parsing & unknown-flag rejection (HIGH)

luca-cli resolves citty@0.2.2 (`bun.lock:977`; the 0.1.6 copies are only for build tooling unbuild/mkdist/untyped). From `citty@0.2.2/dist/index.mjs`:

- `parseRawArgs` calls `node:util` `parseArgs` with `strict: false` (line 90), so **unknown flags appear as extra keys on the parsed args object** (lines 100-104) rather than being dropped or erroring — they're just never forwarded by the leaf `run()` since it cherry-picks named fields. That's the silent-swallow mechanism.
- The run context includes `rawArgs` and `cmd` (lines 198-203): `run({ args, rawArgs, cmd })`. Two viable detection strategies:
  - **Key-diff**: `Object.keys(args)` minus `_` vs. declared `cmd.args` — but beware citty auto-aliases camelCase↔kebab-case for every multi-word flag (parseArgs lines 147-154, alias mirroring at parseRawArgs lines 113-117), so e.g. declaring `metadata-file` yields both `metadata-file` and `metadataFile` keys. The allowed set must include both variants per declared arg.
  - **rawArgs scan**: extract `--flag` tokens from `rawArgs` directly; must handle `--no-<flag>` negation (stripped at lines 77-81), `--flag=value`, and stop at `--` (line 73). Slightly more code but immune to aliasing surprises.
- **No existing command validates unknown flags** — `rawArgs` appears nowhere in luca-cli src except run-handler.ts doc comments.
- **Best shared home**: `packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts` — every write-surface leaf already funnels through `runWriteHandler` (lines 44-102). But `runWriteHandler` receives a pre-built plain object, not the citty context, so rejection needs either (a) a new exported helper, e.g. `rejectUnknownFlags(command, cmd, rawArgs)` called at the top of each `run()`, or (b) changing `runWriteHandler`'s signature to accept the citty context. Option (a) is least invasive for a SIMPLE phase; adopting it for the whole write surface later is trivial.
- **Bonus (MEDIUM)**: citty 0.2.2 supports `type: 'enum'` with `options: [...]` and throws `CLIError` on invalid values (index.mjs lines 143, 166-169). No luca-cli command uses it yet, but `--priority` could be declared `type: 'enum', options: ['low','medium','high','critical']` for free CLI-level validation on top of the Zod re-validation in run-handler.

### 3. Who reads priority today (HIGH)

- **No code** reads todo priority — zero matches in luca-cli/luca-core production source. Consumers are instruction prose only:
  - `packages/luca-tools/src/artifacts/skills/session-plan/index.ts:34-35` — claims `luca todo list --status pending --format json` returns "title, area, source, body, priority". Note: `--format` does not exist on `todo list` either — additional drift in the same family.
  - `packages/luca-tools/src/artifacts/skills/note/index.ts:102,133` — claims context-check hooks surface high-priority todos (aspirational; no hook code reads priority).
  - `packages/luca-tools/src/artifacts/commands/todo-check.ts:34` — render line; add priority/area here for surfacing in list flows.
- WSJF logic lives in the architect-mode brief (session-plan/index.ts:54-59), prose only — would benefit from first-class priority but requires no code change.

### 4. Update handler is full replace, not read-modify-write (HIGH)

`luca-todo-update.ts:83-95` constructs a complete new `Todo` from the supplied args and emits `muninn_remember` under the same concept — **latest memory wins**. `title` and `status` are required (`todo.ts:130-143`); `body`/`source`/`metadata` are optional and **omitted (not preserved) when not re-sent** — an update without `--body` silently drops the existing body. Implication for backfilling the 9 existing todos: the agent must recall each todo first and re-send title, body, status, source, and metadata alongside the new priority/area, or bodies will be clobbered. Worth a one-line warning in the update flag descriptions.

### 5. Doc-drift sites and flag-set agreement (HIGH)

| Site | Prescribed | Matches proposed enum? |
|---|---|---|
| `packages/luca-tools/src/artifacts/skills/todo-add/index.ts:35` | `--area "<area>" --priority "<low\|medium\|high\|critical>"` | Yes, exact |
| `packages/luca-tools/src/artifacts/skills/note/index.ts:113` | `--area "note" --priority high` | Yes (also `:144` `--priority low`, tables at `:158-159`) |
| `packages/luca-tools/src/artifacts/modes/research.ts:257` | `--area "<affected domain>" --priority "<low\|medium\|high\|critical>"` | Yes, exact |
| `packages/luca-tools/src/artifacts/skills/gh-issue-triage/index.ts:66-79` | priority/area via `--metadata-file` JSON, enum `<high\|medium\|low>` | Compatible subset; should migrate to first-class flags in same phase (lines 67, 78-79, 92) |
| `packages/luca-tools/src/artifacts/skills/session-plan/index.ts:34-35` | `--format json` + priority/area in list output | `--format` is extra drift, out of declared scope |
| `packages/luca-tools/src/artifacts/skills/todo-add/index.ts:51-59` | "Todo File Format" frontmatter block | Stale — describes file-based todos that no longer exist; cheap cleanup while editing |

### 6. Test/type constraints (HIGH)

- `packages/luca-core/src/todos/schemas.test.ts` **does exist** in the working tree (contradicting the blanket "all tests removed" memory note). Adding two optional fields breaks nothing in it; per repo convention the verification gate is `bunx --bun tsc --noEmit` only — `bun test` must never run. No edit strictly required; optionally extend it, but do not run it.
- Note `schemas.test.ts:37` stores `metadata: { priority: 'high' }` — the gh-issue-triage metadata pattern. After first-class fields land, priority may exist in both `metadata.priority` and top-level `priority` for old todos; harmless but worth a sentence in the backfill step.
- Type-only consumers of `Todo`: none beyond the three handlers.

## Implications for Planning

- The four planned change sites are correct and complete for code; add `todo-check.ts` render prose and `gh-issue-triage` flag migration to the doc-drift list (5 prose files total).
- Unknown-flag rejection should be a small exported helper in `__helpers/run-handler.ts` called from each todo leaf `run({ args, rawArgs, cmd })`; account for camel/kebab auto-aliases or scan `rawArgs`.
- Declare `--priority` as citty `type: 'enum'` with `options` for native rejection of bad values.
- Backfill of existing todos must recall-then-resend full payloads — update is full-replace.

## Open Questions (for discuss)

1. Should unknown-flag rejection apply to all write-surface command groups now (helper is shared anyway), or strictly `todo` per REQ-01? Cost difference is one call per leaf `run()`.
2. `session-plan`'s `--format json` on `luca todo list` is undocumented drift outside this REQ — fix in this phase or file a follow-up todo?
3. Where should `area`/`priority` render in `luca todo list`'s instruction text — extend the post-recall filter description only, or also add an `--area` filter symmetric with `--status`?
