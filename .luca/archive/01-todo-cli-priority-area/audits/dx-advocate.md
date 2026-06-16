PERSPECTIVE: dx
VERDICT: APPROVE
FINDINGS:
- [SHOULD-FIX] Full-replace warning enumerates an incomplete field list. The `todo update` flag descriptions for `--body` and `--source` (and the handler `.describe()` texts) say "omitted body/source/metadata are dropped" — but `priority` and `area` are now also dropped on omission. An agent reading only the body/source warning could conclude priority survives a partial update. The per-flag priority/area texts do say "omit and it is dropped", but the enumerated list is the authoritative-sounding one and is now stale.
  File: packages/luca-cli/src/commands/write-surface/todo.ts:182-184, packages/luca-cli/src/commands/write-surface/todo.ts:199-204, packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts:31, packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts:51, packages/luca-cli/src/write-surface/handlers/luca-todo-update.ts:57
  Suggestion: Change the enumeration to "omitted optional fields (body/priority/area/source/metadata) are dropped; re-send the full payload" in all five spots, or centralize the sentence once in the command meta description.
  Cross-phase: false
- [SHOULD-FIX] `todo list --status` help text implies an open value set the handler rejects. Description reads 'Optional status filter (pending, backlog, done, ...)' — the trailing "..." suggests more statuses exist, but `luca-todo-list.ts` validates with the closed `TodoStatus` enum, so any fourth value errors at the Zod layer with a generic enum message instead of being visible in --help. Inconsistent with `--priority`, which correctly uses citty `type: 'enum'` and fails fast with the option list.
  File: packages/luca-cli/src/commands/write-surface/todo.ts:113-118 (list --status), packages/luca-cli/src/commands/write-surface/todo.ts:49-55 (add --status, same pattern — could be enum ['pending','backlog'])
  Suggestion: Drop the "..." and declare `--status` as `type: 'enum'` with the real options on both `add` and `list`, matching the new `--priority` pattern so typos are caught by citty with the option list in the error.
  Cross-phase: false
- [NOTE] TodoSchema's new `priority`/`area` fields use JSDoc comments instead of `.describe()`, unlike `VerificationRefSchema.criterionId` in the same file (schemas.ts:40-42). JSDoc is invisible at runtime, so any JSON-schema/MCP introspection of TodoSchema carries no description for the new fields. The handler-level inputSchemas do have `.describe()` texts, so agent-facing surfaces are covered — informational only.
  File: packages/luca-core/src/todos/schemas.ts:52-55
- [NOTE] `area` is free-form while the list filter is an exact string compare (`content.area === "cli"`). Casing/spelling drift ("CLI" vs "cli") will silently return zero matches with no hint. Consider lowercasing/trimming area at write time in the handlers, or noting case-sensitivity in the filter descriptions.
  File: packages/luca-cli/src/write-surface/handlers/luca-todo-list.ts:57-59, packages/luca-cli/src/write-surface/handlers/luca-todo-add.ts:37-43
- [NOTE] Single-dash typos (`-priority high`) bypass `rejectUnknownFlags` since short flags are deliberately ignored (documented at run-handler.ts:148). Acceptable, documented tradeoff — recorded for future hardening.
  File: packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts:205-210

APPROVE evidence (verified locations):
1. Unknown-flag error quality — run-handler.ts:224-228: names the flag (`'--${name}'`), the command (`luca ${command}`), and points to `--help` ("Run 'luca <cmd> --help' to list supported flags"). Actionable; matches the existing `runWriteHandler` error style (run-handler.ts:59-64).
2. JSDoc completeness on rejectUnknownFlags — run-handler.ts:127-172: rationale (citty strict:false hole), full token-scan semantics (`--` terminator, `=value`, `--no-` negation, short-flag exclusion), @param/@returns/@example. `toCamelCase`/`toKebabCase` helpers also documented (105-125). Satisfies mandatory-documentation rule.
3. Wiring completeness — every write-surface leaf calls the guard: per-file `rejectUnknownFlags` counts equal imports + one call per `run()` across all 12 command files, including the sync `run()` at verification.ts:90-91 (grep-verified; 42 occurrences / 13 files; todo.ts has all 3 leaves wired at todo.ts:88, 139, 221).
4. Enum visibility in --help — `--priority` declared `type: 'enum'`, `options: ['low','medium','high','critical']` on add/update/list (todo.ts:56-61, 119-124, 186-191) AND the option list is duplicated in every description text, so it is visible regardless of citty's enum usage rendering. Enum order/values identical to `TodoPriority` (schemas.ts:20).
5. Naming consistency — `TodoPriority` exactly mirrors the `TodoStatus` const+type pattern (schemas.ts:17-21); handlers import it rather than re-declaring the enum (luca-todo-add.ts:4, luca-todo-list.ts:3, luca-todo-update.ts:3).
6. Import grouping — todo.ts:14-25 (external citty → internal relative, blank-line separated) and run-handler.ts:18-27 (node builtin → packages → relative type import) conform to import-standards; no inline imports.
7. Prose accuracy — all checked sites match the real CLI surface: todo-add skill line 35 uses real flags incl. `--priority "<low|medium|high|critical>"`, no stale "Todo File Format" block remains; session-plan:34-36 describes recall-instruction delegation + post-recall filters, no phantom `--format json`; gh-issue-triage:63-81 uses first-class `--priority`/`--area` (no `--metadata-file` priority routing) and notes legacy `metadata.priority` coexistence; note skill:113,144 uses valid enum values; research.ts:257 and todo-check.ts:26,34 list priority/area matching TodoSchema field names.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 2
  NOTE_COUNT: 3
  CROSS_PHASE_COUNT: 0
