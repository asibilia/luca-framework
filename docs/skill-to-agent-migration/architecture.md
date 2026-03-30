# Skill-to-Agent Orchestration Migration

## Documents in This Directory

| Document                                                         | Purpose                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| [architecture.md](./architecture.md) (this file)                 | Full migration architecture, options evaluated, end-to-end pipeline   |
| [muninndb-context-pattern.md](./muninndb-context-pattern.md)     | MuninnDB-mediated context passing between orchestrator and sub-agents |
| [integration-assessment.md](./integration-assessment.md)         | Subsystem integration analysis, dependency ordering, risk levels      |
| [risk-register.md](./risk-register.md)                           | 16 risks across 5 groups with detection and mitigation strategies     |
| [orchestration-completeness.md](./orchestration-completeness.md) | End-to-end pipeline coverage audit, gap analysis, robustness          |
| [context-management.md](./context-management.md)                 | MuninnDB operation budget, recall quality, session isolation strategy |
| [grounding-report.md](./grounding-report.md)                     | Factual verification of all claims (78% verified, 3 critical issues)  |
| [phase-0-validation.md](./phase-0-validation.md)                 | Phase 0 empirical validation test prompts and pass/fail criteria      |

## Migration Status: COMPLETE

**Completed:** Phase 232 — Skill-to-Agent Orchestration Migration

| Metric                        | Value                                                                |
| ----------------------------- | -------------------------------------------------------------------- |
| Sub-skills deleted            | 22                                                                   |
| Orchestrators rewritten       | 5 (lu, phase-execute, pr-address, verify, milestone-complete)        |
| Infrastructure files modified | 12                                                                   |
| New files created             | 3 (agent-prompts.ts, agent-output.schemas.ts, phase-0-validation.md) |
| Compiled lu SKILL.md          | 228 lines (~912 tokens, well under 8K target)                        |
| Build file count              | 341 (down from 362 pre-migration)                                    |

---

## Problem

Claude Code has a confirmed bug ([#17351](https://github.com/anthropics/claude-code/issues/17351), [#29191](https://github.com/anthropics/claude-code/issues/29191)) where **nested `Skill()` calls do not return control to the parent skill**. After a sub-skill completes, the LLM's turn ends and the orchestrator's remaining steps are silently dropped. The user must manually prod the conversation to continue.

This affects all 5 Luca orchestrators that use `Skill()` to delegate to sub-skills:

| Orchestrator       | Sub-Skills Called via Skill()                                                                  | Max Nesting Depth |
| ------------------ | ---------------------------------------------------------------------------------------------- | ----------------- |
| lu                 | lu-route, lu-configure, lu-backlog, lu-phase-loop                                              | 4 levels          |
| phase-execute      | phase-execute-waves, phase-execute-verify, phase-execute-review                                | 3 levels          |
| pr-address         | pr-fetch, pr-validate, pr-debate, pr-fix, pr-learn, pr-respond                                 | 3 levels          |
| milestone-complete | milestone-learn, milestone-prune, milestone-shadow-gate, milestone-archive, milestone-finalize | 3 levels          |
| verify             | verify-extract, verify-test, verify-diagnose, verify-review                                    | 3 levels          |

The deepest nesting path is `lu -> lu-phase-loop -> phase-execute -> phase-execute-waves` (4 levels). Every `Skill()` boundary is a potential stuck point.

---

## Root Cause

The Skill tool is a **prompt injection mechanism**, not a sub-process spawner:

1. `Skill(skill: "lu-route")` injects the lu-route SKILL.md content as a new user message
2. The LLM follows the injected instructions within the same conversation
3. When the sub-skill says "return to parent," the LLM's turn-completion heuristic fires
4. The parent orchestrator's remaining steps never execute

The Agent tool (formerly Task tool) works differently: it **spawns a separate Claude instance** with its own context window. When the sub-agent completes, its result is returned to the parent conversation, and the parent continues. This is the key difference that makes Agent() suitable for orchestration.

---

## Hard Constraints

### 1. Sub-Agents Cannot Spawn Sub-Agents

This is a documented Claude Code limitation. A sub-agent spawned via `Agent()` cannot call `Agent()`, `Task()`, or `Skill()`. It can only use standard tools (Read, Write, Edit, Bash, Grep, Glob, MCP tools).

**Agent and Task are the same tool** (Task was renamed to Agent in Claude Code v2.1.63). This means the "monolith Agent that spawns Task() internally" approach **does not work**. All sub-agent spawning must happen at the orchestrator level.

### 2. Skills Run in the Main Conversation

Skills invoked by the user (e.g., `/lu`, `/phase-execute`) run in the main conversation context -- they are NOT sub-agents. This means a user-invoked skill CAN call `Agent()`. The nesting constraint only applies to agents spawned BY Agent().

### 3. Dual-Mode Orchestrators

Some orchestrators are both user-invocable AND called from another orchestrator:

| Orchestrator       | User-Invocable              | Called From            |
| ------------------ | --------------------------- | ---------------------- |
| lu                 | Yes (`/lu`)                 | Never                  |
| phase-execute      | Yes (`/phase-execute`)      | lu (via lu-phase-loop) |
| pr-address         | Yes (`/pr-address`)         | lu (via routing)       |
| verify             | Yes (`/verify`)             | phase-execute          |
| milestone-complete | Yes (`/milestone-complete`) | lu-phase-loop          |

When invoked by the user, they run as skills and CAN call Agent(). When called from lu, they must be called via Agent() and CANNOT spawn further agents.

This means: **lu must inline the orchestration logic for all downstream orchestrators when running the full pipeline.** Standalone orchestrators keep their own Agent() calls for direct user invocation.

---

## Architecture

### The Flat Orchestrator Pattern

```
User invokes /lu (runs as skill in main conversation)
  |
  |-- Agent(name: "cognition")               leaf agent (cognitive pre-flight)
  |-- Agent(name: "classify")                leaf agent (complexity + routing)
  |-- [orchestrator writes state: "routed"]
  |
  |-- Agent(name: "configure")               leaf agent (session config)
  |-- [orchestrator writes state: "configured"]
  |
  |-- Agent(name: "backlog")                 leaf agent (conditional)
  |-- [orchestrator writes state: "scanned"]
  |
  |-- FOR each phase:                        loop logic is INLINE in lu
  |   |
  |   |-- Agent(name: "classify-{NN}")       leaf agent (per-phase re-classify)
  |   |-- Agent(name: "discuss-{NN}")        leaf agent
  |   |-- Agent(name: "plan-{NN}")           leaf agent
  |   |-- Agent(name: "execute-{NN}")        leaf agent (all wave execution)
  |   |-- Agent(name: "harness-{NN}")        leaf agent (run checks)
  |   |-- Agent(name: "fix-{NN}")            leaf agent (fix failures, conditional)
  |   |-- Agent(name: "verify-{NN}")         leaf agent (goal-backward verification)
  |   |-- Agent(name: "review-*-{NN}")       parallel leaf agents (code review)
  |   |-- Agent(name: "learn-{NN}")          leaf agent (learning capture)
  |   |-- [orchestrator commits via Bash]
  |
  |-- Agent(name: "milestone-*")             leaf agents (5 steps, conditional)
  |-- [orchestrator writes state: "complete"]
```

> **Note:** Agent names use a consistent convention: non-suffixed for singleton steps (`cognition`, `classify`, `configure`, `backlog`), phase-suffixed for per-phase steps (`execute-{NN}`, `verify-{NN}`), and domain-prefixed for parallel reviewers (`review-arch-{NN}`, `review-dx-{NN}`).

**Key principles:**

1. **ALL Agent() calls are made by the orchestrator (lu)**, never by sub-agents
2. **Sub-agents are leaf workers** -- they read files, do work, write files, return results
3. **The orchestrator manages ALL state** -- context file writes, bridge transitions, loop control
4. **Sub-agents have full filesystem and MCP access** -- they can read/write project files, use MuninnDB, run bash commands
5. **Sub-agents CANNOT spawn other agents** -- no Agent(), Task(), or Skill() calls

### What Changes vs. What Stays

| Component                                     | Current                                     | After Migration                                 |
| --------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Orchestrator skills (lu, phase-execute, etc.) | Call Skill() for sub-skills                 | Call Agent() for leaf work                      |
| Sub-skills (lu-route, lu-configure, etc.)     | Separate SKILL.md files                     | **Deleted** -- logic becomes Agent() prompts    |
| Named agents (lu-planner, lu-executor, etc.)  | Spawned via Task() from sub-skills          | Spawned via Agent() from orchestrator (hoisted) |
| Context files (/tmp/\*.json)                  | Written by both orchestrator and sub-skills | Written by orchestrator only                    |
| State machines (XState definitions)           | Validate Skill() ordering                   | Validate Agent() ordering                       |
| Pre-step hooks                                | Match on `tool_name === "Skill"`            | Match on `tool_name === "Skill" OR "Agent"`     |
| Context CLI (context-cli.ts)                  | Used by orchestrator and sub-skills         | Used by orchestrator only                       |
| Bridge CLI (luca-bridge)                      | Used by orchestrator and sub-skills         | Used by orchestrator only                       |

### Agent() Call Template

Every Agent() call from the orchestrator follows this pattern:

````
# Step N: {Step Name}

Read context and prepare inputs:
```bash
CTX=$(bun src/skills/__schemas/context-cli.ts read lu 2>/dev/null || echo '{}')
ROADMAP=$(cat .planning/ROADMAP.md 2>/dev/null)
````

Spawn sub-agent:

```
Agent(
  prompt: "
<role>
You are {agent-role}. {Brief description of responsibilities}.
You have access to Read, Write, Edit, Bash, Grep, Glob, and MCP tools.
You CANNOT call Agent(), Task(), or Skill().
</role>

<context>
Project: luca-framework
MuninnDB vault: luca-framework
Complexity: {complexity_level}
Phase: {phase_number}
Current state: {current_state_from_context}
</context>

<instructions>
1. {Step 1}
2. {Step 2}
3. {Step 3}
</instructions>

<output_contract>
When done, output exactly:
STATUS: success OR failure
RESULT: {structured result description}
</output_contract>
",
  name: "{step-name}",
  description: "{3-5 word description}"
)
```

Parse the Agent's response. Write state:

```bash
bun src/skills/__schemas/context-cli.ts write lu '{"current_state":"{next_state}"}'
```

```

### Context Passing Strategy: MuninnDB-Mediated

Sub-agents don't inherit conversation history. Instead of embedding large context in prompts, **MuninnDB serves as the shared memory layer** between orchestrator and sub-agents.

Each sub-agent follows a 3-phase memory protocol:

1. **Recall** -- Load project identity, session context, and relevant patterns from MuninnDB at startup
2. **Observe** -- Store findings, candidate patterns, and pitfalls during execution
3. **Handoff** -- Return structured result; observations persist in MuninnDB for the next agent

The orchestrator seeds session context before spawning agents and updates it between steps. Isolation modes (none/warm/cold) control how much each agent recalls.

See **[muninndb-context-pattern.md](./muninndb-context-pattern.md)** for the full protocol, prompt templates, lifecycle diagram, and edge cases.

```

Agent(
prompt: "
Phase: 230
Complexity: COMPLEX
Vault: luca-framework
Config: { oversight: 'full-auto', skip_uat: true }

Read these files for full context:

- .planning/ROADMAP.md (roadmap)
- .planning/phases/230-v2-enhanced-existing-agents/01-PLAN.md (plan)
- .planning/STATE.md (current state)

Execute the plan...
",
name: "execute-230"
)

```

---

## Standalone vs. Inline Invocation

### Standalone Mode (user invokes directly)

When a user invokes `/phase-execute 230`, it runs as a skill in the main conversation and CAN call Agent():

```

/phase-execute (skill in main conversation)
|-- Agent(name: "execute-waves") works (parent is main conversation)
|-- Agent(name: "verify") works
|-- Agent(name: "review") works

```

### Inline Mode (called from /lu)

When `/lu` runs phase execution, it CANNOT call `/phase-execute` via Skill() (bug) or Agent() (would create nesting). Instead, lu inlines the logic:

```

/lu (skill in main conversation)
|-- FOR each phase:
| |-- Agent(name: "execute-{NN}") works (parent is main conversation)
| |-- Agent(name: "verify-{NN}") works
| |-- Agent(name: "review-{NN}") works

````

**The orchestration logic is duplicated** between standalone phase-execute and inline lu. This is acceptable because:
- The Agent() prompts are the same (shared prompt templates)
- The state machine validation is the same
- Only the loop control differs (standalone has no loop, lu has the phase loop)

### Deduplication via Prompt Templates

To avoid maintaining identical Agent() prompts in two places, extract shared prompt templates:

```typescript
// src/skills/__helpers/agent-prompts.ts
export const EXECUTE_WAVES_PROMPT = (phase: string, complexity: string) => `
<role>You are lu-executor. Execute the plan for phase ${phase}...</role>
...
`

// Used in both lu.skill.ts and phase-execute.skill.ts
Agent(prompt: EXECUTE_WAVES_PROMPT("{phase_number}", "{complexity}"), name: "execute-{NN}")
````

---

## Anti-Skip Enforcement

### Enforcement Stack (Updated)

| Layer                 | Current                                                   | After Migration                                                                     |
| --------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| L0: State Machine     | XState v5 definitions per orchestrator                    | Same (unchanged)                                                                    |
| L1: Fail-Closed Flags | `--run-<gate>` / `--skip-<gate>`                          | Same (unchanged)                                                                    |
| L2: Pre-Step Hooks    | Match `tool_name === "Skill"`, extract `tool_input.skill` | Match `"Skill" OR "Agent"`, extract `tool_input.subagent_type` or `tool_input.name` |
| L3: Context Files     | Track `current_state` per orchestrator                    | Same, but ONLY orchestrator writes (not sub-agents)                                 |
| L4: Gap Detection     | Post-execution audit of context sections                  | Same (unchanged)                                                                    |

### Hook Migration

The enforcement hook factory (`src/hooks/__helpers/enforcement-hook-factory.ts`) needs:

```typescript
// Current (line 173)
if (toolName !== "Skill") {
  return exitSuccess();
}

// After migration
if (toolName !== "Skill" && toolName !== "Agent") {
  return exitSuccess();
}

// Skill name extraction (current)
const skillName = toolInput.skill;

// After migration: extract from either Skill or Agent tool input
const skillName =
  toolName === "Skill"
    ? toolInput.skill
    : toolInput.name || toolInput.subagent_type || "unknown";
```

The settings.json matcher also needs updating:

```json
// Current
{ "matcher": "Skill", "hooks": [...] }

// After migration
{ "matcher": "Skill|Agent", "hooks": [...] }
```

**Resolved:** The hook-agent-compatibility-verification report confirmed that Agent() PreToolUse events use `tool_input.subagent_type` for agent type and `tool_input.name` for instance name. The extraction should check `subagent_type` first (stable type), falling back to `name` (instance-specific, may include phase suffixes).

### Dynamic Agent Name Matching

**Problem:** The current enforcement hook uses exact set matching (`subSkills.has(skillName)`). After migration, Agent names include dynamic phase suffixes (e.g., `execute-230`, `verify-231`, `review-230`). Exact matching cannot handle these.

**Design: Prefix-Based Matching**

Replace the exact set lookup with a prefix-match strategy:

```typescript
// Current: exact match
const isKnown = subSkills.has(skillName);

// After migration: prefix match
const agentPrefixes = new Set([
  // Singleton agents (exact match, no suffix)
  "cognition",
  "configure",
  "backlog",
  // Phase-suffixed agents (prefix match via trailing -)
  "classify-",
  "discuss-",
  "plan-",
  "plan-gaps-",
  "execute-",
  "execute-gaps-",
  "harness-",
  "fix-",
  "verify-",
  "review-", // covers review-arch-, review-dx-, review-security-, review-simplify-
  "learn-",
  "process-data-",
  // Milestone agents (exact match)
  "milestone-learn",
  "milestone-prune",
  "milestone-shadow",
  "milestone-archive",
  "milestone-finalize",
]);

const isKnown =
  // Exact match for non-suffixed agents
  agentPrefixes.has(skillName) ||
  // Prefix match for phase-suffixed agents
  [...agentPrefixes].some(
    (prefix) => prefix.endsWith("-") && skillName.startsWith(prefix),
  );
```

The enforcement hook factory will be updated to accept both `subSkills: Set<string>` (exact match, backward compatible for Skill()-based orchestrators) and `agentPrefixes: Set<string>` (prefix match, for Agent()-based orchestrators).

**Validation state mapping** also needs prefix matching — the `validStates` map currently uses exact skill names as keys. After migration, use the prefix (without phase suffix) as the key:

```typescript
// Current
const validStates = { "phase-execute-waves": "setup" };

// After migration
const validStates = { "execute-": "setup" }; // matches execute-230, execute-231, etc.
```

---

## Files Affected

### Rewrite (5 files)

| File                                             | Change                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `src/skills/luca/lu.skill.ts`                    | Inline lu-phase-loop logic, replace all Skill() with Agent() |
| `src/skills/general/phase-execute.skill.ts`      | Replace Skill() with Agent() for standalone mode             |
| `src/skills/general/pr-address.skill.ts`         | Replace Skill() with Agent()                                 |
| `src/skills/general/milestone-complete.skill.ts` | Replace Skill() with Agent()                                 |
| `src/skills/general/verify.skill.ts`             | Replace Skill() with Agent()                                 |

### Delete (22 sub-skill files)

| Orchestrator       | Sub-Skills to Delete                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| lu                 | lu-route, lu-configure, lu-backlog, lu-phase-loop                                              |
| phase-execute      | phase-execute-waves, phase-execute-verify, phase-execute-review                                |
| pr-address         | pr-fetch, pr-validate, pr-debate, pr-fix, pr-learn, pr-respond                                 |
| milestone-complete | milestone-learn, milestone-prune, milestone-shadow-gate, milestone-archive, milestone-finalize |
| verify             | verify-extract, verify-test, verify-diagnose, verify-review                                    |

### Modify (infrastructure)

| File                                               | Change                                           |
| -------------------------------------------------- | ------------------------------------------------ |
| `src/hooks/__helpers/enforcement-hook-factory.ts`  | Accept "Agent" tool name, extract agent identity |
| `src/hooks/scripts/pre-step-lu.ts`                 | Update sub-skill set to Agent names              |
| `src/hooks/scripts/pre-step-phase-execute.ts`      | Same                                             |
| `src/hooks/scripts/pre-step-verify.ts`             | Same                                             |
| `src/hooks/scripts/pre-step-milestone-complete.ts` | Same                                             |
| `src/hooks/scripts/pre-step-pr-address.ts`         | Same                                             |
| `src/hooks/__helpers/hook-registry.ts`             | Update matcher from "Skill" to "Skill\|Agent"    |
| `src/skills/__helpers/build-skill-registry.ts`     | Remove 22 deleted sub-skill imports              |

### Generated Output (auto-rebuilt by build:all)

- `.claude/skills/` -- 22 sub-skill directories deleted, 5 orchestrator SKILL.md files regenerated
- `packages/luca-framework/templates/harness/claude/skills/` -- 22 template directories deleted

**Estimated total**: ~54-59 source files + ~46 generated files = ~100+ files affected

---

## Risks

### HIGH Likelihood x HIGH Impact

| Risk                                                            | Mitigation                                                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Sub-agent calls Agent()/Skill() violating nesting constraint    | Audit every Agent() prompt; add build-time grep check for forbidden tool calls                                  |
| lu SKILL.md exceeds quality degradation threshold (~800+ lines) | Aggressive prompt compression; extract reference tables to lazy-loaded files; measure token count before deploy |
| Enforcement hooks blind to Agent() calls                        | Update matcher and factory before migrating any orchestrator                                                    |

### MEDIUM Likelihood x HIGH Impact

| Risk                                                      | Mitigation                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Sub-agent lacks session context (identity, config, vault) | Build standard "context envelope" template included in every Agent() prompt |
| Context file race condition in parallel Agent() calls     | Use per-phase namespaced context files for parallel execution               |

### Additional Risks (from risk-register.md)

| Risk                                              | Likelihood | Impact | Source                                                                                                                                              |
| ------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sub-agent silent crash/hang (no diagnostic)       | HIGH       | HIGH   | Claude Code bugs [#33014](https://github.com/anthropics/claude-code/issues/33014), [#27649](https://github.com/anthropics/claude-code/issues/27649) |
| Sub-agent context exhaustion returns garbage      | MEDIUM     | HIGH   | [#18240](https://github.com/anthropics/claude-code/issues/18240)                                                                                    |
| Sub-agent process orphaning after parent crash    | MEDIUM     | MEDIUM | [#19045](https://github.com/anthropics/claude-code/issues/19045)                                                                                    |
| Silent MCP tool failure in sub-agents             | LOW        | HIGH   | [#13890](https://github.com/anthropics/claude-code/issues/13890)                                                                                    |
| LLM loop counter drift in multi-phase execution   | HIGH       | MEDIUM | General LLM reliability concern                                                                                                                     |
| Orchestrator crash loses all progress (no resume) | LOW        | HIGH   | No crash recovery mechanism                                                                                                                         |

See [risk-register.md](./risk-register.md) for the full 16-risk register with detection and mitigation strategies.

### Validation Checklist (Phase 0)

| Question                                                  | Status                                        | How to Validate                                               |
| --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| What is `tool_name` for Agent() in PreToolUse hook stdin? | **RESOLVED**: `"Agent"`                       | hook-agent-compatibility-verification.md                      |
| What does `tool_input` look like for Agent() PreToolUse?  | **RESOLVED**: `subagent_type` + `name` fields | hook-agent-compatibility-verification.md                      |
| Can sub-agents read/write `/tmp/` context files?          | Unvalidated                                   | Spawn test Agent() that writes a file, verify from parent     |
| Can sub-agents call MuninnDB MCP tools reliably?          | Unvalidated                                   | Spawn test Agent() with MuninnDB recall, verify results       |
| Does `context: fork` work now? (#17283)                   | Unvalidated                                   | Test with a simple skill that has `context: fork` frontmatter |

---

## Migration Order

| Phase | Orchestrator       | Why This Order                                               | Risk Level  |
| ----- | ------------------ | ------------------------------------------------------------ | ----------- |
| 1     | pr-address         | Simplest (6 sequential steps, no loops, isolated from /lu)   | LOW         |
| 2     | verify             | Moderate (4 steps, conditional branching)                    | LOW-MEDIUM  |
| 3     | milestone-complete | Moderate (5 steps, some use Task() internally)               | MEDIUM      |
| 4     | phase-execute      | Complex (waves + verify + review, parallel execution)        | MEDIUM-HIGH |
| 5     | lu                 | Highest risk (inlines lu-phase-loop, affects every workflow) | HIGH        |

**Validation between phases**: Run at least 3 full workflow cycles before proceeding to the next orchestrator. Monitor for pipeline stalls, skipped steps, context corruption, and MuninnDB vault misrouting.

### Rollback Strategy

Each orchestrator migration is independent:

1. Revert source file via `git checkout HEAD~1 -- src/skills/{path}/{skill}.skill.ts`
2. Restore deleted sub-skill files from git history
3. Re-add registry entries in `build-skill-registry.ts`
4. User runs `bun run build:all` manually (never during Claude Code session)
5. Verify via `bun run check:drift`

---

## End-to-End Pipeline (After Migration)

### Full /lu Pipeline

```
User: /lu "Execute Phase 230 and 231" --full-auto

1.  [INLINE] Parse args, extract flags, record SESSION_START timestamp
2.  [INLINE] Load git context (branch, status)
3.  [INLINE] Initialize context file
    bun src/skills/__schemas/context-cli.ts init lu

4.  [AGENT] Cognitive pre-flight
    Agent(name: "cognition", prompt: "Load brain tree, recall patterns, init session...")
    -> Write state: "preflight_complete"

5.  [AGENT] Complexity classification + routing
    Agent(name: "classify", prompt: "Classify complexity, determine route (phase-execute,
    quick, pr-address, debug, session-plan, progress, project-new, milestone-new)...")
    -> Write state: "routed"
    -> Parse ROUTE from Agent result

6.  [INLINE] Route branch
    IF route != "phase-execute":
      6a. [AGENT] Execute routed handler
          Agent(name: "{route}-handler", prompt: "Execute {route} workflow...")
      6b. [AGENT] Verification (conditional)
          Agent(name: "verify-route", prompt: "Verify route output...")
      6c. [AGENT] Learning capture
          Agent(name: "learn-route", prompt: "Extract patterns...")
      6d. [INLINE] Commit, write state: "complete"
      -> RETURN (pipeline ends for non-phase-execute routes)

7.  [AGENT] Configure session
    Agent(name: "configure", prompt: "Read config, apply overrides, display banner...")
    -> luca-bridge transition --event=START
    -> luca-bridge transition --event=PREFLIGHT_COMPLETE
    -> Write state: "configured"

8.  [AGENT] Backlog scan (conditional: skip if --skip-backlog)
    Agent(name: "backlog", prompt: "Scan pending todos, WSJF score...")
    -> Write state: "scanned"
    NOTE: Swarm roadmap revision (TeamCreate) is deferred — single-agent sequential scan only

9.  [INLINE] Build phase execution order from ROADMAP.md
    - Parse ROADMAP.md for active phases
    - Build dependency graph, topological sort
    - Filter to requested phases

10. FOR each phase (serial execution; parallel deferred):

    10a. [INLINE] Phase dependency check
         Verify all dependencies complete. If not, skip or park.

    10b. [INLINE] Oversight gate (per-phase)
         IF oversight != "full-auto": prompt user for confirmation

    10c. [AGENT] Per-phase complexity re-classification
         Agent(name: "classify-{NN}", prompt: "Re-classify complexity for phase {NN}...")

    10d. [INLINE] Gate resolution
         - Resolve premortem gate: luca-bridge gate-check --gate=premortem
         - Resolve process_data gate: luca-bridge gate-check --gate=process_data

    10e. [AGENT] Discussion (conditional: skip if --skip-discuss)
         Agent(name: "discuss-{NN}", prompt: "Facilitate discussion for phase {NN}...")
         IF --run-premortem: include premortem analysis in discussion prompt

    10f. [INLINE] Plan existence check
         IF .planning/phases/{NN}-*/PLAN.md exists: skip planning

    10g. [AGENT] Planning
         Agent(name: "plan-{NN}", prompt: "Create PLAN.md with tasks, wave grouping...")

    10h. [AGENT] Wave execution
         Agent(name: "execute-{NN}", prompt: "Read PLAN.md, execute all tasks...")
         NOTE: Sub-agent does ALL wave work. Cannot spawn Task() internally.

    10i. [INLINE] Harness verification + fix loop (HOISTED from phase-execute-verify)
         FOR attempt = 1 to HARNESS_FIX_ITERATIONS (default 2):
           [AGENT] Run harness
           Agent(name: "harness-{NN}", prompt: "Run tsc --noEmit. Report pass/fail...")
           IF harness passed: BREAK
           [AGENT] Fix harness failures
           Agent(name: "fix-{NN}", prompt: "Fix these harness errors: {errors}...")
         -> luca-bridge transition --event=VERIFY_PASSED (or VERIFY_FAILED)

    10j. [AGENT] Goal-backward verification
         Agent(name: "verify-{NN}", prompt: "Verify phase goal achieved, write VERIFICATION.md...")

    10k. [AGENT] Code review (conditional on complexity >= MODERATE and not --skip-review)
         Orchestrator spawns multiple reviewers IN PARALLEL:
         Agent(name: "review-arch-{NN}", prompt: "Review architecture...")
         Agent(name: "review-dx-{NN}", prompt: "Review developer experience...")
         Agent(name: "review-security-{NN}", prompt: "Review security...")
         Agent(name: "review-simplify-{NN}", prompt: "Review for simplification...")

    10l. [AGENT] Learning capture
         Agent(name: "learn-{NN}", prompt: "Extract patterns, decisions, pitfalls to MuninnDB...")
         -> luca-bridge transition --event=LEARN_COMPLETE

    10m. [AGENT] Process data (conditional: --run-process-data)
         Agent(name: "process-data-{NN}", prompt: "Compute process metrics...")

    10n. [INLINE] Commit
         git add ... && git commit ...

    10o. [INLINE] Update state, roadmap, mark phase complete
         Write iteration index + remaining phases to context file (loop counter recovery)

    10p. [INLINE] Gap closure retry (if phase had failures)
         IF gaps detected:
           FOR retry = 1 to GAP_RETRIES:
             [AGENT] Re-plan gaps
             Agent(name: "plan-gaps-{NN}", prompt: "Plan only for these gaps: {gaps}...")
             [AGENT] Execute gap fixes
             Agent(name: "execute-gaps-{NN}", prompt: "Execute gap plan only...")
             -> Re-run harness (10i)
             IF all gaps closed: BREAK
           IF gaps remain after retries: park phase, log warning

    10q. [INLINE] Park-and-continue (if phase failed after retries)
         Park phase, cascade to dependents, track PARKED_PHASES

11. [INLINE] Milestone boundary check
    IF all phases in current milestone complete:
      [INLINE] Run milestone-complete steps as flat Agent() calls:
      11a. [AGENT] Agent(name: "milestone-learn", prompt: "Extract milestone learnings...")
      11b. [AGENT] Agent(name: "milestone-prune", prompt: "Prune stale MuninnDB entries...")
      11c. [AGENT] Agent(name: "milestone-shadow", prompt: "Scan for shadow debt...")
           (conditional: skip if shadow gate disabled)
      11d. [AGENT] Agent(name: "milestone-archive", prompt: "Archive milestone artifacts...")
      11e. [AGENT] Agent(name: "milestone-finalize", prompt: "Bump version, create tag...")
      NOTE: milestone sub-skills that spawn Task() (learn, shadow-gate) must do their
            work without sub-agents — leaf workers only.

12. [INLINE] Cross-milestone continuation check
    IF next milestone exists and user approved: loop back to step 9

13. [INLINE] Gap detection audit
    Build DAGCheckpoint from execution trace, call detectGaps(), report coverage

14. [INLINE] Session summary + session cleanup
15. [INLINE] Write state: "complete"
```

### Full /phase-execute Pipeline (Standalone)

```
User: /phase-execute 230

1.  [INLINE] Parse args, initialize context, model routing resolution
2.  [INLINE] Capture phase start commit: PHASE_START_COMMIT=$(git rev-parse HEAD)
3.  [INLINE] GitHub tracking verification (gate check)
4.  [INLINE] Procedure replay check (MuninnDB recall)

5.  [AGENT] Wave execution
    Agent(name: "execute-waves", prompt: "Read PLAN.md, execute all tasks...")
    -> Write state: "executed"

6.  [INLINE] Harness verification + fix loop (HOISTED)
    FOR attempt = 1 to HARNESS_FIX_ITERATIONS:
      [AGENT] Agent(name: "harness", prompt: "Run tsc --noEmit. Report pass/fail...")
      IF passed: BREAK
      [AGENT] Agent(name: "fix", prompt: "Fix these errors: {errors}...")
    -> luca-bridge transition --event=VERIFY_PASSED
    -> Write state: "verified"

7.  [AGENT] Goal-backward verification
    Agent(name: "verify", prompt: "Verify phase goal, write VERIFICATION.md...")

8.  [AGENT] Code review (conditional, PARALLEL reviewers)
    Agent(name: "review-arch", ...) | Agent(name: "review-dx", ...) | ...
    -> Write state: "reviewed"

9.  [AGENT] Learning capture
    Agent(name: "learn", prompt: "...")
    -> luca-bridge transition --event=LEARN_COMPLETE

10. [AGENT] Process data (conditional: --run-process-data)
    Agent(name: "process-data", prompt: "...")

11. [INLINE] UAT (conditional: not --skip-uat, interactive)
    Present verification results to user. Route: A (approved), B (minor fixes),
    C (re-execute), D (reject).
    NOTE: UAT is INLINE because it requires user interaction in main conversation.

12. [INLINE] Gap detection audit
13. [INLINE] Commit, bridge COMMIT_COMPLETE, write state: "complete"
```

### Interactive Steps That Must Stay Inline

Some steps require user interaction and CANNOT be delegated to Agent() sub-agents (which run in isolation with no user access):

| Step                       | Where                 | Why Inline                                  |
| -------------------------- | --------------------- | ------------------------------------------- |
| Oversight gate (per-phase) | lu step 10b           | User confirmation prompt                    |
| UAT                        | phase-execute step 11 | User reviews and decides outcome            |
| verify-test                | verify orchestrator   | Presents tests for interactive confirmation |

These steps run directly in the orchestrator's conversation context (the main Claude Code session).

### Fix Loop Hoisting Pattern

The harness fix loop was previously inside `phase-execute-verify`, which spawned `Task(lu-executor)` to fix failures. Since Agent() sub-agents cannot spawn sub-agents, this loop is **hoisted to the orchestrator level**:

```
BEFORE (nested):
  phase-execute -> Skill(phase-execute-verify)
    -> phase-execute-verify: FOR attempt = 1..N:
         Task(lu-executor) to fix  <-- NESTING VIOLATION after migration
         run harness
         Task(lu-verifier) to verify

AFTER (flat):
  orchestrator: FOR attempt = 1..N:
    Agent("harness-{NN}")   <-- leaf agent, runs checks, reports errors
    IF failed:
      Agent("fix-{NN}")    <-- leaf agent, reads errors, fixes code
    ELSE: BREAK
```

The same pattern applies to:

- verify-diagnose (previously spawned Task(lu-debugger) in parallel)
- pr-fix (previously spawned Task(lu-planner) + Task(lu-executor) + Task(lu-verifier))
- milestone-learn (previously spawned Task(lu-learner))

In each case, the sub-agent spawning is hoisted to the orchestrator.

---

## Option F: Channel-Driven Orchestrator (Future)

### Concept

Claude Code Channels ([docs](https://code.claude.com/docs/en/channels)) allow an MCP server to push events INTO a running session. A deterministic TypeScript state machine would run as a channel MCP server, watch for state transitions, and push "execute next step" events. Claude receives each event as a `<channel>` tag and does the work -- in the main conversation context, so Agent()/Task() calls still work.

```
State Machine (deterministic TypeScript)     Claude Code Session
        |                                         |
        |  <channel source="luca-orchestrator">   |
        |  Execute Step 3: Configure session...   |
        |  ────────────────────────────────────>   |
        |                                    Claude does the work
        |                                    calls step_complete() reply tool
        |  <── step_complete(step: "configure")   |
        |                                         |
        |  advances state machine                 |
        |  pushes next step event                 |
        |  ────────────────────────────────────>   |
```

### Architecture (Validated by Research)

- **State machines reused directly** -- existing XState definitions imported without modification
- **Reply tool for completion signaling** -- Claude calls `step_complete({ step, output })` after each step, creating a natural lock (push-wait-push, no race conditions)
- **Branching logic in the server** -- skip-backlog, oversight gates, routing decisions resolved deterministically in TypeScript
- **MCP SDK must be added** -- `@modelcontextprotocol/sdk` is NOT a transitive dependency (claude-agent-sdk has zero dependencies); it would need to be installed separately
- **Sub-skills survive as standalone** -- their instructions become channel event payloads for orchestrated execution
- **Enforcement hooks become complementary** -- channel is proactive ("push right step"), hooks are reactive ("block wrong steps")

### Why This Is the Better Long-Term Architecture

1. **Deterministic orchestration** -- the channel server (TypeScript) controls step sequencing, not the LLM
2. **Matches research consensus** -- "make orchestration deterministic, keep judgment in the agent" (StateFlow, MASFT, AWS)
3. **Additive, not destructive** -- add a channel server, don't delete 22 sub-skills
4. **No nesting constraint** -- Claude stays in the main conversation, can use Agent()/Task() freely
5. **Strongest anti-skip** -- the LLM never decides what step comes next; the channel pushes it

### Why We Cannot Use This Today (3 Blockers)

#### Blocker 1: Channel Notification Delivery Bug ([#36477](https://github.com/anthropics/claude-code/issues/36477))

After responding to the first channel event, subsequent notifications are **silently dropped**. 10+ independent reproductions across v2.1.80-v2.1.86, all platforms. Same class of failure as the Skill() bug (#17351) -- pipeline stalls after the first event.

#### Blocker 2: Research Preview (No Stability Guarantees)

Channels launched March 20, 2026 (9 days ago). The docs explicitly warn the API contract may change. The `--channels` flag syntax and protocol may be altered or removed.

#### Blocker 3: Allowlist Prevents Shipping

Custom channels require `--dangerously-load-development-channels` unless published to the official Anthropic marketplace (requires security review, unknown timeline). Enterprise orgs need `channelsEnabled` enabled by admins.

### Verification Team Findings

A 3-agent verification team independently assessed Option F:

**Blocker #1 (Bug #36477): CONFIRMED**

- 6 confirmed bug reports (#36477, #36975, #38259, #36802, #37026, #38104) document the same failure: first channel notification works, subsequent ones silently dropped
- 10+ independent reproductions across v2.1.80-v2.1.87, all platforms
- `mcp.notification()` resolves successfully but Claude Code never renders the `<channel>` tag
- Intermittent (some versions work better than others), making it MORE dangerous -- passes simple tests, fails in production

**Blocker #2 (Research preview): CONFIRMED as risk, DISPUTED as absolute blocker**

- 4-5 channel-related changes across 7 versions in 9 days shows active iteration
- Complete removal unlikely given 3 platform integrations (Telegram, Discord, iMessage)
- But API contract may change

**Blocker #3 (Allowlist): PARTIALLY OVERSTATED**

- **Pro/Max individual users bypass the allowlist entirely** -- official docs: "Pro and Max users without an organization skip these checks entirely"
- `--dangerously-load-development-channels` is NOT required for individual Pro/Max users
- Still a blocker for Enterprise/Team orgs
- Registration requires BOTH `.mcp.json` AND `--channels` flag (forgetting `--channels` causes silent degradation)

**Architecture assessment:**

- The "push-wait-push lock" claim is **FALSE** -- notifications are fire-and-forget with no protocol-level acknowledgment
- The reply tool (`step_complete`) IS sound -- MCP tool calls are synchronous request/response
- But reply tool depends on notification delivery working, which is broken
- Channels are **stronger for ordering** (deterministic) but **weaker for compliance** (Claude can ignore events)
- Current pre-step hooks physically block wrong-order tool calls (exit code 2 = deny); channels cannot block anything
- No community precedent exists for sequential workflow orchestration via channels
- Fakechat source confirms no queuing, no completion detection, no sequential coordination

**Strongest long-term architecture (triple-layer hybrid):**
Channels (ordering) + Agent() (isolation) + Hooks (compliance enforcement) = all three weaknesses covered

### Reactivation Criteria

Re-evaluate Option F when ALL of these are true:

- [ ] Bug #36477 (notification delivery) is resolved and verified
- [ ] Channels exit research preview with stable API contract
- [ ] Custom channels can be distributed without `--dangerously-` flags (either via marketplace approval or policy change)
- [ ] Channel events are confirmed to not be dropped during active Agent()/Task() execution

### Migration Path from Option B to Option F

Option B (Agent migration) is designed so that migrating to Option F later is straightforward:

1. The Agent() prompts in Option B become the `content` payloads in Option F channel events
2. The context file protocol is identical in both approaches
3. The state machines are already the source of truth in Option B; Option F just runs them in-process
4. The enforcement hooks work in both (match on "Agent" in Option B, short-circuit when channel is active in Option F)

---

## Recommendation

### Immediate: Proceed with Option B (Agent Migration)

Option B is the pragmatic path forward. It:

- Fixes the Skill() nesting bug (#17351) using proven Agent() mechanics
- Preserves anti-skip enforcement via hooks + state machines
- Is fully implementable with current Claude Code features
- Provides a clean migration path to Option F when channels mature

### Future: Channel-Driven Orchestrator (Option F)

Track these GitHub issues:

- [#36477](https://github.com/anthropics/claude-code/issues/36477) -- Channel notification delivery bug
- [#17351](https://github.com/anthropics/claude-code/issues/17351) -- Skill() nesting bug (original motivator)
- [#17283](https://github.com/anthropics/claude-code/issues/17283) -- context: fork support

When all 3 blockers are cleared, Option F provides the architecturally superior solution: deterministic orchestration with the LLM confined to bounded judgment within each step.

---

## References

### Bug Reports

- [#17351: Nested skills don't return to invoking skill context](https://github.com/anthropics/claude-code/issues/17351) (OPEN)
- [#29191: Parent skill cannot resume after nested skill completes](https://github.com/anthropics/claude-code/issues/29191) (OPEN)
- [#17283: Skill tool should honor context: fork](https://github.com/anthropics/claude-code/issues/17283) (context: fork ignored)
- [#36477: Channel notification delivery drops after first event](https://github.com/anthropics/claude-code/issues/36477) (OPEN)

### Claude Code Documentation

- [Skills documentation](https://code.claude.com/docs/en/skills) -- inline injection model
- [Sub-agents documentation](https://code.claude.com/docs/en/sub-agents) -- isolated execution, no nesting
- [Channels documentation](https://code.claude.com/docs/en/channels) -- event pushing into sessions
- [Channels reference](https://code.claude.com/docs/en/channels-reference) -- MCP server contract for channels

### Anti-Skip Research

- [StateFlow (Microsoft Research)](https://arxiv.org/html/2403.11322v1) -- per-state tool binding
- [MASFT: Multi-Agent System Failure Taxonomy (NeurIPS 2025)](https://arxiv.org/html/2503.13657v1)
- [AWS Agent Guardrails](https://dev.to/aws/ai-agent-guardrails-rules-that-llms-cannot-bypass-596d)
- [AgentSpec (ICSE 2026)](https://cposkitt.github.io/files/publications/agentspec_llm_enforcement_icse26.pdf)

### Internal Research

- `.planning/notes/skill-orchestration-investigation.md` -- initial investigation
- `.planning/research/01-architecture-patterns.md` -- impact analysis + architecture design
- `.planning/research/02-implementation-approaches.md` -- Agent tool runtime + channel implementation
- `.planning/research/04-pitfalls-and-risks.md` -- risk assessment (Option B)
- `.planning/research/option-f-channels-pitfalls-and-risks.md` -- risk assessment (Option F)
