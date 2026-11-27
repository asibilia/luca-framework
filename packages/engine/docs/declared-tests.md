# Declared renames and ports

This page goes on from [A ticket's steps, fix loops, and bad tests](ticket-steps.md).
A ticket's owner can let the test-writer change old tests in two ways, each
with a table in the ticket's body: rename them, or port them to code the
ticket adds. Any other old test keeps its name and must still pass.

Both tables are read the same way (`intake/markdown-tables.ts`): by their
header, in any case, outside fenced code blocks, rows counted from 1 across
every table with that header. Each cell's value is its first code span; text
after it is a note. A name is a full test name, describe and test joined by
" > ", as bun prints it. Intake refuses the run for a malformed row, with a
message that names the row and the fix. The red check reads the tables again
from the ticket's snapshot body, so they need no snapshot field.

## Renamed tests

A test-writer may rename an old test, or remove its old
name, only when the ticket's renamed-tests table declares it. The owner writes
the table anywhere in the ticket's body; `## Renamed tests` is the heading to
use, but the engine finds the table by its header, `File`, `Old name`, `New
name` (in any case, in that order), outside fenced code blocks:

```markdown
## Renamed tests

| File | Old name | New name |
| --- | --- | --- |
| `src/greet.test.ts` | `greet > says hi` | `greet > says hello` |
| `src/greet.test.ts` | `describe('bye')` (its tests keep their titles) | `describe('farewell')` |
```

Each cell's value is its first code span; text after it is a note. A name is
a full test name, describe and test joined by " > ", as bun prints it. A
`describe('…')` name (in any quote) on both sides renames a describe: every
test in the file whose full name starts with `bye > ` is renamed to start
with `farewell > `. Only the start of the name counts, not a describe nested
inside another. `parseTestRenames` (`intake/test-renames.ts`) reads the
table. Intake refuses the run for a row with a cell that has no code span,
the same old and new name, an old name or a new name an earlier row gives in
the same file, or a describe name on one side and a full test name on the
other. The message names the row and the fix, such as "The renamed-tests
table's row 2 has no new name in backticks."

The red check reads the table again from the ticket's snapshot body, so it
needs no new snapshot field. An old test neither in its file nor moved, that
the table renames, is judged under its new name in the same file:

- Mapped to a criterion, it is a new test: it must fail first, like any
  mapped test, and the old name is only noted (`…: renamed to "…", as the
  ticket declares; mapped to a criterion, so it must fail first`).
- Not mapped, it is an old test: it must still pass (`…, renamed to "…" as
  the ticket declares, no longer passes` otherwise). Its new name is not an
  unmapped new test.
- No test of the new name in the file is a problem: `old test "…" in … was
  declared renamed to "…", but no test of that name is in the file`. A file
  with no results (it doesn't load yet, or its Swift tests don't build) is
  read from its text. A new name found there that is mapped is noted. One
  that is not mapped must still pass, so a file that doesn't load is a
  problem (`… no longer passes (its file does not load yet)`), while Swift
  tests that don't build yet are noted and left to the gates (#668).
- An old test the table doesn't rename is missing, as before: `old test "…"
  in … is missing (rename a test only when the ticket's renamed-tests table
  names it)`.

A row whose old name no test passed under at the baseline is a note, not a
problem: `the ticket declares "…" in … renamed, but no such test passed at
the baseline`.

## Ported tests

An expand–contract change can port old tests to a new mount or helper the
ticket adds, keeping their file and names. Those tests can only pass once
the ticket's code exists. The owner names them in a ported-tests table, with
the header `File`, `Tests`; `## Ported tests` is the heading to use:

```markdown
## Ported tests

| File | Tests |
| --- | --- |
| `packages/armory/tests/app.test.tsx` | `*` (only the mount changes) |
| `packages/armory/tests/error-boundary.test.tsx` | `describe('the error boundary')` |
| `packages/armory/tests/remembered-file.test.tsx` | `remembered-file > a new file replaces the stored one` |
```

The Tests cell is a full test name, `describe('…')` (in any quote: every test
whose full name starts with `the error boundary > `), or `*` (every test in
the file). `parseTestPorts` (`intake/test-ports.ts`) reads it. Intake refuses
a row with a cell that has no code span, a row that repeats an earlier row's
file and tests, and a row for a file that a `*` row also names (the `*` row
ports every test in it already): "The ported-tests table's row 2 has no file
in backticks."

A port keeps names. To rename a ported test too, put it in the renamed-tests
table as well; the ported-tests table may then name it by its old or its new
name. In the red check, an old test the table names:

- Failing is a note, not a problem: `old test "…" in …: fails, as a declared
  port may until the ticket's code exists; the gates must see it pass`.
  Passing is noted too. Renamed as well and not mapped, it may fail too.
- In a file with no results (it doesn't load yet, or its Swift tests don't
  build), its name must still be in the file's text: noted if it is.
- Gone from the file is a problem: `old test "…" in … is declared ported, but
  no test of that name is in the file`.
- Mapped to a criterion, it is judged as a mapped test: it must fail first.

Any other old test that fails is the problem `old test "…" in … no longer
passes (an old test may fail here only when the ticket's ported-tests table
names it)`. A port row that names no test that passed at the baseline is a
note: `the ticket declares "…" in … ported, but no such test passed at the
baseline`.

The ticket's gates just run the test commands, so a ported test must pass
there like any other test. A ported test failing in the red check is no old
test failure for a lone rerun (#544): replay leaves it out of
`old_test_failures`. A bad test resets the worktree to its last commit, so the
red commit's ports stay, and the fresh test-writer is told not to undo them.
The implementer is told a ported test that fails before its code lands is no
bad test.
