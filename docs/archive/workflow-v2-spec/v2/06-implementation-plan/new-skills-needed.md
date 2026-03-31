# New Skills Needed

> Detailed specifications for new and enhanced skills required by the v2 pipeline.

---

## Overview

V2 requires 3 new skills and 1 significantly enhanced skill:

| Skill                   | Status   | Purpose                                             | Location                                                                    |
| ----------------------- | -------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `phase-research`        | ENHANCED | Multi-agent parallel research orchestration         | `src/skills/general/phase-research.skill.ts`                                |
| `phase-research-expand` | NEW      | Targeted deep expansion on specific research topics | `src/skills/general/phase-research-expand.skill.ts`                         |
| `phase-research-review` | NEW      | Research review loop orchestration                  | `src/skills/general/phase-research-review.skill.ts`                         |
| `phase-graduate`        | NEW      | MuninnDB graduation orchestration                   | `src/skills/general/phase-graduate.skill.ts`                                |
| `phase-plan-review`     | NEW/TBD  | Plan review loop orchestration                      | `src/skills/general/phase-plan-review.skill.ts` (or inline in `phase-plan`) |

---

## 1. `phase-research` (ENHANCED)

### Current State (v1)

The current skill is 24 lines of prompt text. It spawns a single `lu-phase-researcher` agent and produces a single `{phase}-RESEARCH.md` file.

**Current file:** `src/skills/general/phase-research.skill.ts`

**Current behavior:**

1. Load phase context (ROADMAP.md, PROJECT.md)
2. Spawn single `lu-phase-researcher`
3. Researcher writes `{phase}-RESEARCH.md`
4. Present findings summary

### v2 Changes

**New behavior:**

1. Load phase context (same as v1)
2. **Create research directory** at `.planning/phases/NN-name/research/` (v2 addition)
3. **Determine research facets** from phase description and complexity level
4. **Spawn 4 parallel researcher agents** (v2 addition):
   - `lu-architecture-researcher` (or `lu-researcher` with `focus: "architecture"`)
   - `lu-implementation-researcher` (or `lu-researcher` with `focus: "implementation"`)
   - `lu-ecosystem-researcher` (or `lu-researcher` with `focus: "ecosystem"`)
   - `lu-risk-researcher` (or `lu-researcher` with `focus: "risk"`)
5. **Collect results** from all researchers
6. **Aggregate findings** into research directory summary
7. Present findings summary with per-researcher confidence levels

### Key Implementation Details

**Research directory creation (Decision 7: phase-scoped, flat, numbered filenames):**

```typescript
// In the skill prompt, instruct the orchestrating agent to create the directory
// and assign each researcher a specific output file path:
//
// .planning/phases/NN-name/research/
// ├── 00-brief.md                       (research brief, created by skill)
// ├── 01-architecture-patterns.md       (lu-architecture-researcher output)
// ├── 02-implementation-approaches.md   (lu-implementation-researcher output)
// ├── 03-existing-solutions.md          (lu-ecosystem-researcher output)
// ├── 04-pitfalls-and-risks.md          (lu-risk-researcher output)
// ├── REVIEW-LOG.md                     (produced by phase-research-review)
// └── GRADUATION-REPORT.md              (produced by phase-graduate)
```

**Parallel spawning:**

The skill prompt instructs the executing agent to use `Task` calls for each researcher. Since researchers are cold-isolated from each other (Decision 11), all four can be spawned in parallel:

```
Task(agent: "lu-architecture-researcher", prompt: "Research architecture patterns for: {phase_description}. Output to: .planning/phases/NN-name/research/01-architecture-patterns.md")
Task(agent: "lu-implementation-researcher", prompt: "Research implementation approach for: {phase_description}. Output to: .planning/phases/NN-name/research/02-implementation-approaches.md")
Task(agent: "lu-ecosystem-researcher", prompt: "Research ecosystem/libraries for: {phase_description}. Output to: .planning/phases/NN-name/research/03-existing-solutions.md")
Task(agent: "lu-risk-researcher", prompt: "Research risks and pitfalls for: {phase_description}. Output to: .planning/phases/NN-name/research/04-pitfalls-and-risks.md")
```

**v1 fallback:**

When `workflow.version != "v2"` (or `research.parallelResearchers: false`), the skill falls back to v1 behavior: single `lu-phase-researcher`, single RESEARCH.md file.

```
# In skill prompt:
if v2 enabled AND parallelResearchers enabled:
    spawn 4 parallel researchers -> .planning/phases/NN-name/research/*.md
else:
    spawn single lu-phase-researcher -> {phase}-RESEARCH.md (v1 behavior)
```

**Complexity scaling (Decision 17: all 10 steps run at all levels):**

| Complexity | Researchers Spawned | Model Tier | Review Iterations |
| ---------- | ------------------- | ---------- | ----------------- |
| TRIVIAL    | 4                   | fast       | 1                 |
| SIMPLE     | 4                   | fast       | 2                 |
| MODERATE   | 4                   | balanced   | 2                 |
| COMPLEX    | 4                   | balanced   | 3                 |
| CRITICAL   | 4                   | balanced   | 3                 |

Researcher count is always 4 at all complexity levels (Decision 13). Complexity controls model tier and iteration budgets, not agent count. Researchers use the ROUTER preset (Decision 10).

### Skill Config Shape

```typescript
const phaseResearchConfig: SkillConfig = {
  frontmatter: {
    name: "phase-research",
    description:
      "Conduct comprehensive ecosystem research with parallel specialist agents (v2) or single researcher (v1).",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `...`, // Enhanced prompt with v1/v2 branching
      order: 1,
    },
  ],
};
```

---

## 2. `phase-research-expand` (NEW)

### Purpose

Deep expansion on specific topics identified during initial research or review. This skill is invoked when:

- The research review loop (Step 5) identifies gaps that need deeper investigation
- The user explicitly requests deeper research on a specific facet
- The initial research flagged LOW-confidence findings that need verification

### Input

- **Review feedback**: From `REVIEW-LOG.md` (produced by `phase-research-review`)
- **Specific topics**: User-specified or review-identified gaps
- **Existing research files**: The `.planning/phases/NN-name/research/` directory from initial research

### Output

- Additional numbered research files in `.planning/phases/NN-name/research/` directory (starting at 05+)
- Updated confidence levels on existing findings (if upgraded)

### Process

1. **Parse review feedback** or user-specified topics
2. **Identify expansion targets**: Which research facets need deepening?
3. **Spawn targeted researcher agents**: Only for gaps, not full re-research
4. **Write deep expansion files** as numbered files starting at `05-` in the same research directory (Decision 7: flat layout, no `deep/` subdir)
5. **Return structured result** with expansion summary

### Directory Structure (Decision 7: Phase-Scoped, Flat)

```
.planning/phases/NN-name/research/
├── 00-brief.md                        (research brief)
├── 01-architecture-patterns.md        (initial research)
├── 02-implementation-approaches.md    (initial research)
├── 03-existing-solutions.md           (initial research)
├── 04-pitfalls-and-risks.md           (initial research)
├── 05-architecture-deep-expansion.md  (deep expansion, if needed)
├── 06-ecosystem-deep-expansion.md     (deep expansion, if needed)
├── REVIEW-LOG.md
└── GRADUATION-REPORT.md
```

### Skill Config Shape

```typescript
const phaseResearchExpandConfig: SkillConfig = {
  frontmatter: {
    name: "phase-research-expand",
    description:
      "Deep expansion on specific research topics identified during review or by user request.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `# Research Deep Expansion

**Arguments:** \`<phase number> [--topics="topic1,topic2"] [--from-review]\`

## When to Use

Invoked by:
- \`phase-research-review\` when gaps are identified (automatic)
- User when deeper research is needed on a specific topic (manual)

## Process

1. **Load expansion context:**
   - Read existing research files from \`.planning/phases/NN-name/research/\`
   - If \`--from-review\`: Read REVIEW-LOG.md for gap identification
   - If \`--topics\`: Use specified topics as expansion targets

2. **Determine expansion scope:**
   - Parse review feedback for CRITICAL and IMPORTANT gaps (per Decision 3 severity model)
   - Map gaps to researcher specializations
   - Skip gaps that are MINOR or already addressed

3. **Spawn targeted researchers:**
   - Only spawn researchers for gaps that need expansion
   - Each researcher receives the original research file as context
   - Output as numbered files starting at 05+ in the same research directory (flat layout per Decision 7)

4. **Aggregate results:**
   - Update SYNTHESIS.md with new findings
   - Note which review gaps were addressed

5. **Return structured result:**
   \`\`\`
   ## EXPANSION COMPLETE
   **Phase:** {N}
   **Topics expanded:** {list}
   **Files created:** {list}
   **Remaining gaps:** {list or "none"}
   \`\`\`

## Success Criteria

- [ ] Expansion targets identified from review or user input
- [ ] Targeted researchers spawned (not full re-research)
- [ ] Deep expansion files created as numbered entries (05+) in the research directory
- [ ] Review gaps addressed or documented as unresolvable
`,
      order: 1,
    },
  ],
};
```

---

## 3. `phase-research-review` (NEW)

### Purpose

Orchestrates the convergence-based research review loop. This is the quality gate between research and graduation. Fresh reviewer agents (cold-isolated from researchers) evaluate the research corpus for completeness, accuracy, and actionability.

### Input

- All research files from `.planning/phases/NN-name/research/` (including deep expansion files at 05+)
- Phase description and intent from STATE.md
- Complexity level (determines iteration budget per Decision 14)

### Output

- `REVIEW-LOG.md` in `.planning/phases/NN-name/research/` directory
- Convergence decision: APPROVED, NEEDS_EXPANSION, or ESCALATE
- If NEEDS_EXPANSION: specific gap descriptions for `phase-research-expand`

### Process

1. **Load research corpus** from `.planning/phases/NN-name/research/`
2. **Spawn 3 reviewer agents in parallel** (cold isolation):
   - `lu-completeness-reviewer`: Are all necessary facets covered?
   - `lu-accuracy-reviewer`: Are findings grounded in real sources?
   - `lu-actionability-reviewer`: Can a planner create tasks from these findings?
3. **Collect reviews** from all three reviewers
4. **Aggregate findings** into structured review
5. **Check convergence**:
   - All reviewers score >= threshold (configurable, default 0.8)?
   - No CRITICAL gaps remaining?
   - If yes: APPROVED -- proceed to graduation
   - If no: NEEDS_EXPANSION -- loop back to `phase-research-expand`
6. **Check iteration budget**:
   - Current iteration < max? Continue loop.
   - At max iterations? ESCALATE to user.
7. **Write REVIEW-LOG.md** with all iterations

### REVIEW-LOG.md Format

```markdown
# Research Review Log

**Phase:** {N} - {name}
**Status:** APPROVED | NEEDS_EXPANSION | ESCALATED
**Iterations:** {current}/{max}

## Iteration 1

### Completeness Review

**Reviewer:** lu-completeness-reviewer
**Score:** 0.85/1.0
**Gaps:**

- [CRITICAL] Missing database migration rollback strategy
- [MINOR] No mention of connection pooling limits

### Accuracy Review

**Reviewer:** lu-accuracy-reviewer
**Score:** 0.90/1.0
**Issues:**

- [IMPORTANT] Bun.serve() WebSocket API version not verified against Context7

### Actionability Review

**Reviewer:** lu-actionability-reviewer
**Score:** 0.75/1.0
**Gaps:**

- [CRITICAL] No code examples for exponential backoff pattern
- [IMPORTANT] Architecture pattern described but not mapped to file structure

### Iteration Decision

**Status:** NEEDS_EXPANSION
**Expansion targets:** ["database migration rollback", "Bun WebSocket API verification", "backoff code examples"]

## Iteration 2

[... subsequent iteration ...]

## Final Decision

**Status:** APPROVED
**Confidence:** HIGH
**All reviewers:** >= 0.8 threshold
```

### Convergence Logic (Decision 3: Gap-Severity Model)

The canonical convergence specification is in `05-review-loops/convergence-criteria.md`. The summary:

```
# Findings classified as CRITICAL / IMPORTANT / MINOR
# Loop continues while any CRITICAL findings exist
# Loop MAY continue for IMPORTANT findings (configurable via research.reviewLoop.continueForImportant)

if no CRITICAL gaps AND no IMPORTANT gaps:
    return APPROVED
elif no CRITICAL gaps AND continueForImportant AND iteration < max_iterations:
    return NEEDS_EXPANSION with IMPORTANT gap list
elif CRITICAL gaps AND iteration < max_iterations:
    return NEEDS_EXPANSION with CRITICAL + IMPORTANT gap list
else:
    return ESCALATE (user must decide)
```

### Skill Config Shape

```typescript
const phaseResearchReviewConfig: SkillConfig = {
  frontmatter: {
    name: "phase-research-review",
    description:
      "Orchestrate convergence-based research review loop with cold-isolated reviewer agents.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `# Research Review Loop

**Arguments:** \`<phase number> [--max-iterations=N] [--threshold=0.8]\`

## Process

1. **Load research corpus:**
   - Read all numbered files from \`.planning/phases/NN-name/research/\`
   - This includes deep expansion files (05+) in the same directory
   - Read phase intent from STATE.md

2. **Read review config:**
   - Max iterations from config or \`--max-iterations\` flag (default: 3)
   - Convergence threshold from config or \`--threshold\` flag (default: 0.8)

3. **Spawn 3 reviewers in parallel (cold isolation):**
   - lu-completeness-reviewer: Coverage assessment
   - lu-accuracy-reviewer: Source verification
   - lu-actionability-reviewer: Planner usability

4. **Collect and aggregate reviews:**
   - Parse each reviewer's structured output
   - Classify gaps as CRITICAL, IMPORTANT, or MINOR

5. **Check convergence:**
   - No CRITICAL and no IMPORTANT gaps? --> APPROVED
   - CRITICAL or IMPORTANT gaps and under iteration budget? --> NEEDS_EXPANSION
   - At budget limit? --> ESCALATE to user

6. **If NEEDS_EXPANSION:**
   - Invoke: Skill(skill: "phase-research-expand", args: "{phase} --from-review")
   - Loop back to step 3

7. **Write REVIEW-LOG.md:**
   - Location: \`.planning/phases/NN-name/research/REVIEW-LOG.md\`
   - Contains all iterations, scores, gaps, decisions

8. **Return structured result:**
   \`\`\`
   ## REVIEW COMPLETE
   **Status:** APPROVED | ESCALATED
   **Iterations:** {N}
   **Final scores:** completeness={X}, accuracy={Y}, actionability={Z}
   \`\`\`

## Success Criteria

- [ ] All 3 reviewers spawned in cold isolation
- [ ] Reviews collected and aggregated
- [ ] Convergence evaluated against threshold
- [ ] REVIEW-LOG.md written with all iterations
- [ ] Loop terminated by approval, budget exhaustion, or escalation
`,
      order: 1,
    },
  ],
};
```

---

## 4. `phase-graduate` (NEW)

### Purpose

Orchestrates the graduation of verified research findings into MuninnDB engrams. This bridges the gap between ephemeral research files and persistent semantic memory that executors can recall per-task.

### Input

- Approved research corpus from `.planning/phases/NN-name/research/` (REVIEW-LOG.md status = APPROVED)
- Phase context (phase number, name, intent)

### Output

- MuninnDB engrams with `research:*` concept prefixes (written to repo vault, per Decision 4)
- `GRADUATION-REPORT.md` in `.planning/phases/NN-name/research/` directory

### Process

1. **Verify research is approved**: Check REVIEW-LOG.md status
2. **Spawn `lu-research-graduator` agent**
3. **Graduator processes each research file**:
   - Extracts key findings
   - Assigns `research:*` concept prefixes
   - Filters: only HIGH and MEDIUM confidence findings graduate
   - Deduplicates across research files
4. **Write engrams to MuninnDB** via `muninn_remember_batch`
5. **Write GRADUATION-REPORT.md** with mapping from research files to engrams
6. **Return structured result** with engram count and concept list

### GRADUATION-REPORT.md Format

```markdown
# Graduation Report

**Phase:** {N} - {name}
**Date:** {date}
**Engrams created:** {count}
**Vault:** {repo_vault}

## Graduated Findings

### From: architecture.md

| Concept                        | Content Summary                  | Confidence | Source                       |
| ------------------------------ | -------------------------------- | ---------- | ---------------------------- |
| research:approach-ws-reconnect | Exponential backoff with jitter  | HIGH       | Context7: Bun WebSocket docs |
| research:pattern-state-machine | Connection state machine pattern | MEDIUM     | Official Bun examples        |

### From: ecosystem.md

| Concept                    | Content Summary                     | Confidence | Source   |
| -------------------------- | ----------------------------------- | ---------- | -------- |
| research:api-bun-websocket | Bun.serve() WebSocket API reference | HIGH       | Context7 |

## Filtered Out (LOW confidence)

- "WebSocket library X has feature Y" -- single blog post, unverified

## Research Refs for Planner

The planner should reference these concepts in PLAN.md task frontmatter:

- `research:approach-ws-reconnect`
- `research:pattern-state-machine`
- `research:api-bun-websocket`
```

### Skill Config Shape

```typescript
const phaseGraduateConfig: SkillConfig = {
  frontmatter: {
    name: "phase-graduate",
    description:
      "Graduate verified research findings into MuninnDB engrams for per-task recall during execution.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `# Research Graduation

**Arguments:** \`<phase number>\`

## Prerequisites

- Research review status must be APPROVED (check REVIEW-LOG.md)
- If not approved, refuse to graduate and instruct user to run review first

## Process

1. **Verify review status:**
   - Read \`.planning/phases/NN-name/research/REVIEW-LOG.md\`
   - Check final status is APPROVED
   - If not: return error with instructions

2. **Spawn lu-research-graduator:**
   - Provide all research files as context
   - Provide phase intent for relevance filtering

3. **Graduator distills findings:**
   - Extract actionable findings from each research file
   - Assign \`research:{type}-{topic}\` concept prefixes
   - Filter: only HIGH and MEDIUM confidence graduate
   - Deduplicate across files

4. **Write to MuninnDB:**
   - Use muninn_remember_batch for efficiency
   - Vault: repo vault (research:* prefix routes to repo vault)
   - Each engram: 3-5 sentences, key detail + source URL

5. **Write GRADUATION-REPORT.md:**
   - Location: \`.planning/phases/NN-name/research/GRADUATION-REPORT.md\`
   - Maps research files to graduated engrams
   - Lists filtered-out findings with reasons

6. **Return structured result:**
   \`\`\`
   ## GRADUATION COMPLETE
   **Engrams created:** {N}
   **Concepts:** {list of research:* concepts}
   **Filtered out:** {N} LOW confidence findings
   \`\`\`

## Success Criteria

- [ ] Review status verified as APPROVED
- [ ] Graduator agent spawned with research corpus
- [ ] HIGH/MEDIUM findings graduated to MuninnDB
- [ ] LOW confidence findings filtered (not graduated)
- [ ] GRADUATION-REPORT.md written
- [ ] Research refs list generated for planner consumption
`,
      order: 1,
    },
  ],
};
```

---

## 5. `phase-plan-review` (NEW or Enhanced `phase-plan`)

### Design Decision: New Skill vs. Enhanced Existing

**Option A: New `phase-plan-review` skill**

- Pros: Clean separation of concerns, `phase-plan` stays simple
- Cons: Another skill to maintain, orchestrator must invoke two skills sequentially

**Option B: Enhanced `phase-plan` with review loop built in**

- Pros: Single invocation, natural flow (plan then review in one step)
- Cons: Larger skill, mixes planning and review concerns

**Recommendation: Option A (new skill)** -- consistent with the v2 pattern of dedicated skills for each pipeline step. The orchestrator (`lu.skill.ts`) already chains skill invocations, so adding one more is low cost.

### Purpose

Orchestrates the plan review loop. Spawns cold-isolated reviewer agents to evaluate PLAN.md files against the research corpus. If reviewers identify issues, the planner revises. Loop continues until convergence or budget exhaustion.

### Input

- PLAN.md files from `.planning/phases/{NN}-{name}/`
- Research corpus from `.planning/phases/NN-name/research/`
- Graduated research refs from GRADUATION-REPORT.md

### Output

- Revised PLAN.md files (if revision needed)
- Plan review log (appended to existing or new file)
- Convergence decision: APPROVED or ESCALATE

### Process

1. **Load plans and research context**
2. **Spawn reviewer agents in parallel** (reusing existing reviewer agents with cold isolation):
   - `code-architect`: Architecture alignment with research
   - `dx-advocate`: Developer experience and task clarity
   - `security-auditor`: Security considerations from research
3. **Collect reviews and check convergence**
4. **If not converged**: Send revision requests to planner, loop
5. **If converged or budget exhausted**: Return result

### Skill Config Shape

```typescript
const phasePlanReviewConfig: SkillConfig = {
  frontmatter: {
    name: "phase-plan-review",
    description:
      "Orchestrate plan review loop with cold-isolated reviewers checking research alignment.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `# Plan Review Loop

**Arguments:** \`<phase number> [--max-iterations=N]\`

## Process

1. **Load plan and research context:**
   - Read PLAN.md files from phase directory
   - Read research corpus from \`.planning/phases/NN-name/research/\`
   - Read GRADUATION-REPORT.md for research refs

2. **Read review config:**
   - Max iterations from complexity matrix (\`planReviewIterations\`)
   - Default: 2 for COMPLEX, 3 for CRITICAL

3. **Spawn reviewers in parallel (cold isolation):**
   - code-architect: Does the plan align with researched architecture?
   - dx-advocate: Are tasks clear, atomic, and well-scoped?
   - security-auditor: Are security findings from research reflected in tasks?

4. **Collect and aggregate reviews:**
   - Parse structured review output
   - Identify plan-level issues (missing tasks, wrong sequencing, ungrounded decisions)

5. **Check convergence:**
   - All reviewers approve? --> APPROVED
   - Under iteration budget? --> Revise plans, loop
   - At budget limit? --> ESCALATE

6. **If revision needed:**
   - Send specific revision requests to lu-planner
   - Planner updates PLAN.md files
   - Loop back to step 3

7. **Return structured result:**
   \`\`\`
   ## PLAN REVIEW COMPLETE
   **Status:** APPROVED | ESCALATED
   **Iterations:** {N}
   **Plans reviewed:** {list}
   \`\`\`

## Success Criteria

- [ ] Plans loaded with research context
- [ ] Reviewers spawned in cold isolation
- [ ] Reviews aggregated with specific issues
- [ ] Convergence evaluated
- [ ] Loop terminated by approval or budget
`,
      order: 1,
    },
  ],
};
```

---

## Skill Dependencies

```
phase-research (enhanced)
    |
    v
phase-research-expand (new) <--+
    |                          |
    v                          |
phase-research-review (new) ---+ (loops back on NEEDS_EXPANSION)
    |
    v
phase-graduate (new)
    |
    v
phase-plan (existing, unchanged)
    |
    v
phase-plan-review (new)
    |
    v
phase-execute (existing, enhanced with per-task recall in Phase 5)
```

---

## Related Documentation

- [new-agents-needed.md](new-agents-needed.md) -- Agents that these skills spawn
- [config-changes.md](config-changes.md) -- Config that controls skill behavior
- [phased-rollout.md](phased-rollout.md) -- When each skill is implemented
- [../02-research-system/](../02-research-system/) -- Research system architecture
- [../05-review-loops/](../05-review-loops/) -- Review loop patterns
