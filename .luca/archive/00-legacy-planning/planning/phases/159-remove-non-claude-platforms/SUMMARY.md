# Phase 159 Summary: Remove Non-Claude Platform Compilation

## Result: COMPLETE

**Duration:** ~23 minutes (18:03:25Z - 18:26:20Z)
**Complexity:** MODERATE
**Commits:** 3

## What Was Done

Removed all Cursor, Pi, and Qwen platform compilation logic, output directories, adapter code, and references. Claude Code is now the sole compilation target. The build pipeline produces only `.claude/` and `dist/plugin/` outputs.

## Commits

| Wave  | Commit    | Description                                                                    |
| ----- | --------- | ------------------------------------------------------------------------------ |
| A+B+C | `da351de` | Delete output dirs, remove entity format methods, narrow hook platform schemas |
| D     | `03704cd` | Remove from compilers, scripts, interop, config                                |
| E     | `a6ba3b2` | Content sweep — docs, hook scripts, remaining stragglers                       |

## Key Changes

### Deleted (Wave A)

- `.cursor/` directory (entire tree — 8 subdirectories, 130+ files)
- `.pi/` directory (entire tree — agents, skills, extensions, hook-scripts)
- `.qwen/` directory (entire tree)
- `src/hooks/adapters/cursor.adapter.ts`
- `src/hooks/adapters/pi.adapter.ts`
- `src/hooks/pi-extensions/` directory (20 files — extensions, helpers, types)

### Narrowed Type Surface (Waves B-C)

- `BaseAgent`, `BaseSkill`, `BaseRule` types: removed `toCursorFormat()` and `toPiFormat()` methods
- `SupportedFormat`: narrowed from `"CLAUDE" | "CURSOR" | "PLUGIN" | "PI"` to `"CLAUDE" | "PLUGIN"`
- `ADAPTER_PLATFORMS`: narrowed from `["claude-code", "cursor", "pi"]` to `["claude-code"]`
- `SUPPORTED_PLATFORMS`: narrowed from `["claude-code", "cursor", "pi"]` to `["claude-code"]`
- `PARITY_FORMATS`: narrowed from `["claude", "cursor", "pi", "plugin"]` to `["claude", "plugin"]`
- `SOURCE_TOOLS`: removed `"cursor"` entry
- `HookDefinitionSchema`: removed `cursor_event`, `pi_event`, `cursor_matcher`, `pi_matcher` fields

### Removed Dead Code (Wave C-D)

- `toCursorFormat()` and `toPiFormat()` from `src/shared/__helpers/format.ts`
- `adaptForCursor()` and `adaptForPi()` from `src/hooks/__helpers/platform-adapters.ts`
- `CURSOR_EVENT_MAP` and `PI_EVENT_MAP` from platform-adapters.ts
- `generateCursorHooksConfigFromCanonical()` and `generatePiExtensionFromCanonical()`
- `compileAgentCursor()`, `compileSkillCursor()`, `compileRuleCursor()` and Pi equivalents
- `cursorPlugin` and `piPlugin` from plugin-registry.ts
- `buildPiAgentFrontmatter()` from create-agent.ts
- `PI_EXTENSION_FILES`, `PI_HELPER_FILES` constants from build-shared.ts
- `generatePiOutputs()`, `generatePiSettings()`, `generatePiAgentsMd()` from build-shared.ts
- Pi OAuth token check from session-start.sh

### Updated References (Waves B, E)

- 15+ agent source files: `.cursor/` paths replaced with `.claude/` equivalents
- 15+ skill source files: `.cursor/luca/` paths replaced with `.claude/luca/`
- 7 rule source files: `.cursor/rules/*.mdc` references updated to `.claude/rules/*.md`
- `.planning/config.json`: `dogfood.outputs` narrowed to `[".claude/"]`
- `CLAUDE.md`: generated files reference updated
- `docs/`: troubleshooting, framework diagrams, directory trees updated

## Verification

- `bunx --bun tsc --noEmit` passes with zero errors
- No `.cursor/`, `.pi/`, or `.qwen/` directories exist
- `ADAPTER_PLATFORMS`, `SUPPORTED_PLATFORMS`, `PARITY_FORMATS`, `SOURCE_TOOLS` contain no cursor/pi values
- `SupportedFormat` type equals `"CLAUDE" | "PLUGIN"` only
- `hookAdapterRegistry` has a single key: `"claude-code"`
- Grep sweep confirms zero straggler references in `src/` and `docs/`

## Post-Session Action Required

**CRITICAL:** Run `bun run build:all` manually outside Claude Code to regenerate the `.claude/` output directory from the updated source. This cannot be run during a Claude Code session (crashes the process per critical memory note). The `.claude/` directory currently contains stale output from the previous build — it needs to be regenerated to reflect the source changes made in this phase.

## Deviations

- **[Rule 3 - Blocking]** Fixed root `index.ts` and `src/compilers/index.ts` barrel exports that still referenced removed `compileAgentCursor`/`compileSkillCursor`/`compileRuleCursor` — these were not listed in the plan but blocked TypeScript compilation.
- **[Rule 1 - Bug]** Fixed duplicate `toCursorFormat`/`toPiFormat` reference in `src/skills/general/rule-hook-skill-boundary.skill.ts` that was in both the skill and rule source (the skill had its own copy of the decision matrix text).
- Legacy migration scripts (`scripts/generate-*-from-cursor.ts`) retain historical `.cursor/` references — these are one-time migration tools that read FROM `.cursor/` during initial project setup and are no longer used in the active build pipeline.
