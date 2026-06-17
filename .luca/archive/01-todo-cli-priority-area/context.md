# Context: 01-todo-cli-priority-area

**Phase:** 01-todo-cli-priority-area (SIMPLE) · **REQ:** REQ-01 (milestone v13.0.0-pai-learnings)
**Gathered:** 2026-06-10 · **Mode:** interactive · **Research:** research.md (implementation dimension)

## Decisions

### 1. Unknown-flag rejection scope — ALL write-surface command groups [user-input]

Shared helper (e.g. `rejectUnknownFlags(command, cmd, rawArgs)`) exported from
`packages/luca-cli/src/commands/write-surface/__helpers/run-handler.ts`, called at the top of
**every** write-surface leaf `run({ args, rawArgs, cmd })` — not just the todo group. One call
per leaf. Rationale: kills the silent-drop failure mode everywhere at once; next doc/CLI drift
fails loudly regardless of command. Implementation must account for citty's camelCase↔kebab-case
auto-aliasing (or scan `rawArgs` directly, handling `--no-` negation, `--flag=value`, and `--`).

### 2. List-surface extras — BOTH in this phase [user-input]

- Add `--area` post-recall filter hint to `luca todo list`, symmetric with `--status`.
- Fix `session-plan`'s phantom `--format json` prose
  (`packages/luca-tools/src/artifacts/skills/session-plan/index.ts:34-35`) to match the real
  `luca todo list` surface.

### 3. Priority flag typing — citty enum + Zod [locked, implementation]

`--priority` declared as citty `type: 'enum'`, `options: ['low','medium','high','critical']`
(native CLIError on bad values; first use of citty enums in repo) on top of Zod
`z.enum([...]).optional()` in TodoSchema. `area`: `z.string().max(60).optional()`. Both fields
optional — no schemaVersion bump; existing todo engrams keep parsing.

### 4. Backfill — recall-then-resend [locked, implementation]

`luca todo update` is **full-replace** (latest memory wins; omitted body/source/metadata are
dropped, not preserved). Backfilling the 9 pai-review todos requires recalling each and
re-sending title/body/status/source unchanged plus new priority/area. Add a one-line warning to
the update flag descriptions. Old `metadata.priority` (gh-issue-triage pattern) may coexist with
top-level `priority` on legacy engrams — harmless, note in docs.

## Scope (fixed by roadmap)

In: TodoSchema fields, add/update handlers, todo CLI args, unknown-flag helper wired across all
write-surface leaves, doc-drift fixes (todo-add skill, note skill, research mode,
gh-issue-triage → first-class flags, session-plan --format, todo-check render prose, stale
"Todo File Format" block in todo-add), backfill of 9 pai-review todos.

Out (deferred, already noted in research): WSJF code reading priority (prose-only today);
hooks surfacing high-priority todos (aspirational in note skill).

## Verification gate

`bunx --bun tsc --noEmit` only. NEVER `bun test` (schemas.test.ts exists in tree but is not run;
adding optional fields breaks nothing in it).
