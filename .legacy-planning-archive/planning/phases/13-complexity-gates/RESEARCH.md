# Phase 13: Complexity Gates — Research

**Phase Goal:** Design and implement a structured system where workflow complexity scales with task scope. Core steps always run; additional steps activate based on complexity level.

**Research completed:** 2026-02-10

---

## 1. What existing workflow steps and skills reference complexity?

### 1.1 Current Complexity Model (lu-router)

The primary complexity classification lives in `src/agents/general/lu-router.agent.ts` (lines 31, 48-70, 84-143, 194-213). The router currently defines **three levels**:

| Level | Criteria | File Count | Risk | Route |
|-------|----------|-----------|------|-------|
| TRIVIAL | Single file, clear requirement, no dependencies, low risk | 1 | Low | Direct execution |
| MODERATE | 2-5 files, some implementation choices, internal dependencies, medium risk | 2-5 | Medium | Quick plan + execute |
| COMPLEX | 5+ files OR architectural, needs research, external dependencies, high risk | 5+ | High | Full pipeline |

**Key finding:** The roadmap specifies **5 levels** (trivial, simple, moderate, complex, critical), but the codebase currently only has **3 levels** (trivial, moderate, complex). Phase 13 needs to expand from 3 to 5, or justify keeping 3 and mapping the 5 requirement levels to them.

### 1.2 Complexity Signals (lu-router)

The router defines YAML-structured signals per level (`src/agents/general/lu-router.agent.ts:84-143`):

```yaml
# TRIVIAL
file_count: 1
requirement_clarity: high
dependencies: none
risk_level: low
reversibility: easy
estimated_time: < 15 minutes

# MODERATE
file_count: 2-5
requirement_clarity: medium-high
dependencies: internal only
risk_level: medium
reversibility: moderate
estimated_time: 15-60 minutes

# COMPLEX
file_count: 5+ OR architectural
requirement_clarity: low-medium
dependencies: external or cross-cutting
risk_level: high
reversibility: difficult
estimated_time: 60+ minutes
```

Edge cases are also defined (line 210-213): auth/security work is always MODERATE minimum, database changes always MODERATE minimum, external API integration always COMPLEX, "refactor" in task usually COMPLEX.

### 1.3 Complexity in /lu Entry Point

`src/skills/general/lu.skill.ts` (line 20-22) and `src/skills/luca/lu.skill.ts` (line 97-100) show the workflow diagram where step 2 is "Complexity Classification" using lu-router, routing to TRIVIAL/MODERATE/COMPLEX paths.

The `/lu` skill accepts a `--force-complex` flag (line 22 of `src/skills/general/lu.skill.ts`) which serves as the current manual override for complexity. No `--force-trivial` or `--force-moderate` equivalent exists.

### 1.4 Complexity in STATE.md Template

`packages/luca-framework/templates/framework/templates/state.md` (lines 31, 175-181, 224-229) defines:
- A `Task Complexity: [TRIVIAL / MODERATE / COMPLEX]` field
- Persistence of complexity classification across sessions
- A "Quick Tasks Completed" table tracking TRIVIAL tasks

### 1.5 Complexity in lu-verifier

`src/agents/general/lu-verifier.agent.ts` (lines 30-36) defines verification modes by complexity:
- **TRIVIAL**: Quick verification (existence + basic functionality)
- **MODERATE**: Standard verification (functionality + integration)
- **COMPLEX**: Full verification (goal-backward + key links + comprehensive)

### 1.6 Complexity in lu-execute-phase

`src/skills/general/lu-execute-phase.skill.ts` (lines 61-67) scales verification mode based on plan count (not explicit complexity level):
- Simple (1-2 plans): Standard verification
- Complex (3+ plans): Full goal-backward verification

### 1.7 Complexity in Cognitive Pre-Flight

`src/agents/general/lu-cognition.agent.ts` (line 195) outputs complexity as "to be classified by router." The cognitive report flows into the router.

---

## 2. What are the current workflow steps in lu-execute-phase?

The `lu-execute-phase` skill (`src/skills/general/lu-execute-phase.skill.ts`) defines these steps:

| Step | Name | Currently Always Runs? | Gatable? |
|------|------|----------------------|----------|
| 0 | Resolve model profile | Yes | No (infrastructure) |
| 0.5 | Verify GitHub tracking | Yes | Could skip for TRIVIAL |
| 1 | Validate phase exists | Yes | No (infrastructure) |
| 2 | Discover plans | Yes | No (infrastructure) |
| 3 | Group by wave | Yes | No (infrastructure) |
| 4 | Execute waves | Yes | No (core) |
| 5 | Aggregate results | Yes | No (core) |
| 6 | Commit orchestrator corrections | Yes | No (infrastructure) |
| 6.5 | Run verification harness | Yes | Scale: full vs lightweight |
| 6.6 | Failure-to-fix loop | If harness fails | Scale: max iterations |
| 7 | Verify phase goal (lu-verifier) | Yes | Scale: quick/standard/full |
| 7.5 | Code quality review | Conditional (--skip-review) | Yes: gate by complexity |
| 7.6 | Handle code review results | If issues found | Follows 7.5 |
| 8 | Update roadmap and state | Yes | No (infrastructure) |
| 9 | Update requirements | Yes | No (infrastructure) |
| 10 | Commit phase completion | Yes | No (infrastructure) |
| 11 | User acceptance testing | Conditional (--skip-uat) | Yes: gate by complexity |
| 12 | Handle UAT results | If issues found | Follows 11 |

**Code review agents spawned in step 7.5:**
- `dx-advocate` -- Always spawned
- `code-simplifier` -- Always spawned
- `code-architect` -- Always spawned
- `tailwind-auditor` -- Always spawned
- `security-auditor` -- Conditional (auth/api files changed)

---

## 3. What other skills reference workflow behavior that could be gated?

### 3.1 lu-plan-phase (`src/skills/general/lu-plan-phase.skill.ts`)

Steps that could be complexity-gated:
- **Research** (step 5): Already conditionally skippable via `--skip-research`. Could auto-skip for lower complexity.
- **Plan verification** (step 10): lu-plan-checker loop. Could skip for trivial, reduce iterations for moderate.
- **Revision loop** (step 12): Max 3 iterations. Could scale: 1 for trivial/simple, 2 for moderate, 3 for complex/critical.

### 3.2 lu-discuss-phase (`src/skills/general/lu-discuss-phase.skill.ts`)

- Could be entirely skipped for TRIVIAL/SIMPLE levels
- Probing depth could scale: 2 questions for MODERATE, 4+ for COMPLEX/CRITICAL

### 3.3 lu-verify-work (`src/skills/general/lu-verify-work.skill.ts`)

Spawns review agents: dx-advocate, code-simplifier, code-architect, tailwind-auditor, security-auditor. These could be gated:
- **TRIVIAL**: Skip code review entirely
- **SIMPLE**: dx-advocate only
- **MODERATE**: dx-advocate + code-simplifier
- **COMPLEX**: All reviewers
- **CRITICAL**: All reviewers + mandatory security audit

### 3.4 lu-quick (`src/skills/general/lu-quick.skill.ts`)

Already implements a reduced workflow (skips research, plan-checker, verifier). This is effectively the TRIVIAL path. Could be formalized as the complexity-gated trivial path.

### 3.5 lu (unified entry point) (`src/skills/general/lu.skill.ts`)

Routes to TRIVIAL/MODERATE/COMPLEX paths via lu-router. The complexity gate system would formalize what happens on each path.

---

## 4. What agent configurations could scale with complexity?

### 4.1 Agent Spawn Matrix

Current agents and their potential complexity scaling:

| Agent | Current Usage | Scalable Dimension |
|-------|--------------|-------------------|
| lu-cognition | Always (in /lu) | Could simplify for TRIVIAL (skip MEMORY.md recall) |
| lu-router | Always (in /lu) | Core -- determines complexity level |
| lu-phase-researcher | Before planning | Skip for TRIVIAL/SIMPLE, optional for MODERATE |
| lu-planner | Before execution | Inline for TRIVIAL, quick for SIMPLE/MODERATE, full for COMPLEX+ |
| lu-plan-checker | After planning | Skip for TRIVIAL/SIMPLE, standard for MODERATE, strict for COMPLEX+ |
| lu-executor | During execution | Scale concurrent agents and iteration limits |
| lu-verifier | After execution | Quick/standard/full modes already exist |
| lu-learner | After verification | Could skip for TRIVIAL (nothing meaningful to learn) |
| dx-advocate | Code review | Skip for TRIVIAL/SIMPLE |
| code-simplifier | Code review | Skip for TRIVIAL/SIMPLE |
| code-architect | Code review | Only for COMPLEX+ |
| tailwind-auditor | Code review | Only if UI changes + MODERATE+ |
| security-auditor | Code review | Only if security-related + MODERATE+ |
| lu-debugger | UAT failures | Scale max debug iterations |
| lu-pr-reviewer | PR review | Scale reviewer count |

### 4.2 Model Profile Interaction

The model profile system (`config.json:model_profile`) already has quality/balanced/budget tiers. Complexity could interact:
- TRIVIAL/SIMPLE: Use budget models regardless of profile
- MODERATE: Use profile setting
- COMPLEX/CRITICAL: Use quality models regardless of profile

### 4.3 Parallelization Scaling

`config.json:parallelization.max_concurrent_agents` is currently fixed at 3. Could scale:
- TRIVIAL: 1 (sequential)
- SIMPLE: 2
- MODERATE: 3
- COMPLEX: 4-5
- CRITICAL: Max available

### 4.4 Iteration Limits

- Plan-checker revision loop: Currently max 3. Scale by complexity.
- Harness failure-to-fix loop: `config.json:harness.maxFixIterations` is 3. Scale by complexity.
- Future Ralph Wiggum loops: Iteration count tied to complexity.

---

## 5. How does .planning/config.json currently work?

### 5.1 Current Structure

File: `.planning/config.json`

```json
{
  "mode": "interactive",
  "depth": "comprehensive",
  "model_profile": "balanced",
  "cognitive": { "enabled", "memory_recall", "working_memory", "intuition_check", "routing" },
  "workflow": { "research", "plan_check", "verifier", "code_review", "uat_required", "always_verify", "capture_learnings" },
  "planning": { "commit_docs", "search_gitignored" },
  "parallelization": { "enabled", "plan_level", "task_level", "skip_checkpoints", "max_concurrent_agents", "min_plans_for_parallel" },
  "gates": { "confirm_project", "confirm_phases", "confirm_roadmap", "confirm_breakdown", "confirm_plan", "execute_next_plan", "issues_review", "confirm_transition" },
  "safety": { "always_confirm_destructive", "always_confirm_external_services" },
  "harness": { "enabled", "maxFixIterations", "failFast", "checks": [...] }
}
```

### 5.2 How Complexity Would Fit

There is no `complexity` section yet. A new top-level section would be the cleanest fit:

```json
{
  "complexity": {
    "default_level": "auto",
    "inference": "auto",
    "levels": { ... },
    "matrix": { ... },
    "overrides": { ... }
  }
}
```

This parallels how `harness` was added as a new top-level section in Phase 12.

### 5.3 Existing Workflow Booleans as Complexity Proxies

Several `workflow` booleans already serve as manual complexity gates:
- `workflow.research`: true/false (could become: only for COMPLEX+)
- `workflow.plan_check`: true/false (could become: only for MODERATE+)
- `workflow.code_review`: true/false (could become: only for MODERATE+)
- `workflow.uat_required`: true/false (could become: only for COMPLEX+)

These could remain as overrides or be subsumed by the complexity matrix.

---

## 6. What patterns exist in the codebase for registries?

### 6.1 Registry Pattern Summary

The codebase uses a consistent registry pattern across 5 domains:

| Registry | File | Type | Structure |
|----------|------|------|-----------|
| `agentRegistry` | `src/agents/index.ts` | `Record<string, AgentClass>` | name -> constructor |
| `skillRegistry` | `src/skills/index.ts` | `Record<string, SkillClass>` | name -> constructor |
| `ruleRegistry` | `src/rules/index.ts` | `Record<string, RuleClass>` | name -> constructor |
| `hookRegistry` | `src/hooks/index.ts` | `Record<string, HookDefinition>` | name -> metadata object |
| `parserRegistry` | `src/harness/parsers/index.ts` | `Record<string, OutputParser>` | name -> function |

### 6.2 Should Complexity Use a Registry?

**Recommendation: No registry needed.** Complexity levels are configuration, not compiled entities. The complexity matrix is better expressed as:

1. **A TypeScript type definition** in `src/complexity/types.ts` (for build-time validation)
2. **A config section** in `.planning/config.json` (for runtime configuration)
3. **A reference document** in the workflow templates (for human consumption)

This differs from agents/skills/rules because complexity levels don't compile to output files. They're consumed by existing skills/agents through config.json, similar to how `harness.checks` works.

### 6.3 Alternative: Complexity as a Workflow Module

Following the harness pattern (`src/harness/`), complexity could be a module:

```
src/complexity/
  types.ts           # ComplexityLevel, ComplexityMatrix, ComplexityConfig types
  index.ts           # Public API: inferComplexity(), getGatedSteps()
  defaults.ts        # DEFAULT_COMPLEXITY_CONFIG (like DEFAULT_HARNESS_CONFIG)
```

This module would be referenced by skills but not compiled into output files. The actual gating logic lives in the skill/agent prompt text.

---

## 7. How is the /lu entry point routing implemented?

### 7.1 Current Flow

The `/lu` unified entry point (`src/skills/general/lu.skill.ts`, `src/skills/luca/lu.skill.ts`) follows this flow:

1. **Git Context Setup** -- Jira URL/ticket -> GitHub issue -> branch
2. **Cognitive Pre-Flight** -- Spawn `lu-cognition` agent
3. **Complexity Classification** -- Spawn `lu-router` agent (receives cognitive report)
4. **Route by Complexity**:
   - TRIVIAL: Direct execution -> verify -> learn -> commit
   - MODERATE: Quick plan -> execute -> verify -> learn -> commit
   - COMPLEX: Full pipeline (research -> plan -> execute -> verify -> learn -> commit)
5. **Always Verify** -- lu-verifier (mode scales with complexity)
6. **Learning Capture** -- lu-learner
7. **Commit & PR** -- If on feature branch

### 7.2 Where Complexity Inference Plugs In

Complexity inference currently happens in the `lu-router` agent, which:
1. Receives the cognitive report from `lu-cognition`
2. Analyzes: file count, scope, risk, clarity
3. Factors in intuition flags (RISK, UNKNOWN, CAUTION, OPPORTUNITY)
4. Applies classification pseudocode (lines 197-206)
5. Returns routing decision

**Where Phase 13 plugs in:**
- The `lu-router` agent prompt needs to reference the complexity matrix from config
- The `--force-complex` flag on `/lu` needs expansion: `--complexity=<level>`
- The routing decision output needs to include gated steps (which agents to spawn, which steps to skip)
- Skills need to read the complexity classification and gate their sub-steps accordingly

### 7.3 Manual Override UX

Currently only `--force-complex` exists. The override mechanism needs:
- `--complexity=trivial|simple|moderate|complex|critical` (explicit level)
- Auto-inference remains the default
- Override persists to STATE.md for session continuity

---

## 8. Recommended Approach per Requirement

### CPLX-01: Complexity Level Definitions

**Recommendation:** Expand from 3 to 5 levels. The current 3 (TRIVIAL, MODERATE, COMPLEX) map to the 5 as follows:

| Level | Maps From | File Count | Scope | Risk | Time Est. |
|-------|-----------|-----------|-------|------|-----------|
| TRIVIAL | TRIVIAL (unchanged) | 1 | Single component | Low | < 15 min |
| SIMPLE | New (splits from TRIVIAL/MODERATE gap) | 2-3 | Related components | Low-Med | 15-30 min |
| MODERATE | MODERATE (narrowed) | 3-5 | Feature-scoped | Medium | 30-60 min |
| COMPLEX | COMPLEX (narrowed) | 5-10 | Cross-cutting | High | 1-3 hours |
| CRITICAL | New (splits from COMPLEX) | 10+ OR architectural | System-wide | Very High | 3+ hours |

**Implementation:**
- Define in `src/complexity/types.ts` as a TypeScript enum/const
- Add to `config.json` under `complexity.levels`
- Update `lu-router.agent.ts` classification logic
- Update `packages/luca-framework/templates/framework/templates/state.md` to use 5 levels

**Files to modify:**
- `src/agents/general/lu-router.agent.ts` -- Update classification criteria and routing paths
- `src/complexity/types.ts` -- New file with type definitions
- `.planning/config.json` -- Add complexity section
- `packages/luca-framework/templates/framework/templates/state.md` -- Expand level options

### CPLX-02: Always-On Workflow Steps

**Recommendation:** Based on analysis of lu-execute-phase, these steps must always run regardless of complexity:

**Always-on (cannot be gated):**
1. Model profile resolution
2. Phase/environment validation
3. Plan discovery and wave grouping
4. Core execution (lu-executor)
5. Result aggregation
6. Verification harness (may scale in scope, but always runs)
7. lu-verifier (mode scales, but always invoked)
8. State/roadmap/requirements updates
9. Commit

**Files to modify:**
- `src/skills/general/lu-execute-phase.skill.ts` -- Mark always-on steps explicitly
- `src/rules/general/harness-verification.rule.ts` -- Codify always-on principle

### CPLX-03: Complexity-Gated Steps

**Recommendation:** The complexity matrix maps levels to step activation:

| Step | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|------|---------|--------|----------|---------|----------|
| Cognitive pre-flight | Lite | Lite | Full | Full | Full |
| Research (lu-phase-researcher) | Skip | Skip | Optional | Required | Required |
| Discussion (lu-discuss-phase) | Skip | Skip | Optional | Recommended | Required |
| Plan verification (lu-plan-checker) | Skip | Skip | Standard (1 iter) | Strict (2 iter) | Strict (3 iter) |
| Harness checks | Test only | Test + typecheck | All enabled | All enabled | All enabled + strict |
| Harness fix iterations | 1 | 2 | 3 | 3 | 5 |
| Verification mode | Quick | Quick | Standard | Full | Full + human |
| Code review: dx-advocate | Skip | Skip | Run | Run | Run |
| Code review: code-simplifier | Skip | Skip | Run | Run | Run |
| Code review: code-architect | Skip | Skip | Skip | Run | Run |
| Code review: tailwind-auditor | Skip | Skip | If UI files | If UI files | Run |
| Code review: security-auditor | Skip | Skip | If auth files | If auth files | Always |
| UAT | Skip | Skip | Optional | Required | Required + thorough |
| Learning capture | Skip | Brief | Standard | Full | Full + debrief |

**Files to modify:**
- `src/skills/general/lu-execute-phase.skill.ts` -- Add gating conditionals
- `src/skills/general/lu-plan-phase.skill.ts` -- Gate research and plan-checker
- `src/skills/general/lu-verify-work.skill.ts` -- Gate reviewer spawning
- `src/skills/general/lu.skill.ts` -- Gate cognitive depth
- `src/complexity/types.ts` -- Define matrix type

### CPLX-04: Manual Override + Automatic Inference

**Recommendation:** Two mechanisms, both persisted to STATE.md.

**Automatic inference (default):**
- lu-router continues to classify based on signals
- New: router reads complexity matrix from config to calibrate thresholds
- New: router outputs the full gated-steps list, not just the level name

**Manual override:**
- Expand `--force-complex` to `--complexity=<level>`
- Add to lu-quick: implicit `--complexity=trivial`
- Override persists to STATE.md `Task Complexity:` field
- In lu-execute-phase: check STATE.md for override before auto-inferring
- Add `lu-set-complexity` as a lightweight skill or parameter to `/lu-settings`

**Files to modify:**
- `src/skills/general/lu.skill.ts` -- Expand `--force-complex` to `--complexity=<level>`
- `src/agents/general/lu-router.agent.ts` -- Reference matrix, handle override
- `packages/luca-framework/templates/framework/templates/state.md` -- Persist overrides

### CPLX-05: Complexity Matrix Documentation

**Recommendation:** The matrix should exist in three forms:

1. **TypeScript types** (`src/complexity/types.ts`) -- Build-time truth
2. **Config default** (`src/complexity/defaults.ts`) -- Runtime defaults
3. **Reference document** (workflow template or rule) -- Human-readable, loaded into agent context

The reference document is the most important. Agents need the matrix in their prompt context to make gating decisions. This should be a workflow reference file at `packages/luca-framework/templates/framework/references/complexity-matrix.md` that gets compiled to `.cursor/luca/references/complexity-matrix.md`.

**Files to create:**
- `src/complexity/types.ts` -- Type definitions
- `src/complexity/defaults.ts` -- Default matrix configuration
- `src/complexity/index.ts` -- Public API
- `packages/luca-framework/templates/framework/references/complexity-matrix.md` -- Human reference

### CPLX-06: Skill and Rule Enforcement

**Recommendation:** Two enforcement layers (mirrors hooks + harness pattern):

1. **Rules (always-loaded context):** Create a `complexity-gating.rule.ts` that defines the complexity matrix and instructs agents to check complexity before spawning optional sub-agents. This is the "soft" enforcement — agents see the rule and self-gate.

2. **Skill updates (procedural enforcement):** Update each skill's process section to include complexity-gated conditionals. For example, in lu-execute-phase:

```
### 7.5. Code Quality Review

**Complexity gate:** Runs at MODERATE and above. Skip for TRIVIAL/SIMPLE.

**If complexity < MODERATE:** Skip to step 8.
```

This is the "hard" enforcement — the orchestrator instructions explicitly skip steps.

**Files to create:**
- `src/rules/general/complexity-gating.rule.ts` -- New rule

**Files to modify:**
- `src/skills/general/lu-execute-phase.skill.ts` -- Add gating conditionals
- `src/skills/general/lu-plan-phase.skill.ts` -- Add gating conditionals
- `src/skills/general/lu-verify-work.skill.ts` -- Add gating conditionals
- `src/skills/general/lu.skill.ts` -- Add gating conditionals
- `src/skills/general/lu-discuss-phase.skill.ts` -- Add complexity awareness

### CPLX-07: Scaling Sub-Agent Behavior

**Recommendation:** Three dimensions of scaling:

1. **Agent count** (which agents are spawned):
   - Defined by the gated steps matrix (CPLX-03)
   - Example: TRIVIAL spawns 0 reviewers, COMPLEX spawns 4-5

2. **Iteration limits** (how many retry loops):
   - Plan-checker iterations: 0/0/1/2/3 by level
   - Harness fix iterations: 1/2/3/3/5 by level
   - Future: Ralph Wiggum loop count tied to level

3. **Review depth** (how thorough each agent is):
   - lu-verifier already has quick/standard/full modes
   - Reviewer agents could receive a `depth` parameter: "quick scan" vs "thorough review"
   - Could be implemented via prompt context: "This is a {LEVEL} task. Adjust review depth accordingly."

**Files to modify:**
- `src/agents/general/lu-verifier.agent.ts` -- Formalize mode selection by level
- `src/skills/general/lu-execute-phase.skill.ts` -- Pass complexity to sub-agents
- `src/skills/general/lu-plan-phase.skill.ts` -- Scale plan-checker iterations

---

## 9. Key Risks and Mitigations

### Risk 1: Over-Engineering the Matrix

**Risk:** Creating a 5x20 matrix with granular per-step gating creates more ceremony than it saves. Agents spend tokens reading and interpreting the matrix rather than doing work.

**Mitigation:**
- Keep the matrix to ~10 gatable dimensions, not every conceivable step
- Use simple rules: "MODERATE+ requires X" not "MODERATE gets X at 70% depth, COMPLEX at 90%"
- Start with 3 tiers of behavior (skip / standard / thorough) not 5
- The matrix reference doc should fit on one screen

### Risk 2: Automatic Inference Unreliability

**Risk:** lu-router misclassifies complexity, leading to either over-engineering simple tasks or under-verifying complex ones.

**Mitigation:**
- Make manual override prominent and easy (`--complexity=<level>`)
- Display inferred complexity prominently so users can override
- Log all classifications to WORKING.md for learning
- lu-learner can flag when classification seemed wrong (based on what actually happened)
- Add a "complexity reclassification" mid-workflow: if execution reveals more complexity than expected, bump up

### Risk 3: Gating Boundaries Are Subjective

**Risk:** "Is adding 3 API endpoints SIMPLE or MODERATE?" Different sessions may classify differently.

**Mitigation:**
- Use multiple signals, not just file count
- Weight memory (MEMORY.md patterns) heavily -- if this pattern was complex before, it's likely complex again
- Provide clear examples in the matrix reference doc
- Accept some subjectivity -- the system is advisory, not a compliance framework

### Risk 4: Config Complexity

**Risk:** Adding a `complexity` section to config.json makes the config increasingly complex for users to manage.

**Mitigation:**
- Provide sensible defaults (DEFAULT_COMPLEXITY_CONFIG)
- Users only need to override specific aspects
- The `lu-settings` skill could manage complexity configuration
- Consider a "strict" mode that always runs everything (for users who don't want gating)

### Risk 5: Breaking Existing Workflows

**Risk:** Introducing complexity gating changes the behavior of existing skills that users have workflows around.

**Mitigation:**
- Default to current behavior: inference = "auto" matches current lu-router behavior
- Existing `--skip-review`, `--skip-uat` flags continue to work as overrides
- Phase in gradually: start with the matrix as documentation, then add soft gating, then hard gating
- The `workflow` booleans in config.json serve as escape hatches

---

## 10. Files to Create or Modify

### New Files

| File | Purpose | Requirement |
|------|---------|-------------|
| `src/complexity/types.ts` | TypeScript type definitions for levels, matrix, config | CPLX-01, CPLX-05 |
| `src/complexity/defaults.ts` | Default complexity configuration | CPLX-01, CPLX-05 |
| `src/complexity/index.ts` | Public API exports | CPLX-05 |
| `src/rules/general/complexity-gating.rule.ts` | Rule enforcing complexity-aware agent behavior | CPLX-06 |
| `packages/luca-framework/templates/framework/references/complexity-matrix.md` | Human-readable matrix reference | CPLX-05 |

### Files to Modify

| File | Change | Requirement |
|------|--------|-------------|
| `src/agents/general/lu-router.agent.ts` | Expand to 5 levels, reference matrix, output gated steps | CPLX-01, CPLX-03, CPLX-04 |
| `src/skills/general/lu.skill.ts` | Expand `--force-complex` to `--complexity=<level>` | CPLX-04 |
| `src/skills/general/lu-execute-phase.skill.ts` | Add complexity gating conditionals to steps 6.5-12 | CPLX-03, CPLX-06, CPLX-07 |
| `src/skills/general/lu-plan-phase.skill.ts` | Gate research and plan-checker by complexity | CPLX-03, CPLX-06 |
| `src/skills/general/lu-verify-work.skill.ts` | Gate reviewer agent spawning by complexity | CPLX-03, CPLX-06 |
| `src/skills/general/lu-discuss-phase.skill.ts` | Add complexity awareness (skip for low levels) | CPLX-03, CPLX-06 |
| `src/agents/general/lu-verifier.agent.ts` | Formalize verification mode selection by level | CPLX-07 |
| `src/agents/general/lu-cognition.agent.ts` | Support lite vs full pre-flight by complexity | CPLX-07 |
| `.planning/config.json` | Add `complexity` section | CPLX-01, CPLX-04, CPLX-05 |
| `src/rules/index.ts` | Register new complexity-gating rule | CPLX-06 |
| `packages/luca-framework/templates/framework/templates/state.md` | Expand complexity options to 5 levels | CPLX-01 |
| `packages/luca-framework/templates/framework/templates/config.json` | Add complexity section to template | CPLX-05 |

### Test Files to Create

| File | Purpose |
|------|---------|
| `__tests__/src/complexity/types.test.ts` | Validate type definitions and defaults |
| `__tests__/src/complexity/defaults.test.ts` | Verify default config structure |

---

## 11. Recommended Implementation Order

### Plan 1: Types, Defaults, and Matrix Definition (CPLX-01, CPLX-02, CPLX-05)

1. Create `src/complexity/types.ts` with level enum, matrix types, config types
2. Create `src/complexity/defaults.ts` with DEFAULT_COMPLEXITY_CONFIG
3. Create `src/complexity/index.ts` public API
4. Create the complexity matrix reference document
5. Add `complexity` section to `.planning/config.json`
6. Update state template to use 5 levels
7. Tests for types and defaults

### Plan 2: Router and Override Mechanism (CPLX-01 partial, CPLX-04)

1. Update `lu-router.agent.ts` to classify into 5 levels
2. Update router to output gated steps based on matrix
3. Expand `--force-complex` to `--complexity=<level>` in lu.skill.ts
4. Persist override to STATE.md

### Plan 3: Gated Steps and Skill Updates (CPLX-03, CPLX-06)

1. Create `complexity-gating.rule.ts`
2. Update `lu-execute-phase.skill.ts` with gating conditionals
3. Update `lu-plan-phase.skill.ts` with gating conditionals
4. Update `lu-verify-work.skill.ts` with gating conditionals
5. Register new rule in `src/rules/index.ts`

### Plan 4: Agent Scaling (CPLX-07)

1. Update `lu-verifier.agent.ts` to formalize mode by complexity level
2. Update `lu-cognition.agent.ts` for lite vs full pre-flight
3. Scale iteration limits in execute-phase (harness fix iterations, plan-checker loops)
4. Scale reviewer agent spawning count

---

## 12. Design Decision: 3 Levels vs 5 Levels

The roadmap specifies 5 levels (trivial, simple, moderate, complex, critical). However, the existing codebase uses 3 (TRIVIAL, MODERATE, COMPLEX). There are arguments for both.

### Arguments for Keeping 3 Levels

- Simpler to implement and reason about
- Less subjective boundary decisions
- Current router already works well with 3
- 5 levels may not provide enough behavioral difference between adjacent levels

### Arguments for Expanding to 5 Levels

- Requirements explicitly specify 5
- SIMPLE fills a real gap (2-3 file changes that don't need full MODERATE treatment)
- CRITICAL fills a real gap (architectural changes that need more than standard COMPLEX)
- More granular gating reduces wasted effort on borderline tasks
- Aligns with the todo file specification

### Recommendation

**Implement 5 levels to match requirements, but design the matrix so SIMPLE and MODERATE share most behaviors, and COMPLEX and CRITICAL share most behaviors.** This gives the 3-level simplicity in practice while having 5-level granularity where it matters. The effective behavior groups are:

- **Group A (lightweight):** TRIVIAL, SIMPLE -- skip most optional steps
- **Group B (standard):** MODERATE -- standard workflow
- **Group C (thorough):** COMPLEX, CRITICAL -- full workflow with scaling

---

*Research completed: 2026-02-10*
*Researcher: Claude (lu-phase-researcher)*
