---
title: Reduce repo pollution from install/update and sunset legacy memory files
area: install
created: 2026-04-01
source: conversation
related: remove-cursor-adapter-remnants
---

## Context

When a user installs the luca-framework npm package on a new machine and runs `luca update`, the framework dumps ~59 files (~656 KB) of reference docs, templates, and workflows into `.planning/` in their project repo. This contradicts the design philosophy where framework artifacts live at `~/.claude/` (user-level) so users can share the framework across repositories seamlessly without repo pollution.

Additionally, `BRAIN.md`, `MEMORY.md`, and `WORKING.md` are still being created by `session-start.sh` and base templates, even though MuninnDB has fully replaced file-based memory. These are legacy files that no longer serve as the source of truth.

## Task

### Part 1: Move framework reference material out of the repo

The following directories are framework documentation (identical across every repo) and should NOT live in the user's project:

- `.planning/references/` (11 files, ~128 KB) -- concept docs like checkpoints, complexity matrix, TDD
- `.planning/templates/` (34 files, ~280 KB) -- document templates for BRAIN.md, phase-prompt, roadmap, etc.
- `.planning/workflows/` (14 files, ~248 KB) -- workflow guides for execute-plan, verify-phase, etc.

These should move to `~/.claude/luca/` (or `~/.luca/`) at the user level. Key code paths to change:

1. **`packages/luca-framework/src/commands/update.ts:135-140`** -- `collectTemplateFiles()` adds `.planning` prefix to all framework files. Should route references/templates/workflows to user-level dir instead.
2. **`packages/luca-framework/src/utils/files.ts:173-208`** -- `generateFiles()` creates `.planning/` subdirectories. Should conditionally skip framework reference dirs.
3. **`packages/luca-framework/src/commands/vault-init.ts:204-209`** -- `generateFiles({ planningOnly })` flag needs refinement to distinguish project state vs framework docs.
4. **Skill/agent `@` file references** -- currently point to `.planning/workflows/` etc. Need to update to the new user-level location.
5. **`packages/luca-framework/templates/framework/index.json`** -- lists `workflows/`, `references/`, `templates/` as contents. Needs routing metadata.

**What SHOULD remain in `.planning/`** (project-specific state):

- `config.json`, `state.json`, `session-ledger.jsonl`
- `ROADMAP.md`, `PROJECT.md`, `CANONICAL-DECISIONS.md`
- `phases/`, `todos/`, `milestones/`, `summaries/`

### Part 2: Sunset legacy file-based memory (BRAIN.md, MEMORY.md, WORKING.md)

MuninnDB is the canonical memory system. These files are legacy but still actively created and read:

1. **`templates/hooks/scripts/session-start.sh`** -- creates BRAIN.md, MEMORY.md, WORKING.md on every session start if missing. Should stop creating them (or create a minimal pointer file that says "use MuninnDB").
2. **`templates/hooks/scripts/context-monitor.sh`** -- uses WORKING.md/MEMORY.md file size as a context usage proxy. Should use MuninnDB session metrics or a different signal.
3. **`templates/hooks/scripts/session-persist.sh`** -- writes to WORKING.md on session end. Should persist to MuninnDB instead.
4. **`templates/base/.planning/WORKING.md`** -- base template that seeds WORKING.md. Should be removed.
5. **`templates/framework/workflows/cognitive-preflight.md`** -- reads BRAIN.md and greps MEMORY.md as fallback. Should be MuninnDB-first with no file fallback.
6. **`src/skills/general/seed-memory.skill.ts`** -- exists to bridge file-based memory into MuninnDB. After sunset, this skill becomes unnecessary (or becomes a one-time migration tool only).
7. **`src/shared/__schemas/shadow-scanner.schemas.ts`** -- allowlists BRAIN.md/MEMORY.md/WORKING.md at `.planning/` root. Should be removed from allowlist after sunset.
8. **`src/rules/general/planning-structure.rule.ts`** -- documents these files as canonical. Should be updated.

### Migration path

- Existing repos that have BRAIN.md/MEMORY.md with real content: `seed-memory` skill can do a one-time migration to MuninnDB, then the files can be deleted.
- New installs should never create these files.

## Notes

- This is related to `remove-cursor-adapter-remnants.md` -- both are cleanup from incomplete platform migrations.
- The manifest system (`manifest.json`) tracks installed files and will need updating to reflect the new installation locations.
- Consider a `luca migrate` command that moves framework docs to user-level and seeds MuninnDB from legacy files in one step.
- `.planning/` should still exist for project state -- this is about removing the ~59 framework reference files, not the directory itself.
