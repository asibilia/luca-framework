/**
 * Module boundary: import direction rules and entity isolation
 */
import { createRule } from "~/rules/__helpers/create-rule";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

const moduleBoundaryConfig: RuleConfig = {
  frontmatter: {
    description: "Module boundary: import direction rules and entity isolation",
    globs: ["src/**/*.ts"],
    alwaysApply: true,
  },
  sections: [
    {
      title: "rule",
      content: `# Module Boundary Rules

## Dependency Tier Map

\`\`\`
T0 Foundation:  shared, complexity       (imported by many, imports nothing from src/)
T1 Core:        context, planner, harness, iteration, observability, interop, workflow, eval  (import T0-T1)
T2 Entity:      agents, skills, rules    (import T0-T1; parallel, never cross-import)
T3 Build:       compilers, hooks, adapters  (terminal; imported by nothing in src/)
\`\`\`

## Rule 1 — Downward-Only Imports

A file in tier N may import from tiers 0 through N-1 only. Never import upward.

\`\`\`typescript
// ✅ T1 (planner) importing T0 (complexity)
import { COMPLEXITY_ORDER } from "~/complexity";

// ✅ T2 (agents) importing T1 (context)
import type { ContextConfig } from "~/context";

// ❌ T0 (shared) importing T1 (harness) — upward dependency
import { runHarness } from "~/harness";

// ❌ T1 (harness) importing T2 (agents) — upward dependency
import { agentRegistry } from "~/agents";

// ✅ T1 (context) importing T1 (interop) — same-tier is allowed
import { scanForAgents } from "~/interop";

// ✅ T1 (workflow) importing T0 (complexity)
import { COMPLEXITY_ORDER } from "~/complexity";

// ✅ T1 (workflow) importing T1 (iteration) — same-tier allowed
import { assessBudget } from "~/iteration";

// ✅ T1 (eval) importing T1 (workflow) — same-tier allowed
import type { WorkflowStep } from "~/workflow";

// ✅ T3 (adapters) importing T2 (agents) — downward
import type { AgentConfig } from "~/agents";

// ✅ T3 (adapters) importing T1 (workflow) — downward
import type { WorkflowAdapter } from "~/workflow";

// ❌ T1 (eval) importing T3 (adapters) — upward dependency
import { createClaudeAdapter } from "~/adapters";
// FIX: eval imports WorkflowAdapter interface from workflow (T1), not adapter impl (T3)
\`\`\`

**Clarification: Same-tier imports (T1->T1) are permitted.** The tier map shorthand "T1 imports T0-T1" means T1 cannot import from T2 or T3. Cross-domain imports within the same tier are allowed (e.g., context importing from interop). The enforcement script (\`check-domain-boundaries.ts\`) validates this: \`sourceTier < targetTier\` is the violation condition, so same-tier imports pass.

## Rule 2 — Entity Isolation

Entity domains (agents, skills, rules) are parallel and MUST NEVER cross-import.

\`\`\`typescript
// ❌ agents importing from skills
import { someSkill } from "~/skills";

// ❌ rules importing from agents
import { someAgent } from "~/agents";

// ❌ skills importing from rules
import { someRule } from "~/rules";
\`\`\`

Entity domains may import from T0 (shared, complexity) and T1 (context, planner, etc.) only.

## Rule 3 — Barrel-First Cross-Domain Imports

When importing from another domain, prefer the barrel (\`~/domain\`). Direct deep imports into \`__schemas/\` are allowed when only specific types are needed.

\`\`\`typescript
// ✅ Preferred: barrel import
import { ComplexityGateSchema } from "~/complexity";
import type { HarnessResult } from "~/harness";

// ✅ Acceptable: direct schema import for specificity
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
\`\`\`

## Rule 4 — __helpers/ Encapsulation

Never import directly from another domain's \`__helpers/\`. These are internal implementation details.

\`\`\`typescript
// ❌ Cross-domain import into __helpers/
import { runCheck } from "~/harness/__helpers/runner";

// ✅ Import via barrel
import { runHarness } from "~/harness";
\`\`\`

**Exception**: \`shared/__helpers/*\` may be imported directly by any domain, because shared barrels everything and direct imports are sometimes needed for path specificity (e.g., \`~/shared/__helpers/validation-utils\`).

## Rule 5 — Documented Exceptions

There are currently no known cross-tier import exceptions.

**Removed exceptions (resolved):**
- \`shared/__helpers/validation-utils.ts\` -> agents/skills/rules \`__schemas/\` was a T0->T2 violation where shared imported entity schemas for config validation. Resolved in Phase 13 by replacing entity-specific validators with a generic \`safeValidate<T>(schema, config)\` that accepts any Zod schema, eliminating all T2 imports from shared.
- \`harness/parsers/parser-registry.ts\` -> \`~/harness/__schemas/harness.schemas\` was listed but is an intra-domain import (harness -> harness), not a cross-tier violation. Removed in Phase 95.

New exceptions must be documented here and in this rule file before being committed.

## Enforcement

- **Convention**: All developers and AI agents follow these rules
- **Automated**: \`bun run scripts/check-domain-boundaries.ts\` validates tier compliance
- **Pre-commit**: Boundary violations are flagged during code review

## Barrel Index Invariant

Every domain's \`index.ts\` is a pure barrel — it contains ONLY re-export statements (\`export { ... } from\` and \`export type { ... } from\`). No logic, no schemas, no registries, no constants.`,
      order: 1,
    },
  ],
};

export const moduleBoundaryRule = createRule(moduleBoundaryConfig);
