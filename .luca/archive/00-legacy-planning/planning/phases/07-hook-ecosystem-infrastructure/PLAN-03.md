---
phase: 07
plan: 03
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 07 Plan 03: Selective Skill Scaffolding (Core vs Extended)

## Objective

Implement a two-tier skill system where skills are classified as "core" (always installed) or "extended" (installed based on preset). Currently all 49 skills are installed regardless of preset. After this plan:

- **Starter** preset installs ~12 core skills only
- **Standard** preset installs ~25 skills (core + commonly used)
- **Full** preset installs all ~49 skills

Additionally, add a `luca add-skill <name>` command for on-demand skill installation after init.

Dependency #11 (Progressive Config Presets) is already completed -- presets exist in `packages/luca-framework/src/utils/presets.ts`.

## Context

@packages/luca-framework/src/utils/files.ts
@packages/luca-framework/src/utils/wizard.ts
@packages/luca-framework/src/utils/presets.ts
@packages/luca-framework/src/utils/template.ts
@packages/luca-framework/src/types.ts
@packages/luca-framework/src/commands/init.ts
@packages/luca-framework/templates/harness/claude/skills/

## Tasks

### 1. Create Skill Manifest Schema and Data

**Type:** auto
**TDD:** false
**Depends on:** none

Create the skill classification manifest:

1. Define `SkillManifestEntrySchema` in `packages/luca-framework/src/utils/skill-manifest.ts`:
   - `name`: skill directory name (kebab-case)
   - `tier`: "core" | "standard" | "extended"
   - `category`: "git" | "planning" | "verification" | "session" | "config" | "workflow" | "debugging" | "analysis"
   - `description`: one-line description
   - `depends_on`: optional array of skill names this skill requires

2. Define `SkillManifestSchema` as `z.array(SkillManifestEntrySchema)`

3. Create the manifest data classifying all 49 skills into tiers:

   **Core (~12, always installed):**
   - lu (entry point router), help, quick (lightweight tasks)
   - git-commit, git-feature, git-pr (git workflow)
   - phase-plan, phase-execute, phase-discuss (core workflow)
   - verify (verification)
   - debug (debugging)
   - session-resume (continuity)

   **Standard (~13 more, installed at standard+):**
   - phase-research, phase-add, phase-insert, phase-assumptions
   - session-pause, session-plan
   - code-lint, code-typecheck
   - todo-add, todo-check
   - progress, choose
   - codebase-map

   **Extended (~24, full only):**
   - jira-issue (Jira integration)
   - pr-address (PR comment handling)
   - milestone-audit, milestone-complete, milestone-gaps, milestone-new
   - config-profile, config-settings
   - repo-audit
   - project-new
   - All remaining workflow/analysis skills

4. Export `getSkillsForPreset(preset: PresetId): string[]` that returns the list of skill names to install for a given preset

**Files to create/edit:**

- `packages/luca-framework/src/utils/skill-manifest.ts` (new)

**Verification:**

- All 49 skills are classified (no orphans)
- `getSkillsForPreset("starter")` returns ~12 skills
- `getSkillsForPreset("standard")` returns ~25 skills
- `getSkillsForPreset("full")` returns all ~49 skills
- `bunx --bun tsc --noEmit` passes

### 2. Filter Skills During Scaffolding

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `packages/luca-framework/src/utils/files.ts` to filter skills based on preset:

1. Import `getSkillsForPreset` from skill-manifest
2. In the Step 4.7 harness template copy loop, when processing the `skills/` subdirectory:
   - Read the preset from config (`config.preset`)
   - Get the allowed skill names via `getSkillsForPreset(preset)`
   - Only copy skill directories whose names are in the allowed list
   - Log how many skills were installed vs available

3. Non-skill harness files (agents, rules, settings) are unaffected -- always copy all of them

**Files to create/edit:**

- `packages/luca-framework/src/utils/files.ts` (update skill filtering logic)

**Verification:**

- `luca init --preset=starter` installs only core skills (~12)
- `luca init --preset=standard` installs core + standard (~25)
- `luca init --preset=full` installs all skills (~49)
- `luca init` (default = standard) installs ~25 skills
- Agents, rules, hooks are unaffected by preset
- `bunx --bun tsc --noEmit` passes

### 3. Create add-skill Command

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-framework/src/commands/add-skill.ts`:

1. Define command with citty:
   - `name`: "add-skill"
   - `description`: "Install additional skills on demand"
   - Args: positional `skill` (string, required), `--harness` (optional, default: auto-detect from manifest)

2. Implementation:
   - Read `.planning/manifest.json` to determine installed harnesses
   - Validate the requested skill name exists in the skill manifest
   - Check if the skill is already installed (check if directory exists)
   - Copy the skill template from the framework's template directory to each active harness
   - Update the manifest with the new file entries

3. Support `--list` flag to show available skills grouped by tier with installed status

**Files to create/edit:**

- `packages/luca-framework/src/commands/add-skill.ts` (new)

**Verification:**

- `bun run luca add-skill jira-issue` installs the jira-issue skill into active harnesses
- `bun run luca add-skill --list` shows all skills with tier and installed status
- Already-installed skills show a warning instead of overwriting
- Invalid skill names produce a clear error
- `bunx --bun tsc --noEmit` passes

### 4. Register add-skill Command in CLI

**Type:** auto
**TDD:** false
**Depends on:** 3

1. Import and register the `addSkillCommand` in the CLI entry point (likely `packages/luca-framework/src/commands/index.ts` or `bin/luca.ts` -- wherever commands are registered)
2. Add it as a subcommand alongside init, update, doctor, status

**Files to create/edit:**

- CLI entry point file (update to register new command)

**Verification:**

- `bun run luca add-skill --help` shows usage
- `bun run luca --help` lists add-skill in available commands
- `bunx --bun tsc --noEmit` passes

### 5. Write Skill Index JSON Templates

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `index.json` files in each harness template directory that list available skills with metadata. These are reference manifests used by `add-skill --list` when operating outside the framework source tree (npm consumers):

1. `packages/luca-framework/templates/harness/claude/skills/index.json`
2. `packages/luca-framework/templates/harness/cursor/skills/index.json`
3. `packages/luca-framework/templates/harness/pi/skills/index.json`

Each contains the same skill classification data, generated from the TypeScript manifest. These files are generated artifacts (like the rest of the templates).

**Files to create/edit:**

- `packages/luca-framework/templates/harness/claude/skills/index.json` (new)
- `packages/luca-framework/templates/harness/cursor/skills/index.json` (new)
- `packages/luca-framework/templates/harness/pi/skills/index.json` (new)

**Verification:**

- Each index.json lists all skills with tier, category, description
- JSON is valid and parseable
- Content matches the TypeScript manifest

## Verification

- `luca init --preset=starter` installs ~12 skills (core only)
- `luca init --preset=standard` installs ~25 skills (core + standard)
- `luca init --preset=full` installs all ~49 skills
- `luca add-skill <name>` installs a single skill into active harnesses
- `luca add-skill --list` shows skill catalog with tier and status
- All non-skill harness files (agents, rules, hooks) are always installed
- Manifest tracks newly added skills
- `bunx --bun tsc --noEmit` passes

## Success Criteria

- Starter preset produces a minimal, uncluttered installation (~12 skills)
- Standard preset provides a balanced set (~25 skills) covering common workflows
- Full preset installs everything (backward compatible with pre-tiering behavior)
- Users can add specific skills after init without reinstalling
- Skill classification is maintained in one place (TypeScript manifest) and generated to JSON

## Output Specification

- New: `packages/luca-framework/src/utils/skill-manifest.ts` (manifest + getSkillsForPreset)
- New: `packages/luca-framework/src/commands/add-skill.ts` (CLI command)
- New: `packages/luca-framework/templates/harness/*/skills/index.json` (3 files)
- Updated: `packages/luca-framework/src/utils/files.ts` (skill filtering)
- Updated: CLI entry point (command registration)
