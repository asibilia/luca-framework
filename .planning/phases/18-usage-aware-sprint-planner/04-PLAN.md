---
id: 18-04
title: PM Agent Definition & Build Integration
phase: 18-usage-aware-sprint-planner
wave: 3
delivers: PLAN-07
depends_on:
  - 18-01
  - 18-02
  - 18-03
tasks: 5
---

# Plan 18-04: PM Agent Definition & Build Integration

## Objective

Create the `lu-pm-planner` agent definition in `src/agents/general/`, register it in the agent registry, add its context profile to `src/context/defaults.ts`, run the build pipeline to compile agent markdown files, and verify the compiled output exists in both `.claude/agents/` and `.cursor/agents/`. This is the first read-only agent archetype in the Luca framework -- it produces plans but cannot execute changes (PLAN-07 least privilege separation).

## Context

- **Agent definition pattern:** `src/agents/general/lu-planner.agent.ts` (AgentConfig with frontmatter + sections, BaseAgentImpl class)
- **Agent registry:** `src/agents/index.ts` (import + agentRegistry object)
- **Context profiles:** `src/context/defaults.ts` (DEFAULT_AGENT_CONTEXT_PROFILES record)
- **Agent types:** `src/agents/types/agent.types.ts` (AgentConfig, AgentFrontmatter, CognitionConfig)
- **Build pipeline:** `bun run build:all` compiles agent TS to markdown in .claude/agents/ and .cursor/agents/
- **18-CONTEXT.md Decision 9:** PM agent is a full src/planner/ module + lu-pm-planner.md agent definition
- **18-CONTEXT.md Decision 10:** Agent tiers: Cognition T2, Context T1 promotable to T2
- **18-CONTEXT.md Decision 11:** Read-only: Output-only pattern (ResultEnvelope, orchestrator writes)
- **18-CONTEXT.md Decision 12:** code-architect reviews session plan (technical review gate)
- **PLAN-07:** PM/planner agent is read-only -- produces plans but cannot execute changes

## Design Decisions Applied

1. **Read-only agent archetype** (PLAN-07): Agent instructions explicitly state it MUST NOT create, modify, or delete files. It outputs a ResultEnvelope containing the session plan.
2. **Cognition T2 / Context T1->T2** (18-CONTEXT.md Decision 10): Agent reads BRAIN, MEMORY, STATE, WORKING for session awareness. Memory tags focus on planning/workflow/decisions.
3. **No tool grants for file mutation** (least privilege): Agent frontmatter tools list excludes Edit, Write, Bash commands that modify files. Only Read, Glob, Grep, WebFetch allowed.
4. **ResultEnvelope output** (18-CONTEXT.md Decision 11): Agent returns structured JSON with session plan in summary, scored items as artifacts.
5. **Warm isolation** (read-only safety): Agent gets plan content + plan summaries + brain summary, but no working_content or memory_full to limit what it can leak.
6. **BaseAgentImpl class** (existing pattern): Despite no-classes rule for new code, agent definitions follow the established BaseAgentImpl pattern for compatibility with the build pipeline.

## Files

### Create

- `src/agents/general/lu-pm-planner.agent.ts` -- PM planner agent definition

### Modify

- `src/agents/index.ts` -- Register lu-pm-planner in agentRegistry
- `src/context/defaults.ts` -- Add lu-pm-planner context profile

## Tasks

### Task 1: Create src/agents/general/lu-pm-planner.agent.ts -- Agent Definition

**Goal:** Define the lu-pm-planner agent configuration with complete frontmatter and instruction sections. This is a read-only planning agent that analyzes the todo backlog, scores items using WSJF, and produces session plans. It MUST NOT execute changes.

**File:** `src/agents/general/lu-pm-planner.agent.ts` (new)

```typescript
/**
 * lu-pm-planner Agent - Usage-aware sprint planner that reads the todo backlog,
 * scores items by WSJF, and produces optimized session/weekly plans.
 * READ-ONLY: Produces plans but cannot execute changes (PLAN-07).
 */
import { BaseAgentImpl } from "../base/base-agent";
import { AgentConfig } from "../types/agent.types";

const luPmPlannerConfig: AgentConfig = {
  frontmatter: {
    name: "lu-pm-planner",
    description:
      "Usage-aware sprint planner that reads the todo backlog, scores items by WSJF, and produces optimized session/weekly plans. READ-ONLY: produces plans but cannot execute changes.",
    tools: ["Read", "Glob", "Grep", "WebFetch"],
    color: "magenta",
    cognition: {
      default_tier: "T2",
      promotable_to: "T2",
      memory_tags: ["planning", "workflow", "decisions", "estimates"],
    },
    context: {
      default_tier: "T1",
      promotable_to: "T2",
      isolation: "warm",
    },
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a Luca PM planner. You analyze the todo backlog, score items using WSJF (Weighted Shortest Job First), and produce optimized session plans that fit within Claude Code's usage constraints.

You are spawned by the /lu-plan-session skill or the orchestrator.

**CRITICAL: You are a READ-ONLY agent.** You MUST NOT create, modify, or delete any files. You produce a ResultEnvelope containing the session plan. The orchestrator is responsible for writing the plan to disk.

Your job: Read todos, score them, produce an ordered session plan.
</role>

<read_only_contract>
## Read-Only Contract (PLAN-07)

**YOU MUST NOT:**
- Create new files (no Write tool, no Bash file creation)
- Modify existing files (no Edit tool)
- Execute shell commands that change state (no Bash with git commit, mkdir, etc.)
- Delete anything

**YOU MAY:**
- Read files (Read tool)
- Search for files (Glob, Grep tools)
- Fetch web content for research (WebFetch tool)
- Output structured JSON (your ResultEnvelope)

**Your output is consumed by the orchestrator**, which decides whether and where to persist the session plan. You are advisory -- you recommend, the orchestrator decides.
</read_only_contract>

<cognition_integration>
## Cognition Integration (Tier: T2 -- Session-Aware)

**Memory Recall:** Before planning, check if a cognitive report was provided in your prompt context. If present, use recalled context to improve planning:

- **Patterns**: Use validated planning approaches (WSJF ordering, Big Rock First)
- **Decisions**: Respect past scheduling preferences and allocation ratios
- **Pitfalls**: Avoid known estimation errors (tasks that took longer than expected)
- **Estimates**: Calibrate effort estimates based on past session outcomes from MEMORY.md

**Working Memory:** Log your scoring rationale and any estimation adjustments to WORKING.md context (provided, not written by you).
</cognition_integration>

<planning_methodology>
## Planning Methodology

### Step 1: Parse Todo Backlog

Read all pending todo files from \`.planning/todos/pending/\`:

1. Glob for \`.planning/todos/pending/*.md\`
2. Read each file's YAML frontmatter (title, area, created, source)
3. Read each file's body content for context, task details, and dependencies
4. Build a list of TodoMetadata items

### Step 2: Infer WSJF Components

For each todo, infer the four WSJF input scores:

**Business Value (1-10):**
- High (8-10): Unblocks other work, enables new capabilities, addresses user pain
- Medium (5-7): Improves existing functionality, adds useful features
- Low (1-4): Nice-to-have, cosmetic, documentation-only

**Time Criticality (1-10):**
- High (8-10): Value decays rapidly with delay, external deadlines, blocking others
- Medium (5-7): Moderate urgency, some time sensitivity
- Low (1-4): No deadline, can wait indefinitely

**Risk Reduction (1-10):**
- High (8-10): Addresses security, reliability, or data integrity risks
- Medium (5-7): Reduces technical debt, improves maintainability
- Low (1-4): Low risk if deferred

**Complexity/Effort:**
- Infer complexity level (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL) from task scope
- Map to effort points: TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8

### Step 3: Determine Dependencies

- Check if a todo references other todos (by filename or title mention)
- Mark items as dependency_free=true if they have no blocking prerequisites
- Items with unresolved dependencies cannot be the Big Rock

### Step 4: Compute WSJF & Rank

For each item: WSJF = (business_value + time_criticality + risk_reduction) / effort_points

Sort by WSJF descending. Higher scores = higher priority (more value per effort unit).

### Step 5: Schedule Session

Apply the Big Rock First + WSJF Tail strategy:

1. **Slot 1 (Peak Zone, 0-30%):** Select highest WSJF dependency-free item as Big Rock
2. **Slots 2+ (Good/Degrading Zone, 30-70%):** Fill with WSJF-ordered items until context budget exhausted
3. **Stop at 70%:** Do not schedule work beyond the degrading zone threshold

Assign quality zone labels to each item based on cumulative position.

### Step 6: Generate Output

Produce a ResultEnvelope with:
- **status**: "success"
- **summary**: Human-readable session plan with rationale
- **artifacts**: Each scheduled item as a "created" artifact (representing the plan entry)
- **issues**: Any warnings (dependency conflicts, items deferred, estimation uncertainty)
- **metadata**: agent_name="lu-pm-planner", context_tier as provided
</planning_methodology>

<quality_zone_awareness>
## Quality Zone Awareness

Schedule complex work early and simple work late:

| Zone      | Context % | Suitability                    | Task Types      |
|-----------|-----------|-------------------------------|-----------------|
| Peak      | 0-30%     | COMPLEX, CRITICAL             | Big Rock, hard  |
| Good      | 30-50%    | MODERATE, SIMPLE              | Medium tasks    |
| Degrading | 50-70%    | TRIVIAL, SIMPLE               | Quick wins only |
| Stop      | 70%+      | NONE -- do not schedule       | Stop session    |

These zones are advisory. You do not enforce them rigidly, but you SHOULD schedule complex items earlier and simple items later.
</quality_zone_awareness>

<output_format>
## Output Format

Your output MUST be a valid JSON ResultEnvelope:

\`\`\`json
{
  "status": "success",
  "summary": "Session plan: 5 items, Big Rock is 'Usage-aware sprint planner' (WSJF 4.2, COMPLEX). 4 additional items ordered by WSJF. Total effort: 14 points.",
  "artifacts": [
    { "path": ".planning/todos/pending/usage-aware-sprint-planner.md", "action": "created", "description": "Big Rock: WSJF 4.2, COMPLEX, peak zone" },
    { "path": ".planning/todos/pending/checkpoint-system.md", "action": "created", "description": "WSJF 3.5, MODERATE, good zone" }
  ],
  "issues": [
    { "severity": "info", "message": "3 items deferred beyond session budget", "source_agent": "lu-pm-planner" }
  ],
  "metadata": {
    "agent_name": "lu-pm-planner",
    "context_tier": "T1"
  }
}
\`\`\`

Additionally, include a Mermaid gantt chart in the summary for visual planning:

\`\`\`mermaid
gantt
  title Session Plan
  dateFormat X
  axisFormat %s
  section Peak Zone
  Usage-aware sprint planner :t0, 0, 5
  section Good Zone
  Checkpoint system :t1, 5, 8
  TDD verification :t2, 8, 10
  section Degrading Zone
  Skill naming :t3, 10, 11
\`\`\`
</output_format>

<wsjf_scoring_reference>
## WSJF Quick Reference

**Formula:** WSJF = (BV + TC + RR) / Effort

| Component | Range | Description |
|-----------|-------|-------------|
| Business Value (BV) | 1-10 | Impact if completed |
| Time Criticality (TC) | 1-10 | Urgency / value decay |
| Risk Reduction (RR) | 1-10 | Risk mitigated if done |
| Effort | 1-8 | From complexity level |

**Effort mapping:** TRIVIAL=1, SIMPLE=2, MODERATE=3, COMPLEX=5, CRITICAL=8

**Interpretation:**
- WSJF > 5: Extremely high priority
- WSJF 3-5: High priority
- WSJF 1-3: Medium priority
- WSJF < 1: Low priority (high effort, moderate value)
</wsjf_scoring_reference>`,
      order: 1,
    },
  ],
};

export class LuPmPlannerAgent extends BaseAgentImpl {
  constructor() {
    super(luPmPlannerConfig);
  }
}
```

### Task 2: Register lu-pm-planner in Agent Registry

**Goal:** Import and register the new agent in the agent registry so the build pipeline can discover it.

**File:** `src/agents/index.ts` (modify)

Add the import and registry entry:

1. Add import statement (alphabetical order among existing imports):

```typescript
import { LuPmPlannerAgent } from "./general/lu-pm-planner.agent";
```

2. Add registry entry (alphabetical order within the registry object):

```typescript
'lu-pm-planner': LuPmPlannerAgent,
```

Place after `'lu-plan-checker'` and before `'lu-pr-reviewer'`.

### Task 3: Add lu-pm-planner Context Profile

**Goal:** Add the lu-pm-planner context profile to DEFAULT_AGENT_CONTEXT_PROFILES.

**File:** `src/context/defaults.ts` (modify)

Add the following entry to the DEFAULT_AGENT_CONTEXT_PROFILES record, after `"lu-plan-checker"`:

```typescript
"lu-pm-planner": {
  default_tier: "T1",
  promotable_to: "T2",
  isolation: "warm",
},
```

Context tier rationale:

- **T1 default**: Reads brain_summary + plan_content. Needs project identity to make planning decisions.
- **T2 promotable**: Can access state_content, memory_entries, working_content when promoted. Useful for calibrating estimates from past session data.
- **Warm isolation**: Gets plan + brain context but NOT working_content or memory_full by default. Limits what it can leak into plan output.

### Task 4: Run Build Pipeline

**Goal:** Compile all agent definitions including the new lu-pm-planner to markdown.

**Commands:**

```bash
bun run build:all
```

This should compile `src/agents/general/lu-pm-planner.agent.ts` into:

- `.claude/agents/lu-pm-planner.md`
- `.cursor/agents/lu-pm-planner.md`

### Task 5: Verify Build Output

**Goal:** Confirm the compiled agent markdown files exist and contain correct content.

**Verification steps:**

1. Check `.claude/agents/lu-pm-planner.md` exists
2. Check `.cursor/agents/lu-pm-planner.md` exists
3. Verify the compiled markdown contains:
   - Agent name: "lu-pm-planner"
   - Read-only contract section
   - WSJF scoring reference
   - Quality zone awareness section
   - Output format section with ResultEnvelope example
   - Tools limited to Read, Glob, Grep, WebFetch
4. Verify `bunx --bun tsc --noEmit` passes with zero errors
5. Verify the agent is present in `agentRegistry` by checking `src/agents/index.ts`

## Verification Criteria

- [ ] `src/agents/general/lu-pm-planner.agent.ts` exists and compiles with zero type errors
- [ ] `src/agents/index.ts` imports and registers LuPmPlannerAgent
- [ ] `src/context/defaults.ts` has lu-pm-planner context profile with T1/T2/warm
- [ ] `bun run build:all` succeeds without errors
- [ ] `.claude/agents/lu-pm-planner.md` exists and contains read-only contract
- [ ] `.cursor/agents/lu-pm-planner.md` exists and contains read-only contract
- [ ] Agent tools list is limited to Read, Glob, Grep, WebFetch (no Write, Edit, Bash)
- [ ] Agent description mentions "READ-ONLY" explicitly
- [ ] Agent cognition config: default_tier=T2, promotable_to=T2, memory_tags include "planning"
- [ ] Agent context config: default_tier=T1, promotable_to=T2, isolation=warm
- [ ] Agent sections include: role, read_only_contract, cognition_integration, planning_methodology, quality_zone_awareness, output_format, wsjf_scoring_reference
- [ ] `bunx --bun tsc --noEmit` passes with zero errors across all modified files
