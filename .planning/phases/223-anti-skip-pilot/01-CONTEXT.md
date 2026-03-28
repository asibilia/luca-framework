# Phase 223: Anti-Skip Pilot — Context

## Phase Goal

Decompose pr-address into atomic sub-skill chains and apply all 5 enforcement layers end-to-end as proof of concept.

## Decisions

### 1. Inter-Skill Context Passing [researched]

**Decision:** Use a JSON file at a well-known path as the shared context store. Each sub-skill reads, extends, and writes back. The orchestrator passes only the PR number and flags via Skill() args.

**Path:** `/tmp/pr-address-context.json` (session-ephemeral, matching existing pr-address `/tmp/` patterns)

**Schema:** Create `src/skills/__schemas/pr-address-context.schemas.ts` with:

- `PrFetchOutputSchema` — PR number, repo, comments, reviews, diff
- `PrValidateOutputSchema` — valid concerns, disputed, informational
- `PrDebateOutputSchema` — split verdict results, deferred to human
- `PrFixOutputSchema` — fix tracking (comment ID, commit hash, files)
- `PrAddressContextSchema` — union of all above as optional fields

Each sub-skill calls `PrAddressContextSchema.safeParse()` on read, extends its section, writes back.

**Constraints:**

- Skill() args carry only identifiers and flags, never structured data
- Bridge is for workflow state, not business-domain payloads
- MuninnDB is for persistent learnings, not deterministic handoffs

### 2. State Machine Transition Design [researched]

**Decision:** Use explicit SKIP events (fail-closed) for conditional steps, following the workflow machine's established pattern from `packages/luca-framework/src/state/machine.ts`.

**States (11):**

```
IDLE → FETCHED → CATEGORIZED → VALIDATED → DEBATED → PLANNED → FIXED → VERIFIED → LEARNED → RESPONDED → PUSHED
```

**Events (SCREAMING_SNAKE_CASE):**

```
FETCH_COMPLETE       → FETCHED
CATEGORIZE_COMPLETE  → CATEGORIZED
VALIDATE_COMPLETE    → VALIDATED
SKIP_DEBATE          → PLANNED (no split verdicts — fail-closed skip)
DEBATE_COMPLETE      → DEBATED → implicit to PLANNED
PLAN_COMPLETE        → PLANNED
FIX_COMPLETE         → FIXED
VERIFY_COMPLETE      → VERIFIED
SKIP_LEARN           → RESPONDED (no comments — fail-closed skip)
LEARN_COMPLETE       → LEARNED
RESPOND_COMPLETE     → RESPONDED
PUSH_COMPLETE        → PUSHED (final)
ABORT                → failed (final, any state)
```

**Conditional steps use explicit SKIP events, not guards:**

- VALIDATED → SKIP_DEBATE (orchestrator decides, not machine)
- VERIFIED → SKIP_LEARN (orchestrator decides, not machine)
- This follows gate-enforcement rule: fail-closed semantics

**Constraints:**

- Use `createSkillStateMachine` factory from Phase 222 (`src/workflow/__helpers/skill-state-machine.ts`)
- State definition file: `src/skills/__schemas/states/pr-address.states.ts`
- Context schema includes: `split_verdicts`, `valid_concerns`, `pr_number`

### 3. Orchestrator Error Handling [researched]

**Decision:** Per-sub-skill policy using the `optional` field from `WorkflowStepSchema` (Phase 222). Critical sub-skills halt on failure; optional sub-skills record failure as `guard-exception` skip and continue.

**Criticality map:**
| Sub-skill | Step | optional | On failure |
|-------------|---------|----------|-----------------------------------------|
| pr-fetch | 0-1 | false | HALT — no data to work with |
| pr-validate | 2-3-4 | false | HALT — no verdicts to act on |
| pr-debate | 4.5 | true | SKIP — use majority verdict, log warning |
| pr-fix | 5-6-7 | false | HALT — fixes are the core deliverable |
| pr-learn | 7.5 | true | SKIP — log warning, don't block PR |
| pr-respond | 8-9 | false | HALT — must respond to PR |

**Recording:** Optional step failures use `SkipReason: "guard-exception"` in `SkippedStepEntrySchema`. The gap detector sees a ledger entry (not a gap) with severity=WARNING.

**Constraints:**

- Anti-skip goal: prevent silent omission, not prevent optional failures
- Required steps that fail → ABORT event → terminal failed state
- Optional steps that fail → skip entry recorded → continue to next state

## Decomposition Map

| Sub-skill   | Source Steps | Lines (est.) | Responsibility                          |
| ----------- | ------------ | ------------ | --------------------------------------- |
| pr-fetch    | 0, 1         | ~100         | Resolve PR, fetch comments/reviews/diff |
| pr-validate | 2, 3, 4      | ~150         | Categorize, spawn reviewers, aggregate  |
| pr-debate   | 4.5          | ~100         | Split verdict handling (conditional)    |
| pr-fix      | 5, 6, 7      | ~150         | Plan fixes, execute, verify             |
| pr-learn    | 7.5          | ~80          | Spawn lu-learner, MuninnDB capture      |
| pr-respond  | 8, 9         | ~120         | Post comments, push, summary            |

## Scope Boundary

This phase decomposes ONLY pr-address. Other skills (milestone-complete, lu, verify, phase-execute) are Phase 224. The thin orchestrator pattern established here will be the template for Phase 224.
