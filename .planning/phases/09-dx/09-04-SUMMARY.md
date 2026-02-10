# Plan 09-04 Summary: Documentation Accuracy -- Remove Stale References and Align Docs with Implementation

## Status: COMPLETE

## Tasks Completed

### Task 1: Remove all `luca execute` references and fix quickstart (DX-017 HIGH, DX-015 LOW)
- **Files:** `README.md`, `packages/luca-framework/README.md`, `docs/getting-started.md`, `docs/troubleshooting.md`
  - Removed all `luca execute` references (5 occurrences across 4 files)
  - Replaced with `/lu` command explanation: "Open a plan in your IDE and use the `/lu` command"
  - Fixed quickstart in `README.md` and `docs/getting-started.md` to use `mkdir my-project && cd my-project` then `npx create-luca` (instead of `npx create-luca my-project`)
  - Updated common commands table in `docs/getting-started.md` to replace `luca execute <path>` with `/lu`
  - Updated troubleshooting execution section to reference IDE-based execution instead of CLI

### Task 2: Fix Node.js version mismatch (DX-020 MEDIUM)
- **Files:** `docs/getting-started.md`, `docs/troubleshooting.md`
  - Changed "v20 or higher" to "v18 or higher" in getting-started.md prerequisites
  - Changed "Node.js v20+" to "Node.js v18+" in troubleshooting.md installation section

### Task 3: Fix GITHUB_TOKEN reference (DX-021 MEDIUM)
- **File:** `docs/troubleshooting.md`
  - Replaced `GITHUB_TOKEN` env var guidance with `gh auth login` for GitHub authentication
  - Updated section title from "Environment variables not detected" to "GitHub authentication not working"
  - Updated common errors table to recommend `gh auth login` for authentication failures

### Task 4: Fix STATE.md/PROJECT.md references (DX-022 LOW)
- **File:** `docs/getting-started.md`
  - Replaced stale `STATE.md` and `PROJECT.md` file descriptions with actual files: `config.json`, `BRAIN.md`, `MEMORY.md`, `WORKING.md`
  - Kept `phases/` reference (still accurate)

### Task 5: Fix stale compile:to-cursor script reference (DX-024 MEDIUM)
- **File:** `docs/generation-system.md`
  - Replaced `bun run compile:to-cursor` with actual build scripts: `build:all`, `build:cursor`, `build:claude`
  - Updated section description from single command to multi-format build options

### Task 6: Replace wrong-project coding standards (DX-019 MEDIUM)
- **File:** `docs/style-guide/coding-standards.md`
  - Completely replaced "joes-book" Next.js/Supabase coding standards (687 lines) with Luca-specific standards (393 lines)
  - New document covers: Luca tech stack (Bun, TypeScript, Zod, unbuild), file naming conventions (kebab-case, lu- prefix, UPPERCASE.md), functional patterns (no classes), Zod schema-first validation, Lodash preference, Bun test framework, conventional commit format, and project directory structure
  - All examples use Luca-domain concepts (agents, skills, rules, compilers) instead of Pokemon/golf examples

### Task 7: Fix SECURITY_QUESTIONNAIRE.md dead link (DX-023 LOW)
- **File:** `SECURITY.md`
  - Replaced broken markdown link `[.planning/SECURITY_QUESTIONNAIRE.md](.planning/SECURITY_QUESTIONNAIRE.md)` with a note explaining the questionnaire is generated during `luca init` and available locally in `.planning/`

## Verification

All stale references confirmed eliminated via grep:
- `luca execute` -- zero matches in README.md, packages/luca-framework/README.md, docs/
- `v20 or higher` / `v20+` -- zero matches in docs/
- `GITHUB_TOKEN` -- zero matches in docs/
- `STATE.md` / `PROJECT.md` -- zero matches in docs/getting-started.md
- `compile:to-cursor` -- zero matches in docs/
- `joes-book` -- zero matches in docs/
- `SECURITY_QUESTIONNAIRE.md` link -- removed from SECURITY.md

## Files Modified
1. `README.md` -- quickstart fix + removed `luca execute`
2. `packages/luca-framework/README.md` -- removed `luca execute` from core workflow
3. `docs/getting-started.md` -- Node.js version, quickstart, STATE.md/PROJECT.md, `luca execute`
4. `docs/troubleshooting.md` -- `luca execute`, Node.js version, GITHUB_TOKEN
5. `docs/generation-system.md` -- compile:to-cursor replaced with build scripts
6. `docs/style-guide/coding-standards.md` -- full replacement with Luca-specific standards
7. `SECURITY.md` -- SECURITY_QUESTIONNAIRE.md link fix
