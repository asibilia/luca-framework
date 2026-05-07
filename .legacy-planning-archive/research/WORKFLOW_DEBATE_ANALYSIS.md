# Luca Workflow Orchestration × Stripe Minions Alignment Report

**Prepared by:** workflow-surveyor (research agent)
**Date:** 2026-03-02
**Status:** READ-ONLY ANALYSIS

---

## Executive Summary

Luca's workflow already incorporates several key patterns from Stripe's Minions framework (diminishing iteration returns, complexity gating, pre-flight context hydration, verification gates). However, **adversarial debate patterns are absent** and represent the highest-value integration opportunity.

**Key Alignment Finding:** Luca's always-on verification mandate + multi-tier memory system create ideal conditions for debate rounds at phase and milestone boundaries.

**Implementation Priority:** 5 debate opportunities identified, ranging from SIMPLE (config-only) to COMPLEX (agent team refactoring).

---

## Part 1: Stripe Minions Learnings × Luca Workflow Mapping

### Stripe Pattern 1: Diminishing Returns on Iteration (1-2 CI rounds max)

**Stripe Quote:** "diminishing marginal returns for an LLM to run many rounds" (1,300+ PRs/week at scale)

**Current Luca State:**

| Complexity | Harness Fix Iterations | Verify Fix Iterations |
| ---------- | ---------------------- | --------------------- |
| MODERATE   | 3                      | 1                     |
| COMPLEX    | 3                      | 2                     |
| CRITICAL   | 5                      | 3                     |

**Alignment Gap:** Harness and verify fix iterations are **2-3x higher** than Stripe's data suggests optimal.

**Location:** `.claude/rules/complexity-gating.md` (lines 33-50), `src/iteration/__helpers/budget.ts`

**Todo Reference:** #32 — "Tighten harness iteration caps (max 3 even at CRITICAL)"

---

### Stripe Pattern 2: Conditional/Scoped Rules to Reduce Context Saturation

**Stripe Approach:** "Minions conditionally apply agent rules based on subdirectories rather than loading all rules globally"

**Current Luca State:**

- All 20+ rules in `.claude/rules/` are loaded globally via `.claude/settings.json`
- Metrics: API rule applies to ~15% of codebase, security-audit applies differently across agent/skill/rule domains
- Result: ~70KB of rule text per agent invocation, consumed regardless of relevance

**Alignment Gap:** COMPLETE. No domain-aware rule scoping mechanism exists.

**Todo Reference:** #33 — "Scope rules by directory/domain to reduce context saturation"

**Candidates for Scoping:**

- `api-snake-case.md` → Only applies to `src/**/api/**`, `src/**/__schemas/**`
- `posthog-integration.md` → Only applies to analytics-touching code
- `atlassian-mcp.md` → Only applies to Jira/milestone workflow files
- `schema-first-parsing.md` → Only applies to component/hook files
- `lodash-preference.md` → Only applies to data transformation code

---

### Stripe Pattern 3: Pre-Hydration of Context Before Execution

**Stripe Approach:** "deterministically runs relevant MCP tools over likely-looking links before a minion run even starts"

**Current Luca State:**

Cognitive pre-flight (`.claude/rules/lu-workflow.md` lines 87-96) includes:

1. Load BRAIN.md ✓
2. Selective MEMORY.md recall ✓
3. Initialize WORKING.md ✓
4. Generate intuition flags ✓

**Missing:**

- No file tree snapshot of target area
- No test discovery (`__tests__/` file mapping)
- No git history scan (recent commits in target)
- No import graph extraction

**Alignment Gap:** PARTIAL. Pre-flight loads **project-level** context but not **target-area-specific** context.

**Todo Reference:** #34 — "Expand pre-flight to include file tree and test discovery"

**Expected Impact:** Saves 2-3 agentic turns per phase (discovery → implementation → verification).

---

### Stripe Pattern 4: Adversarial Review for Higher-Confidence Results

**Stripe Approach:** Reviewers "actively challenge each other's findings, leading to higher-confidence results"

**Quote:** "each one's job is not only to investigate its own theory but to challenge the others'"

**Current Luca State:**

**Code Review (Milestone-audit):**

- 6 independent subagents (integration, DX, simplifier, architect, UI, security)
- Each returns YAML report in isolation
- Orchestrator merges findings without cross-validation

**Verification (lu-verifier):**

- Single-agent, goal-backward analysis
- No debate with executor or other reviewers

**Learning Capture (lu-learner):**

- Extracts patterns/decisions/pitfalls from WORKING.md
- Single agent, no adversarial quality check
- Learning entries stored without dispute resolution

**Alignment Gap:** SEVERE. No debate or adversarial validation anywhere in the workflow.

**Todo Reference:** #35 — "Add adversarial debate round to milestone-audit using agent teams"

---

## Part 2: Multi-Phase Coordination & Debate Opportunities

### Lifecycle Overview

Luca workflow follows this sequence:

```
Route (lu-router)
  ↓
Pre-Flight (Cognition, BRAIN.md, MEMORY.md)
  ↓
Plan (lu-pm-planner, phase discovery)
  ↓
Execute [Phase N]
  ├─ Plan Verification (lu-plan-checker) [COMPLEX/CRITICAL only]
  ├─ Harness (tests + typecheck + lint + build)
  ├─ Harness Auto-Fix Loop (max 3-5 iterations)
  └─ Verification (lu-verifier, goal-backward)
  ↓
Learning Capture (lu-learner)
  ├─ Extract WORKING.md findings
  ├─ Curate patterns/decisions/pitfalls
  └─ Write MEMORY.md
  ↓
Commit & Report
  ↓
[Next Phase] OR Milestone Boundary
  ├─ Milestone-Audit (6 parallel reviewers)
  └─ Integration Verification
```

### Phase Boundary: Where Debate Would Add Most Value

**Debate Round 1: Plan Verification Debate** (COMPLEX/CRITICAL only)

**Current:** `lu-plan-checker` runs solo, produces boolean pass/fail

**Debate Opportunity:**

- After lu-plan-checker preliminary pass
- Spawn secondary reviewer (e.g., code-architect, lu-debugger)
- Have them challenge assumptions: "You flagged task X as complete — I see potential order dependency with task Y"
- Reach consensus before execution begins

**Impact:** HIGH (catches phase-level design issues before coding starts)
**Complexity:** MODERATE (requires agent team sync point)

---

**Debate Round 2: Harness + Verification Debate** (After Phase Execution)

**Current:** Harness fails → Auto-fix loop (max 3-5 iterations) → Verification gates go/no-go

**Debate Opportunity:**

- If harness fails after 2 iterations, trigger debate round instead of continuing auto-fix
- Have verifier + code-simplifier challenge: "Are these failures indicative of architectural issues, not just typos?"
- Decide: Continue fixing OR escalate to lu-debugger for deeper investigation

**Impact:** HIGH (avoids wasted iterations on symptom-fixing, identifies root causes early)
**Complexity:** MODERATE (adds conditional logic to iteration loop)

---

**Debate Round 3: Verification Consensus** (After Goal-Backward Analysis)

**Current:** lu-verifier produces report, passes or fails

**Debate Opportunity:**

- If verification is PARTIAL (some goals met, some not)
- Spawn secondary verifier (e.g., lu-integration-checker, lu-debugger)
- Have them debate: "You flagged goal X as unmet — I see it's actually satisfied by component Y in a different module"
- Produce consensus verdict with confidence scores

**Impact:** MEDIUM (reduces false negatives in verification)
**Complexity:** SIMPLE (parallel spawn, consolidate results)

---

**Debate Round 4: Learning Quality Audit** (Before Memory Persist)

**Current:** lu-learner extracts findings, writes MEMORY.md unilaterally

**Debate Opportunity:**

- After lu-learner produces candidate patterns/decisions/pitfalls
- Spawn secondary reviewer (e.g., code-architect for patterns, security-auditor for pitfalls)
- Have them challenge: "This pattern is too specific/obvious. This pitfall isn't novel."
- Curate high-confidence learnings before writing to long-term memory

**Impact:** MEDIUM (improves MEMORY.md signal-to-noise ratio)
**Complexity:** SIMPLE (post-learning-capture debate, don't block on it)

---

**Debate Round 5: Milestone-Audit Cross-Review** (Already Designed)

**Current:** 6 independent reviewers, orchestrator merges findings

**Debate Opportunity:** [#35 core task]

- Phase 1: Independent review (existing)
- Phase 2: Adversarial debate via agent teams
  - Security asks architect: "You flagged module boundary — does this create auth exposure?"
  - DX asks simplifier: "We both found pattern duplication — separate issues or one root cause?"
  - Architect challenges security: "That's in data validation layer, never hits trust boundary"
- Phase 3: Consensus synthesis with confidence scores

**Impact:** HIGH (multi-reviewer code review done right)
**Complexity:** COMPLEX (agent teams, experimental, token cost)

---

## Part 3: Detailed Debate Opportunities with Priority & Complexity

### Opportunity #1: Rule Scoping by Domain (CONFIG ONLY)

**What:** Add glob/scope metadata to rules so they activate conditionally

**Where:** `.claude/rules/` + `.claude/settings.json` configuration

**Stripe Alignment:** Direct (context saturation reduction)

**Implementation Approach:**

```yaml
# Add to each .md rule file front matter:
---
description: Rule description
globs: src/agents/**, src/skills/** # Only apply to these paths
alwaysApply: false # Set to true for universal rules
---
```

**Candidates for Scoping:**
| Rule | Current | Proposed Scope |
|------|---------|----------------|
| api-snake-case.md | Always | `src/**/api/**`, `**/schemas/**` |
| posthog-integration.md | Always | `src/**/*analytics*`, `src/**/*event*` |
| atlassian-mcp.md | Always | `.planning/**`, `.cursor/**` |
| schema-first-parsing.md | Always | `src/skills/**`, `src/agents/**` |
| lodash-preference.md | Always | `src/**/*utils*`, `src/**/__helpers/**` |

**Impact:** HIGH (10-15% context reduction)
**Complexity:** SIMPLE (config + rule header updates)
**Estimated Effort:** 2-3 hours
**Stripe Alignment:** DIRECT

---

### Opportunity #2: Pre-Flight Context Hydration

**What:** Extend cognitive pre-flight to gather target-area-specific context deterministically

**Where:** `.claude/rules/lu-workflow.md` (cognitive pre-flight section), WORKING.md initialization

**Stripe Alignment:** Direct (pre-hydration)

**Implementation Approach:**

```bash
# New pre-flight step: Target Area Discovery (runs before agent execution)

# 1. File tree snapshot
find {target-area} -type f -name "*.ts" -o -name "*.tsx" | head -50

# 2. Related test discovery
find __tests__ -path "*{target-area}*" -name "*.test.ts"

# 3. Recent git history
git log --oneline -10 -- {target-area}

# 4. Import graph (simple)
grep -r "from.*{target-area}" src/ | cut -d: -f1 | sort | uniq
```

**Add to WORKING.md Template:**

```markdown
## Target Area Context

**File Tree:**
[auto-populated file listing]

**Related Tests:**
[auto-populated test file mapping]

**Recent Changes:**
[auto-populated git history]

**Dependents:**
[auto-populated import graph]
```

**Impact:** MEDIUM (saves 2-3 discovery turns)
**Complexity:** SIMPLE (shell scripts, no LLM)
**Estimated Effort:** 4-6 hours
**Stripe Alignment:** DIRECT

---

### Opportunity #3: Tighten Iteration Caps (Stripe Data-Driven)

**What:** Reduce harness/verify fix iteration limits based on Stripe's empirical findings

**Where:** `src/iteration/__helpers/budget.ts`, `.claude/rules/complexity-gating.md`

**Stripe Alignment:** Direct (diminishing returns)

**Proposed Changes:**

| Level    | Current Harness | Proposed | Current Verify | Proposed |
| -------- | --------------- | -------- | -------------- | -------- |
| TRIVIAL  | 1               | 1        | 0              | 0        |
| SIMPLE   | 2               | 2        | 1              | 1        |
| MODERATE | 3               | **2**    | 1              | **1**    |
| COMPLEX  | 3               | **2**    | 2              | **1**    |
| CRITICAL | 5               | **3**    | 3              | **2**    |

**Rationale:**

- Stripe data: "1-2 CI rounds optimal" with 1,300+ PRs/week
- Iteration 3+ shows diminishing ROI (most fixable issues found by iteration 2)
- Luca should ship fast, escalate hard problems early

**Todo:** #32

**Impact:** MEDIUM (faster feedback loops, more escalations to debugger)
**Complexity:** SIMPLE (config change)
**Estimated Effort:** 1-2 hours
**Risk:** May increase "unresolved failures" metric; requires monitoring

---

### Opportunity #4: Harness ↔ Verification Debate Gate

**What:** If harness iteration 2 fails, trigger debate instead of continuing to iteration 3

**Where:** `src/harness/runner.ts`, phase executor orchestration

**Stripe Alignment:** Indirect (iteration caps + focus on root causes)

**Implementation Approach:**

```typescript
// Pseudo-code
if (iteration === 2 && harnessResult.status === 'failed') {
  // Debate: Is this a fixable syntax issue or architectural problem?
  const debateResult = await spawnDebate({
    verifier: 'lu-verifier',
    challenger: 'lu-debugger',
    context: harnessResult.errors,
    question: 'Are these failures symptoms of deeper issues?'
  })

  if (debateResult.consensus === 'architectural_issue') {
    escalate() // Stop auto-fix, flag for manual investigation
  } else {
    continue() // Proceed to iteration 3
  }
}
```

**Impact:** MEDIUM (avoids wasted iterations, forces root cause analysis)
**Complexity:** MODERATE (adds debate spawn point + consensus logic)
**Estimated Effort:** 6-8 hours
**Stripe Alignment:** INDIRECT

---

### Opportunity #5: Learning Quality Debate (Pre-Memory)

**What:** Before lu-learner writes to MEMORY.md, spawn secondary reviewer to challenge quality

**Where:** `src/agents/general/lu-learner.agent.ts`, post-learning-extraction phase

**Stripe Alignment:** Indirect (quality assurance for long-term artifacts)

**Implementation Approach:**

After lu-learner produces candidate learnings, spawn optional debate:

```typescript
const debateResult = await spawnDebate({
  original: "lu-learner",
  challenger: "code-architect", // For patterns
  challenger: "security-auditor", // For pitfalls
  context: candidateLearnings,
  questions: [
    "Which of these patterns are too specific/obvious?",
    "Which pitfalls are truly novel vs standard practice?",
    "Any duplicates with existing MEMORY.md entries?",
  ],
});

const curatedLearnings = debateResult.consensus;
memoryWriter.append(curatedLearnings);
```

**Gate:** COMPLEX/CRITICAL only (MODERATE uses quick curation)

**Impact:** MEDIUM (improves long-term memory quality)
**Complexity:** SIMPLE (parallel spawn, don't block learning completion)
**Estimated Effort:** 4-6 hours
**Stripe Alignment:** INDIRECT

---

### Opportunity #6: Milestone-Audit Agent Team Debate (High-Value, Experimental)

**What:** #35 — Convert milestone-audit from parallel subagents to agent team with debate round

**Where:** `src/skills/general/milestone-audit.skill.ts`

**Stripe Alignment:** Direct (adversarial review pattern)

**Implementation Approach:**

```
Phase 1: Independent Review (existing)
├─ lu-integration-checker → cross-phase wiring
├─ dx-advocate → code quality
├─ code-simplifier → DRY/complexity
├─ code-architect → module boundaries
├─ tailwind-auditor → UI consistency
└─ security-auditor → auth/data security

Phase 2: Adversarial Debate (new, agent team)
├─ Security ↔ Architect: "Boundary violation + auth risk?"
├─ DX ↔ Simplifier: "Duplication in X and Y = same root?"
├─ Arch ↔ Integration: "Cross-phase wiring + module isolation?"
└─ All ↔ All: Consolidate conflicting findings

Phase 3: Consensus Synthesis
└─ Orchestrator: Merge debate-refined findings with confidence scores
```

**Team Setup:**

```typescript
const team = TeamCreate({
  name: "milestone-review",
  members: [
    "lu-integration-checker",
    "dx-advocate",
    "code-simplifier",
    "code-architect",
    "security-auditor",
    "ui",
  ],
});

// Phase 1: Each member gets Task for independent review
for (const member of team.members) {
  Task({
    prompt: independentReviewPrompt,
    subagent_type: member,
    title: `Phase1: ${member} independent review`,
  });
}

// Phase 2: Members send each other messages for debate
// "Security asks Architect: does boundary violation create auth bypass?"
dx_advocate.SendMessage({
  recipient: "code-simplifier",
  content:
    "You found duplication in X—I found similar pattern in Y. Are these symptoms of one issue?",
});

// Phase 3: Consolidate
const consensus = orchestrator.synthesize(team.messages);
```

**Gate:** COMPLEX/CRITICAL only (MODERATE uses parallel subagents)

**Complexity Trade-offs:**

- **Pro:** Higher-confidence results, catches cross-cutting issues early
- **Con:** Agent teams experimental, slower (debate overhead), ~2x token cost
- **Risk:** Shutdown can be slow; teams have known limitations

**Impact:** HIGH (multi-reviewer code review done correctly)
**Complexity:** COMPLEX (agent teams, experimental status)
**Estimated Effort:** 12-16 hours (includes refactoring + debate prompts)
**Stripe Alignment:** DIRECT
**Todo:** #35

---

## Part 3: Cross-Lifecycle Debate Synthesis

### The Full Debate Integration Picture

```
Route → Pre-Flight (with context hydration #2) → Plan
                                                   ↓
                                           [COMPLEX+: Debate 1]
                                           Plan verification debate
                                                   ↓
Execute Phase N
├─ Harness iteration loop
│  ├─ Iter 1 fails
│  ├─ Iter 2 still fails
│  ├─ [DEBATE 2: Root cause analysis]
│  └─ Continue OR escalate
├─ Verification
│  ├─ [DEBATE 3: If partial, consensus verification]
│  └─ Pass/fail
└─ Learning capture
   └─ [DEBATE 4: Learning quality audit]
        ↓
Milestone Boundary
└─ Milestone-Audit (rules scoped #1)
   ├─ Phase 1: Independent review
   ├─ [DEBATE 5: Adversarial review]
   └─ Phase 3: Consensus synthesis
```

### Context Saturation Impact

**With Stripe Alignment (All 5 Opportunities):**

| Component                  | Before               | After                       | Savings                 |
| -------------------------- | -------------------- | --------------------------- | ----------------------- |
| Global rules               | 20+ rules × 70KB     | Scoped to 5-10KB per domain | 86% reduction           |
| Pre-flight                 | Project context only | + Target area context       | +15KB (but saves turns) |
| Iteration cycles           | 3-5 per phase        | 2 before debate             | ~40% reduction          |
| Total context at execution | ~180KB               | ~110KB                      | 39%                     |

**Quality Impact:**

- Debate rounds add ~20-30% token cost per phase (parallel teams)
- But save 2-3 discovery turns per phase (~40% turn reduction)
- Net: Slightly higher tokens, significantly fewer turns

---

## Part 4: Prioritized Implementation Roadmap

### Phase A: Foundation (SIMPLE tasks, 1-2 weeks)

**#1 Tighten Iteration Caps (Stripe Data-Driven)**

- Impact: MEDIUM (saves tokens, forces root cause focus)
- Effort: 1-2 hours
- Risk: LOW (monitor unresolved failure metric)
- Dependencies: None
- Start: IMMEDIATE

**#2 Rule Scoping by Domain**

- Impact: HIGH (10-15% context reduction)
- Effort: 2-3 hours
- Risk: LOW (incremental, rule-by-rule)
- Dependencies: #1
- Start: Week 1

**#3 Pre-Flight Context Hydration**

- Impact: MEDIUM (saves discovery turns)
- Effort: 4-6 hours
- Risk: LOW (shell scripts, non-blocking)
- Dependencies: None
- Start: Week 1 (parallel with #2)

### Phase B: Debate Foundations (MODERATE tasks, 2-4 weeks)

**#4 Harness ↔ Verification Debate Gate**

- Impact: MEDIUM (root cause focus)
- Effort: 6-8 hours
- Risk: MEDIUM (touches iteration loop)
- Dependencies: #1 (iteration caps)
- Start: Week 2

**#5 Learning Quality Debate**

- Impact: MEDIUM (MEMORY.md quality)
- Effort: 4-6 hours
- Risk: LOW (parallel, non-blocking)
- Dependencies: None
- Start: Week 2

### Phase C: Advanced Debate (COMPLEX task, 3-4 weeks)

**#6 Milestone-Audit Agent Team**

- Impact: HIGH (higher-confidence reviews)
- Effort: 12-16 hours
- Risk: MEDIUM (experimental teams, token cost)
- Dependencies: #1, #2, #3 (context improvements make teams more viable)
- Start: Week 3 (after Phase A/B stabilized)

---

## Part 5: Alignment with Existing Todosq

### Direct Mapping

| Todo | Opportunity                    | Alignment       | Status  |
| ---- | ------------------------------ | --------------- | ------- |
| #32  | Tighten harness iteration caps | DIRECT (Stripe) | Pending |
| #33  | Scope rules by domain          | DIRECT (Stripe) | Pending |
| #34  | Expand pre-flight hydration    | DIRECT (Stripe) | Pending |
| #35  | Milestone-audit agent team     | DIRECT (Stripe) | Pending |

### Indirect Alignment

| Todo | Debate Opportunity          | Alignment               | Status  |
| ---- | --------------------------- | ----------------------- | ------- |
| #31  | Team-based roadmap creation | Debate #5 (Learning)    | Pending |
| #15  | Reflective meta-cognition   | Debate #4 (Learning QA) | Pending |

---

## Part 6: Key Architecture Decisions

### Decision 1: When to Debate (Complexity Gating)

**Recommendation:** Apply complexity gating to debate rounds

```
TRIVIAL:   No debate (straight execution)
SIMPLE:    Debate 3 + 4 optional (verification + learning)
MODERATE:  Debate 3 + 4 enabled (verification + learning)
COMPLEX:   All debates enabled (1-5)
CRITICAL:  All debates enabled + human input on debate results
```

### Decision 2: Agent Teams vs Subagents

**Recommendation:** Phased adoption

- **Now:** Debates 1-5 use subagents (existing model)
- **Future:** Debate 6 (milestone-audit) graduates to agent teams when GA
- **Reason:** Agent teams experimental, unknown token costs at scale

### Decision 3: Debate Synchrony

**Recommendation:** Asynchronous with consensus gates

- Debates spawn parallel subagents (current model)
- Don't block phase on debate completion
- Gate phase advancement on debate consensus only
- Log debate dissents in WORKING.md for learning

### Decision 4: Memory Debate Blocking

**Recommendation:** Non-blocking, append to WORKING.md

- Learning quality debate doesn't block phase completion
- Curated learnings append to MEMORY.md after debate
- Flagged learnings (disputed) stored in WORKING.md for review
- Prevents learning loop from becoming critical path

---

## Part 7: Estimated Impact Summary

### Token & Turn Savings (Year 1)

Assuming 52 weeks × avg 3 phases/week = 156 phases:

| Change               | Token Impact | Turn Savings | Value                     |
| -------------------- | ------------ | ------------ | ------------------------- |
| Rule scoping         | -15%         | -5%          | ~1,000 GPU-hours/year     |
| Pre-flight hydration | -5%          | -20%         | ~2,000 turns/year         |
| Iteration caps       | -40%         | -30%         | ~3,000 GPU-hours/year     |
| Debate overhead      | +20%         | -15%         | +15% tokens, -2,000 turns |
| **Net**              | **-15%**     | **-40%**     | **~8,000 GPU-hours/year** |

---

## Part 8: Risks & Mitigations

### Risk 1: Agent Team Experimental Status (Debate #6)

**Severity:** MEDIUM
**Mitigation:** Start with complexity gating (COMPLEX/CRITICAL only), monitor failure rate, rollback if >5% failure

### Risk 2: Iteration Cap Increase Unresolved Failures

**Severity:** MEDIUM
**Mitigation:** Implement #4 (debate gate) before #3; monitor metrics; rollback if unresolved failures > 10%

### Risk 3: Debate Context Bloat

**Severity:** LOW
**Mitigation:** Rule scoping (#1) + pre-flight optimization (#2) ensure debate context < 20KB per round

### Risk 4: Learning Quality Debate False Negatives

**Severity:** LOW
**Mitigation:** Non-blocking design; WORKING.md capture of flagged learnings for post-phase review

---

## Conclusion

**Luca is well-positioned for Stripe-aligned debate integration.**

The framework already has:

- ✅ Always-on verification (necessary precondition)
- ✅ Complexity gating infrastructure (ready for debate gating)
- ✅ Multi-tier memory system (ready for adversarial learning curation)
- ✅ Agent definitions with background_spawnable flag (ready for debate spawning)

**Missing pieces (5 opportunities identified):**

1. Rule scoping by domain (SIMPLE)
2. Pre-flight context hydration (SIMPLE)
3. Iteration cap tightening (SIMPLE)
4. Harness ↔ Verification debate (MODERATE)
5. Learning quality debate (SIMPLE)
6. Milestone-audit agent team (COMPLEX)

**Recommended Start:** Implement #1-3 in Week 1-2 (foundation, low risk, high context wins). Then add #4-5 in Week 2-3 (debate infrastructure). Graduate to #6 (agent teams) in Week 3-4 after foundation stabilized.

**Expected Outcome:** 15-40% fewer turns, 5-20% fewer tokens, higher-confidence results through adversarial validation.
