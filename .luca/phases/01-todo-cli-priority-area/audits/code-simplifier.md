PERSPECTIVE: simplification
VERDICT: APPROVE
FINDINGS:
- [SHOULD-FIX] Full-replace warning is repeated 7 times across the update surface, and in the handler it has displaced the actual field descriptions. `packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts:31,51,57` carry three verbatim-identical strings ('Update is full-replace — omitted body/source/metadata are dropped; re-send the full payload.') as the ONLY description for body/source/metadata — a reader of the schema no longer learns what `body` is, only the caveat. `packages/luca-cli/src/commands/write-surface/todo.ts:182,191,197,202` repeat it four more times in --help text.
  File: packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts:31
  Suggestion: State the full-replace semantics once per surface — append one sentence to the tool `description` (luca-todo-update.ts:79) and to the update command's meta.description (todo.ts:152-155) — then restore one-line field meanings in the per-field describes (e.g. body: 'Optional updated markdown body.'). Per-field caveats on priority/area can stay short ('Full-replace: omit and it is dropped.') or go.
  Cross-phase: false
- [NOTE] The rejectUnknownFlags wiring duplicates the command-name string at every leaf (e.g. todo.ts:88 + todo.ts:92 both pass 'todo add'; same pairing at all ~25 call sites). Folding the check into `runWriteHandler` via an optional `{ cmd, rawArgs }` param would dedupe the name and remove the forget-to-call hazard for future leaves. However, several leaves call rejectUnknownFlags WITHOUT runWriteHandler (confidence.ts:229,252 read/summary go straight to local readers), so extraction would not cover the full surface — the uniform explicit one-liner is a defensible choice. Advisory only.
  Cross-phase: false
- [NOTE] The conditional-spread blocks in luca-todo-add.ts:94-101 and luca-todo-update.ts:115-126 (five and six `...(x !== undefined ? {x} : {})` clauses) are strictly unnecessary for behavior: the parsed todo is consumed only via `JSON.stringify(todo)` (add:110, update:135), which drops undefined-valued keys, and the root tsconfig does not set `exactOptionalPropertyTypes` (repo-wide grep: no matches), so plain `priority: args.priority` assignments would type-check and persist identical content. That said, the spread idiom matches pre-existing repo usage (confidence.ts:196-204), so this is conventional repetition, not new complexity. Advisory.

Checks performed that passed (evidence for APPROVE):
1. rejectUnknownFlags internals (run-handler.ts:173-231) — token scan is minimal and single-pass: `--` terminator (l.206), non-`--` skip (l.209), `=value` split (l.213-215), `--no-` boolean-negation retry (l.221), short flags/positionals ignored. No dead branches: the `cmd.args instanceof Promise` guard (l.181) is required because citty types `args` as `Resolvable<ArgsDef>` and a Promise passes `typeof === 'object'`; the redundant-looking `allowed.add(key)` alongside both case variants (l.189-191) is correct defensive coverage for keys that aren't pure camel/kebab, and the Set dedupes.
2. 14 leaf call sites (branch/checks/confidence/phase/pr-review/preferences/repo/roadmap/state/verification/workflow/todo + helpers doc example) — verified by grep, all are the identical one-line `rejectUnknownFlags('<cmd>', cmd, rawArgs)` at the top of run(); acceptable mechanical repetition, no variant logic crept in.
3. List filter-description builder (luca-todo-list.ts:50-64) — three guard-push statements plus one ternary; no abstraction, no loop over a field table, proportionate to three filters. Not over-engineered.
4. Schema change (luca-core/src/todos/schemas.ts:20-21,52-55) — exactly two optional fields plus an exported TodoPriority enum; no schemaVersion bump, no migration machinery, matching the "absent on old todos" comment. Minimal.
5. luca-tools prose (gh-issue-triage/index.ts:63-79, todo-check.ts:26,34, session-plan, note, research.ts:257) — flag prose matches the real CLI enum; the legacy-metadata note (gh-issue-triage:79) is one line, not duplicated elsewhere; no full-replace warning leaked into luca-tools prose.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 1
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
