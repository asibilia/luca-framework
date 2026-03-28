---
phase: 223
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 223 Plan 1: Schemas + Sub-Skills + Context File Infrastructure

## Objective

Decompose the monolithic pr-address skill (~815 lines) into 6 atomic sub-skills with a shared context file schema, laying the foundation for the state machine orchestrator in Wave 2.

> Appetite: Large (200,000 tokens remaining of 200,000 ceiling)

## Context

@src/skills/general/pr-address.skill.ts
@src/skills/**schemas/skill.schemas.ts
@src/skills/**helpers/create-skill.ts
@src/workflow/**helpers/skill-state-machine.ts
@src/workflow/**schemas/workflow.schemas.ts
@.planning/phases/223-anti-skip-pilot/01-CONTEXT.md
@.planning/phases/223-anti-skip-pilot/01-PREMORTEM.md

## Tasks

### 1. Create PrAddressContext Schema

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/pr-address-context.schemas.ts` with the shared context file schema that all sub-skills read/write.

**Schema requirements (from CONTEXT.md Decision #1):**

- `PrAddressContextSchema` — the top-level union containing all sub-skill output sections as optional fields
- `context_version: z.literal(1)` — **PREMORTEM Constraint #1**: must be present, failed safeParse = ABORT
- `PrFetchOutputSchema` — pr_number, repo, comments (review + issue), reviews, diff
- `PrValidateOutputSchema` — valid_concerns array, disputed_concerns array, informational array, split_verdicts array
- `PrDebateOutputSchema` — debate_results array (split verdict outcomes, deferred_to_human flags)
- `PrFixOutputSchema` — fix_tracking array (comment_id, commit_hash, files_modified, verified)
- `PrLearnOutputSchema` — learnings_captured array (concept names stored in MuninnDB)
- `PrRespondOutputSchema` — responses_posted array, summary_posted boolean, pushed boolean

Each sub-schema should be exported independently for per-sub-skill imports. Use snake_case for all schema field names per API conventions.

**Helpers to include in the same file:**

- `readPrContext()` — reads `/tmp/pr-address-context.json`, returns `safeParse` result. Failed parse returns `{ success: false }` (sub-skill treats as ABORT per PREMORTEM Constraint #1).
- `writePrContext(patch)` — reads current file, merges patch via lodash `merge`, writes back. Creates file if missing with `context_version: 1`.

**Files to create:**

- `src/skills/__schemas/pr-address-context.schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `PrAddressContextSchema`, all sub-schemas, `readPrContext`, `writePrContext`
- `context_version: z.literal(1)` is present in `PrAddressContextSchema`

### 2. Create pr-address state definitions

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/skills/__schemas/states/pr-address.states.ts` with the state machine definition for the pr-address orchestrator using the `createSkillStateMachine` factory from Phase 222.

**State machine spec (from CONTEXT.md Decision #2):**

States (11): `idle`, `fetched`, `categorized`, `validated`, `debated`, `planned`, `fixed`, `verified`, `learned`, `responded`, `pushed`

Plus terminal `failed` state.

Events (SCREAMING_SNAKE_CASE):

| Event               | From                                 | To          |
| ------------------- | ------------------------------------ | ----------- |
| FETCH_COMPLETE      | idle                                 | fetched     |
| CATEGORIZE_COMPLETE | fetched                              | categorized |
| VALIDATE_COMPLETE   | categorized                          | validated   |
| SKIP_DEBATE         | validated                            | planned     |
| DEBATE_COMPLETE     | validated                            | debated     |
| PLAN_COMPLETE       | debated, validated (via SKIP_DEBATE) | planned     |
| FIX_COMPLETE        | planned                              | fixed       |
| VERIFY_COMPLETE     | fixed                                | verified    |
| SKIP_LEARN          | verified                             | responded   |
| LEARN_COMPLETE      | verified                             | learned     |
| RESPOND_COMPLETE    | learned, verified (via SKIP_LEARN)   | responded   |
| PUSH_COMPLETE       | responded                            | pushed      |
| ABORT               | any non-terminal                     | failed      |

Context schema for the machine: `{ pr_number: z.number(), split_verdicts: z.array(z.any()).default([]), valid_concerns: z.array(z.any()).default([]) }`

**PREMORTEM Constraint #2:** SKIP_DEBATE and SKIP_LEARN are explicit events decided by the orchestrator, not guards. This ensures fail-closed semantics.

**Files to create:**

- `src/skills/__schemas/states/` directory
- `src/skills/__schemas/states/pr-address.states.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `prAddressStateMachine` created via `createSkillStateMachine`
- Machine has 12 states (11 + failed) and all events listed above
- SKIP_DEBATE transitions from `validated` to `planned`
- SKIP_LEARN transitions from `verified` to `responded`
- ABORT is available from all non-terminal states

### 3. Create pr-fetch sub-skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/skills/general/pr-fetch.skill.ts` — extracts Steps 0-1 from pr-address.

**Responsibility:** Resolve PR context and fetch all comment types from GitHub.

**Prompt content must include:**

- Resolve PR number from args or current branch (`gh pr view`)
- Fetch review comments (`gh api /repos/{repo}/pulls/{pr}/comments`)
- Fetch issue comments (`gh api /repos/{repo}/issues/{pr}/comments`)
- Fetch reviews (`gh api /repos/{repo}/pulls/{pr}/reviews`)
- Fetch PR diff (`gh pr diff`)
- Filter actionable comments (exclude bot, resolved, non-actionable)
- Write results to `/tmp/pr-address-context.json` via `writePrContext()`

**Input:** PR number or URL (from Skill() args)
**Output:** Populated `pr_fetch` section in context file

**Files to create:**

- `src/skills/general/pr-fetch.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `prFetchSkill` via `createSkill`
- Skill prompt references context file read/write pattern
- No Task() spawns (this is a leaf skill, not an orchestrator)

### 4. Create pr-validate sub-skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/skills/general/pr-validate.skill.ts` — extracts Steps 2-3-4 from pr-address.

**Responsibility:** Categorize comments, spawn reviewer agents in parallel, aggregate validation results.

**Prompt content must include:**

- Read context file for fetched comments
- Categorize each comment by concern type (security, architecture, performance, code quality, accessibility, testing, general)
- Spawn reviewer agents in PARALLEL via Task() for each category (security-auditor, code-architect, performance-auditor, dx-advocate, ux, lu-pr-reviewer)
- Collect YAML validation results from all reviewers
- Aggregate into valid_concerns, disputed_concerns, informational arrays
- Detect split verdicts (tie or narrow majority)
- Write results to context file via `writePrContext()`

**Input:** Fetched comments from context file
**Output:** Populated `pr_validate` section in context file, including `split_verdicts`

**Files to create:**

- `src/skills/general/pr-validate.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `prValidateSkill` via `createSkill`
- Skill prompt spawns reviewer agents via Task() (this IS an orchestrating sub-skill)
- Prompt includes split verdict detection logic

### 5. Create pr-debate sub-skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/skills/general/pr-debate.skill.ts` — extracts Step 4.5 from pr-address.

**Responsibility:** Handle split verdict debates when validators disagree.

**Prompt content must include:**

- Read context file for split_verdicts from pr-validate
- For each split verdict: spawn dissenter agent, then spawn majority response agent
- Use `buildDissenterPrompt()` and `buildMajorityResponsePrompt()` helpers from `src/skills/__helpers/pr-verdict-debate.ts`
- Use `buildSplitVerdictResult()` and `formatSplitVerdictForPR()` for output
- Write debate results to context file
- This sub-skill is OPTIONAL (PREMORTEM Constraint #2)

**Input:** Split verdicts from context file
**Output:** Populated `pr_debate` section in context file

**Files to create:**

- `src/skills/general/pr-debate.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `prDebateSkill` via `createSkill`
- Prompt references pr-verdict-debate helpers

### 6. Create pr-fix sub-skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/skills/general/pr-fix.skill.ts` — extracts Steps 5-6-7 from pr-address.

**Responsibility:** Plan fixes, execute them, and verify they address concerns.

**Prompt content must include:**

- Read context file for valid_concerns
- Spawn lu-planner to create fix plan for valid concerns
- Spawn lu-executor to implement fixes with atomic commits
- Spawn lu-verifier to confirm fixes address original concerns
- Track fix results: comment_id, commit_hash, files_modified, verified status
- Write results to context file via `writePrContext()`

**Input:** Valid concerns from context file
**Output:** Populated `pr_fix` section in context file

**Files to create:**

- `src/skills/general/pr-fix.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `prFixSkill` via `createSkill`
- Prompt spawns lu-planner, lu-executor, lu-verifier via Task()

### 7. Create pr-learn sub-skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/skills/general/pr-learn.skill.ts` — extracts Step 7.5 from pr-address.

**Responsibility:** Capture PR review patterns as MuninnDB pitfall engrams.

**Prompt content must include:**

- Read context file for all categorized concerns and verification results
- Spawn lu-learner to extract pitfalls from PR review feedback
- Write pitfalls to DEFAULT_VAULT (cross-cutting) via `muninn_remember`
- Link new engrams to related existing memories via `muninn_link`
- Write learning summary to context file
- This sub-skill is OPTIONAL (PREMORTEM Constraint #2)

**Input:** Categorized concerns + verification results from context file
**Output:** Populated `pr_learn` section in context file

**Files to create:**

- `src/skills/general/pr-learn.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `prLearnSkill` via `createSkill`
- Prompt references MuninnDB vault routing (DEFAULT_VAULT for pitfalls)

### 8. Create pr-respond sub-skill

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/skills/general/pr-respond.skill.ts` — extracts Steps 8-9 from pr-address.

**Responsibility:** Post responses to PR comments and push changes.

**Prompt content must include:**

- Read context file for fix tracking, debate results, disputed concerns
- Post responses to addressed comments via `gh api` (reply to review comments)
- Post responses to disputed concerns
- Include split verdict information for deferred-to-human items
- Push all fixes via `git push`
- Post summary comment on PR via `gh pr comment`
- Write response tracking to context file

**Input:** Fix tracking + debate results from context file
**Output:** Populated `pr_respond` section in context file, changes pushed

**Files to create:**

- `src/skills/general/pr-respond.skill.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File exports `prRespondSkill` via `createSkill`
- Prompt includes `gh api` calls for comment replies and `gh pr comment` for summary
- Prompt includes `git push`

### 9. Update skills barrel export

**Type:** auto
**TDD:** false
**Depends on:** 3, 4, 5, 6, 7, 8

Ensure all new sub-skills are registered in the skill barrel/registry so the build system picks them up.

Check how existing skills are registered (examine the skills index.ts or registry pattern) and add the 6 new sub-skills following the same pattern.

**Files to edit:**

- `src/skills/index.ts` (or wherever the skill registry lives)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 6 sub-skills are importable from the skills barrel

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. All 9 files exist at their specified paths
3. `PrAddressContextSchema` includes `context_version: z.literal(1)`
4. State machine has 12 states, all events match CONTEXT.md Decision #2
5. Each sub-skill maps cleanly to its source steps from the original pr-address
6. No sub-skill contains logic from another sub-skill's responsibility boundary

## Success Criteria

- 6 atomic sub-skills created, each with focused responsibility
- Shared context file schema with version field and read/write helpers
- State machine definition with explicit SKIP events for conditional steps
- All files typecheck cleanly
- Original pr-address.skill.ts is NOT modified (it will be replaced in Wave 2)

## Output Specification

- `src/skills/__schemas/pr-address-context.schemas.ts` — context file schema + helpers
- `src/skills/__schemas/states/pr-address.states.ts` — state machine definition
- `src/skills/general/pr-fetch.skill.ts` — sub-skill for Steps 0-1
- `src/skills/general/pr-validate.skill.ts` — sub-skill for Steps 2-3-4
- `src/skills/general/pr-debate.skill.ts` — sub-skill for Step 4.5
- `src/skills/general/pr-fix.skill.ts` — sub-skill for Steps 5-6-7
- `src/skills/general/pr-learn.skill.ts` — sub-skill for Step 7.5
- `src/skills/general/pr-respond.skill.ts` — sub-skill for Steps 8-9
- Skills barrel updated with new exports
