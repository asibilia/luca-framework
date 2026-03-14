---
title: Remove non-Claude platform compilation and config (Cursor, Pi, Qwen)
area: compilers/build
created: 2026-03-14
source: conversation
---

## Context

Luca currently compiles agents, skills, rules, and hooks to three platforms: Claude Code (`.claude/`), Cursor (`.cursor/`), and Pi (`.pi/`). There's also a `.qwen/` directory. The multi-platform approach adds complexity to the build pipeline, adapters, format functions, and dogfood config. We're doubling down on Claude Code as the sole target platform.

## Task

Remove all non-Claude platform compilation, output directories, and config references.

### Directories to Delete

- `.cursor/` — generated Cursor output (agents, skills, rules, hooks)
- `.pi/` — generated Pi output (agents, extensions)
- `.qwen/` — Qwen integration files

### Source Files to Remove

- `src/hooks/adapters/cursor.adapter.ts` — Cursor hook config adapter
- `src/hooks/adapters/pi.adapter.ts` — Pi hook config adapter
- `src/hooks/pi-extensions/` — Pi-specific extensions (e.g., `luca-complexity.ts`)

### Source Files to Modify

- `src/hooks/adapters/adapter-registry.ts` — Remove Cursor/Pi adapter registrations
- `src/hooks/adapters/adapter.schemas.ts` — Remove Cursor/Pi adapter schemas
- `src/hooks/adapters/index.ts` — Remove Cursor/Pi barrel exports
- `src/compilers/__helpers/compile.ts` — Remove `toCursorFormat()`, `toPiFormat()` calls
- `src/compilers/__helpers/plugin-registry.ts` — Remove Cursor/Pi plugin output
- `src/compilers/__helpers/parity.ts` — Remove cross-platform parity checks
- `src/compilers/__schemas/compilers.schemas.ts` — Remove Cursor/Pi format schemas
- `src/shared/__helpers/format.ts` — Remove `toCursorFormat()` function (keep `toClaudeFormat()`)
- `src/shared/index.ts` — Remove `toCursorFormat` barrel export
- `src/agents/__helpers/create-agent.ts` — Remove `toCursorFormat()`/`toPiFormat()` from BaseAgent
- `src/skills/__helpers/create-skill.ts` — Remove `toCursorFormat()`/`toPiFormat()` from BaseSkill
- `src/rules/__helpers/create-rule.ts` — Remove `toCursorFormat()`/`toPiFormat()` from BaseRule
- `scripts/build-all.ts` — Remove Cursor/Pi output generation steps
- `scripts/check-drift.ts` — Remove `.cursor/`, `.pi/` drift checks

### Config to Update

- `.planning/config.json` — Remove `.cursor/` and `.pi/` from `dogfood.outputs` array
- `CLAUDE.md` — Update generated file references (remove `.cursor/`, `.pi/` mentions)
- `.claude/rules/` — Update rules that reference `.cursor/` or `.pi/` directories
- `.gitignore` — Add `.cursor/`, `.pi/`, `.qwen/` if not already ignored (or just delete and stop tracking)

### Agent/Skill/Rule Definitions to Update

- Any agent, skill, or rule `.ts` files that reference `.cursor/` paths in their content (e.g., `phase-execute.skill.ts` references `.cursor/luca/references/`)
- Grep for `.cursor/` and `.pi/` across all `src/` files

### Documentation to Update

Critical — stale docs referencing removed platforms will confuse future contributors.

**docs/ files with platform references:**

- `docs/generation-system.md` — Describes multi-platform compilation pipeline, directory tree shows `.cursor/`, `.pi/` output
- `docs/agent-framework/README.md` — References cross-platform compilation
- `docs/agent-framework/luca/README.md` — References Cursor/Pi formats
- `docs/agent-framework/luca/framework-diagram.md` — Diagram shows multi-platform output
- `docs/style-guide/coding-standards.md` — May reference cross-platform patterns
- `docs/troubleshooting.md` — May reference Cursor/Pi debugging

**Rules with platform references (source in `src/rules/`):**

- `hook-skill-boundary` rule — References "Both platforms" (Claude Code and Cursor), `.cursor/hooks.json`, different event name formats
- `harness-verification` rule — May reference Cursor hooks
- `domain-architecture` rule — References compilation to `.cursor/`, `.pi/`
- `cursor-rules` rule — Entirely about Cursor rule authoring format; may need removal or renaming
- `self-improve` rule — References `.cursor/rules/` paths

**Other markdown:**

- `AGENTS.md` — Check for cross-platform references
- `.pi/AGENTS.md` — Will be deleted with `.pi/` directory
- Root `README.md` — Check for multi-platform selling points

**What to grep for across all remaining files after cleanup:**

```
\.cursor/|\.pi/|toCursorFormat|toPiFormat|Cursor IDE|cursor\.adapter|pi\.adapter|\.qwen/|three platform|cross-platform compilation
```

## Notes

- This is a large refactor touching the build pipeline, compilers, adapters, and entity factories
- The `toCursorFormat()` function in `src/shared/__helpers/format.ts` is exported from the shared barrel — removing it is a breaking change for the public API (`index.ts`)
- After removal, `bun run build:all` should only write to `.claude/`
- The `.cursor/hooks.json` file is currently used by the user's Cursor IDE — need to decide whether to keep Cursor hooks as a separate manual config or remove entirely
- Consider whether `.cursor/rules/` (which mirrors `.claude/rules/`) should also be removed or kept as a convenience
