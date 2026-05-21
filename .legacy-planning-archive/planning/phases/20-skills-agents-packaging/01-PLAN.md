---
id: 20-01
title: Skill Description Optimization & lu.skill.ts Consolidation
phase: 20-skills-agents-packaging
wave: 1
delivers: PACK-05, PACK-01 (partial)
depends_on: null
tasks: 4
---

# Plan 20-01: Skill Description Optimization & lu.skill.ts Consolidation

## Objective

Optimize all 39 existing skill descriptions for lazy loading discovery and consolidate the duplicate `lu.skill.ts` files into a single authoritative source. Descriptions must be concise (1-2 sentences, under 160 characters), action-oriented, and mutually distinguishable so that Claude's Tool Search can accurately match user intent to the correct skill.

## Context

- **Skill descriptions** live in each `.skill.ts` file's `frontmatter.description` field in the `SkillConfig` object
- **Compiled output** uses `BaseSkillImpl.toClaudeFormat()` which renders `# {name}\n\n{description}` as the heading (see `src/shared/format.ts`)
- **Duplicate lu.skill.ts**: `src/skills/general/lu.skill.ts` (Cursor XML format) and `src/skills/luca/lu.skill.ts` (Claude H2 format). The build script (`scripts/build-plugin.ts`) imports from `luca/` separately and it overwrites the `general/` version in output. The registry in `src/skills/index.ts` imports from `general/`.
- **Current description patterns**: Many skills follow "Do X. Use when user wants Y, mentions /skill-name, or Z." The "Use when..." suffix is redundant for self-explanatory actions and inflates token count.
- **39 skills total**: 38 in `skillRegistry` (from `src/skills/general/`) + 1 luca-specific (`src/skills/luca/lu.skill.ts`)
- **JSDoc comment pattern**: Each skill file has a JSDoc comment above imports that mirrors the description. This should also be updated.

## Files

### Modify

- `src/skills/general/code-lint.skill.ts` — Optimize description
- `src/skills/general/code-typecheck.skill.ts` — Optimize description
- `src/skills/general/git-commit.skill.ts` — Optimize description
- `src/skills/general/git-feature.skill.ts` — Optimize description
- `src/skills/general/git-pr.skill.ts` — Optimize description
- `src/skills/general/jira-issue.skill.ts` — Optimize description
- `src/skills/general/lu-add-phase.skill.ts` — Optimize description
- `src/skills/general/lu-add-todo.skill.ts` — Optimize description
- `src/skills/general/lu-address-pr.skill.ts` — Optimize description
- `src/skills/general/lu-audit-milestone.skill.ts` — Optimize description
- `src/skills/general/lu-check-todos.skill.ts` — Optimize description
- `src/skills/general/lu-choose.skill.ts` — Optimize description
- `src/skills/general/lu-complete-milestone.skill.ts` — Optimize description
- `src/skills/general/lu-debug.skill.ts` — Optimize description
- `src/skills/general/lu-discuss-phase.skill.ts` — Optimize description
- `src/skills/general/lu-execute-phase.skill.ts` — Optimize description
- `src/skills/general/lu-help.skill.ts` — Optimize description
- `src/skills/general/lu-insert-phase.skill.ts` — Optimize description
- `src/skills/general/lu-list-phase-assumptions.skill.ts` — Optimize description
- `src/skills/general/lu-map-codebase.skill.ts` — Optimize description
- `src/skills/general/lu-new-milestone.skill.ts` — Optimize description
- `src/skills/general/lu-new-project.skill.ts` — Optimize description
- `src/skills/general/lu-pause-work.skill.ts` — Optimize description
- `src/skills/general/lu-plan-milestone-gaps.skill.ts` — Optimize description
- `src/skills/general/lu-plan-phase.skill.ts` — Optimize description
- `src/skills/general/lu-plan-session.skill.ts` — Optimize description
- `src/skills/general/lu-progress.skill.ts` — Optimize description
- `src/skills/general/lu-quick.skill.ts` — Optimize description
- `src/skills/general/lu-remove-phase.skill.ts` — Optimize description
- `src/skills/general/lu-research-phase.skill.ts` — Optimize description
- `src/skills/general/lu-resume-work.skill.ts` — Optimize description
- `src/skills/general/lu-set-profile.skill.ts` — Optimize description
- `src/skills/general/lu-settings.skill.ts` — Optimize description
- `src/skills/general/lu-update.skill.ts` — Optimize description
- `src/skills/general/lu-verify-work.skill.ts` — Optimize description
- `src/skills/general/qa-consolidate.skill.ts` — Optimize description
- `src/skills/general/test-run.skill.ts` — Optimize description
- `src/skills/general/workflow-start.skill.ts` — Optimize description
- `src/skills/luca/lu.skill.ts` — Optimize description
- `src/skills/index.ts` — Verify no `lu` entry exists (read-only check, no modification needed)

### Delete

- `src/skills/general/lu.skill.ts` — Remove duplicate; keep `src/skills/luca/lu.skill.ts` as authoritative source

## Tasks

### Task 1: Remove orphaned duplicate lu.skill.ts from general/

**Goal:** Remove the orphaned duplicate `lu.skill.ts` from `src/skills/general/`. This file is NOT imported or registered anywhere — it is an orphan on disk. The authoritative source is `src/skills/luca/lu.skill.ts`, which `scripts/build-plugin.ts` imports directly.

**Files:**

- `src/skills/general/lu.skill.ts` (delete)

**Instructions:**

1. Delete `src/skills/general/lu.skill.ts` entirely.

2. Verify `src/skills/index.ts` does NOT reference `lu.skill` or have a `"lu"` key in the registry (it shouldn't — `lu` was never registered in `skillRegistry`). This is a verification step, not a modification step.

3. Verify `scripts/build-plugin.ts` still imports `LuSkill` from `../src/skills/luca/lu.skill`. This import must remain unchanged.

4. Run `bunx --bun tsc --noEmit` to verify no compile errors from the removal.

**Verification:**

- `src/skills/general/lu.skill.ts` no longer exists
- `src/skills/index.ts` has no import referencing `general/lu.skill`
- `scripts/build-plugin.ts` still imports `LuSkill` from `../src/skills/luca/lu.skill`
- `bun test` passes

### Task 2: Optimize descriptions for all 38 general skills

**Goal:** Rewrite the `description` field in every general skill's config to be concise, action-oriented, and optimized for lazy loading discovery.

**Files:** All 38 `.skill.ts` files in `src/skills/general/` (after removing `lu.skill.ts` in Task 1)

**Instructions:**

For each skill file, update two things:

1. The JSDoc comment at the top of the file (line 2, the `* skill-name Skill - ...` line)
2. The `description` field in the `frontmatter` object of the `SkillConfig`

Both must contain the same text.

**Optimization principles:**

- First sentence: what the skill does (action verb, present tense)
- Keep under 160 characters total
- Remove "Use when user wants..." phrasing — this is redundant; Claude's Tool Search matches on semantics
- Remove "mentions /skill-name" phrasing — this is handled by the skill name matching
- Make descriptions mutually distinguishable (especially similar skills like `lu-plan-phase` vs `lu-plan-session` vs `lu-plan-milestone-gaps`)
- Include key differentiating terms that help Claude route correctly

**Optimized descriptions to apply:**

| Skill                       | New Description                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `code-lint`                 | `Run ESLint with auto-fix on the codebase or a specific path.`                                      |
| `code-typecheck`            | `Run TypeScript type checking on the codebase or a specific workspace.`                             |
| `git-commit`                | `Stage and commit changes using the project's conventional commit CLI with ticket extraction.`      |
| `git-feature`               | `Create a feature branch linked to a Jira ticket or GitHub issue.`                                  |
| `git-pr`                    | `Create a pull request with conventional formatting and submit for review.`                         |
| `jira-issue`                | `Import a Jira ticket as a GitHub issue with labels and cross-references.`                          |
| `lu-add-phase`              | `Append a new phase to the end of the current milestone roadmap.`                                   |
| `lu-add-todo`               | `Capture an idea or task as a todo for later without acting on it now.`                             |
| `lu-address-pr`             | `Address PR review comments by swarming reviewer agents, validating concerns, and applying fixes.`  |
| `lu-audit-milestone`        | `Audit milestone completion against original requirements and acceptance criteria.`                 |
| `lu-check-todos`            | `List pending todos and select one to work on next.`                                                |
| `lu-choose`                 | `Choose between issue-driven development and Luca spec-driven workflow for a task.`                 |
| `lu-complete-milestone`     | `Archive a completed milestone, extract learnings, and prepare for the next version.`               |
| `lu-debug`                  | `Systematic debugging workflow with persistent hypothesis state across context resets.`             |
| `lu-discuss-phase`          | `Gather phase context through adaptive questioning before creating execution plans.`                |
| `lu-execute-phase`          | `Execute all plans in a phase with wave-based parallelization and harness verification.`            |
| `lu-help`                   | `Show available Luca commands, usage guide, and workflow overview.`                                 |
| `lu-insert-phase`           | `Insert urgent work as a decimal phase between existing phases mid-milestone.`                      |
| `lu-list-phase-assumptions` | `Preview AI planning assumptions for a phase before committing to execution.`                       |
| `lu-map-codebase`           | `Analyze an existing codebase with parallel mapper agents to build a structural overview.`          |
| `lu-new-milestone`          | `Start a new milestone cycle with requirements gathering and roadmap generation.`                   |
| `lu-new-project`            | `Initialize a new Luca project with deep context gathering and BRAIN.md creation.`                  |
| `lu-pause-work`             | `Create a context handoff snapshot when pausing work mid-phase for later resumption.`               |
| `lu-plan-milestone-gaps`    | `Create phases to close gaps identified by a milestone audit.`                                      |
| `lu-plan-phase`             | `Create detailed PLAN.md execution plans for a specific phase with tasks, waves, and verification.` |
| `lu-plan-session`           | `Plan the next coding session using WSJF prioritization of pending todos and roadmap items.`        |
| `lu-progress`               | `Check project progress, show current state, and suggest the next action to take.`                  |
| `lu-quick`                  | `Execute a quick ad-hoc task with Luca quality guarantees but minimal ceremony.`                    |
| `lu-remove-phase`           | `Remove a future phase from the roadmap and renumber subsequent phases.`                            |
| `lu-research-phase`         | `Conduct comprehensive ecosystem research for niche or complex technical domains.`                  |
| `lu-resume-work`            | `Resume work from a previous session with full cognitive context restoration.`                      |
| `lu-set-profile`            | `Switch the model profile (quality/balanced/budget) for Luca agent delegation.`                     |
| `lu-settings`               | `Configure Luca workflow toggles, model profile, and agent settings.`                               |
| `lu-update`                 | `Update Luca to the latest version with changelog preview and migration notes.`                     |
| `lu-verify-work`            | `Validate built features through conversational UAT testing against acceptance criteria.`           |
| `qa-consolidate`            | `Consolidate QA testing plans from merged feature PRs onto a parent release PR.`                    |
| `test-run`                  | `Run the project test suite with optional filter pattern and coverage reporting.`                   |
| `workflow-start`            | `Start work on a Jira ticket. Redirects to /lu for the full development workflow.`                  |

**For each file, the edit pattern is:**

1. Update the JSDoc comment (line 2):

   ```typescript
   // Before:
   /**
    * git-commit Skill - Create a commit using the interactive commit tool. Use when the user wants to commit changes, make a commit, save changes to git, or stage and commit code.
    */

   // After:
   /**
    * git-commit Skill - Stage and commit changes using the project's conventional commit CLI with ticket extraction.
    */
   ```

2. Update the `description` field in `frontmatter`:

   ```typescript
   // Before:
   description: `Create a commit using the interactive commit tool. Use when the user wants to commit changes, make a commit, save changes to git, or stage and commit code.`,

   // After:
   description: `Stage and commit changes using the project's conventional commit CLI with ticket extraction.`,
   ```

**Verification:**

- All 38 general skill files have updated descriptions
- Both the JSDoc comment and the `frontmatter.description` field match
- No description exceeds 160 characters
- `bun test` passes

### Task 3: Optimize the luca/lu.skill.ts description

**Goal:** Update the description for the authoritative `lu` skill in `src/skills/luca/lu.skill.ts`.

**File:** `src/skills/luca/lu.skill.ts`

**Instructions:**

1. Update the JSDoc comment at line 2 to:

   ```typescript
   /**
    * lu Skill - Unified entry point for all Luca workflows with cognitive pre-flight and complexity routing.
    */
   ```

2. Update the `description` field in `frontmatter` (currently on line 12) to:
   ```
   Unified entry point for all Luca workflows with cognitive pre-flight and complexity routing.
   ```

**Verification:**

- Description is under 160 characters
- JSDoc and frontmatter.description match
- `bun test` passes

### Task 4: Build verification

**Goal:** Run the full plugin build to verify all 39 skills compile correctly with optimized descriptions and no duplicate `lu` skill.

**Instructions:**

1. Run the plugin build:

   ```bash
   bun run build:plugin
   ```

2. Verify the build output:
   - Exactly 39 skills generated (38 from registry + 1 luca-specific `lu`)
   - No duplicate `skills/lu/SKILL.md` compilation (should appear only once, from the luca import)
   - All 26 agents still compile
   - Build summary shows 0 failures

3. Spot-check a few compiled SKILL.md files to verify the new descriptions appear correctly:

   ```bash
   head -3 dist/plugin/skills/git-commit/SKILL.md
   head -3 dist/plugin/skills/lu-plan-phase/SKILL.md
   head -3 dist/plugin/skills/lu/SKILL.md
   ```

4. Verify the manifest `skills` array has 39 entries and does NOT contain a duplicate `lu` entry:

   ```bash
   cat dist/plugin/.claude-plugin/plugin.json | grep -c '"lu"'
   # Should output: 1
   ```

5. Run the full test suite:
   ```bash
   bun test
   ```

**Verification:**

- `bun run build:plugin` completes with 0 failures
- 39 skills in output
- 26 agents in output
- No duplicate `lu` skill in manifest
- All tests pass

## Verification

- [ ] `src/skills/general/lu.skill.ts` deleted (duplicate removed)
- [ ] `src/skills/index.ts` no longer has `"lu"` in registry or its import
- [ ] All 38 general skill descriptions optimized (under 160 chars, action-oriented)
- [ ] `src/skills/luca/lu.skill.ts` description optimized
- [ ] JSDoc comments match frontmatter descriptions in all skill files
- [ ] `bun run build:plugin` produces 39 skills with 0 failures
- [ ] No duplicate `lu` entry in plugin manifest
- [ ] `bun test` passes
