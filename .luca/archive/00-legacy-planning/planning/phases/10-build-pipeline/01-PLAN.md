# Plan 10-01: Create Agent and Rule Registries

## Frontmatter
- **ID**: 10-01
- **Title**: Create Agent and Rule Registries
- **Phase**: 10 (Build Pipeline)
- **Wave**: 1
- **Depends on**: none
- **Delivers**: BUILD-01, BUILD-02

## Objective

Create `agentRegistry` and `ruleRegistry` following the exact pattern established by `skillRegistry` in `src/skills/index.ts`. These registries map kebab-case string keys to class constructors, enabling the build scripts to iterate all entities without hardcoding. Also update the root `index.ts` to re-export all three registries as part of the public API surface.

## Context

- `src/skills/index.ts` -- The proven registry pattern to replicate. Maps 35 kebab-case keys to skill class constructors. Build scripts iterate with `Object.entries(skillRegistry)`.
- `src/agents/general/` -- 23 agent files, each exporting a uniquely-named class extending `BaseAgentImpl`. All have a `name` property in their `AgentFrontmatter`.
- `src/agents/luca/` -- 2 luca-specific agents (`LuExecutorAgent`, `LuPlannerAgent`). These are NOT included in the registry; they are handled separately in build scripts (same pattern as `LuSkill` vs `skillRegistry`).
- `src/rules/general/` -- 20 rule files. **3 pairs have duplicate class names** requiring import aliases.
- `src/rules/lu-workflow.rule.ts` -- 1 luca-specific rule (`LuWorkflowRule`). NOT included in the registry.
- `index.ts` (root) -- Public API surface. Currently exports types, base classes, compilers, luca entities, and validation utils. Missing all three registry re-exports.
- `.planning/phases/10-build-pipeline/RESEARCH.md` -- Full inventory tables, duplicate class name analysis, and recommended approach.

### Duplicate Class Names in Rules (Critical)

Three pairs of rule files export identically-named classes. The registry MUST use import aliases:

| Class Name | File 1 | File 2 |
|---|---|---|
| `GenericruledescripRule` | `file-naming.rule.ts` | `lodash-preference.rule.ts` |
| `GuideforusingTaskRule` | `dev_workflow.rule.ts` | `taskmaster-dev_workflow.rule.ts` |
| `ComprehensiverefereRule` | `taskmaster.rule.ts` | `taskmaster-taskmaster.rule.ts` |

## Tasks

### Task 1: Create `src/agents/index.ts` (agentRegistry)

**Goal**: Create an agent registry that maps all 23 general agent names to their class constructors.

**File**: Create `src/agents/index.ts`

**Details**:

Follow the `src/skills/index.ts` pattern exactly:
1. Import all 23 agent classes from `./general/`.
2. Re-export the base class and types for downstream consumers.
3. Export a `const agentRegistry` object mapping kebab-case keys to class constructors.

```ts
/**
 * Agent registry for the Luca Framework
 * Auto-generated index file for bulk agent processing
 */

// Import all general agents
import { CodeArchitectAgent } from './general/code-architect.agent';
import { CodeDeveloperAgent } from './general/code-developer.agent';
import { CodeSimplifierAgent } from './general/code-simplifier.agent';
import { DxAdvocateAgent } from './general/dx-advocate.agent';
import { LuCodebaseMapperAgent } from './general/lu-codebase-mapper.agent';
import { LuCognitionAgent } from './general/lu-cognition.agent';
import { LuDebuggerAgent } from './general/lu-debugger.agent';
import { LuIntegrationCheckerAgent } from './general/lu-integration-checker.agent';
import { LuLearnerAgent } from './general/lu-learner.agent';
import { LuPhaseResearcherAgent } from './general/lu-phase-researcher.agent';
import { LuPlanCheckerAgent } from './general/lu-plan-checker.agent';
import { LuPrReviewerAgent } from './general/lu-pr-reviewer.agent';
import { LuProjectResearcherAgent } from './general/lu-project-researcher.agent';
import { LuResearchSynthesizerAgent } from './general/lu-research-synthesizer.agent';
import { LuRoadmapperAgent } from './general/lu-roadmapper.agent';
import { LuRouterAgent } from './general/lu-router.agent';
import { LuVerifierAgent } from './general/lu-verifier.agent';
import { PerformanceAuditorAgent } from './general/performance-auditor.agent';
import { ProductAgent } from './general/product.agent';
import { QaPlanGeneratorAgent } from './general/qa-plan-generator.agent';
import { SecurityAuditorAgent } from './general/security-auditor.agent';
import { UiAgent } from './general/ui.agent';
import { UxAgent } from './general/ux.agent';

// Export base agent class
export { BaseAgentImpl } from './base/base-agent';

// Export types
export type { BaseAgent, AgentConfig, AgentFrontmatter, AgentSection } from './types/agent.types';

// Registry mapping agent names to their classes for bulk processing
export const agentRegistry = {
  'code-architect': CodeArchitectAgent,
  'code-developer': CodeDeveloperAgent,
  'code-simplifier': CodeSimplifierAgent,
  'dx-advocate': DxAdvocateAgent,
  'lu-codebase-mapper': LuCodebaseMapperAgent,
  'lu-cognition': LuCognitionAgent,
  'lu-debugger': LuDebuggerAgent,
  'lu-integration-checker': LuIntegrationCheckerAgent,
  'lu-learner': LuLearnerAgent,
  'lu-phase-researcher': LuPhaseResearcherAgent,
  'lu-plan-checker': LuPlanCheckerAgent,
  'lu-pr-reviewer': LuPrReviewerAgent,
  'lu-project-researcher': LuProjectResearcherAgent,
  'lu-research-synthesizer': LuResearchSynthesizerAgent,
  'lu-roadmapper': LuRoadmapperAgent,
  'lu-router': LuRouterAgent,
  'lu-verifier': LuVerifierAgent,
  'performance-auditor': PerformanceAuditorAgent,
  'product': ProductAgent,
  'qa-plan-generator': QaPlanGeneratorAgent,
  'security-auditor': SecurityAuditorAgent,
  'ui': UiAgent,
  'ux': UxAgent,
};
```

**Key decisions**:
- Registry keys are the filename stems without `.agent.ts` (matching the `name` property each agent declares in its `AgentFrontmatter`).
- Luca-specific agents (`LuExecutorAgent`, `LuPlannerAgent`) are excluded from the registry -- they are handled separately by build scripts (same pattern as `LuSkill`).
- The registry has exactly 23 entries.

**Verification**:
- File compiles without TypeScript errors: `bun build src/agents/index.ts --no-bundle`
- `Object.keys(agentRegistry).length === 23`
- Every `.agent.ts` file in `src/agents/general/` has a corresponding registry key

### Task 2: Create `src/rules/index.ts` (ruleRegistry)

**Goal**: Create a rule registry that maps all 20 general rule names to their class constructors, using import aliases to resolve 3 pairs of duplicate class names.

**File**: Create `src/rules/index.ts`

**Details**:

Follow the `src/skills/index.ts` pattern. Use import aliases for the 6 files involved in 3 duplicate class name pairs. Use filename stems (without `.rule.ts`) as registry keys.

```ts
/**
 * Rule registry for the Luca Framework
 * Auto-generated index file for bulk rule processing
 */

// Import all general rules
// -- Unique class names (14 rules)
import { APIpayloadsmustusRule } from './general/api-snake-case.rule';
import { AtlassianMCPintegrRule } from './general/atlassian-mcp.rule';
import { UseBunpackagemanaRule } from './general/bun-preference.rule';
import { GuidelinesforcreatRule } from './general/cursor_rules.rule';
import { FunctionalAPIReuseRule } from './general/functional-api-reuse.rule';
import { StandardsforimportRule } from './general/import-standards.rule';
import { LucaworkflowsystemRule } from './general/lu-workflow.rule';
import { MandatorydocumentatRule } from './general/mandatory-documentation.rule';
import { ProhibitclassusageRule } from './general/no-classes.rule';
import { ApplywheninteractiRule } from './general/posthog-integration.rule';
import { EnforceZodschemafRule } from './general/schema-first-parsing.rule';
import { GuidelinesforcontiRule } from './general/self_improve.rule';
import { GuidelinesforanalyRule } from './general/task-analyzation.rule';
import { UseBuninsteadofNRule } from './general/use-bun-instead-of-node-vite-npm-pnpm.rule';

// -- Duplicate class names requiring aliases (6 rules, 3 pairs)
import { GenericruledescripRule as FileNamingRule } from './general/file-naming.rule';
import { GenericruledescripRule as LodashPreferenceRule } from './general/lodash-preference.rule';
import { GuideforusingTaskRule as DevWorkflowRule } from './general/dev_workflow.rule';
import { GuideforusingTaskRule as TaskmasterDevWorkflowRule } from './general/taskmaster-dev_workflow.rule';
import { ComprehensiverefereRule as TaskmasterRule } from './general/taskmaster.rule';
import { ComprehensiverefereRule as TaskmasterTaskmasterRule } from './general/taskmaster-taskmaster.rule';

// Export base rule class
export { BaseRuleImpl } from './base/base-rule';

// Export types
export type { BaseRule, RuleConfig, RuleFrontmatter, RuleSection } from './types/rule.types';

// Registry mapping rule names to their classes for bulk processing
export const ruleRegistry = {
  'api-snake-case': APIpayloadsmustusRule,
  'atlassian-mcp': AtlassianMCPintegrRule,
  'bun-preference': UseBunpackagemanaRule,
  'cursor_rules': GuidelinesforcreatRule,
  'dev_workflow': DevWorkflowRule,
  'file-naming': FileNamingRule,
  'functional-api-reuse': FunctionalAPIReuseRule,
  'import-standards': StandardsforimportRule,
  'lodash-preference': LodashPreferenceRule,
  'lu-workflow': LucaworkflowsystemRule,
  'mandatory-documentation': MandatorydocumentatRule,
  'no-classes': ProhibitclassusageRule,
  'posthog-integration': ApplywheninteractiRule,
  'schema-first-parsing': EnforceZodschemafRule,
  'self_improve': GuidelinesforcontiRule,
  'task-analyzation': GuidelinesforanalyRule,
  'taskmaster': TaskmasterRule,
  'taskmaster-dev_workflow': TaskmasterDevWorkflowRule,
  'taskmaster-taskmaster': TaskmasterTaskmasterRule,
  'use-bun-instead-of-node-vite-npm-pnpm': UseBuninsteadofNRule,
};
```

**Key decisions**:
- Registry keys are filename stems without `.rule.ts`, preserving underscores in names like `cursor_rules`, `dev_workflow`, `self_improve` (matching existing output filenames in `.cursor/rules/`).
- Import aliases use descriptive PascalCase names derived from the filename (e.g., `FileNamingRule` for `file-naming.rule.ts`).
- Luca-specific rule (`LuWorkflowRule` from `src/rules/lu-workflow.rule.ts`) is excluded -- handled separately by build scripts.
- The registry has exactly 20 entries.

**Verification**:
- File compiles without TypeScript errors: `bun build src/rules/index.ts --no-bundle`
- `Object.keys(ruleRegistry).length === 20`
- Every `.rule.ts` file in `src/rules/general/` has a corresponding registry key
- No import name collisions (aliases resolve all duplicates)

### Task 3: Update root `index.ts` to re-export registries

**Goal**: Add `agentRegistry`, `skillRegistry`, and `ruleRegistry` re-exports to the root `index.ts` so they are part of the public API surface.

**File**: Modify `index.ts` (repository root)

**Details**:

Add the following registry exports after the existing "Luca-specific entities" section and before the "Validation utilities" section:

```ts
// Registries (for build scripts and consumers)
export { agentRegistry } from './src/agents/index';
export { skillRegistry } from './src/skills/index';
export { ruleRegistry } from './src/rules/index';
```

The existing individual luca-specific entity exports (`LuExecutorAgent`, `LuPlannerAgent`, `LuSkill`, `LuWorkflowRule`) remain unchanged -- they are the framework's own entities and are separate from the registries.

**Verification**:
- File compiles without TypeScript errors
- `import { agentRegistry, skillRegistry, ruleRegistry } from './index'` works from a test file
- All existing exports are preserved (no regressions)

## Exit Criteria

1. `src/agents/index.ts` exists and exports `agentRegistry` with exactly 23 entries (one per file in `src/agents/general/`)
2. `src/rules/index.ts` exists and exports `ruleRegistry` with exactly 20 entries (one per file in `src/rules/general/`)
3. Root `index.ts` re-exports `agentRegistry`, `skillRegistry`, and `ruleRegistry`
4. All three registry files compile without TypeScript errors
5. Every class in every registry can be instantiated with `new RegistryClass()` without throwing
6. No import name collisions -- all 3 duplicate class name pairs use aliases
7. `bun test` passes (existing tests unbroken)
