# Plan 58-A: Add run:claude and run:cursor CLI Commands

## Objective

Add `luca run:claude` command that invokes `claude --plugin-dir` with the correct path to the installed package's dist/ directory. Add `luca run:cursor` as a stub.

## Tasks

### 1. Create run command file

**File:** `packages/luca-framework/src/commands/run.ts`

Using citty, create a command with subcommands:

- `run:claude` — Execute: `claude --plugin-dir <resolved-path-to-dist>`
- `run:cursor` — Stub: Print message that Cursor support is coming

The plugin-dir path should resolve to the package's own dist/ directory (where compiled rules, skills, agents live).

### 2. Register in CLI router

Update `packages/luca-framework/src/index.ts` to add the `run` subcommand.

## Verification

- TypeScript compiles
- `luca run:claude --help` shows usage
- `luca run:cursor` shows stub message
