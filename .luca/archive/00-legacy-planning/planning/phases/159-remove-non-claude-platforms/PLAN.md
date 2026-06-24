---
phase: 159
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 159 Plan 1: Remove Non-Claude Platform Compilation

## Objective

Remove all Cursor, Pi, and Qwen platform compilation logic, output directories, adapter code, and references throughout the codebase. After this phase, Claude Code is the sole compilation target. The build pipeline, adapter registry, compiler plugins, parity checker, and all content references must reflect a single-platform architecture.

> NOTE: `bun run build:all` MUST NOT be run during a Claude Code session — it crashes the process. The final build validation step is documented in Wave E and must be run manually by the developer after the session ends.

## Context

- @src/hooks/adapters/adapter-registry.ts — registry mapping platform IDs to adapters; remove cursor and pi entries
- @src/hooks/adapters/adapter.schemas.ts — ADAPTER_PLATFORMS const; narrow to ["claude-code"]
- @src/hooks/adapters/index.ts — barrel re-exporting cursor and pi adapters; remove those exports
- @src/hooks/\_\_helpers/platform-adapters.ts — CURSOR_EVENT_MAP, PI_EVENT_MAP, adaptForCursor, adaptForPi, canonicalToLegacy; strip cursor/pi logic
- @src/hooks/\_\_helpers/portable-hook.ts — SUPPORTED_PLATFORMS includes cursor and pi; narrow to ["claude-code"]
- @src/hooks/\_\_helpers/config-generators.ts — generateCursorHooksConfigFromCanonical, generatePiExtensionFromCanonical; remove
- @src/hooks/\_\_schemas/hook.schemas.ts — HookDefinition has cursor_event, pi_event, cursor_matcher, pi_matcher fields; remove
- @src/compilers/\_\_helpers/compile.ts — SupportedFormat includes CURSOR and PI; remove those branches
- @src/compilers/\_\_helpers/plugin-registry.ts — cursorPlugin and piPlugin registered; remove
- @src/compilers/\_\_helpers/parity.ts — FORMAT_PATTERNS and FORMAT_ENTITY_SUPPORT reference cursor and pi; remove
- @src/compilers/\_\_schemas/compilers.schemas.ts — PARITY_FORMATS includes cursor and pi; remove
- @src/interop/\_\_schemas/interop.schemas.ts — SOURCE_TOOLS includes cursor; interopScanConfigSchema defaults include .cursor/agents; remove
- @src/interop/\_\_helpers/normalizer.ts — detectSourceTool maps .cursor/ prefix; remove
- @src/interop/\_\_helpers/scanner.ts — scan_dirs default includes .cursor/agents; remove
- @scripts/build-shared.ts — generates .cursor/ and .pi/ outputs, calls generateCursorHooksConfigFromCanonical and generatePiOutputs; remove all
- @scripts/build-all.ts — prepares and cleans .cursor/ and .pi/ directories; remove
- @scripts/check-drift.ts — checks .cursor/rules/ for drift; remove
- @.planning/config.json — dogfood.outputs includes .cursor/ and .pi/; remove
- @CLAUDE.md — mentions .cursor/ and .pi/ as generated dirs; update
- @docs/ — multiple files reference .cursor/ and .pi/ paths; update
- @src/rules/general/ — several rule sources reference .cursor/ paths in their content
- @src/skills/general/ — several skill sources reference .cursor/ paths in their content
- @src/agents/general/ — several agent sources reference .cursor/ or .pi/ paths

## Tasks

### 1. Wave A — Delete output directories and dead source files

**Type:** auto
**TDD:** false
**Depends on:** none

> **IMPORTANT — Contiguous execution:** Waves A through C must execute without any intermediate commits or pre-commit gate runs. TypeScript errors are expected and intentional after Wave A (broken adapter imports) and after Wave B (schema methods removed before the shared layer is cleaned). Do NOT run `bunx --bun tsc --noEmit` as a blocking gate until Wave C is fully complete. Proceed immediately from Wave A to Wave B to Wave C.

Delete all tracked output directories and the two Pi/Cursor adapter source files. These are pure deletions with no callers to update first.

**Files to delete:**

- `.cursor/` — entire directory tree (git rm -r)
- `.pi/` — entire directory tree (git rm -r)
- `.qwen/` — entire directory tree if present (git rm -r)
- `src/hooks/adapters/cursor.adapter.ts`
- `src/hooks/adapters/pi.adapter.ts`
- `src/hooks/pi-extensions/` — entire directory tree (git rm -r)

After deletion, add to `.gitignore`:

```
.cursor/
.pi/
.qwen/
```

**Verification:**

- `git status` shows all deleted paths staged
- `.gitignore` contains entries for `.cursor/`, `.pi/`, `.qwen/`
- `ls .cursor .pi .qwen 2>&1` returns "No such file" for all three
- `bunx --bun tsc --noEmit` — expected to fail at this point because imports to deleted adapters remain; proceed to Wave B immediately

---

### 2. Wave B — T2 entity sources: remove platform references in agents, skills, rules

**Type:** auto
**TDD:** false
**Depends on:** 1

Update agent, skill, and rule source files that embed platform-specific path references in their content strings, and remove `toCursorFormat()` and `toPiFormat()` interface method declarations from all three T2 entity schema files.

**Files to edit:**

Agents:

- `src/agents/general/qa-plan-generator.agent.ts` — remove `.cursor/` and `.pi/` from compiler output description
- `src/agents/general/lu-integration-checker.agent.ts` — remove `.cursor/agents/`, `.pi/`, from source→build output descriptions and the shell if-block checking `.cursor/hooks.json`
- `src/agents/general/product.agent.ts` — remove `.cursor/`, `.pi/` from outputs list
- `src/agents/general/ui.agent.ts` — remove `.cursor/rules/` and `.cursor/agents/` from review context
- `src/agents/general/security-auditor.agent.ts` — remove `.cursor/hooks/` from hook scripts description
- `src/agents/general/lu-research-synthesizer.agent.ts` — replace `.cursor/luca/templates/` references with `.claude/luca/templates/`
- `src/agents/general/lu-roadmapper.agent.ts` — replace `.cursor/luca/templates/` references with `.claude/luca/templates/`
- `src/agents/general/lu-test-writer.agent.ts` — remove `toCursorFormat()` content string reference (line 131)
- `src/agents/__helpers/build-agent-registry.ts` — update comment referencing `.cursor/` output
- `src/agents/__schemas/agent.schemas.ts` — remove `toCursorFormat()` and `toPiFormat()` interface method declarations

Skills:

- `src/skills/general/phase-discuss.skill.ts` — replace `.cursor/luca/` refs with `.claude/luca/`
- `src/skills/general/quick.skill.ts` — replace `.cursor/luca/references/` with `.claude/luca/references/`
- `src/skills/general/update.skill.ts` — replace `.cursor/luca/VERSION` with `.claude/luca/VERSION`
- `src/skills/general/rule-hook-skill-boundary.skill.ts` — remove Cursor IDE hook paragraph
- `src/skills/general/choose.skill.ts` — remove `.cursor/plans/` row from comparison table
- `src/skills/general/debug.skill.ts` — replace `.cursor/luca/references/` with `.claude/luca/references/`
- `src/skills/general/phase-execute.skill.ts` — replace `.cursor/luca/` refs with `.claude/luca/`
- `src/skills/general/milestone-complete.skill.ts` — replace `.cursor/luca/` refs with `.claude/luca/`
- `src/skills/general/verify.skill.ts` — replace `.cursor/luca/` refs with `.claude/luca/`
- `src/skills/general/pr-address.skill.ts` — replace `.cursor/luca/` and `.cursor/agents/` refs with `.claude/` equivalents
- `src/skills/__schemas/skill.schemas.ts` — remove `toCursorFormat()` and `toPiFormat()` interface method declarations

Rules:

- `src/rules/general/cursor-rules.rule.ts` — this rule documents Cursor-specific rule format; retain the rule itself but note it is for historical/reference purposes only, or remove the rule if it has no Claude Code relevance. Default: retain but update header to clarify it is no longer the active IDE.
- `src/rules/general/hook-skill-boundary.rule.ts` — remove Cursor platform paragraph from content
- `src/rules/general/self-improve.rule.ts` — any `.cursor/rules/` references in examples
- `src/rules/general/atlassian-mcp.rule.ts` — any `.cursor/` refs
- `src/rules/general/mandatory-documentation.rule.ts` — any `.cursor/` refs
- `src/rules/profiles/typescript/*.rule.ts` — scan for `.cursor/` mdc: references and update to `.claude/rules/`
- `src/rules/__schemas/rule.schemas.ts` — remove `toCursorFormat()` and `toPiFormat()` interface method declarations

**Verification:**

- `bunx --bun tsc --noEmit` — still expected to fail (hook adapter imports still broken); proceed immediately to Wave C

---

### 3. Wave C — T0/T1 hook layer: narrow platform schema and remove dead adapters

**Type:** auto
**TDD:** false
**Depends on:** 2

Remove all cursor and pi logic from the hooks module. This fixes the broken imports from Wave A and updates schemas to reflect the single-platform reality.

**Files to edit:**

`src/hooks/adapters/adapter.schemas.ts`:

- Change `ADAPTER_PLATFORMS` from `["claude-code", "cursor", "pi"]` to `["claude-code"]`
- Update JSDoc

`src/hooks/adapters/adapter-registry.ts`:

- Remove `import { cursorAdapter } from "./cursor.adapter"`
- Remove `import { piAdapter } from "./pi.adapter"`
- Remove `cursor: cursorAdapter` and `pi: piAdapter` from registry object
- Update JSDoc

`src/hooks/adapters/index.ts`:

- Remove Cursor adapter re-exports block
- Remove Pi adapter re-exports block

`src/hooks/__helpers/portable-hook.ts`:

- Change `SUPPORTED_PLATFORMS` from `["claude-code", "cursor", "pi"]` to `["claude-code"]`
- Change default in `PortableHookConfigSchema.platforms` from `["claude-code", "cursor", "pi"]` to `["claude-code"]`
- Remove `detectPlatform` Cursor and Pi env-var branches
- Update JSDoc and example comments

`src/hooks/__helpers/platform-adapters.ts`:

- Remove `CURSOR_EVENT_MAP` constant
- Remove `PI_EVENT_MAP` constant
- Remove `adaptForCursor` function
- Remove `adaptForPi` function
- In `canonicalToLegacy`: remove cursor and pi adapter calls; remove `cursor_event`, `pi_event`, `cursor_matcher`, `pi_matcher` fields from returned object

`src/hooks/__schemas/hook.schemas.ts`:

- Remove `cursor_event`, `pi_event`, `cursor_matcher`, `pi_matcher` fields from `HookDefinitionSchema`
- Update JSDoc

`src/hooks/__helpers/config-generators.ts`:

- Remove `generateCursorHooksConfigFromCanonical` function (and its Pi imports from pi-extensions/\_\_helpers)
- Remove `generatePiExtensionFromCanonical` function
- Remove any remaining imports from pi-extensions
- Update barrel if needed

`src/hooks/index.ts`:

- Remove exports of `generateCursorHooksConfigFromCanonical`, `generatePiExtensionFromCanonical`
- Remove exports of `cursorAdapter`, `piAdapter`, `CURSOR_ADAPTER_EVENT_MAP`, `PI_ADAPTER_EVENT_MAP`
- Remove `cursorAdapt`, `piAdapt` exports

`src/shared/__helpers/format.ts`:

- Remove `toCursorFormat` function (line 39 and surrounding implementation)
- Remove `toPiFormat` function (line 68 and surrounding implementation)
- Update module JSDoc to reflect Claude Code-only formatting

`src/shared/index.ts`:

- Remove `toCursorFormat` barrel re-export (line 32)
- Remove `toPiFormat` barrel re-export if present

**Verification:**

- `bunx --bun tsc --noEmit` — should now pass for the hooks module; any remaining errors are in scripts/ or compilers/ (addressed in Wave D)

---

### 4. Wave D — Build infrastructure: compilers, scripts, config

**Type:** auto
**TDD:** false
**Depends on:** 3

Update the compiler plugins, parity checker, schemas, interop scanner, and all build scripts to remove cursor/pi logic. Also update `.planning/config.json` and `CLAUDE.md`.

**Files to edit:**

`src/compilers/__helpers/compile.ts`:

- Remove `SupportedFormat` values `"CURSOR"` and `"PI"` — change to `"CLAUDE" | "PLUGIN"`
- Remove `validateFormat` check for CURSOR and PI
- Remove `compileAgentCursor`, `compileSkillCursor`, `compileRuleCursor` functions
- Remove `compileAgentPi`, `compileSkillPi`, `compileRulePi` functions
- Remove CURSOR and PI cases from `compileAgent`, `compileSkill`, `compileRule` dispatchers
- Update module JSDoc

`src/compilers/__helpers/plugin-registry.ts`:

- Remove `cursorPlugin` constant and registration
- Remove `piPlugin` constant and registration
- Remove imports of `compileAgentCursor`, `compileSkillCursor`, `compileRuleCursor`, `compileAgentPi`, `compileSkillPi`, `compileRulePi`
- Remove `"CURSOR"` and `"PI"` from registry Map

`src/compilers/__helpers/parity.ts`:

- Remove `cursor` and `pi` entries from `FORMAT_PATTERNS`
- Remove `"cursor"` and `"pi"` from `FORMAT_ENTITY_SUPPORT` arrays for agent, skill, rule
- Update module JSDoc

`src/compilers/__schemas/compilers.schemas.ts`:

- Remove `"cursor"` and `"pi"` from `PARITY_FORMATS`
- Update `ParityFormat` type to `"claude" | "plugin"`

`src/interop/__schemas/interop.schemas.ts`:

- Remove `"cursor"` from `SOURCE_TOOLS`
- Remove `.cursor/agents` from `interopScanConfigSchema.scan_dirs` default

`src/interop/__helpers/normalizer.ts`:

- Remove `{ prefix: ".cursor/", tool: "cursor" }` entry from tool detection map

`src/interop/__helpers/scanner.ts`:

- Remove `".cursor/agents"` from default scan directories

`scripts/build-shared.ts`:

- Remove all `generatePiOutputs`, `generatePiAgentsMd`, `generatePiSettings` functions
- Remove all `.cursor/agents/`, `.cursor/skills/`, `.cursor/rules/`, `.cursor/hooks/` generated.set calls
- Remove all `.pi/agents/`, `.pi/skills/`, `.pi/extensions/`, `.pi/hook-scripts/` generated.set calls
- Remove import and call of `generateCursorHooksConfigFromCanonical`
- Remove `PI_EXTENSION_FILES`, `PI_HELPER_FILES` constants
- Remove `".cursor/hooks.json"` generation block
- Remove `".pi/settings.json"` generation block
- Remove `compileAgent(instance, "CURSOR")` and `compileAgent(instance, "PI")` calls
- Remove `compileSkill(instance, "CURSOR")` and `compileSkill(instance, "PI")` calls
- Remove `compileRule(instance, "CURSOR")` calls
- Update module JSDoc comment block

`scripts/build-all.ts`:

- Remove `cursorDir`, `cursorAgentsDir`, `cursorSkillsDir`, `cursorRulesDir`, `cursorHooksDir` variables
- Remove `piDir`, `piAgentsDir`, `piSkillsDir`, `piExtensionsDir`, `piExtensionsHelpersDir` variables
- Remove those dirs from `ensureDir` calls and `cleanDirectory` calls
- Remove corresponding `removedCursor*` and `removedPi*` variables from destructured result
- Remove those counts from `totalRemoved` sum
- Update module JSDoc

`scripts/check-drift.ts`:

- Remove the `.cursor/rules/` orphan check block (lines scanning `cursorDir`)
- Update module JSDoc

`.planning/config.json`:

- Remove `".cursor/"` and `".pi/"` from `dogfood.outputs` array

`CLAUDE.md`:

- Update the generated files paragraph: change `.claude/`, `.cursor/`, `.pi/` to just `.claude/`
- Update build pipeline description if it mentions .cursor or .pi outputs

**Verification:**

- `bunx --bun tsc --noEmit` — must pass cleanly with zero errors
- Confirm no remaining `"cursor"` or `"pi"` in `ADAPTER_PLATFORMS`, `SUPPORTED_PLATFORMS`, `PARITY_FORMATS`, `SOURCE_TOOLS`, or `SupportedFormat`

---

### 5. Wave E — Content sweep: docs, remaining straggler references

**Type:** auto
**TDD:** false
**Depends on:** 4

Perform a comprehensive grep sweep to catch all remaining cursor/pi/qwen references in docs, notes, and any source files not yet addressed. Update or remove as appropriate.

**Sweep targets:**

Documentation files with known refs:

- `docs/troubleshooting.md` — remove or archive Pi troubleshooting section (PAT token issue)
- `docs/agent-framework/luca/framework-diagram.md` — remove cursor/pi nodes from Mermaid diagram
- `docs/agent-framework/luca/README.md` — update .cursor/rules/ reference to .claude/rules/; remove .cursor/ from output dir tree
- `docs/agent-framework/README.md` — remove cursor/pi from platform list
- `docs/workflow-system/systematization-gaps.md` — remove cursor/pi platform mentions
- `docs/generation-system.md` — update directory tree, remove .cursor/ and .pi/ output sections
- `docs/style-guide/coding-standards.md` — remove cursor-specific coding standards if present

Sweep commands to run after making targeted edits (for verification):

```bash
grep -rn "\.cursor/" src/ scripts/ docs/ CLAUDE.md .planning/config.json --include="*.ts" --include="*.md" --include="*.json"
grep -rn "\.pi/" src/ scripts/ docs/ CLAUDE.md .planning/config.json --include="*.ts" --include="*.md" --include="*.json"
grep -rn "\"cursor\"\|'cursor'" src/ scripts/ --include="*.ts"
grep -rn "\"pi\"\|'pi'" src/ scripts/ --include="*.ts"
grep -rn "qwen\|QWEN" src/ scripts/ docs/ --include="*.ts" --include="*.md"
```

Allowed remaining references after the sweep:

- `src/interop/__schemas/interop.schemas.ts` — `"cursor"` may appear in the SOURCE_TOOLS comment as a removed historical note (if kept for documentation)
- `docs/` — retrospective content explicitly noting removal is acceptable
- Test files (none currently exist per no-tests rule)

**Files to edit:** any files surfaced by the grep sweep that were not addressed in Waves A-D.

**Verification:**

- All five grep commands above produce zero results for unintended references
- `bunx --bun tsc --noEmit` — passes cleanly
- Manual post-session step: run `bun run build:all` outside Claude Code to confirm build succeeds and only `.claude/` and `dist/plugin/` outputs are written

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors after Wave C (incrementally confirmed each wave)
2. No `.cursor/` or `.pi/` directories exist at the repo root
3. `src/hooks/adapters/cursor.adapter.ts` and `src/hooks/adapters/pi.adapter.ts` do not exist
4. `src/hooks/pi-extensions/` directory does not exist
5. `ADAPTER_PLATFORMS`, `SUPPORTED_PLATFORMS`, `PARITY_FORMATS`, and `SOURCE_TOOLS` contain no cursor or pi values
6. `SupportedFormat` type in `compile.ts` equals `"CLAUDE" | "PLUGIN"` only
7. `hookAdapterRegistry` has a single key: `"claude-code"`
8. `.planning/config.json` dogfood outputs array is `[".claude/"]` only
9. `CLAUDE.md` generated-files paragraph references only `.claude/`
10. Grep sweeps (Wave E) return zero straggler hits

## Success Criteria

- Claude Code is the sole documented and compiled target platform
- Build pipeline compiles only to `.claude/` and `dist/plugin/`
- TypeScript compiles cleanly with no errors
- No dead code from cursor or pi adapter logic remains in `src/`
- `bun run build:all` (run manually after session) succeeds without writing to `.cursor/` or `.pi/`

## Output Specification

This plan produces no new files. It deletes and modifies existing files to reduce the platform surface to Claude Code only. Key artifacts after completion:

- Deleted: `.cursor/`, `.pi/`, `.qwen/`, `src/hooks/adapters/cursor.adapter.ts`, `src/hooks/adapters/pi.adapter.ts`, `src/hooks/pi-extensions/`
- Modified: adapter registry, portable-hook, platform-adapters, compile.ts, plugin-registry.ts, parity.ts, compilers.schemas.ts, interop schemas and helpers, build-shared.ts, build-all.ts, check-drift.ts, config.json, CLAUDE.md, docs/, rules sources, skills sources, agents sources
