# 01-03 Summary: Fix bridge CLI documentation drift and add --help flag

## Status: COMPLETE

## Tasks Completed

### t1: Verify JSDoc accuracy

**Result:** Already correct. Lines 8-24 of `bridge.ts` list "Subcommands (15)" with all 15 subcommands.

### t2: Verify architecture-overview accuracy

**Result:** Already correct. `docs/architecture-overview.md` line 129 references "15 subcommands" and lists all categories.

### t3: Add --help flag to bridge CLI

**Changes:**

- Replaced flat `printUsage()` with a categorized `HELP_TEXT` constant organized by command category (read, write, lifecycle, observability)
- Added `VALID_SUBCOMMANDS` constant (typed tuple of all 15 subcommand names)
- `--help`, `-h`, and no-subcommand now print help to stdout and exit 0
- `printUsage()` accepts a `stream` parameter ("stdout" | "stderr") for correct output routing

### t4: Improve unknown subcommand error

**Changes:**

- Unknown subcommands now print: the invalid name, the full list of valid subcommands, and a hint to run `--help`
- Exits with code 2 (unchanged)

## Verification Results

| Check                            | Result                             |
| -------------------------------- | ---------------------------------- |
| `bunx --bun tsc --noEmit`        | Pass (no errors)                   |
| `bun bridge.ts --help`           | Prints all 15 subcommands, exits 0 |
| `bun bridge.ts` (no args)        | Prints help, exits 0               |
| `bun bridge.ts bad-cmd`          | Prints error + valid list, exits 2 |
| JSDoc says 15 subcommands        | Confirmed                          |
| architecture-overview.md says 15 | Confirmed                          |

## Files Modified

- `packages/luca-framework/src/state/bridge.ts` -- added HELP_TEXT, VALID_SUBCOMMANDS, --help handling, improved error message
