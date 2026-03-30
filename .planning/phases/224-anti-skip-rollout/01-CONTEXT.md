# Phase 224 — Anti-Skip Rollout: Context

## Phase Goal

Apply the validated 5-layer anti-skip architecture (from pr-address pilot in Phase 223) to remaining high-risk skills: milestone-complete, lu, verify, phase-execute.

## Decisions

### 1. Rollout Ordering [researched]

**Decision:** milestone-complete first, then verify, then phase-execute, then lu.

**Rationale:**

- milestone-complete (~800 lines, 9 steps) — smallest blast radius, good second validation
- verify (~800 lines, 12 steps) — similar size, independent skill
- phase-execute (~29K tokens) — large but has existing state machine support to extend
- lu (~19K tokens) — LARGEST blast radius, benefits from lessons learned on other 3

This ordering goes from smallest-to-largest blast radius, letting us validate the rollout pattern on simpler skills before tackling the complex ones.

### 2. Decomposition Follows Todo Spec [user-input]

**Decision:** Follow the exact decomposition laid out in the todo `anti-skip-rollout-remaining-skills.md`.

The todo specifies:

- milestone-complete → 5 sub-skills (learn, prune, shadow-gate, archive, finalize)
- lu → 4 sub-skills (route, configure, backlog, phase-loop)
- verify → 4 sub-skills (extract, test, diagnose, review)
- phase-execute → extend existing state machine, decompose wave/review/verify loops

### 3. Template Sync Strategy [researched]

**Decision:** Create skills in `src/skills/` as TypeScript source, then regenerate `.claude/skills/` and template dirs via `bun run build:all` (run by user between sessions per MEMORY.md constraint).

The generated-file-guard rule prohibits editing `.claude/` directly. All skill definitions live in `src/skills/` and compile to output directories.

### 4. Hook Pattern: Per-Orchestrator Enforcement [researched]

**Decision:** One pre-step hook per orchestrator skill (not per sub-skill). Following the pr-address pilot pattern:

- `pre-step-milestone-complete.ts` — enforces milestone-complete sub-skill ordering
- `pre-step-lu.ts` — enforces lu sub-skill ordering
- `pre-step-verify.ts` — enforces verify sub-skill ordering
- `pre-step-phase-execute.ts` — enforces phase-execute sub-skill ordering

Each hook reads a context file (like `/tmp/{skill}-context.json`) to determine current state and validates the next sub-skill call is allowed.

### 5. Context File Protocol [researched]

**Decision:** Each orchestrator gets its own context file following the pr-address pattern:

- `/tmp/milestone-complete-context.json`
- `/tmp/lu-context.json`
- `/tmp/verify-context.json`
- `/tmp/phase-execute-context.json`

Each context file has a Zod schema in `src/skills/__schemas/` defining the sections each sub-skill reads/writes, plus a `current_state` field for hook enforcement.

### 6. State Machine Definitions [researched]

**Decision:** Each skill gets a dedicated state machine definition (not shared). State machines are defined per the todo:

- milestone-complete: IDLE → LEARNED → PRUNED → SCANNED → ARCHIVED → FINALIZED
- lu: IDLE → ROUTED → CONFIGURED → SCANNED → EXECUTING → COMPLETE
- verify: IDLE → EXTRACTED → TESTED → DIAGNOSED → REVIEWED
- phase-execute: Extend existing transitions (already has some state machine support)

### 7. build:all Constraint [user-input]

**Decision:** Per MEMORY.md, `bun run build:all` crashes Claude Code sessions. All source changes go into `src/`. The user runs `bun run build:all` manually between sessions to regenerate `.claude/`, `.cursor/`, `.pi/` outputs. The executor must NOT run build:all.

## Scope Guardrails

- This phase ONLY covers the 4 skills listed above
- No new enforcement infrastructure (that was Phase 222)
- No changes to the pr-address pilot (that was Phase 223)
- Any new capabilities discovered during rollout → note for future phase

## Deferred Ideas

(none yet)
