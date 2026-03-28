# Phase 224: Anti-Skip Rollout - Research

**Researched:** 2026-03-28
**Domain:** Skill decomposition, state machine enforcement, hook registry
**Confidence:** HIGH

## Summary

This research investigates how to roll out the anti-skip enforcement architecture (validated in the pr-address pilot, Phase 223) to four additional skills: milestone-complete, verify, phase-execute, and lu. The pilot established a clear 5-layer pattern that can be replicated mechanically.

The primary finding is that the pilot pattern is highly systematic and each new skill rollout requires exactly the same set of artifacts: (1) a state machine definition in `src/skills/__schemas/states/`, (2) a context schema in `src/skills/__schemas/`, (3) sub-skill source files in `src/skills/general/` (or `src/skills/luca/` for lu), (4) a refactored thin orchestrator replacing the current monolith, (5) a pre-step enforcement hook in `src/hooks/scripts/`, (6) a hook registry entry in `canonicalHookRegistry`, and (7) registry entries in `build-skill-registry.ts`.

**Primary recommendation:** Follow the exact pilot pattern for each skill. The biggest risk is not the pattern itself but the volume of files -- 4 skills x ~7 artifacts each = ~28 new/modified files. Execute in the order: milestone-complete, verify, lu, phase-execute (matching CONTEXT.md Decision #1, except verify before lu since verify is simpler and independent).

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library      | Version       | Purpose                            | Why Standard                                    |
| ------------ | ------------- | ---------------------------------- | ----------------------------------------------- |
| XState       | v5            | State machine definitions          | Already used by createSkillStateMachine factory |
| Zod          | (project dep) | Context schema validation          | Already used by all existing schemas            |
| lodash/merge | (project dep) | Deep merge for context file writes | Already used by pr-address context helpers      |

### Supporting

| Library              | Version  | Purpose                  | When to Use                          |
| -------------------- | -------- | ------------------------ | ------------------------------------ |
| Bun.file / Bun.write | built-in | Context file I/O         | Read/write /tmp/{skill}-context.json |
| node:fs readFileSync | built-in | Sync file reads in hooks | Pre-step hooks must be synchronous   |

### Alternatives Considered

| Instead of            | Could Use                | Tradeoff                                                                                |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| /tmp/ context files   | luca-bridge state fields | /tmp is simpler, no bridge dependency; bridge adds typed persistence but extra coupling |
| Per-skill Zod schemas | Shared generic schema    | Per-skill gives type safety for each sub-skill chain; shared would lose specificity     |

**Installation:**
No new dependencies needed. All libraries are already in the project.

## Architecture Patterns

### Recommended Project Structure

For each decomposed skill (using milestone-complete as example):

```
src/
├── skills/
│   ├── __schemas/
│   │   ├── states/
│   │   │   ├── pr-address.states.ts          # (existing pilot)
│   │   │   ├── milestone-complete.states.ts   # NEW
│   │   │   ├── verify.states.ts               # NEW
│   │   │   ├── lu.states.ts                   # NEW
│   │   │   └── phase-execute.states.ts        # NEW
│   │   ├── pr-address-context.schemas.ts      # (existing pilot)
│   │   ├── milestone-complete-context.schemas.ts  # NEW
│   │   ├── verify-context.schemas.ts              # NEW
│   │   ├── lu-context.schemas.ts                  # NEW
│   │   └── phase-execute-context.schemas.ts       # NEW
│   ├── general/
│   │   ├── milestone-complete.skill.ts    # MODIFY (thin orchestrator)
│   │   ├── milestone-learn.skill.ts       # NEW sub-skill
│   │   ├── milestone-prune.skill.ts       # NEW sub-skill
│   │   ├── milestone-shadow-gate.skill.ts # NEW sub-skill
│   │   ├── milestone-archive.skill.ts     # NEW sub-skill
│   │   ├── milestone-finalize.skill.ts    # NEW sub-skill
│   │   ├── verify.skill.ts               # MODIFY (thin orchestrator)
│   │   ├── verify-extract.skill.ts        # NEW sub-skill
│   │   ├── verify-test.skill.ts           # NEW sub-skill
│   │   ├── verify-diagnose.skill.ts       # NEW sub-skill
│   │   ├── verify-review.skill.ts         # NEW sub-skill
│   │   ├── phase-execute.skill.ts         # MODIFY (thin orchestrator)
│   │   └── (phase-execute sub-skills TBD) # NEW sub-skills
│   ├── luca/
│   │   ├── lu.skill.ts                    # MODIFY (thin orchestrator)
│   │   ├── lu-route.skill.ts              # NEW sub-skill
│   │   ├── lu-configure.skill.ts          # NEW sub-skill
│   │   ├── lu-backlog.skill.ts            # NEW sub-skill
│   │   └── lu-phase-loop.skill.ts         # NEW sub-skill
│   └── __helpers/
│       └── build-skill-registry.ts        # MODIFY (add all new sub-skills)
├── hooks/
│   ├── scripts/
│   │   ├── pre-step-pr-address.ts             # (existing pilot)
│   │   ├── pre-step-milestone-complete.ts     # NEW
│   │   ├── pre-step-verify.ts                 # NEW
│   │   ├── pre-step-lu.ts                     # NEW
│   │   └── pre-step-phase-execute.ts          # NEW
│   └── __helpers/
│       └── hook-registry.ts                   # MODIFY (add 4 new hook entries)
```

### Pattern 1: Thin Orchestrator (from pr-address pilot)

**What:** The parent skill becomes a pure orchestrator containing ONLY Skill() calls, context reads, and state transitions. All business logic moves to sub-skills.

**When to use:** Every decomposed skill follows this pattern.

**Example (from pilot):**

```typescript
// pr-address.skill.ts orchestrator pattern:
// 1. Parse args, initialize context file
// 2. Skill("pr-fetch", "{pr_number}")     -- on success: FETCH_COMPLETE
// 3. Skill("pr-validate", "{pr_number}")  -- on success: CATEGORIZE_COMPLETE, VALIDATE_COMPLETE
// 4. Read context, check split_verdicts
// 5. Skill("pr-debate") or SKIP_DEBATE    -- conditional
// 6. Skill("pr-fix", "{pr_number}")       -- on success: FIX_COMPLETE, VERIFY_COMPLETE
// 7. Read context, check valid_concerns
// 8. Skill("pr-learn") or SKIP_LEARN      -- conditional
// 9. Skill("pr-respond", "{pr_number}")   -- on success: RESPOND_COMPLETE, PUSH_COMPLETE
```

Zero inline logic constraint: no gh commands, no Task() spawns, no template parsing, no data processing.

### Pattern 2: State Machine Definition (from pilot)

**What:** Each skill gets a dedicated XState v5 state machine created via `createSkillStateMachine` factory.

**Key elements:**

- Zod context schema for machine context (minimal -- only what orchestrator needs for decisions)
- ABORT transition from every non-terminal state to `failed`
- Explicit SKIP events for optional steps (fail-closed: orchestrator MUST send skip or complete, never silently omit)
- Terminal states: one success state + `failed`

**Example:**

```typescript
// Source: src/skills/__schemas/states/pr-address.states.ts
export const prAddressStateMachine = createSkillStateMachine({
  id: "pr-address",
  contextSchema: PrAddressMachineContextSchema,
  initial: "idle",
  states: {
    idle: { on: { FETCH_COMPLETE: "fetched", ...ABORT_TRANSITION } },
    // ... more states ...
    pushed: { type: "final" as const },
    failed: { type: "final" as const },
  },
});
```

### Pattern 3: Context Schema with Read/Write Helpers

**What:** A Zod schema defining the shared context file structure, plus `readXxxContext()` and `writeXxxContext()` async helpers.

**Key elements:**

- `context_version: z.literal(1)` required field (PREMORTEM Constraint #1 from pilot)
- Each sub-skill's output is an optional section (populated incrementally)
- `readXxxContext()` returns safeParse result; callers MUST check `.success`
- `writeXxxContext(patch)` deep-merges via lodash/merge
- `current_state` field is written by orchestrator but NOT in the Zod schema (runtime-only, read by hook)
- Context file path exported as constant: `/tmp/{skill}-context.json`

### Pattern 4: Pre-Step Enforcement Hook

**What:** A TypeScript hook script that fires before Skill tool invocations, validates the state machine state allows the requested sub-skill.

**Key elements:**

- Only acts on `tool_name === "Skill"` (ignores all other tools)
- Uses `guardPreStep()` with 200ms TTL for dedup (PREMORTEM Constraint #2)
- Maps sub-skill names to valid state sets
- Reads `current_state` from context file
- Calls `exitBlock()` if state is invalid, `exitSuccess()` if valid
- Falls open for unrecognized skills (not part of this chain)

### Pattern 5: Hook Registry Entry

**What:** Each enforcement hook gets a single entry in `canonicalHookRegistry`.

**Template:**

```typescript
"pre-step-{skill-name}": () => ({
  event: "pre_tool_use",
  tool_filter: "Skill",
  script: "pre-step-{skill-name}.ts",
  timeout: 5,
  async: false,
  status_message: "Validating {skill-name} step order...",
}),
```

### Pattern 6: Skill Registry Registration

**What:** Each new sub-skill must be imported and registered in `build-skill-registry.ts`.

**Template:**

```typescript
import { milestoneLearnSkill } from "../general/milestone-learn.skill";
// ... in skillRegistry:
"milestone-learn": () => milestoneLearnSkill,
```

### Anti-Patterns to Avoid

- **Inline logic in orchestrator:** The orchestrator must not contain `gh api` calls, Task() spawns, data processing, or file reads beyond context file checks.
- **Implicit skip:** Every state transition must be explicit -- either a COMPLETE event, a SKIP event, or an ABORT. The LLM must never silently omit a sub-skill call.
- **current_state in Zod schema:** The `current_state` field is runtime-only, written by the orchestrator for hook consumption. It must NOT be in the Zod schema because it would create a circular dependency between schema validation and state tracking.
- **Shared state machine across skills:** Each skill gets its own machine. Sharing would create coupling between independent workflows.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                | Don't Build                 | Use Instead                                                 | Why                                                  |
| ---------------------- | --------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| State machine creation | Custom state tracking       | `createSkillStateMachine()` from `~/workflow`               | Handles XState v5 setup, Zod validation, deep freeze |
| Context file I/O       | Manual JSON.parse/stringify | `readXxxContext()` / `writeXxxContext()` pattern from pilot | Handles merge, version check, error handling         |
| Hook dedup             | Custom timestamp logic      | `guardPreStep()` from hook-io.ts                            | Already handles 200ms TTL, project scoping           |
| Hook stdin parsing     | Manual stdin read           | `readStdinJson()` from hook-io.ts                           | Handles empty/malformed stdin gracefully             |
| Block/allow decisions  | Custom exit codes           | `exitBlock()` / `exitSuccess()` from hook-io.ts             | Correct exit codes and payload format                |

**Key insight:** The entire enforcement infrastructure was built in Phase 222. Phase 224 only creates instances of existing patterns -- no new infrastructure needed.

## Common Pitfalls

### Pitfall 1: Forgetting to Write current_state to Context File

**What goes wrong:** The pre-step hook reads `current_state` from the context file, but it is not part of the Zod schema. If the orchestrator forgets to write it, the hook defaults to "idle" and blocks all non-initial sub-skills.
**Why it happens:** The Zod schema does not enforce this field, so TypeScript will not catch the omission.
**How to avoid:** In each orchestrator's skill spec, explicitly document that after each state transition event, the orchestrator must call `writeXxxContext({ current_state: "{new_state}" })`.
**Warning signs:** Sub-skills after the first one are consistently blocked by the hook.

### Pitfall 2: Hook Registry Entry Without Script File

**What goes wrong:** Adding the hook to `canonicalHookRegistry` without creating the corresponding `.ts` file in `src/hooks/scripts/` causes build errors or silent enforcement gaps.
**Why it happens:** The registry and scripts are in different directories; easy to add one and forget the other.
**How to avoid:** Always create the script file first, then add the registry entry. The plan should pair these as a single task.
**Warning signs:** `bun run build:all` fails with missing file errors.

### Pitfall 3: Sub-Skill Not Registered in build-skill-registry.ts

**What goes wrong:** Sub-skill source file exists but is never compiled to `.claude/skills/{name}/SKILL.md` because it is not in the registry.
**Why it happens:** The registry is a separate file from the skill source; easy to create the skill and forget the registry entry.
**How to avoid:** The plan should include registry updates as part of each sub-skill creation task.
**Warning signs:** `Skill("sub-skill-name")` fails with "unknown skill" at runtime.

### Pitfall 4: Orchestrator Still Contains Inline Logic

**What goes wrong:** The orchestrator still has `gh api` calls, Task() spawns, or data processing that should be in sub-skills, violating the zero-inline-logic constraint.
**Why it happens:** When refactoring a monolith, it is tempting to leave "small" pieces in the orchestrator.
**How to avoid:** Review each orchestrator against the constraint: ONLY Skill() calls + context reads + state transitions + arg parsing.
**Warning signs:** The orchestrator SKILL.md is longer than ~200 lines of actual instructions.

### Pitfall 5: build:all Crash During Session

**What goes wrong:** Running `bun run build:all` during a Claude Code session crashes the process (documented in MEMORY.md).
**Why it happens:** The build pipeline conflicts with the running Claude Code session.
**How to avoid:** All source changes go into `src/`. User runs `build:all` manually between sessions. The executor must NEVER run `bun run build:all`.
**Warning signs:** Claude Code session terminates unexpectedly.

### Pitfall 6: Phase-Execute Already Has Bridge Transitions

**What goes wrong:** phase-execute already uses `luca-bridge transition` with events like `VERIFY_PASSED`, `LEARN_COMPLETE`, `COMMIT_COMPLETE`, `PROCESS_DATA_COMPLETE`. Adding a new state machine that conflicts with existing bridge transitions causes double state tracking.
**Why it happens:** phase-execute is the only target skill with pre-existing state machine integration.
**How to avoid:** The phase-execute state machine must be designed to EXTEND the existing bridge transitions, not replace them. Map existing events to the new machine states.
**Warning signs:** State machine state and bridge state diverge.

## Code Examples

### State Machine Definition Template (for new skills)

```typescript
// Source: pattern from src/skills/__schemas/states/pr-address.states.ts
import { z } from "zod";
import { createSkillStateMachine } from "~/workflow/__helpers/skill-state-machine";

const ContextSchema = z.object({
  // Minimal context for orchestrator decisions
});

const ABORT_TRANSITION = { ABORT: "failed" } as const;

export const milestoneCompleteStateMachine = createSkillStateMachine({
  id: "milestone-complete",
  contextSchema: ContextSchema,
  initial: "idle",
  states: {
    idle: { on: { LEARN_COMPLETE: "learned", ...ABORT_TRANSITION } },
    learned: { on: { PRUNE_COMPLETE: "pruned", ...ABORT_TRANSITION } },
    pruned: {
      on: {
        SCAN_COMPLETE: "scanned",
        SKIP_SCAN: "scanned",
        ...ABORT_TRANSITION,
      },
    },
    scanned: { on: { ARCHIVE_COMPLETE: "archived", ...ABORT_TRANSITION } },
    archived: { on: { FINALIZE_COMPLETE: "finalized", ...ABORT_TRANSITION } },
    finalized: { type: "final" as const },
    failed: { type: "final" as const },
  },
});
```

### Context Schema Template

```typescript
// Source: pattern from src/skills/__schemas/pr-address-context.schemas.ts
import { z } from "zod";
import merge from "lodash/merge";

export const MilestoneLearnOutputSchema = z.object({
  learnings_extracted: z.boolean().default(false),
  // ... sub-skill specific fields
});

export const MilestoneCompleteContextSchema = z.object({
  context_version: z.literal(1),
  milestone_learn: MilestoneLearnOutputSchema.optional(),
  // ... more sub-skill sections
});

export const MILESTONE_COMPLETE_CONTEXT_PATH =
  "/tmp/milestone-complete-context.json";

export async function readMilestoneCompleteContext() {
  /* same pattern as readPrContext */
}
export async function writeMilestoneCompleteContext(patch) {
  /* same pattern as writePrContext */
}
```

### Pre-Step Hook Template

```typescript
// Source: pattern from src/hooks/scripts/pre-step-pr-address.ts
import { readFileSync } from "fs";
import {
  readStdinJson,
  exitSuccess,
  exitBlock,
  guardPreStep,
} from "../__helpers/hook-io.ts";

const CONTEXT_PATH = "/tmp/milestone-complete-context.json";
const SUB_SKILLS = new Set([
  "milestone-learn",
  "milestone-prune",
  "milestone-shadow-gate",
  "milestone-archive",
  "milestone-finalize",
]);
const VALID_STATES_FOR_SKILL: Record<string, ReadonlySet<string>> = {
  "milestone-learn": new Set(["idle"]),
  "milestone-prune": new Set(["learned"]),
  "milestone-shadow-gate": new Set(["pruned"]),
  "milestone-archive": new Set(["scanned"]),
  "milestone-finalize": new Set(["archived"]),
};

const stdinData = await readStdinJson();
const toolName = (stdinData?.tool_name as string) || "unknown";
if (toolName !== "Skill") {
  exitSuccess();
}
guardPreStep("pre-step-milestone-complete", toolName);

// ... same main() pattern as pr-address hook
```

## Per-Skill Decomposition Analysis

### Skill 1: milestone-complete

**Current size:** ~650 lines of skill content, 9+ logical steps
**Decomposition:** 5 sub-skills

| Sub-Skill             | Steps Extracted                           | State After | Notes                                                      |
| --------------------- | ----------------------------------------- | ----------- | ---------------------------------------------------------- |
| milestone-learn       | Step 0 (learning extraction)              | learned     | MuninnDB recall + lu-learner spawn                         |
| milestone-prune       | Step 0.5 (stale memory detection)         | pruned      | MuninnDB recall + interactive prune + consolidate          |
| milestone-shadow-gate | Step 0.7 (shadow debt scan)               | scanned     | Spawns lu-shadow-scanner; optional (SKIP_SCAN if disabled) |
| milestone-archive     | Steps 1-7.5 (archive + stats + retro)     | archived    | Bulk of workflow: archive, stats, retro, github milestone  |
| milestone-finalize    | Steps 8-9 (commit + tag + divergent mode) | finalized   | Git tag, commit, divergent mode advisory                   |

**State machine:** IDLE -> LEARNED -> PRUNED -> SCANNED -> ARCHIVED -> FINALIZED (+ failed)
**Context file:** `/tmp/milestone-complete-context.json`
**Conditional paths:** SKIP_SCAN (shadow debt disabled)

**milestone-archive is large** (~300 lines). It could theoretically be further decomposed but the CONTEXT.md Decision #2 says to follow the todo spec exactly, so we keep it as one sub-skill. The planner may note this as a future decomposition candidate.

### Skill 2: verify

**Current size:** ~380 lines of skill content, 12 steps
**Decomposition:** 4 sub-skills

| Sub-Skill       | Steps Extracted                                                 | State After | Notes                                                               |
| --------------- | --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| verify-extract  | Steps 1-4 (find summaries, extract deliverables, create UAT.md) | extracted   | File reads + UAT template creation                                  |
| verify-test     | Step 5-7 (present tests, collect results, update UAT.md)        | tested      | Interactive: one test at a time                                     |
| verify-diagnose | Step 8 (spawn debuggers, planner, plan-checker)                 | diagnosed   | Parallel Task() spawns for lu-debugger, lu-planner, lu-plan-checker |
| verify-review   | Steps 9-12 (code review swarm)                                  | reviewed    | Parallel Task() spawns for all reviewers                            |

**State machine:** IDLE -> EXTRACTED -> TESTED -> DIAGNOSED -> REVIEWED (+ failed)
**Context file:** `/tmp/verify-context.json`
**Conditional paths:** SKIP_DIAGNOSE (all tests passed -> go straight to review); SKIP_REVIEW (if UAT failed -> no code review)

**Important:** verify-diagnose only runs if UAT issues are found. verify-review only runs if UAT passes. The state machine needs conditional paths for both outcomes:

- tested -> SKIP_DIAGNOSE -> reviewed (UAT passed, go to review)
- tested -> DIAGNOSE_COMPLETE -> diagnosed -> SKIP_REVIEW -> reviewed (UAT failed, skip review)
- Actually more accurately: tested with issues -> DIAGNOSE_COMPLETE -> diagnosed (terminal for this run -- fixes planned, next step is phase-execute --gaps-only)
- tested without issues -> SKIP_DIAGNOSE -> reviewed (review runs, then finalize)

Revised state machine:

```
IDLE -> EXTRACTED -> TESTED ->
  (issues) -> DIAGNOSED -> (terminal, ready for --gaps-only)
  (no issues) -> REVIEWED -> (terminal, phase verified)
```

### Skill 3: lu

**Current size:** ~19,000 tokens, 11+ steps, 8 sections
**Decomposition:** 4 sub-skills

| Sub-Skill     | Steps Extracted                                                  | State After           | Notes                                                     |
| ------------- | ---------------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| lu-route      | Steps 0-3 (parse request, git context, cognition, classify)      | routed                | Includes arg parsing, lu-router spawn, lu-cognition spawn |
| lu-configure  | Step 0 config section (read config, apply overrides, pre-flight) | configured            | Config extraction, override merging                       |
| lu-backlog    | Backlog scan + roadmap revision sections                         | scanned               | MuninnDB todos scan, WSJF scoring, swarm or --no-swarm    |
| lu-phase-loop | Phase loop + milestone gate + summary sections                   | executing -> complete | The core execution loop                                   |

**State machine:** IDLE -> ROUTED -> CONFIGURED -> SCANNED -> EXECUTING -> COMPLETE (+ failed)
**Context file:** `/tmp/lu-context.json`
**Conditional paths:** SKIP_BACKLOG (--skip-backlog flag), SKIP_COGNITION (--skip-memory flag)

**lu is the most complex decomposition.** The phase-loop sub-skill itself is very large (~500+ lines of instructions). However, per CONTEXT.md Decision #2, we follow the todo spec's decomposition. The lu-phase-loop sub-skill will be the largest sub-skill by far, but it is internally well-structured (serial execution path + parallel execution path).

**Note on lu sub-skills directory:** lu is in `src/skills/luca/`, not `src/skills/general/`. Its sub-skills should also go in `src/skills/luca/`.

### Skill 4: phase-execute

**Current size:** ~29,000 tokens, largest skill in the system
**Decomposition:** Extend existing state machine; decompose wave/review/verify loops

**Existing bridge transitions already in phase-execute:**

- `VERIFY_PASSED` (line 2251)
- `LEARN_COMPLETE` (line 297)
- `PROCESS_DATA_COMPLETE` (line 289)
- `COMMIT_COMPLETE` (line 2349)

**This is the trickiest skill** because it already partially integrates with the bridge state machine. The todo spec says "extend existing transitions" rather than full decomposition.

**Recommended sub-skill boundaries (informed by codebase analysis):**

The phase-execute skill has these major phases:

1. Setup (Steps 0-0.6: model routing, phase start commit, GitHub tracking, procedure replay)
2. Wave Execution (Steps 1-4: validate, discover plans, group by wave, execute waves)
3. Verification Loops (Steps 5-7: Loop A harness fix, Loop B verify fix)
4. Code Review (Step 8: reviewer swarm)
5. Learning Capture (Step 9+: lu-learner, process data)

The todo says to decompose "wave execution, code review, and verification loops." This suggests 3 sub-skills:

- `phase-execute-waves.skill.ts` (Steps 1-4: discover, group, execute waves)
- `phase-execute-verify.skill.ts` (Steps 5-7: harness + verify fix loops)
- `phase-execute-review.skill.ts` (Step 8: code review swarm)

Setup (Steps 0-0.6) and learning capture (Step 9+) remain in the orchestrator or become additional sub-skills. The orchestrator handles setup because it is arg-parsing/config, and learning capture because it is post-execution.

**State machine extension:** Must be compatible with existing bridge events.

## State of the Art

| Old Approach                            | Current Approach                                     | When Changed                           | Impact                                        |
| --------------------------------------- | ---------------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| Monolithic skills with all logic inline | Thin orchestrator + sub-skill chain                  | Phase 222-223 (anti-skip architecture) | Each skill step is independently enforceable  |
| No state tracking for skill execution   | XState v5 state machines per skill                   | Phase 222 (infrastructure)             | Formal state transitions prevent silent skips |
| No enforcement hooks                    | Pre-step hooks validate state before sub-skill calls | Phase 222-223                          | Hook blocks out-of-order execution            |
| Ad-hoc context passing via args         | Shared context files with Zod schemas                | Phase 223 (pilot)                      | Type-safe data flow between sub-skills        |

**Deprecated/outdated:**

- Direct editing of `.claude/` files is forbidden (generated-file-guard rule)
- Running `bun run build:all` during Claude Code session is forbidden (crashes)

## Open Questions

1. **phase-execute sub-skill granularity**
   - What we know: The todo spec says "decompose wave execution, code review, and verification loops"
   - What's unclear: Whether setup (Steps 0-0.6) should be a sub-skill or remain in orchestrator
   - Recommendation: Keep setup in orchestrator (it is arg parsing/config), decompose the 3 major loops as sub-skills, keep learning capture in orchestrator (it is post-execution wrap-up)

2. **verify conditional flow complexity**
   - What we know: verify has two divergent paths after testing (issues found vs. all passed)
   - What's unclear: Whether diagnosed should be terminal or should flow into review
   - Recommendation: Make diagnosed terminal for the "issues found" path (user runs `--gaps-only` next). Make reviewed terminal for the "all passed" path. Two distinct success terminals.

3. **lu-phase-loop size**
   - What we know: lu-phase-loop will contain ~500+ lines of instructions including both serial and parallel execution paths
   - What's unclear: Whether this violates the spirit of decomposition
   - Recommendation: Follow todo spec as-is (CONTEXT.md Decision #2). The phase-loop is internally well-structured with labeled steps. Further decomposition can be a future phase.

## File Manifest

### Files to CREATE (new)

**milestone-complete decomposition (8 files):**

1. `src/skills/__schemas/states/milestone-complete.states.ts` -- state machine
2. `src/skills/__schemas/milestone-complete-context.schemas.ts` -- context schema + helpers
3. `src/skills/general/milestone-learn.skill.ts` -- sub-skill
4. `src/skills/general/milestone-prune.skill.ts` -- sub-skill
5. `src/skills/general/milestone-shadow-gate.skill.ts` -- sub-skill
6. `src/skills/general/milestone-archive.skill.ts` -- sub-skill
7. `src/skills/general/milestone-finalize.skill.ts` -- sub-skill
8. `src/hooks/scripts/pre-step-milestone-complete.ts` -- enforcement hook

**verify decomposition (7 files):** 9. `src/skills/__schemas/states/verify.states.ts` -- state machine 10. `src/skills/__schemas/verify-context.schemas.ts` -- context schema + helpers 11. `src/skills/general/verify-extract.skill.ts` -- sub-skill 12. `src/skills/general/verify-test.skill.ts` -- sub-skill 13. `src/skills/general/verify-diagnose.skill.ts` -- sub-skill 14. `src/skills/general/verify-review.skill.ts` -- sub-skill 15. `src/hooks/scripts/pre-step-verify.ts` -- enforcement hook

**lu decomposition (7 files):** 16. `src/skills/__schemas/states/lu.states.ts` -- state machine 17. `src/skills/__schemas/lu-context.schemas.ts` -- context schema + helpers 18. `src/skills/luca/lu-route.skill.ts` -- sub-skill 19. `src/skills/luca/lu-configure.skill.ts` -- sub-skill 20. `src/skills/luca/lu-backlog.skill.ts` -- sub-skill 21. `src/skills/luca/lu-phase-loop.skill.ts` -- sub-skill 22. `src/hooks/scripts/pre-step-lu.ts` -- enforcement hook

**phase-execute decomposition (6 files):** 23. `src/skills/__schemas/states/phase-execute.states.ts` -- state machine 24. `src/skills/__schemas/phase-execute-context.schemas.ts` -- context schema + helpers 25. `src/skills/general/phase-execute-waves.skill.ts` -- sub-skill (wave execution) 26. `src/skills/general/phase-execute-verify.skill.ts` -- sub-skill (verification loops) 27. `src/skills/general/phase-execute-review.skill.ts` -- sub-skill (code review) 28. `src/hooks/scripts/pre-step-phase-execute.ts` -- enforcement hook

### Files to MODIFY (existing)

29. `src/skills/general/milestone-complete.skill.ts` -- refactor to thin orchestrator
30. `src/skills/general/verify.skill.ts` -- refactor to thin orchestrator
31. `src/skills/luca/lu.skill.ts` -- refactor to thin orchestrator
32. `src/skills/general/phase-execute.skill.ts` -- refactor to thin orchestrator
33. `src/skills/__helpers/build-skill-registry.ts` -- add all 16 new sub-skill imports + entries
34. `src/hooks/__helpers/hook-registry.ts` -- add 4 new hook entries to canonicalHookRegistry

**Total: 28 new files + 6 modified files = 34 file touches**

## Sources

### Primary (HIGH confidence)

- `src/hooks/scripts/pre-step-pr-address.ts` -- pilot enforcement hook (read directly)
- `src/skills/__schemas/pr-address-context.schemas.ts` -- pilot context schema (read directly)
- `src/skills/__schemas/states/pr-address.states.ts` -- pilot state machine (read directly)
- `src/skills/general/pr-address.skill.ts` -- pilot thin orchestrator (read directly)
- `src/skills/general/pr-fetch.skill.ts` -- pilot sub-skill pattern (read directly)
- `src/hooks/__helpers/hook-registry.ts` -- hook registry pattern (read directly)
- `src/hooks/__helpers/hook-io.ts` -- hook I/O utilities (read directly)
- `src/workflow/__helpers/skill-state-machine.ts` -- state machine factory (read directly)
- `src/skills/__helpers/build-skill-registry.ts` -- skill registry (read directly)
- `src/skills/__helpers/create-skill.ts` -- skill factory (read directly)

### Secondary (MEDIUM confidence)

- `src/skills/general/milestone-complete.skill.ts` -- current monolith (read directly, step boundaries analyzed)
- `src/skills/general/verify.skill.ts` -- current monolith (read directly, step boundaries analyzed)
- `src/skills/luca/lu.skill.ts` -- current monolith (partially read, step boundaries grep-analyzed)
- `src/skills/general/phase-execute.skill.ts` -- current monolith (partially read, bridge transitions grep-analyzed)

### Tertiary (LOW confidence)

- phase-execute sub-skill boundary decisions -- based on grep analysis of a 29K-token file, not full read

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all patterns are verified from pilot implementation
- Architecture: HIGH -- exact pilot pattern to replicate; per-skill decomposition verified against source
- Pitfalls: HIGH -- derived from pilot experience + codebase constraints documented in MEMORY.md
- phase-execute decomposition: MEDIUM -- largest skill, partial read only; sub-skill boundaries may need adjustment

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (30 days -- stable pattern, no fast-moving dependencies)
