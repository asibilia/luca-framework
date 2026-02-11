# Phase 10: Build Pipeline - Research

## 1. The Proven `skillRegistry` Pattern

**File:** `src/skills/index.ts`

The skill registry is the template to replicate for agents and rules. Its structure:

1. **Individual imports** -- Each skill class is imported by name from its source file.
2. **Re-exports** -- The base class and types are re-exported for downstream consumers.
3. **Named registry object** -- A `const skillRegistry = { ... }` maps string keys to class constructors.

```ts
// Pattern summary from src/skills/index.ts
import { CodeLintSkill } from './general/code-lint.skill';
// ... 35 more imports ...

export const skillRegistry = {
  'code-lint': CodeLintSkill,
  'git-commit': GitCommitSkill,
  // ... all skills mapped by kebab-case name
};
```

**Key design choices:**
- Registry keys use the **skill's kebab-case name** (matching the filename stem without `.skill`).
- Registry values are **class constructors** (not instances), so build scripts call `new SkillClass()` at build time.
- The LuSkill (from `src/skills/luca/lu.skill.ts`) is NOT in the registry -- it is handled separately in build scripts as a "luca-specific" entity.
- The registry currently has **35 entries**.

**How build scripts consume it:**
```ts
for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
  const skillInstance = new (SkillClass as new () => BaseSkill)();
  const content = compiler.compileSkill(skillInstance, 'CURSOR');
  // write to .cursor/skills/{skillName}/SKILL.md
}
```

---

## 2. Complete Agent Inventory

### `src/agents/general/` (23 agents)

| File | Class | `name` Property |
|------|-------|-----------------|
| `code-architect.agent.ts` | `CodeArchitectAgent` | `code-architect` |
| `code-developer.agent.ts` | `CodeDeveloperAgent` | `code-developer` |
| `code-simplifier.agent.ts` | `CodeSimplifierAgent` | `code-simplifier` |
| `dx-advocate.agent.ts` | `DxAdvocateAgent` | `dx-advocate` |
| `lu-codebase-mapper.agent.ts` | `LuCodebaseMapperAgent` | `lu-codebase-mapper` |
| `lu-cognition.agent.ts` | `LuCognitionAgent` | `lu-cognition` |
| `lu-debugger.agent.ts` | `LuDebuggerAgent` | `lu-debugger` |
| `lu-integration-checker.agent.ts` | `LuIntegrationCheckerAgent` | `lu-integration-checker` |
| `lu-learner.agent.ts` | `LuLearnerAgent` | `lu-learner` |
| `lu-phase-researcher.agent.ts` | `LuPhaseResearcherAgent` | `lu-phase-researcher` |
| `lu-plan-checker.agent.ts` | `LuPlanCheckerAgent` | `lu-plan-checker` |
| `lu-pr-reviewer.agent.ts` | `LuPrReviewerAgent` | `lu-pr-reviewer` |
| `lu-project-researcher.agent.ts` | `LuProjectResearcherAgent` | `lu-project-researcher` |
| `lu-research-synthesizer.agent.ts` | `LuResearchSynthesizerAgent` | `lu-research-synthesizer` |
| `lu-roadmapper.agent.ts` | `LuRoadmapperAgent` | `lu-roadmapper` |
| `lu-router.agent.ts` | `LuRouterAgent` | `lu-router` |
| `lu-verifier.agent.ts` | `LuVerifierAgent` | `lu-verifier` |
| `performance-auditor.agent.ts` | `PerformanceAuditorAgent` | `performance-auditor` |
| `product.agent.ts` | `ProductAgent` | `product` |
| `qa-plan-generator.agent.ts` | `QaPlanGeneratorAgent` | `qa-plan-generator` |
| `security-auditor.agent.ts` | `SecurityAuditorAgent` | `security-auditor` |
| `ui.agent.ts` | `UiAgent` | `ui` |
| `ux.agent.ts` | `UxAgent` | `ux` |

### `src/agents/luca/` (2 agents -- handled separately, like LuSkill)

| File | Class | `name` Property |
|------|-------|-----------------|
| `lu-executor.agent.ts` | `LuExecutorAgent` | `lu-executor` |
| `lu-planner.agent.ts` | `LuPlannerAgent` | `lu-planner` |

**Agents have a `name` field** in their `AgentFrontmatter`, so registry keys can reliably use `agent.name`.

**No `src/agents/index.ts` exists yet** -- this file must be created.

---

## 3. Complete Rule Inventory

### `src/rules/general/` (20 rules)

| File | Class | Has Unique Class Name? |
|------|-------|----------------------|
| `api-snake-case.rule.ts` | `APIpayloadsmustusRule` | Yes |
| `atlassian-mcp.rule.ts` | `AtlassianMCPintegrRule` | Yes |
| `bun-preference.rule.ts` | `UseBunpackagemanaRule` | Yes |
| `cursor_rules.rule.ts` | `GuidelinesforcreatRule` | Yes |
| `dev_workflow.rule.ts` | `GuideforusingTaskRule` | **DUPLICATE** (also in `taskmaster-dev_workflow.rule.ts`) |
| `file-naming.rule.ts` | `GenericruledescripRule` | **DUPLICATE** (also in `lodash-preference.rule.ts`) |
| `functional-api-reuse.rule.ts` | `FunctionalAPIReuseRule` | Yes |
| `import-standards.rule.ts` | `StandardsforimportRule` | Yes |
| `lodash-preference.rule.ts` | `GenericruledescripRule` | **DUPLICATE** (also in `file-naming.rule.ts`) |
| `lu-workflow.rule.ts` | `LucaworkflowsystemRule` | Yes |
| `mandatory-documentation.rule.ts` | `MandatorydocumentatRule` | Yes |
| `no-classes.rule.ts` | `ProhibitclassusageRule` | Yes |
| `posthog-integration.rule.ts` | `ApplywheninteractiRule` | Yes |
| `schema-first-parsing.rule.ts` | `EnforceZodschemafRule` | Yes |
| `self_improve.rule.ts` | `GuidelinesforcontiRule` | Yes |
| `task-analyzation.rule.ts` | `GuidelinesforanalyRule` | Yes |
| `taskmaster.rule.ts` | `ComprehensiverefereRule` | **DUPLICATE** (also in `taskmaster-taskmaster.rule.ts`) |
| `taskmaster-dev_workflow.rule.ts` | `GuideforusingTaskRule` | **DUPLICATE** |
| `taskmaster-taskmaster.rule.ts` | `ComprehensiverefereRule` | **DUPLICATE** |
| `use-bun-instead-of-node-vite-npm-pnpm.rule.ts` | `UseBuninsteadofNRule` | Yes |

### `src/rules/lu-workflow.rule.ts` (1 rule -- root level, handled separately like LuSkill)

| File | Class |
|------|-------|
| `lu-workflow.rule.ts` | `LuWorkflowRule` |

**Critical finding: Duplicate class names.**
Three pairs of rules export identically-named classes:
- `GenericruledescripRule` in both `file-naming.rule.ts` and `lodash-preference.rule.ts`
- `GuideforusingTaskRule` in both `dev_workflow.rule.ts` and `taskmaster-dev_workflow.rule.ts`
- `ComprehensiverefereRule` in both `taskmaster.rule.ts` and `taskmaster-taskmaster.rule.ts`

**This means the rule registry CANNOT use class names as identifiers.** The registry must use filename stems as keys (matching the skill registry pattern), and imports must use aliased names.

**Rules do NOT have a `name` field** in their `RuleFrontmatter` -- they use `description` instead. The `BaseRuleImpl.name` getter derives a name from the first 30 chars of the description, which is unreliable and produces collisions. The registry key should be the **filename stem** (e.g., `api-snake-case`, `bun-preference`).

**No `src/rules/index.ts` exists yet** -- this file must be created.

---

## 4. Current Build Script Analysis

### What the build scripts DO today

All three scripts (`build-cursor.ts`, `build-claude.ts`, `build-all.ts`) follow the same pattern:

1. **Hardcoded luca agents** -- Import and compile `LuExecutorAgent` and `LuPlannerAgent` directly.
2. **Hardcoded lu skill** -- Import and compile `LuSkill` directly.
3. **Registry-driven general skills** -- Iterate `skillRegistry` to compile all general skills.
4. **Hardcoded lu-workflow rule** -- Import and compile `LuWorkflowRule` directly.

### What the build scripts DO NOT do today

- **No general agent compilation** -- 23 agents in `src/agents/general/` are completely ignored by the build scripts.
- **No general rule compilation** -- 20 rules in `src/rules/general/` are completely ignored by the build scripts.
- **No stale file cleanup** -- Build scripts only add files; they never remove obsolete output files.
- **No agent or rule registries** -- Only `skillRegistry` exists.

### Build output structure

| Target | Agents | Skills | Rules |
|--------|--------|--------|-------|
| `.cursor/` | `agents/{name}.md` | `skills/{name}/SKILL.md` | `rules/{name}.mdc` |
| `.claude/` | `agents/{name}.md` | `skills/{name}/SKILL.md` | `rules/{name}.md` |

**Key difference:** Cursor rules use `.mdc` extension; Claude rules use `.md` extension.

### Special cases in cursor rules output

The existing `.cursor/rules/` contains:
- A **symlink**: `use-bun-instead-of-node-vite-npm-pnpm.mdc -> ../../CLAUDE.md`
- A **subdirectory**: `.cursor/rules/taskmaster/` containing `dev_workflow.mdc` and `taskmaster.mdc`

This suggests the original `generate-from-cursor` scripts used a convention where rules prefixed with `taskmaster-` became subdirectory entries. The new build pipeline needs to decide whether to preserve this nesting or flatten.

---

## 5. Compiler Analysis

### `src/compilers/base.compiler.ts`

Abstract base class defining the compiler interface:
```ts
export abstract class BaseCompiler {
  abstract compileAgent(agent: BaseAgent, format: SupportedFormat): string;
  abstract compileSkill(skill: BaseSkill, format: SupportedFormat): string;
  abstract compileRule(rule: BaseRule, format: SupportedFormat): string;
}
```

### `src/compilers/cursor.compiler.ts` and `claude.compiler.ts`

Both are thin wrappers that delegate to the entity's format methods:
```ts
compileAgent(agent: BaseAgent, format: SupportedFormat): string {
  this.validateFormat(format);
  return agent.toCursorFormat(); // or toClaudeFormat()
}
```

The compilers accept `BaseAgent`, `BaseSkill`, and `BaseRule` interfaces. This means the registries just need to export class constructors whose instances implement these interfaces.

---

## 6. Existing Tests

**There are NO project-level tests.** The `src/` directory contains zero `.test.ts` or `.spec.ts` files. Only `node_modules/` contains test files (from dependencies).

The `package.json` defines test scripts:
```json
"test": "bun test",
"test:coverage": "bun test --coverage",
"test:watch": "bun test --watch"
```

But no test files exist to run. This means Phase 10 should include test files for:
- Agent registry completeness
- Rule registry completeness
- Build script execution (integration tests)
- Stale file detection

---

## 7. Stale File Risk Analysis

### `.cursor/agents/` -- 25 files exist, only 2 generated by build

**Files generated by build scripts:** `lu-executor.md`, `lu-planner.md`

**Files that exist but are NOT generated by build scripts (23 files from general agents):**
`code-architect.md`, `code-developer.md`, `code-simplifier.md`, `dx-advocate.md`, `lu-codebase-mapper.md`, `lu-cognition.md`, `lu-debugger.md`, `lu-integration-checker.md`, `lu-learner.md`, `lu-phase-researcher.md`, `lu-plan-checker.md`, `lu-pr-reviewer.md`, `lu-project-researcher.md`, `lu-research-synthesizer.md`, `lu-roadmapper.md`, `lu-router.md`, `lu-verifier.md`, `performance-auditor.md`, `product.md`, `qa-plan-generator.md`, `security-auditor.md`, `ui.md`, `ux.md`

These 23 files were likely generated by the `generate:from-cursor` reverse-direction scripts or manually placed. They are NOT maintained by the current build pipeline.

### `.claude/agents/` -- Only 2 files

`lu-executor.md`, `lu-planner.md` -- both generated by the build. **The 23 general agents are completely missing from Claude output.**

### `.cursor/rules/` -- 17 files + 1 symlink + 1 subdirectory

**Generated by build:** Only `lu-workflow.mdc`

**Not generated by build (16 files):**
`api-snake-case.mdc`, `atlassian-mcp.mdc`, `bun-preference.mdc`, `cursor_rules.mdc`, `dev_workflow.mdc`, `file-naming.mdc`, `functional-api-reuse.mdc`, `import-standards.mdc`, `lodash-preference.mdc`, `mandatory-documentation.mdc`, `no-classes.mdc`, `posthog-integration.mdc`, `schema-first-parsing.mdc`, `self_improve.mdc`, `task-analyzation.mdc`, `taskmaster.mdc`

Plus special entries: `use-bun-instead-of-node-vite-npm-pnpm.mdc` (symlink), `taskmaster/` subdirectory with `dev_workflow.mdc` and `taskmaster.mdc`.

### `.claude/rules/` -- Only 1 file

`lu-workflow.md` -- generated by build. **All 20 general rules are completely missing from Claude output.**

### Summary of stale file risks

The `.cursor/` directory has many files placed by the `generate:from-cursor` reverse workflow that the forward build does not manage. When the build pipeline starts generating these files, there is a risk of:
1. **Orphaned files** -- If a source file is renamed or removed, the old output persists.
2. **Format drift** -- Files generated by `generate:from-cursor` may differ in format from those produced by the compiler pipeline.
3. **Subdirectory vs flat** -- The taskmaster rules use a subdirectory convention that needs a decision.

**Recommended:** Build scripts should clean output directories before writing, or track expected outputs and delete anything not in the manifest.

---

## 8. Root `index.ts` Analysis

**File:** `index.ts`

Currently exports:
- Type interfaces (AgentFrontmatter, SkillFrontmatter, RuleFrontmatter, etc.)
- Base implementations (BaseAgentImpl, BaseSkillImpl, BaseRuleImpl)
- Compilers (BaseCompiler, CursorCompiler, ClaudeCompiler)
- Luca-specific entities (LuExecutorAgent, LuPlannerAgent, LuSkill, LuWorkflowRule)
- Validation utilities

**What is missing:**
- No `agentRegistry` export
- No `ruleRegistry` export
- No `skillRegistry` export (it exists in `src/skills/index.ts` but is not re-exported from root)

**Recommendation:** After creating `src/agents/index.ts` and `src/rules/index.ts`, the root `index.ts` should re-export all three registries:
```ts
export { agentRegistry } from './src/agents/index';
export { skillRegistry } from './src/skills/index';
export { ruleRegistry } from './src/rules/index';
```

---

## 9. Recommended Approach

### Step 1: Create `src/agents/index.ts` (agentRegistry)

Follow the `skillRegistry` pattern exactly:

```ts
import { CodeArchitectAgent } from './general/code-architect.agent';
// ... 22 more imports ...

export const agentRegistry = {
  'code-architect': CodeArchitectAgent,
  'code-developer': CodeDeveloperAgent,
  // ... all 23 general agents
};
```

**Do NOT include** `LuExecutorAgent` and `LuPlannerAgent` in the registry -- they are luca-specific and handled separately (same pattern as `LuSkill` vs `skillRegistry`).

### Step 2: Create `src/rules/index.ts` (ruleRegistry)

```ts
import { APIpayloadsmustusRule } from './general/api-snake-case.rule';
import { AtlassianMCPintegrRule } from './general/atlassian-mcp.rule';
// ... handle duplicate class names with aliases:
import { GenericruledescripRule as FileNamingRule } from './general/file-naming.rule';
import { GenericruledescripRule as LodashPreferenceRule } from './general/lodash-preference.rule';
import { GuideforusingTaskRule as DevWorkflowRule } from './general/dev_workflow.rule';
import { GuideforusingTaskRule as TaskmasterDevWorkflowRule } from './general/taskmaster-dev_workflow.rule';
import { ComprehensiverefereRule as TaskmasterRule } from './general/taskmaster.rule';
import { ComprehensiverefereRule as TaskmasterTaskmasterRule } from './general/taskmaster-taskmaster.rule';

export const ruleRegistry = {
  'api-snake-case': APIpayloadsmustusRule,
  'atlassian-mcp': AtlassianMCPintegrRule,
  'bun-preference': UseBunpackagemanaRule,
  'cursor_rules': GuidelinesforcreatRule,
  'dev_workflow': DevWorkflowRule,
  'file-naming': FileNamingRule,
  // ... all 20 general rules
};
```

Use the **filename stem** (without `.rule.ts`) as the registry key. Use import aliases to resolve duplicate class names.

**Do NOT include** `LuWorkflowRule` (from `src/rules/lu-workflow.rule.ts`) in the registry -- it is luca-specific.

### Step 3: Update build scripts to use registries

Replace hardcoded agent/rule handling with registry iteration:

```ts
import { agentRegistry } from '../src/agents/index';
import { ruleRegistry } from '../src/rules/index';

// Iterate agents
for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
  const instance = new (AgentClass as new () => BaseAgent)();
  const content = compiler.compileAgent(instance, 'CURSOR');
  await Bun.write(path.join(agentsDir, `${agentName}.md`), content);
}

// Iterate rules
for (const [ruleName, RuleClass] of Object.entries(ruleRegistry)) {
  const instance = new (RuleClass as new () => BaseRule)();
  const content = compiler.compileRule(instance, 'CURSOR');
  await Bun.write(path.join(rulesDir, `${ruleName}.mdc`), content);
}
```

The luca-specific entities (`LuExecutorAgent`, `LuPlannerAgent`, `LuSkill`, `LuWorkflowRule`) remain hardcoded in the build scripts -- they are the framework's own entities and always present.

### Step 4: Add stale file cleanup

Before writing, clean the output directories:

```ts
import { readdir, unlink } from 'fs/promises';

async function cleanDirectory(dir: string, extension: string) {
  const files = await readdir(dir);
  for (const file of files) {
    if (file.endsWith(extension)) {
      await unlink(path.join(dir, file));
    }
  }
}
```

Or alternatively, track expected output files and delete any that are not in the expected set after the build.

### Step 5: Update root `index.ts`

Add registry re-exports:
```ts
export { agentRegistry } from './src/agents/index';
export { skillRegistry } from './src/skills/index';
export { ruleRegistry } from './src/rules/index';
```

### Step 6: Add tests

Create tests to verify:
- Registry completeness (every file in `src/agents/general/` has a registry entry)
- Registry completeness (every file in `src/rules/general/` has a registry entry)
- Build output matches source (no stale files)
- All registry entries can be instantiated without errors

---

## 10. Risks and Considerations

### Risk 1: Duplicate class names in rules

**Severity:** HIGH -- Will cause TypeScript compilation errors if not handled.

**Mitigation:** Use import aliases in `src/rules/index.ts`. Three pairs of files export duplicate class names:
- `GenericruledescripRule` (file-naming + lodash-preference)
- `GuideforusingTaskRule` (dev_workflow + taskmaster-dev_workflow)
- `ComprehensiverefereRule` (taskmaster + taskmaster-taskmaster)

Consider also renaming the duplicate classes in a separate cleanup phase to eliminate the root cause.

### Risk 2: Symlink in `.cursor/rules/`

**Severity:** MEDIUM -- `use-bun-instead-of-node-vite-npm-pnpm.mdc` is a symlink to `../../CLAUDE.md`.

**Mitigation:** The build should generate a proper file instead. The source `src/rules/general/use-bun-instead-of-node-vite-npm-pnpm.rule.ts` exists and contains real rule content. The symlink should be replaced with compiled output.

### Risk 3: Taskmaster subdirectory convention

**Severity:** LOW -- `.cursor/rules/taskmaster/` contains `dev_workflow.mdc` and `taskmaster.mdc` as a subdirectory.

**Mitigation:** The new build should flatten all rules into `.cursor/rules/` (and `.claude/rules/`). The files `taskmaster-dev_workflow.mdc` and `taskmaster-taskmaster.mdc` should be top-level entries. The old `taskmaster/` subdirectory should be cleaned up. If Cursor requires subdirectories, make this configurable.

### Risk 4: Stale file accumulation

**Severity:** HIGH -- Without cleanup, renamed or removed source entities leave orphaned output files.

**Mitigation:** Implement a clean-before-build strategy. Either:
- Delete all files in output dirs before writing (simple, safe since build regenerates everything)
- Track expected files and delete extras after build (preserves non-build files like symlinks)

Recommendation: Delete all generated files before building. Non-generated files (if any) should be documented.

### Risk 5: Rule output filename convention

**Severity:** MEDIUM -- Rules use filename stems, not a `name` property. Two rules have underscores in filenames (`cursor_rules`, `dev_workflow`, `self_improve`) while the convention elsewhere is kebab-case.

**Mitigation:** Use filename stems as-is for consistency with existing output. Do not transform underscores to kebab-case, since `.cursor/rules/` already contains `cursor_rules.mdc`, `dev_workflow.mdc`, `self_improve.mdc`.

### Risk 6: No existing tests

**Severity:** MEDIUM -- Cannot verify build correctness without tests.

**Mitigation:** Phase 10 should include test files as part of the deliverables. Tests should verify registry completeness, build output, and stale file absence.

### Risk 7: Build script duplication

**Severity:** LOW -- `build-cursor.ts`, `build-claude.ts`, and `build-all.ts` share 90% of their logic.

**Mitigation:** Consider refactoring to a shared build function, but this can be deferred. The immediate goal is registry-driven iteration.

---

## 11. File Changes Summary

| Action | File | Description |
|--------|------|-------------|
| CREATE | `src/agents/index.ts` | Agent registry with all 23 general agents |
| CREATE | `src/rules/index.ts` | Rule registry with all 20 general rules (using import aliases for duplicates) |
| UPDATE | `scripts/build-cursor.ts` | Import registries, iterate agents and rules, add stale cleanup |
| UPDATE | `scripts/build-claude.ts` | Import registries, iterate agents and rules, add stale cleanup |
| UPDATE | `scripts/build-all.ts` | Import registries, iterate agents and rules, add stale cleanup |
| UPDATE | `index.ts` | Add agentRegistry and ruleRegistry re-exports |
| CREATE | Tests (TBD location) | Registry completeness and build output tests |
