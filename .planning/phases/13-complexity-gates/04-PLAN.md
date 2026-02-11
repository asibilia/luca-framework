---
id: 13-04
title: Agent Scaling and Iteration Limits
phase: 13-complexity-gates
wave: 3
delivers: CPLX-07
depends_on: 13-01, 13-02
tasks: 6
---

# Plan 13-04: Agent Scaling and Iteration Limits

## Objective

Update agent definitions to formalize how complexity level influences their behavior: lu-verifier formalizes verification mode selection by complexity, lu-cognition supports lite vs full pre-flight based on complexity, and create the complexity matrix reference document for human consumption. This plan completes the complexity gate system by ensuring agents themselves are complexity-aware, not just the orchestrator skills.

## Context

- **lu-verifier agent:** `src/agents/general/lu-verifier.agent.ts` (858 lines). Currently references 3 levels in `<always_verify>` section (lines 30-36):
  - TRIVIAL: Quick verification
  - MODERATE: Standard verification
  - COMPLEX: Full verification
- **lu-cognition agent:** `src/agents/general/lu-cognition.agent.ts` (426 lines). Line 195: outputs `**Complexity**: [to be classified by router]` in WORKING.md template. Currently does full pre-flight for all tasks.
- **References directory:** `packages/luca-framework/templates/framework/references/` (10 existing files: checkpoints.md, continuation-format.md, git-integration.md, model-profiles.md, planning-config.md, questioning.md, task-directive.md, tdd.md, ui-brand.md, verification-patterns.md)
- **Complexity module:** `src/complexity/` (built by Plan 13-01)
- **Router:** Updated lu-router now classifies 5 levels (built by Plan 13-02)
- **Skills gated:** lu-execute-phase, lu-plan-phase, lu-verify-work, lu-discuss-phase (updated by Plan 13-03)

## Tasks

### Task 1: Update lu-verifier Agent for 5-Level Verification Modes

**Goal:** Expand the lu-verifier agent's `<always_verify>` section from 3 levels to 5, formalizing how verification mode scales with complexity.
**Files:** `src/agents/general/lu-verifier.agent.ts`

**Change 1:** In the `<always_verify>` section (lines 30-36), replace the 3-level verification mode list:

```markdown
- **TRIVIAL tasks**: Quick verification (existence + basic functionality)
- **MODERATE tasks**: Standard verification (functionality + integration)
- **COMPLEX tasks**: Full verification (goal-backward + key links + comprehensive)
```

with:

```markdown
- **TRIVIAL tasks**: Quick verification (existence + basic functionality check)
- **SIMPLE tasks**: Quick verification (existence + basic functionality + no regressions)
- **MODERATE tasks**: Standard verification (functionality + integration + type safety)
- **COMPLEX tasks**: Full verification (goal-backward + key links + comprehensive)
- **CRITICAL tasks**: Full + human verification (goal-backward + key links + comprehensive + mandatory human testing items flagged)

### Verification Mode by Complexity

| Complexity | Mode | What It Checks |
|------------|------|---------------|
| TRIVIAL | Quick | File exists, compiles, basic functionality |
| SIMPLE | Quick | File exists, compiles, basic functionality, no regressions |
| MODERATE | Standard | Functionality, integration, type safety |
| COMPLEX | Full | Goal-backward analysis, key links, comprehensive artifacts |
| CRITICAL | Full+Human | Everything in Full, plus mandatory human verification items flagged |

**How to determine mode:**
1. Read \`Task Complexity:\` from STATE.md
2. Map to verification mode using the table above
3. If no complexity set, infer from plan count: 1-2 plans = Standard, 3+ plans = Full (backward-compatible)
```

**Change 2:** In the `<verification_process>` section, at **Step 8: Identify Human Verification Needs** (line ~492), add a note about CRITICAL level:

After the "**Always needs human:**" list, add:

```markdown
**For CRITICAL complexity (mandatory):**

When task complexity is CRITICAL, human verification items are mandatory, not optional. The verifier MUST:
- Flag at least 3 human verification items
- Include user flow completion as a mandatory test
- Include edge case testing as a mandatory test
- Set status to \`human_needed\` if any human verification items exist (even if all automated checks pass)
```

**Verification:**
- [ ] Agent references all 5 complexity levels
- [ ] Verification mode table maps each level to a mode
- [ ] CRITICAL level triggers mandatory human verification
- [ ] Backward-compatible: infers mode from plan count if no complexity set
- [ ] File compiles without errors

### Task 2: Update lu-cognition Agent for Lite vs Full Pre-Flight

**Goal:** Make lu-cognition support a "lite" mode for TRIVIAL/SIMPLE tasks that skips detailed MEMORY.md recall and produces a minimal cognitive report.
**Files:** `src/agents/general/lu-cognition.agent.ts`

**Change 1:** In the `<execution_flow>` section, add a new step before `load_brain` (currently the first step at line ~81). Insert as the very first step:

```markdown
<step name="check_complexity_mode" priority="first">
Determine cognitive pre-flight depth based on complexity:

**If complexity override is provided (from --complexity flag or STATE.md):**
- TRIVIAL or SIMPLE → **Lite mode**
- MODERATE, COMPLEX, or CRITICAL → **Full mode** (current behavior)

**If no complexity is known yet (first invocation):**
- Default to **Full mode** (lu-router will classify complexity after this step)

### Lite Mode (TRIVIAL/SIMPLE)

In lite mode, skip detailed memory recall and produce a minimal report:
1. Load BRAIN.md (quick scan for project identity only)
2. **Skip** detailed MEMORY.md keyword search
3. Initialize WORKING.md with minimal template
4. **Skip** detailed intuition checks
5. Output a minimal cognitive report

Lite mode WORKING.md template:

\`\`\`markdown
# Working Memory

## Session Info
- **Started**: [timestamp]
- **Workflow**: [workflow name]
- **Complexity**: [TRIVIAL|SIMPLE]

## Notes
<!-- Minimal tracking for lightweight tasks -->
\`\`\`

Lite mode output:

\`\`\`markdown
## COGNITIVE PRE-FLIGHT COMPLETE (LITE)

### Status
Lite mode — task classified as {TRIVIAL|SIMPLE}

### Project Identity
{1-line summary from BRAIN.md or "Not configured"}

### Working Memory
Initialized: \`.planning/WORKING.md\` (minimal)

### Ready For
Route to: \`lu-router\`
\`\`\`

**If lite mode:** Output the minimal report and return. Skip all subsequent steps.
**If full mode:** Continue with the full pre-flight sequence below.
</step>
```

**Change 2:** Update the WORKING.md template in `initialize_working` step (line ~175). In the Current Context section, change:

```markdown
- **Complexity**: [to be classified by router]
```

to:

```markdown
- **Complexity**: [to be classified by router — see complexity-gating rule for levels: TRIVIAL/SIMPLE/MODERATE/COMPLEX/CRITICAL]
```

**Verification:**
- [ ] Lu-cognition checks complexity mode at start of execution
- [ ] Lite mode produces minimal report and skips memory recall
- [ ] Full mode is unchanged (backward-compatible)
- [ ] WORKING.md template references 5 levels
- [ ] File compiles without errors

### Task 3: Create Complexity Matrix Reference Document

**Goal:** Create a human-readable complexity matrix reference document that gets compiled into `.cursor/luca/references/` and `.claude/references/` for agent context.
**Files:** `packages/luca-framework/templates/framework/references/complexity-matrix.md`
**Pattern:** Follow existing reference files in `packages/luca-framework/templates/framework/references/` (plain markdown, informational)

Create `packages/luca-framework/templates/framework/references/complexity-matrix.md`:

```markdown
# Complexity Matrix Reference

## Overview

Luca uses five complexity levels to gate workflow steps. Each level determines which optional steps activate, how many agents are spawned, iteration limits, and verification depth.

## Levels

| Level | Files | Scope | Risk | Time | Route |
|-------|-------|-------|------|------|-------|
| TRIVIAL | 1 | Single component | Low | < 15 min | Direct execute |
| SIMPLE | 2-3 | Related components | Low-Med | 15-30 min | Direct execute |
| MODERATE | 3-5 | Feature-scoped | Medium | 30-60 min | Quick plan + execute |
| COMPLEX | 5-10 | Cross-cutting | High | 1-3 hours | Full pipeline |
| CRITICAL | 10+ / architectural | System-wide | Very High | 3+ hours | Full pipeline + enhanced |

## Behavioral Tiers

Five levels, three effective tiers:

- **Lightweight** (TRIVIAL, SIMPLE): Skip most optional steps. Direct execution.
- **Standard** (MODERATE): Standard workflow with optional research and review.
- **Thorough** (COMPLEX, CRITICAL): Full workflow with scaling. All agents, all verification.

## Gating Matrix

| Step | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|------|---------|--------|----------|---------|----------|
| Cognitive pre-flight | Lite | Lite | Full | Full | Full |
| Research | Skip | Skip | Optional | Required | Required |
| Discussion | Skip | Skip | Optional | Run | Required |
| Plan verification | 0 iter | 0 iter | 1 iter | 2 iter | 3 iter |
| Harness fix iterations | 1 | 2 | 3 | 3 | 5 |
| Verification mode | Quick | Quick | Standard | Full | Full+Human |
| dx-advocate | Skip | Skip | Run | Run | Run |
| code-simplifier | Skip | Skip | Run | Run | Run |
| code-architect | Skip | Skip | Skip | Run | Run |
| tailwind-auditor | Skip | Skip | If UI | If UI | Run |
| security-auditor | Skip | Skip | If auth | If auth | Always |
| UAT | Skip | Skip | Optional | Required | Required+Thorough |
| Learning capture | Skip | Brief | Standard | Full | Full+Debrief |

## Always-On Steps

These always run regardless of complexity:

1. Model profile resolution
2. Phase/environment validation
3. Plan discovery and wave grouping
4. Core execution (lu-executor)
5. Result aggregation
6. Verification harness (scope scales)
7. lu-verifier (mode scales)
8. State/roadmap/requirements updates
9. Commit

## Classification Signals

### TRIVIAL
- "fix", "update", "change" single item
- No external services, no type/schema changes
- Intuition flags: none or OPPORTUNITY only

### SIMPLE
- "add", "create" small utility or component
- Related files in same module
- Clear pattern to follow

### MODERATE
- "add", "create", "implement" feature
- Multiple related files
- Intuition flags: may have CAUTION

### COMPLEX
- "design", "refactor", "migrate"
- External service integration
- Database schema changes
- Intuition flags: RISK or UNKNOWN

### CRITICAL
- "architect", "overhaul", "redesign"
- System-wide impact
- Multiple RISK/UNKNOWN flags

## Edge Cases (Always Override Upward)

- Auth/security work: MODERATE minimum
- Database schema changes: MODERATE minimum
- External API integration: COMPLEX minimum
- "Refactor" in task: Usually COMPLEX
- "Architect" or "overhaul": Usually CRITICAL

## Override Mechanisms

- `--complexity=<level>`: Explicit override, skips router
- `--force-complex`: Alias for `--complexity=COMPLEX`
- Config booleans (`workflow.code_review`, `workflow.uat_required`): Take precedence
- Per-invocation flags (`--skip-review`, `--skip-uat`): Take precedence

## Configuration

The complexity matrix lives in `.planning/config.json` under the `complexity` key:

```json
{
  "complexity": {
    "defaultLevel": "auto",
    "matrix": { ... }
  }
}
```

When `defaultLevel` is `"auto"`, lu-router infers complexity from cognitive report signals. Set to a specific level (e.g., `"MODERATE"`) to always use that level as the default.
```

**Verification:**
- [ ] Reference document covers all 5 levels with criteria
- [ ] Gating matrix matches `DEFAULT_COMPLEXITY_MATRIX` from `src/complexity/defaults.ts`
- [ ] Always-on steps listed
- [ ] Override mechanisms documented
- [ ] Configuration section explains config.json structure
- [ ] File is clean markdown, no TypeScript

### Task 4: Write Integration Tests

**Goal:** Write tests that validate the full complexity system is properly integrated.
**Files:** `__tests__/src/complexity/integration.test.ts`
**Pattern:** Follow `__tests__/src/harness/integration.test.ts`

Create `__tests__/src/complexity/integration.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { ruleRegistry } from '../../../src/rules/index';
import {
  COMPLEXITY_LEVELS,
  DEFAULT_COMPLEXITY_CONFIG,
  DEFAULT_COMPLEXITY_MATRIX,
  COMPLEXITY_CLASSIFICATIONS,
  meetsThreshold,
} from '../../../src/complexity';

describe('complexity integration', () => {
  test('complexity-gating rule is registered', () => {
    expect(ruleRegistry).toHaveProperty('complexity-gating');
  });

  test('project config.json has complexity section', async () => {
    const file = Bun.file('.planning/config.json');
    const config = await file.json();
    expect(config).toHaveProperty('complexity');
    expect(config.complexity.defaultLevel).toBe('auto');
    expect(config.complexity.matrix).toBeDefined();
    for (const level of COMPLEXITY_LEVELS) {
      expect(config.complexity.matrix).toHaveProperty(level);
    }
  });

  test('template config.json has complexity section', async () => {
    const file = Bun.file('packages/luca-framework/templates/framework/templates/config.json');
    const config = await file.json();
    expect(config).toHaveProperty('complexity');
    expect(config.complexity.matrix).toBeDefined();
  });

  test('matrix entries have all required gate fields', () => {
    const requiredFields = [
      'cognitivePreflight',
      'research',
      'discussion',
      'planVerificationIterations',
      'harnessFixIterations',
      'verificationMode',
      'codeReviewAgents',
      'uat',
      'learningCapture',
    ];

    for (const level of COMPLEXITY_LEVELS) {
      const gate = DEFAULT_COMPLEXITY_MATRIX[level];
      for (const field of requiredFields) {
        expect(gate).toHaveProperty(field);
      }
    }
  });

  test('lightweight tier skips code review', () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.TRIVIAL.codeReviewAgents).toEqual([]);
    expect(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.codeReviewAgents).toEqual([]);
  });

  test('thorough tier enables all code review agents', () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.codeReviewAgents.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_COMPLEXITY_MATRIX.CRITICAL.codeReviewAgents).toContain('security-auditor');
  });

  test('classifications and matrix have same level keys', () => {
    const classificationKeys = Object.keys(COMPLEXITY_CLASSIFICATIONS).sort();
    const matrixKeys = Object.keys(DEFAULT_COMPLEXITY_MATRIX).sort();
    expect(classificationKeys).toEqual(matrixKeys);
  });

  test('verification modes scale with complexity', () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.TRIVIAL.verificationMode).toBe('quick');
    expect(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.verificationMode).toBe('quick');
    expect(DEFAULT_COMPLEXITY_MATRIX.MODERATE.verificationMode).toBe('standard');
    expect(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.verificationMode).toBe('full');
    expect(DEFAULT_COMPLEXITY_MATRIX.CRITICAL.verificationMode).toBe('full+human');
  });

  test('state template mentions 5 levels', async () => {
    const file = Bun.file('packages/luca-framework/templates/framework/templates/state.md');
    const content = await file.text();
    expect(content).toContain('TRIVIAL');
    expect(content).toContain('SIMPLE');
    expect(content).toContain('MODERATE');
    expect(content).toContain('COMPLEX');
    expect(content).toContain('CRITICAL');
  });

  test('complexity reference document exists', async () => {
    const file = Bun.file('packages/luca-framework/templates/framework/references/complexity-matrix.md');
    const exists = await file.exists();
    expect(exists).toBe(true);
  });
});
```

Run tests:

```bash
bun test __tests__/src/complexity/
```

**Verification:**
- [ ] All integration tests pass
- [ ] Tests validate rule registration, config presence, matrix structure
- [ ] Tests validate state template and reference document
- [ ] No regressions in existing tests

### Task 5: Build and Final Validation

**Goal:** Compile all updated entities and run full validation suite.
**Files:** No new files. Build and test.

```bash
bun run build:all
bun test
bunx --bun tsc --noEmit
```

Verify outputs:

```bash
# Rule output
ls .cursor/rules/complexity-gating.mdc
ls .claude/rules/complexity-gating.md

# Reference output
ls .cursor/luca/references/complexity-matrix.md 2>/dev/null || echo "Reference compiled elsewhere"

# Count registries
bun -e "
const { ruleRegistry } = await import('./src/rules/index');
const { agentRegistry } = await import('./src/agents/index');
const { skillRegistry } = await import('./src/skills/index');
console.log('Rules:', Object.keys(ruleRegistry).length);
console.log('Agents:', Object.keys(agentRegistry).length);
console.log('Skills:', Object.keys(skillRegistry).length);
"
```

Expected: Rules = 21, Agents = 25 (unchanged), Skills = 37 (unchanged).

**Verification:**
- [ ] `bun run build:all` completes without errors
- [ ] All complexity tests pass
- [ ] No new test failures beyond pre-existing 6
- [ ] TypeScript compilation clean
- [ ] Rule compiled to both output directories
- [ ] Reference document in templates directory
- [ ] Registry counts correct

### Task 6: Create Complexity Matrix Summary for WORKING.md

**Goal:** Log the complexity matrix summary as a verification artifact in WORKING.md.
**Files:** `.planning/WORKING.md` (update during execution)

After all implementation is complete, verify the entire complexity system works end-to-end by logging to WORKING.md:

```markdown
## Complexity System Verification

### Module Structure
- [x] src/complexity/types.ts — 5 levels, utility functions
- [x] src/complexity/defaults.ts — Default matrix, classifications
- [x] src/complexity/index.ts — Public API

### Config Integration
- [x] .planning/config.json — complexity section present
- [x] Template config.json — complexity section present
- [x] STATE.md template — 5 levels referenced

### Agent Updates
- [x] lu-router — 5-level classification, gated steps output
- [x] lu-verifier — 5-level verification mode mapping
- [x] lu-cognition — Lite vs full pre-flight

### Skill Updates
- [x] lu.skill.ts — --complexity flag, 5-level workflow diagram
- [x] lu-execute-phase — Harness iterations, code review, UAT, learning gated
- [x] lu-plan-phase — Research, plan verification, revision loop gated
- [x] lu-verify-work — Code review agents gated
- [x] lu-discuss-phase — Skip for lightweight, scale depth

### Rule
- [x] complexity-gating.rule.ts — Matrix documentation, enforcement

### Reference
- [x] complexity-matrix.md — Human-readable matrix
```

**Verification:**
- [ ] WORKING.md has complexity system verification checklist
- [ ] All items checked off

## Exit Criteria

- [ ] lu-verifier formalizes verification mode by 5 complexity levels
- [ ] lu-cognition supports lite mode for TRIVIAL/SIMPLE
- [ ] Complexity matrix reference document created in templates/references/
- [ ] Integration tests validate full system
- [ ] Build pipeline produces all updated output
- [ ] No regressions in existing tests
- [ ] All 7 CPLX requirements addressed across all 4 plans

## Dependencies

- **Plan 13-01** must be complete (src/complexity/ module)
- **Plan 13-02** must be complete (router outputs 5 levels)
- **Plan 13-03** should be complete (skills gated), though this plan can execute in parallel with Task ordering awareness
- Requires: `bun run build:all` (build pipeline from Phase 10)

## Requirements Traceability

| Requirement | Plan(s) | Status |
|-------------|---------|--------|
| CPLX-01: Complexity levels defined | 13-01 (types), 13-02 (router) | Covered |
| CPLX-02: Always-on steps identified | 13-01 (matrix), 13-03 (rule) | Covered |
| CPLX-03: Gated steps mapped | 13-01 (matrix), 13-03 (skills) | Covered |
| CPLX-04: Override mechanism | 13-02 (--complexity flag) | Covered |
| CPLX-05: Matrix documented | 13-01 (config), 13-04 (reference) | Covered |
| CPLX-06: Skill/rule enforcement | 13-03 (skills + rule) | Covered |
| CPLX-07: Agent scaling | 13-04 (verifier + cognition) | Covered |
