---
id: 20-02
title: Rules-as-Skills Conversion
phase: 20-skills-agents-packaging
wave: 1
delivers: PACK-04
depends_on: null
tasks: 4
---

# Plan 20-02: Rules-as-Skills Conversion

## Objective

Convert the 5 most critical Luca framework rules into skills for auto-invocation within the plugin system. Rules cannot be injected by plugins, but skills can be auto-discovered. Each converted rule becomes a reference skill with `disable-model-invocation: true`, a concise description for lazy loading, and the full rule content in the skill body.

## Context

- **Why convert:** The `PluginCompiler.compileRule()` explicitly notes that "plugins cannot inject rules into the host project's rule resolution pipeline." Converting rules to skills allows them to be auto-discovered and loaded by Claude when relevant.
- **Rule source files:** `src/rules/general/*.rule.ts` — these use `BaseRuleImpl` with `RuleConfig` (frontmatter has `description`, `globs`, `alwaysApply`)
- **Skill pattern:** `src/skills/general/*.skill.ts` — these use `BaseSkillImpl` with `SkillConfig` (frontmatter has `name`, `description`, `disable-model-invocation`)
- **Rule content format:** Rules use `\\\`` for backtick escaping in template literals. Skills use the same pattern. Content can be copied with minimal adaptation.
- **5 rules selected** (per 20-CONTEXT.md): `lu-workflow`, `complexity-gating`, `harness-verification`, `hook-skill-boundary`, `file-naming`
- **These are NOT commands:** Rule-as-skills have `disable-model-invocation: true` and will not appear as slash commands. They are reference/guidance skills for auto-invocation only.
- **Skill registry:** New skills must be registered in `src/skills/index.ts`
- **Naming convention:** Prefix with `rule-` to distinguish from action skills (e.g., `rule-lu-workflow`)

## Files

### Create

- `src/skills/general/rule-lu-workflow.skill.ts` — Luca workflow system reference skill
- `src/skills/general/rule-complexity-gating.skill.ts` — Complexity gating matrix reference skill
- `src/skills/general/rule-harness-verification.skill.ts` — Harness/hook verification boundary reference skill
- `src/skills/general/rule-hook-skill-boundary.skill.ts` — Hook vs skill decision boundary reference skill
- `src/skills/general/rule-file-naming.skill.ts` — File naming conventions reference skill

### Modify

- `src/skills/index.ts` — Register all 5 new rule-as-skills in the `skillRegistry`

## Tasks

### Task 1: Create rule-lu-workflow.skill.ts

**Goal:** Convert the `lu-workflow` rule to a skill.

**File:** `src/skills/general/rule-lu-workflow.skill.ts` (new)

**Instructions:**

1. Read the rule source at `src/rules/general/lu-workflow.rule.ts` to get the full content.

2. Create the skill file following this structure:

```typescript
/**
 * rule-lu-workflow Skill - Luca cognitive memory system: BRAIN.md, MEMORY.md, WORKING.md workflow and quality curve.
 */
import { BaseSkillImpl } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

const ruleLuWorkflowConfig: SkillConfig = {
  frontmatter: {
    name: "rule-lu-workflow",
    description:
      "Luca cognitive memory system: BRAIN.md, MEMORY.md, WORKING.md workflow and quality curve.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `... FULL RULE CONTENT HERE ...`,
      order: 1,
    },
  ],
};

export class RuleLuWorkflowSkill extends BaseSkillImpl {
  constructor() {
    super(ruleLuWorkflowConfig);
  }
}
```

3. For the section content, copy the **entire** `content` string from the rule's section (the `sections[0].content` value in `LucaworkflowsystemConfig`). The content includes the `<main>`, `<two-tier_memory_system>`, and `<cognitive_pre_flight>` XML tags — keep these as-is since they will be compiled to Claude format which strips XML and uses H2 headings.

4. **Adaptation needed:** The rule content uses XML-style tags (`<main>`, `<two-tier_memory_system>`, `<cognitive_pre_flight>`). For the skill, reorganize into separate `sections` array entries instead of one monolithic section:
   - Section 1: `title: 'main'` with the main Luca Workflow System content (philosophy, plans are prompts, quality curve, ship fast)
   - Section 2: `title: 'two-tier-memory-system'` with BRAIN.md, MEMORY.md, WORKING.md content
   - Section 3: `title: 'cognitive-pre-flight'` with cognitive pre-flight content

   Extract each XML block's inner content and place it in its own section. Remove the XML wrapper tags.

5. Verify the template literal compiles (no unescaped backticks). The rule source already has proper escaping with `\\\``.

**Verification:**

- File exists at `src/skills/general/rule-lu-workflow.skill.ts`
- Exports `RuleLuWorkflowSkill` class extending `BaseSkillImpl`
- Has `disable-model-invocation: true`
- Description is concise and under 160 characters
- Content matches the rule source (adapted for skill sections)
- No compile errors

### Task 2: Create rule-complexity-gating.skill.ts, rule-harness-verification.skill.ts, rule-hook-skill-boundary.skill.ts, and rule-file-naming.skill.ts

**Goal:** Convert the remaining 4 rules to skills following the same pattern as Task 1.

**Files:** 4 new skill files in `src/skills/general/`

**Instructions:**

For each of the 4 rules below, follow the same pattern from Task 1. Read the rule source, create the skill file, copy the content, and adapt the sections.

#### rule-complexity-gating.skill.ts

- **Rule source:** `src/rules/general/complexity-gating.rule.ts`
- **Class name:** `RuleComplexityGatingSkill`
- **Config variable:** `ruleComplexityGatingConfig`
- **Skill name:** `rule-complexity-gating`
- **Description:** `Five complexity levels (TRIVIAL to CRITICAL) with gating matrix for workflow steps and agent activation.`
- **Content:** The rule has a single section with title `rule`. Copy its `content` value into the skill's `main` section. Remove the `# Complexity Gating` H1 heading from the content since the skill format adds it automatically via `toClaudeFormat()`.
- **Escaping note:** The content uses `\\\`` for backtick escaping — preserve this.

#### rule-harness-verification.skill.ts

- **Rule source:** `src/rules/general/harness-verification.rule.ts`
- **Class name:** `RuleHarnessVerificationSkill`
- **Config variable:** `ruleHarnessVerificationConfig`
- **Skill name:** `rule-harness-verification`
- **Description:** `Verification boundary: lightweight hooks run per-edit/commit, comprehensive harness runs at phase boundaries.`
- **Content:** Single section from rule. Copy content, remove H1 heading.

#### rule-hook-skill-boundary.skill.ts

- **Rule source:** `src/rules/general/hook-skill-boundary.rule.ts`
- **Class name:** `RuleHookSkillBoundarySkill`
- **Config variable:** `ruleHookSkillBoundaryConfig`
- **Skill name:** `rule-hook-skill-boundary`
- **Description:** `Decision matrix for choosing deterministic hooks vs interactive skills for enforcement and workflow automation.`
- **Content:** Single section from rule. Copy content, remove H1 heading.

#### rule-file-naming.skill.ts

- **Rule source:** `src/rules/general/file-naming.rule.ts`
- **Class name:** `RuleFileNamingSkill`
- **Config variable:** `ruleFileNamingConfig`
- **Skill name:** `rule-file-naming`
- **Description:** `File and directory naming conventions: kebab-case enforcement with examples and migration guidelines.`
- **Content:** Single section from rule. The file-naming rule content starts with a bullet list (no H1 heading), so the content can be used as-is.

**Important notes for all 4 skills:**

1. All must have `'disable-model-invocation': true` in frontmatter
2. All use `BaseSkillImpl` from `'../base/base-skill'`
3. All import `SkillConfig` type from `'../types/skill.types'`
4. The JSDoc comment at the top follows the pattern: `/** * {name} Skill - {description} */`
5. Class names use PascalCase (e.g., `RuleComplexityGatingSkill`)
6. Config variable names use camelCase (e.g., `ruleComplexityGatingConfig`)
7. **Do NOT remove the H1 heading** if the compiled skill format would be missing one. Check: `toClaudeFormat()` generates `# {name}\n\n{description}` as heading, then `## {section.title}\n\n{content}`. So the content should NOT have its own H1 — remove any `# Title` from the copied rule content to avoid a duplicate heading.

**Verification:**

- All 4 files exist in `src/skills/general/`
- Each exports the correct class name
- Each has `disable-model-invocation: true`
- Descriptions are under 160 characters
- No compile errors: `bunx --bun tsc --noEmit`

### Task 3: Register all 5 new rule-as-skills in the skill registry

**Goal:** Add all 5 new skills to `src/skills/index.ts`.

**File:** `src/skills/index.ts` (modify)

**Instructions:**

1. Add imports for all 5 new skills (add after the existing general skill imports, maintaining alphabetical order):

```typescript
import { RuleComplexityGatingSkill } from "./general/rule-complexity-gating.skill";
import { RuleFileNamingSkill } from "./general/rule-file-naming.skill";
import { RuleHarnessVerificationSkill } from "./general/rule-harness-verification.skill";
import { RuleHookSkillBoundarySkill } from "./general/rule-hook-skill-boundary.skill";
import { RuleLuWorkflowSkill } from "./general/rule-lu-workflow.skill";
```

2. Add entries to the `skillRegistry` object (add in alphabetical order among existing entries):

```typescript
"rule-complexity-gating": RuleComplexityGatingSkill,
"rule-file-naming": RuleFileNamingSkill,
"rule-harness-verification": RuleHarnessVerificationSkill,
"rule-hook-skill-boundary": RuleHookSkillBoundarySkill,
"rule-lu-workflow": RuleLuWorkflowSkill,
```

3. Verify the registry now has 43 entries (38 existing general skills plus 5 new rule-as-skills = 43). Note: `lu` has never been in `skillRegistry` — it is handled separately by the build script — so the count is 43 regardless of Plan 20-01 execution order.

**Verification:**

- All 5 imports added to `src/skills/index.ts`
- All 5 entries in `skillRegistry`
- No duplicate keys
- `bunx --bun tsc --noEmit` passes
- `bun test` passes

### Task 4: Build and verify rule-as-skills compilation

**Goal:** Verify all 5 new rule-as-skills compile correctly via the plugin build.

**Instructions:**

1. Run the plugin build:

   ```bash
   bun run build:plugin
   ```

2. Verify the 5 new skill directories exist in output:

   ```bash
   ls dist/plugin/skills/rule-complexity-gating/SKILL.md
   ls dist/plugin/skills/rule-file-naming/SKILL.md
   ls dist/plugin/skills/rule-harness-verification/SKILL.md
   ls dist/plugin/skills/rule-hook-skill-boundary/SKILL.md
   ls dist/plugin/skills/rule-lu-workflow/SKILL.md
   ```

3. Verify each compiled SKILL.md has the correct structure:
   - Starts with `# rule-{name}`
   - Second line is the concise description
   - Followed by `## main` section with full rule content
   - Content is substantial (not empty or truncated)

4. Spot-check the complexity-gating skill to verify the matrix table renders correctly:

   ```bash
   head -30 dist/plugin/skills/rule-complexity-gating/SKILL.md
   ```

5. Verify the manifest includes all 5 new skills:

   ```bash
   cat dist/plugin/.claude-plugin/plugin.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(s) for s in d['skills'] if s.startswith('rule-')]"
   ```

6. Run the full test suite:
   ```bash
   bun test
   ```

**Verification:**

- All 5 rule-as-skill SKILL.md files exist in `dist/plugin/skills/`
- Each has correct heading format and full content
- Plugin manifest lists all 5 new skills
- Build completes with 0 failures
- All tests pass

## Verification

- [ ] 5 new skill files created in `src/skills/general/`
- [ ] All 5 have `disable-model-invocation: true`
- [ ] All 5 descriptions under 160 characters and optimized for discovery
- [ ] All 5 registered in `src/skills/index.ts` with correct imports
- [ ] Content faithfully represents the original rule (no content loss)
- [ ] H1 headings removed from copied content (skill format adds its own)
- [ ] Backtick escaping preserved in template literals
- [ ] `bun run build:plugin` compiles all 5 with 0 failures
- [ ] All tests pass: `bun test`
