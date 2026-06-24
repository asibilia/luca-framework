---
id: 13-02
title: Router Expansion and Override Mechanism
phase: 13-complexity-gates
wave: 2
delivers: CPLX-01 (partial), CPLX-04
depends_on: 13-01
tasks: 5
---

# Plan 13-02: Router Expansion and Override Mechanism

## Objective

Expand the lu-router agent from 3 complexity levels to 5, update it to output gated steps based on the complexity matrix, and implement the `--complexity=<level>` manual override flag in the `/lu` entry point skill (replacing `--force-complex`). Ensure the override persists to STATE.md and that lu-router references the complexity matrix from config.

## Context

- **lu-router agent:** `src/agents/general/lu-router.agent.ts` (415 lines). Currently classifies into TRIVIAL, MODERATE, COMPLEX. Key sections:
  - Lines 18-34: Role section with 3-level classification
  - Lines 36-82: Philosophy with classification criteria for 3 levels
  - Lines 84-143: Complexity signals (YAML blocks per level)
  - Lines 194-213: Classification pseudocode (IF/ELSE for 3 levels)
  - Lines 216-276: Routing paths (3 paths)
  - Lines 280-353: Detailed routing paths
  - Lines 356-403: Structured returns and success criteria
- **lu.skill.ts (general):** `src/skills/general/lu.skill.ts` (144 lines). Line 22: `--force-complex` argument.
- **lu.skill.ts (luca):** `src/skills/luca/lu.skill.ts`. Line 22: Same `--force-complex` argument. Line 97-100: Workflow diagram with 3-level branching.
- **STATE.md template:** `packages/luca-framework/templates/framework/templates/state.md` (updated in Plan 13-01 to show 5 levels)
- **Complexity module:** `src/complexity/` (built by Plan 13-01: types, defaults, index)
- **Research:** `.planning/phases/13-complexity-gates/RESEARCH.md` (Section 7: routing, Section 8: CPLX-04 override mechanism)

## Tasks

### Task 1: Expand lu-router Agent to 5 Levels

**Goal:** Update the lu-router agent definition to classify tasks into 5 levels (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL) instead of 3, and output the corresponding gated steps from the complexity matrix.
**Files:** `src/agents/general/lu-router.agent.ts`

Replace the entire `sections` array content (the `content` string in the single section object, lines 17-404) with an updated version. The key structural changes are:

**1. Update the role section** (currently lines 18-34). Replace the line:
```
- Classify complexity: TRIVIAL, MODERATE, or COMPLEX
```
with:
```
- Classify complexity: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL
```

**2. Update the philosophy/classification criteria** (currently lines 36-82). Replace the three classification blocks (TRIVIAL, MODERATE, COMPLEX) with five. After the existing `## Complexity-Appropriate Effort` paragraph and before `## Always Verify`, replace the classification criteria with:

```markdown
## Classification Criteria

**TRIVIAL** (Direct execution):

- Single file modification
- Clear, unambiguous requirement
- No dependencies on other changes
- Low risk of side effects
- Examples: Fix typo, update config value, add simple field

**SIMPLE** (Quick plan + execute):

- 2-3 files modified
- Clear requirement, straightforward implementation
- Dependencies limited to related files
- Low-medium risk, easily reversible
- Examples: Add utility + test, update component + styles, add route handler

**MODERATE** (Standard workflow):

- 3-5 files modified
- Clear requirement with some implementation choices
- May have internal dependencies
- Medium risk, moderate reversibility
- Examples: Add new component with API, create schema + migration, implement feature

**COMPLEX** (Full pipeline):

- 5-10 files modified OR cross-cutting change
- Requirement needs some clarification or research
- External dependencies or integrations
- High risk or hard to reverse
- Examples: Auth system, multi-file refactor, new integration, database redesign

**CRITICAL** (Full pipeline + enhanced verification):

- 10+ files modified OR architectural change
- Requirement needs significant research
- System-wide impact, external dependencies
- Very high risk, difficult to reverse
- Examples: Major architecture change, payment integration, security overhaul, platform migration

## Always Verify

Regardless of complexity, all levels get verification:

- TRIVIAL/SIMPLE: Quick verification (existence + basic functionality)
- MODERATE: Standard verification (functionality + integration)
- COMPLEX/CRITICAL: Full verification (goal-backward + key links + comprehensive)

Verification is not optional. It catches issues early and enables learning.
```

**3. Update the complexity_signals section** (currently lines 84-143). Replace the three signal blocks with five:

```markdown
<complexity_signals>

## Trivial Signals

\`\`\`yaml
file_count: 1
requirement_clarity: high
dependencies: none
risk_level: low
reversibility: easy
estimated_time: < 15 minutes
\`\`\`

Indicators:
- "fix", "update", "change" single item
- No external services involved
- No type/schema changes
- No new dependencies
- Intuition flags: none or OPPORTUNITY only

## Simple Signals

\`\`\`yaml
file_count: 2-3
requirement_clarity: high
dependencies: related files only
risk_level: low-medium
reversibility: easy
estimated_time: 15-30 minutes
\`\`\`

Indicators:
- "add", "create" small utility or component
- Related files in same directory/module
- Clear pattern from codebase to follow
- Intuition flags: none or OPPORTUNITY only

## Moderate Signals

\`\`\`yaml
file_count: 3-5
requirement_clarity: medium-high
dependencies: internal only
risk_level: medium
reversibility: moderate
estimated_time: 30-60 minutes
\`\`\`

Indicators:
- "add", "create", "implement" feature
- May involve multiple related files
- Clear pattern to follow from memory
- Intuition flags: may have CAUTION

## Complex Signals

\`\`\`yaml
file_count: 5-10 OR cross-cutting
requirement_clarity: low-medium
dependencies: external or cross-cutting
risk_level: high
reversibility: difficult
estimated_time: 1-3 hours
\`\`\`

Indicators:
- "design", "refactor", "migrate"
- External service integration
- Database schema changes
- Intuition flags: RISK or UNKNOWN present
- Memory shows past complications in this area

## Critical Signals

\`\`\`yaml
file_count: 10+ OR architectural
requirement_clarity: low
dependencies: system-wide
risk_level: very high
reversibility: very difficult
estimated_time: 3+ hours
\`\`\`

Indicators:
- "architect", "overhaul", "redesign", "platform"
- System-wide impact
- Auth/security overhaul
- Multiple external service integrations
- Intuition flags: RISK and UNKNOWN both present
- Memory shows this area is high-risk

</complexity_signals>
```

**4. Update the classification pseudocode** (currently lines 194-213). Replace the IF/ELSE block with:

```markdown
<step name="classify">
Apply classification criteria:

\`\`\`
IF file_count == 1 AND clarity == high AND risk == low AND no RISK/UNKNOWN flags:
  complexity = TRIVIAL

ELSE IF file_count <= 3 AND clarity >= high AND risk <= low-medium AND no RISK flags:
  complexity = SIMPLE

ELSE IF file_count <= 5 AND clarity >= medium AND risk <= medium AND no RISK flags:
  complexity = MODERATE

ELSE IF file_count <= 10 AND (clarity >= low-medium OR has clear patterns):
  complexity = COMPLEX

ELSE:
  complexity = CRITICAL
\`\`\`

Edge cases (always override upward):

- Auth/security work: Always MODERATE minimum
- Database schema changes: Always MODERATE minimum
- External API integration: Always COMPLEX minimum
- "Refactor" in task: Usually COMPLEX
- "Architect" or "overhaul" in task: Usually CRITICAL
- Multiple RISK flags from memory: Bump up one level
</step>
```

**5. Update the routing paths** (currently lines 216-353). Expand to 5 paths. Replace the `determine_route` step and `routing_paths` section with:

```markdown
<step name="determine_route">
Based on complexity, determine execution route:

**TRIVIAL:**

\`\`\`
1. Direct to lu-executor
2. Execute task
3. Run lu-verifier (quick mode)
4. Skip learning capture
\`\`\`

**SIMPLE:**

\`\`\`
1. Direct to lu-executor
2. Execute task
3. Run lu-verifier (quick mode)
4. Brief learning capture (lu-learner)
\`\`\`

**MODERATE:**

\`\`\`
1. Quick plan generation (inline, not full PLAN.md)
2. Execute via lu-executor
3. Run lu-verifier (standard mode)
4. Code review: dx-advocate, code-simplifier
5. Standard learning capture (lu-learner)
\`\`\`

**COMPLEX:**

\`\`\`
1. Route to /lu-plan-phase (full planning)
2. Execute via /lu-execute-phase (full execution)
3. Run lu-verifier (full verification)
4. Full code review (all agents)
5. UAT required
6. Full learning capture (lu-learner)
\`\`\`

**CRITICAL:**

\`\`\`
1. Route to /lu-plan-phase (full planning with extended research)
2. Execute via /lu-execute-phase (full execution)
3. Run lu-verifier (full + human verification)
4. Full code review (all agents including security-auditor)
5. UAT required + thorough
6. Full learning capture with debrief (lu-learner)
\`\`\`

</step>
```

**6. Update the structured returns** (currently lines 356-403). Replace `{TRIVIAL|MODERATE|COMPLEX}` with `{TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL}` in the output template. Also add a `### Gated Steps` section to the routing decision output:

After the `### Classification` block in the output template, add:

```markdown
### Gated Steps (from complexity matrix)

| Step | Activation |
|------|-----------|
| Cognitive pre-flight | {lite|full} |
| Research | {skip|optional|required} |
| Discussion | {skip|optional|run|required} |
| Plan verification | {0|1|2|3} iterations |
| Harness fix iterations | {1|2|3|5} max |
| Verification mode | {quick|standard|full|full+human} |
| Code review agents | {list or "none"} |
| UAT | {skip|optional|required|required+thorough} |
| Learning capture | {skip|brief|standard|full|full+debrief} |
```

**Verification:**
- [ ] Router agent mentions all 5 levels: TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL
- [ ] Classification pseudocode has 5 branches
- [ ] 5 routing paths defined
- [ ] Structured output includes gated steps table
- [ ] Edge cases (auth, DB, external API) still bump appropriately
- [ ] File compiles without errors: `bunx --bun tsc --noEmit`

### Task 2: Update /lu Entry Point to Accept --complexity Flag

**Goal:** Replace `--force-complex` with `--complexity=<level>` in the `/lu` entry point skill definition. Backward-compatible: `--force-complex` still works as alias for `--complexity=COMPLEX`.
**Files:** `src/skills/general/lu.skill.ts`

**Change 1:** On line 22 (the Arguments line in the main section content), replace:
```
**Arguments:** \`<task-description | Jira-URL | [TICKET-ID]> [--force-complex] [--skip-memory] [--skip-branch]\`
```
with:
```
**Arguments:** \`<task-description | Jira-URL | [TICKET-ID]> [--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL] [--force-complex] [--skip-memory] [--skip-branch]\`
```

**Change 2:** In the workflow section (starting at line 74), update the workflow diagram to show 5 paths. Replace the branching section (lines 102-111):

```
    ┌──────┴──────┬──────────┐
    │             │          │
    ▼             ▼          ▼
┌────────┐  ┌────────┐  ┌────────────┐
│TRIVIAL │  │MODERATE│  │  COMPLEX   │
│Direct  │  │Quick   │  │Full        │
│Execute │  │Plan    │  │Pipeline    │
└───┬────┘  └───┬────┘  └─────┬──────┘
    │           │             │
    └─────┬─────┴─────────────┘
```

with:

```
    ┌──────┴──────┬──────────┬──────────┐
    │             │          │          │
    ▼             ▼          ▼          ▼
┌────────┐  ┌────────┐  ┌────────┐ ┌──────────┐
│TRIVIAL │  │SIMPLE  │  │MODERATE│ │COMPLEX/  │
│Direct  │  │Direct  │  │Quick   │ │CRITICAL  │
│Execute │  │Execute │  │Plan    │ │Full      │
└───┬────┘  └───┬────┘  └───┬────┘ │Pipeline  │
    │           │            │      └────┬─────┘
    └─────┬─────┴────────────┴───────────┘
```

**Change 3:** Add a section after the workflow diagram explaining the override mechanism. Insert before the closing `</workflow>` tag:

```markdown
### Complexity Override

If `--complexity=<level>` is passed:
1. Skip lu-router classification
2. Use the specified level directly
3. Look up gated steps from the complexity matrix in config.json
4. Persist to STATE.md `Task Complexity:` field

If `--force-complex` is passed (backward compatibility):
- Equivalent to `--complexity=COMPLEX`

If neither flag is passed:
- lu-router infers complexity from cognitive report (default behavior)
```

**Verification:**
- [ ] Arguments line shows `--complexity=TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL`
- [ ] `--force-complex` is still listed (backward compat)
- [ ] Workflow diagram shows 4 path groups (TRIVIAL, SIMPLE, MODERATE, COMPLEX/CRITICAL)
- [ ] Override mechanism documented
- [ ] File compiles without errors

### Task 3: Update Luca-Specific /lu Skill Entry Point

**Goal:** Mirror the same changes from Task 2 into the luca-specific lu.skill.ts variant.
**Files:** `src/skills/luca/lu.skill.ts`

Apply the same three changes as Task 2:

1. **Arguments line** (line 22 area): Add `--complexity=<level>` flag
2. **Workflow diagram** (lines 97-110 area): Update branching to show 5 levels / 4 path groups
3. **Override mechanism section**: Add the same override documentation

The luca skill variant is a more detailed version of the general skill. Ensure both files are consistent in their complexity level references.

**Verification:**
- [ ] Arguments line matches general lu.skill.ts
- [ ] Workflow diagram consistent with general lu.skill.ts
- [ ] Override mechanism section present
- [ ] File compiles without errors

### Task 4: Run Build Pipeline

**Goal:** Compile all updated entities to both `.cursor/` and `.claude/` output directories.
**Files:** No new files. Run build.

```bash
bun run build:all
```

This recompiles:
- `lu-router.agent.ts` to agent output in both directories
- `lu.skill.ts` (general) to skill output in both directories
- `lu.skill.ts` (luca) to skill output in both directories

**Verification:**
- [ ] `bun run build:all` completes without errors
- [ ] Updated lu-router agent compiled to `.cursor/agents/` and `.claude/agents/`
- [ ] Updated lu skill compiled to `.cursor/skills/` and `.claude/skills/`
- [ ] Output files mention 5 complexity levels

### Task 5: Run Tests and Validate

**Goal:** Confirm no regressions, TypeScript compiles clean, and build output is correct.
**Files:** No new files. Validation only.

```bash
bun test
bunx --bun tsc --noEmit
```

Also verify the complexity config is loadable:

```bash
# Verify config.json is valid with complexity section
bun -e "const c = await Bun.file('.planning/config.json').json(); console.log('Levels:', Object.keys(c.complexity.matrix)); console.log('Default:', c.complexity.defaultLevel);"
```

Expected output:
```
Levels: [ "TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL" ]
Default: auto
```

**Verification:**
- [ ] All complexity tests from Plan 13-01 still pass
- [ ] No new test failures beyond pre-existing 6
- [ ] TypeScript compilation clean
- [ ] Build output correct
- [ ] Config validation script produces expected output

## Exit Criteria

- [ ] lu-router classifies into 5 levels: TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL
- [ ] lu-router outputs gated steps table in routing decision
- [ ] `/lu` accepts `--complexity=<level>` flag
- [ ] `--force-complex` still works as backward-compatible alias
- [ ] Override mechanism documented in skill definition
- [ ] Both lu.skill.ts variants (general + luca) updated consistently
- [ ] Build pipeline produces updated output
- [ ] No regressions

## Dependencies

- **Plan 13-01** must be complete (src/complexity/ module with types, defaults, config sections)
- Requires: `bun run build:all` (build pipeline from Phase 10)
