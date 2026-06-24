---
phase: 232
plan: 1
type: improvement
autonomous: false
wave: 1
depends_on: [229]
---

# Phase 232 Plan 1: Skill-to-Agent Orchestration Migration

## Objective

Migrate all 5 Luca orchestrators from nested `Skill()` calls to flat `Agent()` sub-agent orchestration, fixing the Claude Code bug (#17351) where nested skills do not return control to the parent. This includes updating enforcement hooks, creating shared prompt templates, rewriting orchestrators, removing 22 sub-skills, and updating all supporting infrastructure (registry, DAGs, contracts, gap detection).

> **Complexity: CRITICAL** (10+ files affected, system-wide architectural change, 5 orchestrators + 22 sub-skills + ~8 infrastructure files)

## Context

@docs/skill-to-agent-migration/architecture.md
@docs/skill-to-agent-migration/muninndb-context-pattern.md
@docs/skill-to-agent-migration/integration-assessment.md
@docs/skill-to-agent-migration/risk-register.md
@docs/skill-to-agent-migration/orchestration-completeness.md
@docs/skill-to-agent-migration/context-management.md
@docs/skill-to-agent-migration/grounding-report.md
@src/hooks/**helpers/enforcement-hook-factory.ts
@src/hooks/**helpers/hook-registry.ts
@src/hooks/scripts/pre-step-pr-address.ts
@src/hooks/scripts/pre-step-verify.ts
@src/hooks/scripts/pre-step-milestone-complete.ts
@src/hooks/scripts/pre-step-phase-execute.ts
@src/hooks/scripts/pre-step-lu.ts
@src/hooks/scripts/pre-step-enforcement.ts
@src/skills/**helpers/build-skill-registry.ts
@src/workflow/**helpers/pr-address-dag.ts
@src/workflow/\*\*helpers/contract-hook-adapter.ts

## Critical Constraints

1. **NEVER run `bun run build:all` during a Claude Code session** -- it crashes the process. Each wave that changes skill/hook source files must end with the user running `bun run build:all` manually and then `bun run check:drift` to verify.
2. **No test files** -- per `.claude/rules/no-tests.md`, verification uses `bunx --bun tsc --noEmit` only.
3. **Generated file guard** -- never edit `.claude/` directly. Edit `src/` and rebuild.
4. **Sub-agents CANNOT spawn sub-agents** -- all Agent() calls must originate from the orchestrator.
5. **Interactive steps stay inline** -- verify-test, UAT, oversight gates must remain in the main conversation.
6. **Fix loops hoisted** -- harness fix and verify fix loops move from sub-skills to orchestrators.

---

## Wave 1: Hook Infrastructure + Enforcement Factory (Phase 0)

**Goal:** Update the enforcement hook infrastructure so it recognizes Agent() tool calls alongside Skill() calls. This MUST complete before any orchestrator migration. Includes prefix-based matching for dynamic agent names.

**BLOCKING prerequisite for all subsequent waves.**

### Task 1.1: Update enforcement-hook-factory.ts for Agent() support

**Type:** auto
**TDD:** false
**Depends on:** none
**Scope:** M

Update `src/hooks/__helpers/enforcement-hook-factory.ts` to:

1. Change the tool name filter (line 173) from `toolName !== "Skill"` to `toolName !== "Skill" && toolName !== "Agent"`.
2. Update the name extraction logic (step 4) to handle both Skill and Agent tool inputs:
   - For Skill: `toolInput.skill` (unchanged)
   - For Agent: `toolInput.subagent_type || toolInput.name || "unknown"`
3. Add **prefix-based matching** alongside exact matching. The factory must accept a new optional config field `agentPrefixes: Set<string>` (alongside existing `subSkills: Set<string>`). When `agentPrefixes` is provided, matching logic uses: exact match from `subSkills` OR prefix match from `agentPrefixes` (for entries ending with `-`).
4. Update the `validStates` lookup to support prefix-based keys. When looking up valid states for an agent name like `execute-230`, try exact match first, then fall back to prefix match (find a key that ends with `-` and is a prefix of the agent name).
5. Add JSDoc documentation for the new parameters and matching strategy.

The factory signature changes from:

```typescript
createSubSkillEnforcementHook({
  hookName, contextPath, subSkills, validStates, initialSkill?
})
```

To:

```typescript
createSubSkillEnforcementHook({
  hookName, contextPath, subSkills, validStates, initialSkill?,
  agentPrefixes?  // NEW: Set<string> for prefix-based Agent name matching
})
```

**Files to create/edit:**

- `src/hooks/__helpers/enforcement-hook-factory.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Existing Skill()-based hooks continue to work (backward compatible)
- Agent() tool calls with dynamic names (e.g., `execute-230`) are correctly matched via prefix

### Task 1.2: Update hook-registry.ts tool_filter entries

**Type:** auto
**TDD:** false
**Depends on:** none
**Scope:** S

Update `src/hooks/__helpers/hook-registry.ts` to change `tool_filter` from `"Skill"` to `"Skill|Agent"` for these 6 entries:

1. `pre-step-enforcement` (line 143): `"Bash|Skill"` -> `"Bash|Skill|Agent"`
2. `pre-step-pr-address` (line 151): `"Skill"` -> `"Skill|Agent"`
3. `pre-step-milestone-complete` (line 158): `"Skill"` -> `"Skill|Agent"`
4. `pre-step-verify` (line 165): `"Skill"` -> `"Skill|Agent"`
5. `pre-step-phase-execute` (line 173): `"Skill"` -> `"Skill|Agent"`
6. `pre-step-lu` (line 181): `"Skill"` -> `"Skill|Agent"`

**Files to create/edit:**

- `src/hooks/__helpers/hook-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 6 entries now include `"Agent"` in their tool_filter

### Task 1.3: Update pre-step-enforcement.ts for Agent() semantics

**Type:** auto
**TDD:** false
**Depends on:** 1.1
**Scope:** S

Update `src/hooks/scripts/pre-step-enforcement.ts` to handle Agent() tool calls in addition to Skill(). This advisory enforcement hook checks `toolName === "Skill"` and uses heuristics like `command.includes("lu-")`. Update to also recognize `toolName === "Agent"` and adjust name extraction accordingly.

**Files to create/edit:**

- `src/hooks/scripts/pre-step-enforcement.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Hook can detect both Skill() and Agent() tool invocations

### Task 1.4: Phase 0 validation -- empirical Agent() testing

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 1.1, 1.2, 1.3
**Scope:** S

Create a minimal test prompt that the user will run manually to validate:

1. **Agent() PreToolUse hook firing:** Call `Agent(name: "test-ping", prompt: "Say hello and return STATUS: success")` and verify the pre-step hooks fire (check hook logs).
2. **Sub-agent context file access:** Call `Agent(name: "test-file", prompt: "Write the string 'AGENT_OK' to /tmp/agent-test-output.txt")` and verify the file exists after.
3. **Sub-agent MuninnDB access:** Call `Agent(name: "test-muninn", prompt: "Call mcp__muninn__muninn_recall(vault: 'luca-framework', context: ['project identity']) and return the result in STATUS: success RESULT: {recall_output}")` and verify recall works.

Write these test prompts to `docs/skill-to-agent-migration/phase-0-validation.md` with pass/fail criteria.

**Files to create/edit:**

- `docs/skill-to-agent-migration/phase-0-validation.md`

**Verification:**

- User runs the test prompts and confirms:
  - PreToolUse hooks fire for Agent() calls
  - Sub-agents can write to /tmp/
  - Sub-agents can call MuninnDB MCP tools
- All 3 must pass before proceeding to Wave 2

### Wave 1 Verification

- `bunx --bun tsc --noEmit` passes for all modified files
- User must run `bun run build:all` manually after this wave, then `bun run check:drift`
- User runs Phase 0 validation prompts from Task 1.4 and confirms all 3 pass

---

## Wave 2: Shared Prompt Template Module + Output Contracts

**Goal:** Create the shared prompt template module (`src/skills/__helpers/agent-prompts.ts`) that will be used by all 5 orchestrators. Extract the ~30 Agent() prompt templates from existing sub-skill source files. Define structured output contracts.

**Prerequisite:** Wave 1 complete + Phase 0 validation passed.

### Task 2.1: Create shared Agent() prompt template module

**Type:** auto
**TDD:** false
**Depends on:** Wave 1
**Scope:** L

Create `src/skills/__helpers/agent-prompts.ts` containing typed prompt template factory functions for all ~30 Agent() prompts. Each template function accepts parameters (phase number, complexity, vault name, etc.) and returns a string prompt.

Templates must include:

1. **Role block** -- agent identity and tool constraints ("You CANNOT call Agent(), Task(), or Skill()")
2. **MuninnDB memory protocol** -- recall/observe/handoff phases from `muninndb-context-pattern.md`, with correct API signatures (`context` as array, vault name explicit)
3. **MuninnDB fallback instructions** -- if MCP tools error, fall back to STATE.md / config.json / context file
4. **Context block** -- project, vault, complexity, phase, current state
5. **Task-specific instructions** -- extracted from the corresponding sub-skill source file's markdown body
6. **Output contract** -- STATUS: success/failure + structured RESULT

The templates should be organized by orchestrator:

```typescript
// --- pr-address templates ---
export const PR_FETCH_PROMPT = (params: AgentPromptParams) => `...`;
export const PR_VALIDATE_PROMPT = (params: AgentPromptParams) => `...`;
export const PR_DEBATE_PROMPT = (params: AgentPromptParams) => `...`;
export const PR_FIX_PROMPT = (params: AgentPromptParams) => `...`;
export const PR_LEARN_PROMPT = (params: AgentPromptParams) => `...`;
export const PR_RESPOND_PROMPT = (params: AgentPromptParams) => `...`;

// --- verify templates ---
export const VERIFY_EXTRACT_PROMPT = (params: AgentPromptParams) => `...`;
export const VERIFY_DIAGNOSE_PROMPT = (params: AgentPromptParams) => `...`;
export const VERIFY_REVIEW_PROMPT = (params: AgentPromptParams) => `...`;
// NOTE: verify-test stays INLINE (interactive), no Agent() template needed

// --- milestone-complete templates ---
export const MILESTONE_LEARN_PROMPT = (params: AgentPromptParams) => `...`;
export const MILESTONE_PRUNE_PROMPT = (params: AgentPromptParams) => `...`;
export const MILESTONE_SHADOW_PROMPT = (params: AgentPromptParams) => `...`;
export const MILESTONE_ARCHIVE_PROMPT = (params: AgentPromptParams) => `...`;
export const MILESTONE_FINALIZE_PROMPT = (params: AgentPromptParams) => `...`;

// --- phase-execute templates (shared between standalone and lu inline) ---
export const EXECUTE_WAVES_PROMPT = (params: AgentPromptParams) => `...`;
export const HARNESS_CHECK_PROMPT = (params: AgentPromptParams) => `...`;
export const HARNESS_FIX_PROMPT = (params: AgentPromptParams) => `...`;
export const GOAL_VERIFY_PROMPT = (params: AgentPromptParams) => `...`;
export const CODE_REVIEW_PROMPT = (
  reviewer: string,
  params: AgentPromptParams,
) => `...`;
export const LEARNING_CAPTURE_PROMPT = (params: AgentPromptParams) => `...`;
export const PROCESS_DATA_PROMPT = (params: AgentPromptParams) => `...`;

// --- lu-only templates ---
export const COGNITION_PROMPT = (params: AgentPromptParams) => `...`;
export const CLASSIFY_PROMPT = (params: AgentPromptParams) => `...`;
export const CONFIGURE_PROMPT = (params: AgentPromptParams) => `...`;
export const BACKLOG_PROMPT = (params: AgentPromptParams) => `...`;
export const ROUTE_HANDLER_PROMPT = (
  route: string,
  params: AgentPromptParams,
) => `...`;
```

Define the `AgentPromptParams` interface (internal, not exported as Zod schema since these are build-time constants):

```typescript
interface AgentPromptParams {
  phase: string;
  complexity: string;
  vault: string;
  currentState: string;
  sessionStart?: string;
  config?: Record<string, unknown>;
}
```

**Source extraction:** Read each of the 22 sub-skill `.skill.ts` files and extract the markdown body (the `body` or `instructions` field) as the basis for each Agent() prompt. The goal is NOT to copy verbatim but to distill the essential instructions into a concise prompt that a sub-agent can follow.

**Token budget awareness:** Each individual template should target 200-400 tokens. The MuninnDB memory protocol section is shared (include once per template via a helper function, not duplicated). File references (`@filename`) replace embedded context.

**Files to create/edit:**

- `src/skills/__helpers/agent-prompts.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All ~30 templates are defined and exported
- Each template includes: role block, memory protocol, task instructions, output contract
- No template exceeds ~500 tokens (rough estimate by line count / 4)

### Task 2.2: Define structured output contract schemas

**Type:** auto
**TDD:** false
**Depends on:** none
**Scope:** S

Create `src/skills/__schemas/agent-output.schemas.ts` containing Zod schemas for the structured output contracts that Agent() sub-agents must return. These schemas are used by the orchestrator to parse Agent() text responses.

```typescript
// Base output contract -- all agents return this
export const AgentOutputSchema = z.object({
  status: z.enum(["success", "failure"]),
  result: z.string(),
});

// Extended contracts for agents that return structured data
export const ClassifyOutputSchema = AgentOutputSchema.extend({
  complexity: z.string().optional(),
  route: z.string().optional(),
});

export const HarnessOutputSchema = AgentOutputSchema.extend({
  passed: z.boolean().optional(),
  errors: z.array(z.string()).optional(),
});
```

Also create a parser helper:

```typescript
/**
 * Parse raw Agent() text output into structured result.
 *
 * Extracts STATUS and RESULT from the agent's text response.
 * Falls back to treating entire response as failure if markers missing.
 */
export const parseAgentOutput = (rawText: string): AgentOutput => { ... }
```

**Files to create/edit:**

- `src/skills/__schemas/agent-output.schemas.ts` (new)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Schemas parse valid STATUS/RESULT text correctly
- Missing STATUS treated as failure (fail-closed)

### Wave 2 Verification

- `bunx --bun tsc --noEmit` passes
- `src/skills/__helpers/agent-prompts.ts` exists with all ~30 templates
- `src/skills/__schemas/agent-output.schemas.ts` exists with output schemas + parser
- No `bun run build:all` needed for this wave (new files only, no generated output changes)

---

## Wave 3: Migrate pr-address Orchestrator

**Goal:** Migrate the simplest orchestrator first. Replace all 6 Skill() calls in pr-address with Agent() calls. Remove 6 sub-skill source files. Update the pre-step hook and DAG.

**Migration order rationale:** pr-address is the simplest (6 sequential steps, no loops, isolated from /lu).

### Task 3.1: Rewrite pr-address.skill.ts to use Agent()

**Type:** auto
**TDD:** false
**Depends on:** Wave 2
**Scope:** L

Rewrite `src/skills/general/pr-address.skill.ts` to replace all 6 `Skill()` calls with `Agent()` calls using the shared prompt templates from `agent-prompts.ts`.

Key changes:

1. Replace `Skill(skill: "pr-fetch")` with `Agent(name: "fetch", prompt: PR_FETCH_PROMPT({...}))` etc. for all 6 steps.
2. The orchestrator now writes context file state transitions (currently done by sub-skills).
3. State machine states remain the same: idle -> fetched -> validated -> debated -> planned -> verified -> learned -> responded.
4. Import prompt templates from `~/skills/__helpers/agent-prompts`.
5. Parse Agent() output using `parseAgentOutput()` from agent-output schemas.
6. Include crash recovery pattern (establish this pattern for Tasks 4.1-7.1 to follow):
   ```
   # At orchestrator init, before context-cli init:
   EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state pr-address 2>/dev/null || echo "")
   if [ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ]; then
     # Context file exists with non-idle state — previous session may have crashed
     # Read current_state and resume from the next step instead of reinitializing
     echo "Resuming from state: $EXISTING_STATE"
     # Skip steps that already completed (check state against validStates)
   else
     bun src/skills/__schemas/context-cli.ts init pr-address
   fi
   ```

The compiled SKILL.md should stay well under 800 lines. pr-address absorbs 6 sub-skills (1,122 lines) but Agent() prompts reference the shared template module, not inline all instructions.

**Files to create/edit:**

- `src/skills/general/pr-address.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No `Skill()` calls remain in pr-address.skill.ts
- All 6 steps use `Agent()` with named prompts
- Context file writes are done by orchestrator, not sub-agents
- Crash recovery check exists at init

### Task 3.2: Update pre-step-pr-address.ts for Agent() names

**Type:** auto
**TDD:** false
**Depends on:** 3.1
**Scope:** S

Update `src/hooks/scripts/pre-step-pr-address.ts`:

1. Replace `subSkills` set with Agent names: `"fetch"`, `"validate"`, `"debate"`, `"fix"`, `"learn"`, `"respond"`.
2. Update `validStates` map keys to match new Agent names.
3. Since pr-address uses non-suffixed agent names (no phase number), exact matching is sufficient. No `agentPrefixes` needed.

```typescript
const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-pr-address",
  contextPath: "/tmp/pr-address-context.json",
  subSkills: new Set([
    "fetch",
    "validate",
    "debate",
    "fix",
    "learn",
    "respond",
  ]),
  validStates: {
    fetch: new Set(["idle"]),
    validate: new Set(["fetched"]),
    debate: new Set(["validated"]),
    fix: new Set(["planned", "debated"]),
    learn: new Set(["verified"]),
    respond: new Set(["verified", "learned", "responded"]),
  },
  initialSkill: "fetch",
});
```

**Files to create/edit:**

- `src/hooks/scripts/pre-step-pr-address.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Agent names in hook match Agent names in pr-address.skill.ts

### Task 3.3: Update pr-address-dag.ts handler references

**Type:** auto
**TDD:** false
**Depends on:** 3.1
**Scope:** S

Update `src/workflow/__helpers/pr-address-dag.ts` to change handler names from sub-skill names (`pr-fetch`, `pr-validate`, etc.) to Agent step names (`fetch`, `validate`, `debate`, `fix`, `learn`, `respond`).

**Files to create/edit:**

- `src/workflow/__helpers/pr-address-dag.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Handler names match the Agent() `name` values in pr-address.skill.ts

### Task 3.4: Remove 6 pr-address sub-skill source files

**Type:** auto
**TDD:** false
**Depends on:** 3.1, 3.2, 3.3
**Scope:** S

Delete these 6 source files:

- `src/skills/general/pr-fetch.skill.ts`
- `src/skills/general/pr-validate.skill.ts`
- `src/skills/general/pr-debate.skill.ts`
- `src/skills/general/pr-fix.skill.ts`
- `src/skills/general/pr-learn.skill.ts`
- `src/skills/general/pr-respond.skill.ts`

Remove their imports and registry entries from `src/skills/__helpers/build-skill-registry.ts` (6 imports + 6 registry entries).

**Files to create/edit:**

- Delete 6 files listed above
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No imports or registry entries remain for deleted sub-skills
- `git status` shows 6 deleted files

### Wave 3 Verification

- `bunx --bun tsc --noEmit` passes
- User must run `bun run build:all` manually, then `bun run check:drift`
- After rebuild: `.claude/skills/pr-fetch/`, `.claude/skills/pr-validate/`, `.claude/skills/pr-debate/`, `.claude/skills/pr-fix/`, `.claude/skills/pr-learn/`, `.claude/skills/pr-respond/` directories no longer exist
- `.claude/skills/pr-address/SKILL.md` is regenerated with Agent() orchestration
- **Functional validation:** User runs `/pr-address` on a real PR to verify the full pipeline works end-to-end

---

## Wave 4: Migrate verify Orchestrator

**Goal:** Migrate the verify orchestrator. Replace Skill() calls with Agent() calls. Handle the interactive verify-test step as inline work. Hoist verify-diagnose's Task(lu-debugger) spawning to the orchestrator.

### Task 4.1: Rewrite verify.skill.ts to use Agent()

**Type:** auto
**TDD:** false
**Depends on:** Wave 3
**Scope:** M

Rewrite `src/skills/general/verify.skill.ts`:

1. Replace `Skill(skill: "verify-extract")` with `Agent(name: "extract", prompt: VERIFY_EXTRACT_PROMPT({...}))`.
2. **verify-test stays INLINE** -- this step presents tests to the user for interactive confirmation. Keep its logic directly in the orchestrator skill body, not delegated to Agent().
3. Replace `Skill(skill: "verify-diagnose")` with `Agent(name: "diagnose", prompt: VERIFY_DIAGNOSE_PROMPT({...}))`. The diagnose agent runs debugger work as a single leaf agent (no spawning Task(lu-debugger) -- it does the debugging itself).
4. Replace `Skill(skill: "verify-review")` with `Agent(name: "review", prompt: VERIFY_REVIEW_PROMPT({...}))`.
5. Handle divergent paths: after `tested`, either diagnose (issues found) or review (no issues).
6. Add crash recovery check at init.

**Files to create/edit:**

- `src/skills/general/verify.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- verify-test remains inline (no Agent() call for it)
- No Skill() calls remain
- Divergent path logic preserved

### Task 4.2: Update pre-step-verify.ts for Agent() names

**Type:** auto
**TDD:** false
**Depends on:** 4.1
**Scope:** S

Update `src/hooks/scripts/pre-step-verify.ts`:

```typescript
subSkills: new Set(["extract", "diagnose", "review"]),
// NOTE: verify-test removed -- it runs inline, not via Agent()
validStates: {
  "extract": new Set(["idle"]),
  "diagnose": new Set(["tested"]),
  "review": new Set(["tested"]),
},
```

**Files to create/edit:**

- `src/hooks/scripts/pre-step-verify.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

### Task 4.3: Remove 4 verify sub-skill source files

**Type:** auto
**TDD:** false
**Depends on:** 4.1, 4.2
**Scope:** S

Delete:

- `src/skills/general/verify-extract.skill.ts`
- `src/skills/general/verify-test.skill.ts`
- `src/skills/general/verify-diagnose.skill.ts`
- `src/skills/general/verify-review.skill.ts`

Remove their imports and registry entries from `src/skills/__helpers/build-skill-registry.ts`.

**Files to create/edit:**

- Delete 4 files listed above
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

### Wave 4 Verification

- `bunx --bun tsc --noEmit` passes
- User must run `bun run build:all` manually, then `bun run check:drift`
- 4 sub-skill directories removed from `.claude/skills/`
- **Functional validation:** User runs `/verify` on recent work to confirm pipeline works

---

## Wave 5: Migrate milestone-complete Orchestrator

**Goal:** Migrate milestone-complete. Its 5 sub-skills become 5 Agent() calls. Sub-skills that previously spawned Task() (milestone-learn, milestone-shadow-gate) now do their work as leaf agents without sub-agent spawning.

### Task 5.1: Rewrite milestone-complete.skill.ts to use Agent()

**Type:** auto
**TDD:** false
**Depends on:** Wave 4
**Scope:** M

Rewrite `src/skills/general/milestone-complete.skill.ts`:

1. Replace 5 Skill() calls with Agent() calls using shared templates.
2. milestone-learn agent does learning capture without spawning Task(lu-learner) -- it does the work directly.
3. milestone-shadow-gate agent does shadow scanning without spawning Task(lu-shadow-scanner) -- it does the work directly.
4. milestone-archive and milestone-finalize are simple leaf work, no changes needed to their logic.
5. milestone-prune is simple leaf work.
6. Add crash recovery check at init.

**Files to create/edit:**

- `src/skills/general/milestone-complete.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No Skill() calls remain

### Task 5.2: Update pre-step-milestone-complete.ts for Agent() names

**Type:** auto
**TDD:** false
**Depends on:** 5.1
**Scope:** S

```typescript
subSkills: new Set(["milestone-learn", "milestone-prune", "milestone-shadow", "milestone-archive", "milestone-finalize"]),
validStates: {
  "milestone-learn": new Set(["idle"]),
  "milestone-prune": new Set(["learned"]),
  "milestone-shadow": new Set(["pruned"]),
  "milestone-archive": new Set(["scanned"]),
  "milestone-finalize": new Set(["archived"]),
},
```

**Files to create/edit:**

- `src/hooks/scripts/pre-step-milestone-complete.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

### Task 5.3: Remove 5 milestone sub-skill source files

**Type:** auto
**TDD:** false
**Depends on:** 5.1, 5.2
**Scope:** S

Delete:

- `src/skills/general/milestone-learn.skill.ts`
- `src/skills/general/milestone-prune.skill.ts`
- `src/skills/general/milestone-shadow-gate.skill.ts`
- `src/skills/general/milestone-archive.skill.ts`
- `src/skills/general/milestone-finalize.skill.ts`

Remove imports and registry entries from `src/skills/__helpers/build-skill-registry.ts`.

**Files to create/edit:**

- Delete 5 files listed above
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

### Wave 5 Verification

- `bunx --bun tsc --noEmit` passes
- User must run `bun run build:all` manually, then `bun run check:drift`
- 5 sub-skill directories removed from `.claude/skills/`

---

## Wave 6: Migrate phase-execute Orchestrator

**Goal:** Migrate phase-execute (standalone mode). Replace 3 Skill() calls with Agent() calls. Hoist the harness fix loop and verify fix loop from phase-execute-verify to the orchestrator. Handle parallel code reviewers.

### Task 6.1: Rewrite phase-execute.skill.ts to use Agent()

**Type:** auto
**TDD:** false
**Depends on:** Wave 5
**Scope:** L

Rewrite `src/skills/general/phase-execute.skill.ts` for standalone `/phase-execute` invocation:

1. Replace `Skill(skill: "phase-execute-waves")` with `Agent(name: "execute-waves", prompt: EXECUTE_WAVES_PROMPT({...}))`.
2. **Hoist harness fix loop** from phase-execute-verify:
   ```
   FOR attempt = 1 to HARNESS_FIX_ITERATIONS:
     Agent(name: "harness", prompt: HARNESS_CHECK_PROMPT({...}))
     IF passed: BREAK
     Agent(name: "fix", prompt: HARNESS_FIX_PROMPT({errors}))
   ```
3. Replace `Skill(skill: "phase-execute-verify")` goal-backward verification with `Agent(name: "verify", prompt: GOAL_VERIFY_PROMPT({...}))`.
4. Replace `Skill(skill: "phase-execute-review")` with **parallel** reviewer Agent() calls:
   ```
   Agent(name: "review-arch", prompt: CODE_REVIEW_PROMPT("architecture", {...}))
   Agent(name: "review-dx", prompt: CODE_REVIEW_PROMPT("dx-advocate", {...}))
   Agent(name: "review-security", prompt: CODE_REVIEW_PROMPT("security", {...}))
   Agent(name: "review-simplify", prompt: CODE_REVIEW_PROMPT("simplifier", {...}))
   ```
5. Learning capture via `Agent(name: "learn", prompt: LEARNING_CAPTURE_PROMPT({...}))`.
6. Process data (conditional) via `Agent(name: "process-data", prompt: PROCESS_DATA_PROMPT({...}))`.
7. UAT stays INLINE (interactive user decision).
8. Bridge transitions hoisted: all `luca-bridge transition` calls move to orchestrator.
9. Add crash recovery check at init.
10. Capture phase start commit (`git rev-parse HEAD`) before any Agent() calls.

**Files to create/edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No Skill() calls remain
- Harness fix loop is inline in orchestrator
- UAT stays inline
- Parallel reviewers use separate Agent() calls

### Task 6.2: Update pre-step-phase-execute.ts for Agent() names

**Type:** auto
**TDD:** false
**Depends on:** 6.1
**Scope:** S

Update to use `agentPrefixes` for phase-suffixed names (standalone mode uses non-suffixed, but keep prefix support for when lu calls these same steps with suffixes):

```typescript
const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-phase-execute",
  contextPath: "/tmp/phase-execute-context.json",
  subSkills: new Set([
    "execute-waves",
    "harness",
    "fix",
    "verify",
    "learn",
    "process-data",
  ]),
  agentPrefixes: new Set(["review-"]), // matches review-arch, review-dx, etc.
  validStates: {
    "execute-waves": new Set(["setup"]),
    harness: new Set(["executed"]),
    fix: new Set(["executed"]),
    verify: new Set(["verified"]),
    "review-": new Set(["verified"]),
    learn: new Set(["reviewed"]),
    "process-data": new Set(["reviewed", "learned"]),
  },
});
```

**Files to create/edit:**

- `src/hooks/scripts/pre-step-phase-execute.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

### Task 6.3: Update phase-pipeline.ts handler reference

**Type:** auto
**TDD:** false
**Depends on:** 6.1
**Scope:** S

Update `src/workflow/__helpers/phase-pipeline.ts` handler reference from `"phase-execute"` to the updated step name if needed. Check if the handler field references sub-skill names and update accordingly.

**Files to create/edit:**

- `src/workflow/__helpers/phase-pipeline.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

### Task 6.4: Remove 3 phase-execute sub-skill source files

**Type:** auto
**TDD:** false
**Depends on:** 6.1, 6.2, 6.3
**Scope:** S

Delete:

- `src/skills/general/phase-execute-waves.skill.ts`
- `src/skills/general/phase-execute-verify.skill.ts`
- `src/skills/general/phase-execute-review.skill.ts`

Remove imports and registry entries from `src/skills/__helpers/build-skill-registry.ts`.

**Files to create/edit:**

- Delete 3 files listed above
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

### Wave 6 Verification

- `bunx --bun tsc --noEmit` passes
- User must run `bun run build:all` manually, then `bun run check:drift`
- 3 sub-skill directories removed from `.claude/skills/`
- **Functional validation:** User runs `/phase-execute {phase_number}` on a real phase to verify standalone pipeline works

---

## Wave 7: Migrate lu Orchestrator (Highest Risk)

**Goal:** Migrate the lu orchestrator -- the most complex change. Inline lu-phase-loop logic (708 lines), add the full phase execution loop with all Agent() calls, handle routing branches, gap closure retry, milestone completion, and loop counter recovery. Target the compiled SKILL.md under 8K tokens (~600 lines).

### Task 7.1: Rewrite lu.skill.ts to inline full pipeline

**Type:** auto
**TDD:** false
**Depends on:** Wave 6
**Scope:** L (largest task in the plan)

Rewrite `src/skills/luca/lu.skill.ts` to implement the full End-to-End Pipeline from architecture.md (Steps 1-15):

**Steps 1-3 (INLINE):** Parse args, load git context, initialize context file. Add crash recovery: check if context file exists with state != idle, offer resume.

**Step 4 (AGENT):** `Agent(name: "cognition", prompt: COGNITION_PROMPT({...}))`

**Step 5 (AGENT):** `Agent(name: "classify", prompt: CLASSIFY_PROMPT({...}))` -> parse route + complexity from result.

**Step 6 (INLINE):** Route branch. If route != "phase-execute":

- 6a: `Agent(name: "{route}-handler", prompt: ROUTE_HANDLER_PROMPT(route, {...}))`
- 6b-6c: Conditional verify + learn agents
- 6d: Commit, write complete, RETURN

**Step 7 (AGENT):** `Agent(name: "configure", prompt: CONFIGURE_PROMPT({...}))` -> bridge START + PREFLIGHT_COMPLETE

**Step 8 (AGENT):** `Agent(name: "backlog", prompt: BACKLOG_PROMPT({...}))` (conditional --skip-backlog). Swarm/TeamCreate DEFERRED.

**Step 9 (INLINE):** Build phase execution order from ROADMAP.md.

**Step 10 (FOR loop):** The phase execution loop. Per iteration:

- 10a: Phase dependency check (INLINE)
- 10b: Oversight gate -- if not full-auto, prompt user (INLINE, interactive)
- 10c: `Agent(name: "classify-{NN}", ...)` (per-phase re-classify)
- 10d: Gate resolution (INLINE) -- premortem + process_data via luca-bridge
- 10e: `Agent(name: "discuss-{NN}", ...)` (conditional)
- 10f: Plan existence check (INLINE)
- 10g: `Agent(name: "plan-{NN}", ...)`
- 10h: `Agent(name: "execute-{NN}", ...)`
- 10i: Harness fix loop (INLINE loop, 2 Agent() calls per iteration)
- 10j: `Agent(name: "verify-{NN}", ...)`
- 10k: Parallel reviewers (conditional on complexity >= MODERATE)
- 10l: `Agent(name: "learn-{NN}", ...)`
- 10m: `Agent(name: "process-data-{NN}", ...)` (conditional)
- 10n: Commit (INLINE)
- 10o: Update state, write loop counter + remaining phases to context file (loop counter recovery per RISK-A5)
- 10p: Gap closure retry loop (INLINE)
- 10q: Park-and-continue (INLINE)

**Step 11:** Milestone boundary check + 5 milestone Agent() calls (conditional).

**Step 12:** Cross-milestone loop.

**Steps 13-15:** Gap detection audit, session summary/cleanup, write complete.

**CRITICAL for token budget:** The lu.skill.ts source file will be large, but the COMPILED SKILL.md must stay under ~8K tokens (~600 lines). Follow this structure specification:

**Source file target:** ~400 lines of section content. The compiled SKILL.md will be larger due to frontmatter and formatting.

**What stays in the SKILL.md body (the orchestrator flow):**

- Step sequencing: which Agent() to call, in what order, with what conditions
- Inline logic: loop control, gate resolution, state writes, commit commands
- Agent() calls with concise descriptions: `Agent(name: "execute-{NN}", prompt: "Read PLAN.md for phase {NN}. Execute all tasks. Return STATUS/RESULT.")` — one-liner summaries, NOT full prompt content

**What moves to `@file` references (loaded lazily by the LLM):**

- `src/skills/luca/lu-reference-tables.md` — complexity matrix, routing table, oversight gate descriptions
- `src/skills/__helpers/agent-prompts.ts` — full Agent() prompt templates (the LLM reads this file when it needs to construct a prompt)
- Crash recovery pattern documentation
- MuninnDB memory protocol details (reference muninndb-context-pattern.md)

**How prompt templates connect to compiled SKILL.md:**
The compiled SKILL.md instructs the LLM: "Read `src/skills/__helpers/agent-prompts.ts` and call the appropriate template function (e.g., `EXECUTE_WAVES_PROMPT`) with the current parameters." The LLM uses the Read tool to load the template at runtime, not at compile time. This keeps the SKILL.md small while giving the LLM access to full prompt content.

**Compression checklist (verify before marking Task 7.1 complete):**

- [ ] No Agent() prompt in SKILL.md exceeds 2 lines (summary only, full content in template module)
- [ ] No reference table is inlined (moved to lu-reference-tables.md)
- [ ] No MuninnDB protocol details are inlined (reference the doc)
- [ ] Source section content is under 400 lines
- [ ] Each step in the FOR loop is 3-5 lines max (condition + Agent call + state write)

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No Skill() calls remain in lu.skill.ts
- All routing branches preserved (7+ routes)
- Phase loop includes: dependency check, oversight gate, re-classify, discuss, plan, execute, harness fix loop, verify, review, learn, process data, commit, gap closure
- Loop counter recovery: iteration index + remaining phases written to context file after each loop
- Crash recovery: check existing context file at init

### Task 7.2: Update pre-step-lu.ts for Agent() names

**Type:** auto
**TDD:** false
**Depends on:** 7.1
**Scope:** M

Update `src/hooks/scripts/pre-step-lu.ts` to use `agentPrefixes` for the phase-suffixed agents in lu:

```typescript
const hook = createSubSkillEnforcementHook({
  hookName: "pre-step-lu",
  contextPath: "/tmp/lu-context.json",
  subSkills: new Set([
    "cognition",
    "configure",
    "backlog",
    "milestone-learn",
    "milestone-prune",
    "milestone-shadow",
    "milestone-archive",
    "milestone-finalize",
  ]),
  agentPrefixes: new Set([
    "classify-",
    "discuss-",
    "plan-",
    "plan-gaps-",
    "execute-",
    "execute-gaps-",
    "harness-",
    "fix-",
    "verify-",
    "review-",
    "learn-",
    "process-data-",
  ]),
  validStates: {
    cognition: new Set(["idle"]),
    "classify-": new Set(["idle", "preflight_complete"]),
    configure: new Set(["routed"]),
    backlog: new Set(["configured"]),
    "discuss-": new Set(["scanned", "configured"]),
    "plan-": new Set(["scanned", "configured", "discussed"]),
    "execute-": new Set(["planned"]),
    "harness-": new Set(["executed"]),
    "fix-": new Set(["executed"]),
    "verify-": new Set(["verified"]),
    "review-": new Set(["verified"]),
    "learn-": new Set(["reviewed", "verified"]),
    "process-data-": new Set(["reviewed", "learned"]),
    "milestone-learn": new Set(["executing"]),
    "milestone-prune": new Set(["learned"]),
    "milestone-shadow": new Set(["pruned"]),
    "milestone-archive": new Set(["scanned"]),
    "milestone-finalize": new Set(["archived"]),
  },
  initialSkill: "cognition",
});
```

**Files to create/edit:**

- `src/hooks/scripts/pre-step-lu.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All phase-suffixed agents covered by prefix matching
- All singleton agents covered by exact matching

### Task 7.3: Remove 4 lu sub-skill source files

**Type:** auto
**TDD:** false
**Depends on:** 7.1, 7.2
**Scope:** S

Delete:

- `src/skills/luca/lu-route.skill.ts`
- `src/skills/luca/lu-configure.skill.ts`
- `src/skills/luca/lu-backlog.skill.ts`
- `src/skills/luca/lu-phase-loop.skill.ts`

Remove imports and registry entries from `src/skills/__helpers/build-skill-registry.ts`.

**Files to create/edit:**

- Delete 4 files listed above
- `src/skills/__helpers/build-skill-registry.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No lu sub-skill imports or registry entries remain

### Task 7.4: Measure and optimize lu SKILL.md token budget

**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 7.1, 7.3
**Scope:** M

After the user runs `bun run build:all`:

1. Measure the compiled `.claude/skills/lu/SKILL.md` size in lines and approximate tokens (lines \* 4).
2. If over 8K tokens (~2000 lines), apply these optimizations:
   - Move reference tables (complexity matrix, routing table) to separate `@file` references
   - Compress Agent() prompt descriptions to single-line summaries
   - Remove redundant instructions that the shared template module already contains
   - Consider splitting into a main SKILL.md + companion reference files
3. Re-measure after optimizations.
4. Document final token count.

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (optimization edits)
- Possibly new reference files in `src/skills/luca/` for extracted content

**Verification:**

- Compiled SKILL.md under 8K tokens (or documented reason for exceeding + mitigation)
- User confirms the compiled output is readable and coherent

### Wave 7 Verification

- `bunx --bun tsc --noEmit` passes
- User must run `bun run build:all` manually, then `bun run check:drift`
- 4 lu sub-skill directories removed from `.claude/skills/`
- Compiled lu SKILL.md measured and under 8K tokens
- **Functional validation:** User runs `/lu "Execute Phase {N}"` to verify the full pipeline works end-to-end

---

## Wave 8: Infrastructure Cleanup + Final Verification

**Goal:** Clean up remaining infrastructure: update contract-hook-adapter, verify all DAGs, confirm skill registry is clean, update documentation. Run full type-check. Measure final file counts.

### Task 8.1: Update contract-hook-adapter.ts for Agent step names

**Type:** auto
**TDD:** false
**Depends on:** Wave 7
**Scope:** S

Review `src/workflow/__helpers/contract-hook-adapter.ts` for any step name references that matched sub-skill names. Update to Agent step names. If the adapter uses a mapping from step IDs to contract names, ensure the new Agent names are mapped correctly.

**Files to create/edit:**

- `src/workflow/__helpers/contract-hook-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes

### Task 8.2: Verify skill registry is clean

**Type:** auto
**TDD:** false
**Depends on:** Wave 7
**Scope:** S

Audit `src/skills/__helpers/build-skill-registry.ts` to confirm:

- All 22 sub-skill imports are removed
- All 22 sub-skill registry entries are removed
- The 5 orchestrator entries remain
- No dangling imports to deleted files

**Files to create/edit:**

- `src/skills/__helpers/build-skill-registry.ts` (if corrections needed)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Registry has exactly 22 fewer entries than before migration

### Task 8.3: Update generated template directory

**Type:** auto
**TDD:** false
**Depends on:** 8.2
**Scope:** S

Verify that `packages/luca-framework/templates/harness/claude/skills/` no longer contains directories for the 22 deleted sub-skills after `bun run build:all`. If the build pipeline does not automatically clean up deleted skills, manually remove the template directories.

**Files to create/edit:**

- Possibly delete directories under `packages/luca-framework/templates/harness/claude/skills/`

**Verification:**

- No template directories exist for deleted sub-skills
- `bun run check:drift` passes

### Task 8.4: Final type-check and documentation

**Type:** auto
**TDD:** false
**Depends on:** 8.1, 8.2, 8.3
**Scope:** M

1. Run `bunx --bun tsc --noEmit` on the entire project.
2. Update `docs/skill-to-agent-migration/architecture.md` with a "Migration Status" section marking the migration as complete.
3. Update `docs/skill-to-agent-migration/` index table to reflect completed status.
4. Update `.planning/ROADMAP.md` to mark Phase 232 as complete.
5. Document the final file count: source files changed, deleted, created.

**Files to create/edit:**

- `docs/skill-to-agent-migration/architecture.md`
- `.planning/ROADMAP.md`

**Verification:**

- `bunx --bun tsc --noEmit` passes clean
- All documentation updated

### Wave 8 Verification

- `bunx --bun tsc --noEmit` passes for entire project
- `bun run check:drift` passes after final `bun run build:all`
- All 22 sub-skill directories removed from `.claude/skills/`
- All 5 orchestrators use Agent() calls exclusively
- Documentation updated

---

## Verification

### Per-Wave Verification (between waves)

Each wave ends with:

1. `bunx --bun tsc --noEmit` passes
2. User runs `bun run build:all` manually (NEVER during Claude Code session)
3. `bun run check:drift` passes
4. For orchestrator migration waves: functional validation by running the migrated orchestrator on real work

### Overall Verification

1. **Zero Skill() calls in orchestrators:** Grep all 5 orchestrator source files for `Skill(` -- zero matches.
2. **22 sub-skill source files deleted:** Verify with `git diff --stat` against pre-migration.
3. **Hook infrastructure updated:** All 6 pre-step hooks accept `"Skill|Agent"` in tool_filter.
4. **Enforcement factory supports prefix matching:** `agentPrefixes` parameter works for dynamic agent names.
5. **Compiled output clean:** `bun run check:drift` passes.
6. **Token budget met:** lu SKILL.md under 8K tokens.
7. **End-to-end functional:** `/lu`, `/phase-execute`, `/pr-address`, `/verify`, `/milestone-complete` all work.

## Success Criteria

1. All 5 orchestrators use Agent() instead of Skill() for sub-agent delegation
2. All 22 sub-skill source files are deleted
3. Enforcement hooks fire for both Skill() and Agent() tool calls
4. Shared prompt template module contains all ~30 Agent() prompts
5. Compiled lu SKILL.md is under 8K tokens
6. No TypeScript compilation errors (`bunx --bun tsc --noEmit` clean)
7. `bun run check:drift` passes after final rebuild
8. At least one functional validation per migrated orchestrator

## Output Specification

### Files Created

- `src/skills/__helpers/agent-prompts.ts` -- shared prompt template module (~30 templates)
- `src/skills/__schemas/agent-output.schemas.ts` -- output contract schemas + parser
- `docs/skill-to-agent-migration/phase-0-validation.md` -- Phase 0 test prompts

### Files Modified (5 orchestrators)

- `src/skills/luca/lu.skill.ts` -- full pipeline inline
- `src/skills/general/phase-execute.skill.ts` -- standalone Agent() orchestration
- `src/skills/general/pr-address.skill.ts` -- Agent() orchestration
- `src/skills/general/milestone-complete.skill.ts` -- Agent() orchestration
- `src/skills/general/verify.skill.ts` -- Agent() orchestration

### Files Modified (infrastructure)

- `src/hooks/__helpers/enforcement-hook-factory.ts` -- Agent() support + prefix matching
- `src/hooks/__helpers/hook-registry.ts` -- tool_filter updates
- `src/hooks/scripts/pre-step-enforcement.ts` -- Agent() support
- `src/hooks/scripts/pre-step-pr-address.ts` -- Agent names
- `src/hooks/scripts/pre-step-verify.ts` -- Agent names
- `src/hooks/scripts/pre-step-milestone-complete.ts` -- Agent names
- `src/hooks/scripts/pre-step-phase-execute.ts` -- Agent names + prefix matching
- `src/hooks/scripts/pre-step-lu.ts` -- Agent names + prefix matching
- `src/skills/__helpers/build-skill-registry.ts` -- 22 entries removed
- `src/workflow/__helpers/pr-address-dag.ts` -- handler names
- `src/workflow/__helpers/phase-pipeline.ts` -- handler names
- `src/workflow/__helpers/contract-hook-adapter.ts` -- step names

### Files Deleted (22 sub-skills)

- `src/skills/luca/lu-route.skill.ts`
- `src/skills/luca/lu-configure.skill.ts`
- `src/skills/luca/lu-backlog.skill.ts`
- `src/skills/luca/lu-phase-loop.skill.ts`
- `src/skills/general/pr-fetch.skill.ts`
- `src/skills/general/pr-validate.skill.ts`
- `src/skills/general/pr-debate.skill.ts`
- `src/skills/general/pr-fix.skill.ts`
- `src/skills/general/pr-learn.skill.ts`
- `src/skills/general/pr-respond.skill.ts`
- `src/skills/general/verify-extract.skill.ts`
- `src/skills/general/verify-test.skill.ts`
- `src/skills/general/verify-diagnose.skill.ts`
- `src/skills/general/verify-review.skill.ts`
- `src/skills/general/phase-execute-waves.skill.ts`
- `src/skills/general/phase-execute-verify.skill.ts`
- `src/skills/general/phase-execute-review.skill.ts`
- `src/skills/general/milestone-learn.skill.ts`
- `src/skills/general/milestone-prune.skill.ts`
- `src/skills/general/milestone-shadow-gate.skill.ts`
- `src/skills/general/milestone-archive.skill.ts`
- `src/skills/general/milestone-finalize.skill.ts`

### Rollback

Each wave's changes can be rolled back independently via:

```bash
git revert <wave-commit-hash>
bun run build:all  # user runs manually
bun run check:drift
```

Hook infrastructure changes (Wave 1) are additive and backward-compatible -- they work with both Skill() and Agent(). Never roll back Wave 1 independently while later waves are deployed.
