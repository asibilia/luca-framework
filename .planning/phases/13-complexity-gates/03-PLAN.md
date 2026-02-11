---
id: 13-03
title: Gated Steps and Skill/Rule Updates
phase: 13-complexity-gates
wave: 3
delivers: CPLX-03, CPLX-06
depends_on: 13-01, 13-02
tasks: 7
---

# Plan 13-03: Gated Steps and Skill/Rule Updates

## Objective

Add complexity gating conditionals to all orchestrator skills (lu-execute-phase, lu-plan-phase, lu-verify-work, lu-discuss-phase) and create the `complexity-gating` rule that instructs agents to check complexity before spawning optional sub-agents. Register the rule in the rule registry.

## Context

- **lu-execute-phase skill:** `src/skills/general/lu-execute-phase.skill.ts` (985 lines). Steps to gate:
  - Step 6.5 (line ~359): Run Verification Harness -- always runs, but harness fix iterations scale
  - Step 6.6 (line ~391): Failure-to-Fix Loop -- max iterations come from complexity matrix
  - Step 7.5 (line ~515): Code Quality Review -- gate reviewer agent spawning by complexity
  - Step 11 (line ~796): UAT -- gate by complexity
  - Learning capture in the "Always Verify & Learning Capture" section (line ~56): gate learning depth
- **lu-plan-phase skill:** `src/skills/general/lu-plan-phase.skill.ts` (491 lines). Steps to gate:
  - Step 5 (line ~183): Research -- skip for TRIVIAL/SIMPLE
  - Step 10 (line ~356): Plan verification (lu-plan-checker) -- skip for TRIVIAL/SIMPLE, scale iterations
  - Step 12 (line ~426): Revision loop -- max iterations from complexity matrix
- **lu-verify-work skill:** `src/skills/general/lu-verify-work.skill.ts` (381 lines). Steps to gate:
  - Step 9 (line ~172): Code quality review -- gate reviewer spawning count by complexity
- **lu-discuss-phase skill:** `src/skills/general/lu-discuss-phase.skill.ts` (115 lines). Steps to gate:
  - Entire skill can be skipped for TRIVIAL/SIMPLE
  - Probing depth scales: 2 questions for MODERATE, 4+ for COMPLEX/CRITICAL
- **Rule pattern:** `src/rules/general/harness-verification.rule.ts` (62 lines) -- BaseRuleImpl pattern
- **Rule registry:** `src/rules/index.ts` (64 lines) -- import + register pattern
- **Complexity module:** `src/complexity/` (built by Plan 13-01)
- **Router:** Updated lu-router now outputs gated steps (built by Plan 13-02)

## Tasks

### Task 1: Create complexity-gating Rule

**Goal:** Create a rule that defines the complexity matrix and instructs all agents to check complexity before performing optional steps. This is the "soft enforcement" layer -- agents see the rule in their context and self-gate.
**Files:** `src/rules/general/complexity-gating.rule.ts`
**Pattern:** Follow `src/rules/general/harness-verification.rule.ts` exactly (class extends BaseRuleImpl, RuleConfig with frontmatter + sections)

Create `src/rules/general/complexity-gating.rule.ts`:

```typescript
/**
 * Complexity gating: which workflow steps activate at which complexity level
 */
import { BaseRuleImpl } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

const ComplexityGatingConfig: RuleConfig = {
  frontmatter: {
    description: 'Complexity gating: which workflow steps activate at which complexity level',
    globs: ['*.ts', '*.md', '.planning/config.json'],
    alwaysApply: true,
  },
  sections: [
    {
      title: 'rule',
      content: `# Complexity Gating

## Five Complexity Levels

Luca classifies task complexity into five levels, grouped into three behavioral tiers:

| Level | Tier | File Count | Scope | Risk |
|-------|------|-----------|-------|------|
| TRIVIAL | Lightweight | 1 | Single component | Low |
| SIMPLE | Lightweight | 2-3 | Related components | Low-Medium |
| MODERATE | Standard | 3-5 | Feature-scoped | Medium |
| COMPLEX | Thorough | 5-10 | Cross-cutting | High |
| CRITICAL | Thorough | 10+ / architectural | System-wide | Very High |

## Always-On Steps (Cannot Be Gated)

These steps run regardless of complexity:

1. Model profile resolution
2. Phase/environment validation
3. Plan discovery and wave grouping
4. Core execution (lu-executor)
5. Result aggregation
6. Verification harness (scope scales, always runs)
7. lu-verifier (mode scales, always invoked)
8. State/roadmap/requirements updates
9. Commit

## Complexity Matrix

| Step | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|------|---------|--------|----------|---------|----------|
| Cognitive pre-flight | Lite | Lite | Full | Full | Full |
| Research | Skip | Skip | Optional | Required | Required |
| Discussion | Skip | Skip | Optional | Run | Required |
| Plan verification | 0 iter | 0 iter | 1 iter | 2 iter | 3 iter |
| Harness fix iterations | 1 | 2 | 3 | 3 | 5 |
| Verification mode | Quick | Quick | Standard | Full | Full+Human |
| Code review: dx-advocate | Skip | Skip | Run | Run | Run |
| Code review: code-simplifier | Skip | Skip | Run | Run | Run |
| Code review: code-architect | Skip | Skip | Skip | Run | Run |
| Code review: tailwind-auditor | Skip | Skip | If UI | If UI | Run |
| Code review: security-auditor | Skip | Skip | If auth | If auth | Always |
| UAT | Skip | Skip | Optional | Required | Required+Thorough |
| Learning capture | Skip | Brief | Standard | Full | Full+Debrief |

## How to Apply

**Before spawning optional sub-agents**, check the current task complexity:

1. Read complexity from STATE.md \\\`Task Complexity:\\\` field
2. If not set, read from lu-router's classification output
3. Look up the step in the matrix above
4. If the step says "Skip" for the current level, skip it
5. If the step says "Optional", skip unless the user or config explicitly enables it
6. If the step says "Run" or "Required", always execute

**Complexity is set by:**
- lu-router (automatic inference)
- \\\`--complexity=<level>\\\` flag (manual override)
- Persisted in STATE.md for session continuity

## Override Mechanisms

- \\\`--complexity=<level>\\\`: Explicit level, skips router inference
- \\\`--force-complex\\\`: Alias for \\\`--complexity=COMPLEX\\\`
- \\\`workflow.code_review: false\\\`: Skip code review regardless of complexity
- \\\`workflow.uat_required: false\\\`: Skip UAT regardless of complexity
- \\\`--skip-review\\\`, \\\`--skip-uat\\\`: Per-invocation skip flags

Config booleans and per-invocation flags take precedence over complexity gating. If \\\`workflow.code_review: false\\\`, code review is skipped even at CRITICAL level.`,
      order: 1,
    },
  ],
};

export class ComplexityGatingRule extends BaseRuleImpl {
  constructor() {
    super(ComplexityGatingConfig);
  }
}
```

**Verification:**
- [ ] Rule file follows harness-verification pattern exactly
- [ ] Rule exports class extending BaseRuleImpl
- [ ] Rule has `alwaysApply: true`
- [ ] Complexity matrix is readable and matches defaults from `src/complexity/defaults.ts`
- [ ] Override mechanisms documented
- [ ] File compiles without errors

### Task 2: Register complexity-gating Rule

**Goal:** Register the new rule in the rule registry.
**Files:** `src/rules/index.ts`
**Pattern:** Follow existing import/registration pattern in `src/rules/index.ts`

Add to `src/rules/index.ts`:

**Import** (add after the `HarnessVerificationRule` import on line 13):
```typescript
import { ComplexityGatingRule } from "./general/complexity-gating.rule";
```

**Register** (add to `ruleRegistry` object after the `"harness-verification"` entry on line 51):
```typescript
  "complexity-gating": ComplexityGatingRule,
```

**Update test assertion:** In `__tests__/src/rules/rule-registry.test.ts` line 37, change `.toBe(20)` to `.toBe(21)` to account for the new complexity-gating rule.

**Verification:**
- [ ] Rule imported from correct path
- [ ] Rule registered in `ruleRegistry` (21 entries total, was 20; adding 1 makes 21)
- [ ] Test assertion updated from 20 to 21
- [ ] `bunx --bun tsc --noEmit` passes

### Task 3: Add Complexity Gating to lu-execute-phase Skill

**Goal:** Add complexity gating conditionals to the lu-execute-phase skill for steps 6.6, 7.5, and 11.
**Files:** `src/skills/general/lu-execute-phase.skill.ts`

**Change 1: Gate harness fix iteration count (Step 6.6)**

In Step 6.6 "Failure-to-Fix Loop" (line ~391), replace the instruction:
```
Read maxFixIterations from harness config (default 3).
```
with:
```
Read maxFixIterations from complexity matrix. Look up the current complexity level in STATE.md, then use \`harnessFixIterations\` from the complexity matrix in config.json. If no complexity is set, fall back to harness config maxFixIterations (default 3).

| Complexity | Max Fix Iterations |
|------------|-------------------|
| TRIVIAL | 1 |
| SIMPLE | 2 |
| MODERATE | 3 |
| COMPLEX | 3 |
| CRITICAL | 5 |
```

**Change 2: Gate code review (Step 7.5)**

In Step 7.5 "Code Quality Review" (line ~515), replace the skip condition:
```
**Skip if:** \`--skip-review\` flag passed OR \`workflow.code_review: false\` in config.
```
with:
```
**Skip if:** \`--skip-review\` flag passed OR \`workflow.code_review: false\` in config OR complexity is TRIVIAL or SIMPLE.

**Complexity gate:** Code review runs at MODERATE and above. TRIVIAL/SIMPLE skip code review entirely.
```

After the "Determine which reviewers to spawn:" heading (line ~539), replace the current always-spawn list:
```
Always spawn:

- \`dx-advocate\` — conventions, coding standards, Lodash vs native, snake_case keys
- \`code-simplifier\` — DRY violations, duplicated code, complexity
- \`code-architect\` — architecture, structure, patterns, module boundaries
- \`tailwind-auditor\` — dynamic color system, Tailwind patterns, shadcn anti-patterns
```
with:
```
**Spawn based on complexity level** (read from STATE.md \`Task Complexity:\` field):

| Agent | MODERATE | COMPLEX | CRITICAL |
|-------|----------|---------|----------|
| dx-advocate | Run | Run | Run |
| code-simplifier | Run | Run | Run |
| code-architect | Skip | Run | Run |
| tailwind-auditor | If UI files | If UI files | Run |
| security-auditor | If auth files | If auth files | Always |

If complexity not set, default to spawning all reviewers (backward-compatible).
```

**Change 3: Gate UAT (Step 11)**

In Step 11 "User Acceptance Testing" (line ~796), replace the skip condition:
```
**Skip if:** \`--skip-uat\` flag passed OR \`workflow.uat_required: false\` in config.
```
with:
```
**Skip if:** \`--skip-uat\` flag passed OR \`workflow.uat_required: false\` in config OR complexity is TRIVIAL or SIMPLE.

**Complexity gate:** UAT runs at MODERATE (optional) and above. For COMPLEX/CRITICAL, UAT is required.

| Complexity | UAT |
|------------|-----|
| TRIVIAL | Skip |
| SIMPLE | Skip |
| MODERATE | Optional (runs unless --skip-uat) |
| COMPLEX | Required |
| CRITICAL | Required + thorough |
```

**Change 4: Gate learning capture depth**

In the "Learning Capture" section (line ~74), after the existing spawn instruction, add:

```markdown
**Complexity-gated learning depth:**

| Complexity | Learning Capture |
|------------|-----------------|
| TRIVIAL | Skip (do not spawn lu-learner) |
| SIMPLE | Brief (spawn with minimal context) |
| MODERATE | Standard (current behavior) |
| COMPLEX | Full (include all working memory) |
| CRITICAL | Full + debrief (include retrospective analysis) |

For TRIVIAL: Skip the lu-learner spawn entirely.
For SIMPLE: Include only execution summary, not full working memory.
For MODERATE and above: Use the current lu-learner spawn as-is.
For CRITICAL: Add to the lu-learner prompt: "Include a retrospective analysis: what went well, what didn't, what would you do differently?"
```

**Verification:**
- [ ] Step 6.6 references complexity matrix for fix iterations
- [ ] Step 7.5 gates reviewer spawning by complexity level
- [ ] Step 11 gates UAT by complexity level
- [ ] Learning capture gated by complexity
- [ ] All gating is backward-compatible (defaults to current behavior when no complexity set)
- [ ] File compiles without errors

### Task 4: Add Complexity Gating to lu-plan-phase Skill

**Goal:** Add complexity gating conditionals to lu-plan-phase for research, plan verification, and revision loop.
**Files:** `src/skills/general/lu-plan-phase.skill.ts`

**Change 1: Gate research (Step 5)**

In Step 5 "Handle Research" (line ~183), after the existing `--gaps` check and before the `--skip-research` check, add a complexity gate. Replace the section starting with:
```
**If \`--gaps\` flag:** Skip research (gap closure uses VERIFICATION.md instead).

**If \`--skip-research\` flag:** Skip to step 6.
```
with:
```
**If \`--gaps\` flag:** Skip research (gap closure uses VERIFICATION.md instead).

**If \`--skip-research\` flag:** Skip to step 6.

**Complexity gate:** Research is skipped for TRIVIAL and SIMPLE levels, optional for MODERATE, required for COMPLEX and CRITICAL.

| Complexity | Research |
|------------|----------|
| TRIVIAL | Skip |
| SIMPLE | Skip |
| MODERATE | Run if \`workflow.research: true\` (default) |
| COMPLEX | Always run |
| CRITICAL | Always run |

Read complexity from STATE.md \`Task Complexity:\` field. If TRIVIAL or SIMPLE, skip to step 6 (equivalent to --skip-research).
```

**Change 2: Gate plan verification (Step 10)**

In Step 10 "Spawn lu-plan-checker Agent" (line ~356), add a complexity gate before the spawn. Insert after the display banner and before the MANDATORY note:

```markdown
**Complexity gate:** Plan verification is skipped for TRIVIAL and SIMPLE, runs with scaled iterations for MODERATE and above.

| Complexity | Plan Verification |
|------------|------------------|
| TRIVIAL | Skip entirely |
| SIMPLE | Skip entirely |
| MODERATE | 1 iteration |
| COMPLEX | 2 iterations |
| CRITICAL | 3 iterations |

If complexity is TRIVIAL or SIMPLE: Skip steps 10-12 entirely (no plan-checker, no revision loop). Proceed directly to step 13 (Present Final Status).
```

**Change 3: Gate revision loop (Step 12)**

In Step 12 "Revision Loop" (line ~426), replace:
```
### 12. Revision Loop (Max 3 Iterations)

If issues found and iteration_count < 3:
```
with:
```
### 12. Revision Loop (Complexity-Scaled Iterations)

Max iterations from complexity matrix (default 3 if no complexity set):

| Complexity | Max Revisions |
|------------|--------------|
| MODERATE | 1 |
| COMPLEX | 2 |
| CRITICAL | 3 |

If issues found and iteration_count < max_revisions:
```

**Verification:**
- [ ] Research gated by complexity (TRIVIAL/SIMPLE skip)
- [ ] Plan verification gated by complexity (TRIVIAL/SIMPLE skip entirely)
- [ ] Revision loop max iterations scale with complexity
- [ ] Backward-compatible: current behavior when no complexity set
- [ ] File compiles without errors

### Task 5: Add Complexity Gating to lu-verify-work Skill

**Goal:** Gate the code review agent spawning in lu-verify-work by complexity level.
**Files:** `src/skills/general/lu-verify-work.skill.ts`

In Step 9 (line ~172), where the code quality review section begins, add a complexity gate. After the heading "9. **If UAT passes:** Run code quality review" and before the MANDATORY note, insert:

```markdown
**Complexity gate:** Code review runs at MODERATE and above. If complexity is TRIVIAL or SIMPLE, skip code review entirely and proceed to step 12.

**Spawn reviewers based on complexity** (read from STATE.md `Task Complexity:` field):

| Agent | MODERATE | COMPLEX | CRITICAL |
|-------|----------|---------|----------|
| dx-advocate | Run | Run | Run |
| code-simplifier | Run | Run | Run |
| code-architect | Skip | Run | Run |
| tailwind-auditor | If UI files | If UI files | Run |
| security-auditor | If auth files | If auth files | Always |

If no complexity is set in STATE.md, default to spawning all reviewers (backward-compatible).
```

**Verification:**
- [ ] Code review gated by complexity in lu-verify-work
- [ ] Reviewer matrix matches lu-execute-phase (consistency)
- [ ] Backward-compatible when no complexity set
- [ ] File compiles without errors

### Task 6: Add Complexity Awareness to lu-discuss-phase Skill

**Goal:** Make lu-discuss-phase complexity-aware so it can be skipped for low complexity and scale probing depth for higher complexity.
**Files:** `src/skills/general/lu-discuss-phase.skill.ts`

In the Process section (after "## Process" and before "1. **Validate phase number**"), add:

```markdown
### Complexity Gate

Read complexity from STATE.md \`Task Complexity:\` field before starting discussion.

| Complexity | Discussion |
|------------|-----------|
| TRIVIAL | Skip entirely — proceed to /lu-plan-phase |
| SIMPLE | Skip entirely — proceed to /lu-plan-phase |
| MODERATE | Optional — run with standard depth (4 questions per area) |
| COMPLEX | Recommended — run with extended depth (4+ questions per area) |
| CRITICAL | Required — run with thorough depth (6+ questions per area) |

If complexity is TRIVIAL or SIMPLE:
```
Display a skip notice and route to planning:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► DISCUSSION SKIPPED (TRIVIAL/SIMPLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task complexity is {TRIVIAL|SIMPLE}. Discussion is not needed.

▶ Next Up
/lu-plan-phase {phase}
```
```

Also update the "## Probing Depth" section (currently at line ~69). Replace:
```
## Probing Depth

- Ask 4 questions per area before checking
```
with:
```
## Probing Depth

Scale probing depth by complexity:
- MODERATE: 4 questions per area (standard)
- COMPLEX: 4-6 questions per area (extended)
- CRITICAL: 6+ questions per area (thorough)

Default:
- Ask 4 questions per area before checking
```

**Verification:**
- [ ] TRIVIAL/SIMPLE skip discussion with notice
- [ ] Probing depth scales with complexity
- [ ] CRITICAL gets thorough treatment
- [ ] File compiles without errors

### Task 7: Build and Validate

**Goal:** Compile all updated entities and validate no regressions.
**Files:** No new files. Run build and tests.

```bash
bun run build:all
bun test
bunx --bun tsc --noEmit
```

Verify rule output:
```bash
ls .cursor/rules/complexity-gating.mdc
ls .claude/rules/complexity-gating.md
```

Count rules in registry:
```bash
bun -e "const { ruleRegistry } = await import('./src/rules/index'); console.log('Rules:', Object.keys(ruleRegistry).length);"
```

Expected: 21 rules (20 + complexity-gating).

**Verification:**
- [ ] `bun run build:all` completes without errors
- [ ] `.cursor/rules/complexity-gating.mdc` exists
- [ ] `.claude/rules/complexity-gating.md` exists
- [ ] Rule registry has 21 entries
- [ ] All tests pass (no new failures beyond pre-existing 6)
- [ ] TypeScript compilation clean
- [ ] All skill/agent updates compiled to output directories

## Exit Criteria

- [ ] `complexity-gating.rule.ts` created and registered (21 rules total)
- [ ] lu-execute-phase gates: harness fix iterations, code review, UAT, learning capture by complexity
- [ ] lu-plan-phase gates: research, plan verification, revision loop by complexity
- [ ] lu-verify-work gates: code review agent spawning by complexity
- [ ] lu-discuss-phase: skips for TRIVIAL/SIMPLE, scales probing depth
- [ ] All gating is backward-compatible (defaults to current behavior when no complexity set)
- [ ] Build pipeline produces updated output for all modified entities
- [ ] No regressions

## Dependencies

- **Plan 13-01** must be complete (src/complexity/ module)
- **Plan 13-02** must be complete (router outputs 5 levels + gated steps)
- Requires: `bun run build:all` (build pipeline from Phase 10)
