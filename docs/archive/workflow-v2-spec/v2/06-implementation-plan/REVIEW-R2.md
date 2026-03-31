# Review Round 2: 06-implementation-plan

## Reviewer: Implementation Feasibility Reviewer (Round 2)

## Date: 2026-03-23

## Iteration: 2

## Summary Assessment

Round 1 identified three critical issues (CRIT-IP-001 camelCase, CRIT-IP-002 skill registry, CRIT-IP-003 build:all) and several important/minor findings. The revision agent addressed the critical issues effectively but was cut short by a rate limit after 59 tool uses. As a result, several secondary fixes were applied incompletely, leaving residual inconsistencies. The core structural changes are sound, but there are new issues found in this round that need attention before implementation.

---

## Round 1 Fix Verification

### CRIT-IP-001: Config casing (snake_case -> camelCase) -- FIXED

**Status: RESOLVED**

The `ResearchConfigSchema` in `config-changes.md` now uses camelCase throughout: `parallelResearchers`, `reviewLoop`, `planReviewLoop`, `continueForImportant`, `maxIterations`, `scoringThreshold`, `autoCleanupAfterMilestone`, `perTaskRecall`, `maxEngramsPerTask`. The convention note at line 107 explicitly references Decision 9 and explains why camelCase is correct for internal config.

The example JSON blocks (lines 216-237, 464-715) are consistent with the schema definition.

The `CANONICAL-DECISIONS.md` Decision 9 matches exactly.

**Verdict: Fully resolved.**

### CRIT-IP-002: Skill registry (`build-skill-registry.ts`) -- FIXED

**Status: RESOLVED**

`build-skill-registry.ts` now appears in the "Files to Modify" tables for:

- Phase 1 (`phased-rollout.md` line 61): "Import and register enhanced `phase-research` skill (if export name changes)"
- Phase 2 (`phased-rollout.md` line 125): "Import and register `phase-research-review` and `phase-research-expand` skills"
- Phase 3 (`phased-rollout.md` line 185): "Import and register `phase-graduate` skill"
- Phase 4 (`phased-rollout.md` line 248): "Import and register `phase-plan-review` skill"

`README.md` line 47 also includes `build-skill-registry.ts` in the Modified Files table.

**Verdict: Fully resolved.**

### CRIT-IP-003: `bun run build:all` step -- FIXED

**Status: RESOLVED**

Each phase (1 through 6) now has a "Build & Manual Validation" subsection with standardized language:

> "**Build step (required before manual validation):** Run `bun run build:all` **outside** the Claude Code session. Then run `bun run check:drift` to verify generated output matches source."

This appears in:

- Phase 1: line 83-84
- Phase 2: line 146-147
- Phase 3: line 210-211
- Phase 4: line 265-266
- Phase 5: line 328-329
- Phase 6: uses "Manual Validation (End-to-End)" at line 467+

**Verdict: Fully resolved.**

### IMP-IP-001: Config parser (`lu-config.schemas.ts`) -- FIXED

**Status: RESOLVED**

`config-changes.md` now has a Section 7 "Config Parser Updates" (lines 732-751) that explicitly identifies `src/shared/__schemas/lu-config.schemas.ts` as needing modification, with an example integration snippet. It also appears in `README.md` line 49 as a modified file.

**Verdict: Fully resolved.**

### IMP-IP-002: Graduator cognition tier T2 -> T1 -- FIXED

**Status: RESOLVED**

In `new-agents-needed.md` line 751, the graduator config comment explicitly notes: "Cognition T1 to match existing agent conventions (IMP-IP-002: no existing agent uses T2)." The frontmatter at lines 769-776 shows `default_tier: "T1"` and `promotable_to: "T1"` for both cognition and context.

**Verdict: Fully resolved.**

### IMP-IP-003: Phase 5 parallelism note -- FIXED

**Status: RESOLVED**

`phased-rollout.md` Phase 5 now includes a detailed parallelism note at lines 315-316 explaining that full integration testing requires Phase 4 to be complete and that parallel development requires mock data.

**Verdict: Fully resolved.**

### IMP-IP-004: Accuracy reviewer tool clarification -- FIXED

**Status: RESOLVED**

`new-agents-needed.md` lines 615-617 include a clear callout explaining that the accuracy reviewer uses document-based assessment only, no `WebSearch`/`WebFetch`, aligning with cold isolation semantics.

**Verdict: Fully resolved.**

### IMP-IP-005: Count precedence documentation -- FIXED

**Status: RESOLVED**

`config-changes.md` lines 240-247 now include a "Precedence" section with four numbered rules, including the important clarification that researcher/reviewer counts are NOT in the complexity matrix (always 4/3 per Decision 13).

**Verdict: Fully resolved.**

### IMP-IP-006: Compiler verification -- FIXED

**Status: RESOLVED**

`phased-rollout.md` Phase 1 now includes a "Pre-Implementation Check" subsection (lines 69-70): "Verify that `src/compilers/__helpers/compile.ts` handles all frontmatter fields used by new agents."

**Verdict: Fully resolved.**

### MIN-IP-001: `allowed_contexts` field -- FIXED

**Status: RESOLVED**

Verified against actual repo: `AgentFrontmatterSchema` at `/Users/alecsibilia/Github/luca-framework/src/agents/__schemas/agent.schemas.ts` line 89 includes `allowed_contexts: z.array(z.string()).optional()`. The field exists and is valid. No change needed.

**Verdict: No issue (field exists in schema).**

### MIN-IP-002: `--v2` CLI flag parsing location -- FIXED

**Status: RESOLVED**

`migration-from-v1.md` line 57 now clarifies: "The flag is parsed by the orchestrator's prompt logic in `lu.skill.ts` (the skill checks for `--v2` in its arguments string), not by compiled CLI argument parsing."

**Verdict: Fully resolved.**

### MIN-IP-003: `workflow.research` vs `research.*` confusion -- FIXED

**Status: RESOLVED**

`migration-from-v1.md` lines 85-86 now include an explicit callout explaining the orthogonal relationship between `workflow.research` (boolean, v1) and `research.*` (object, v2).

**Verdict: Fully resolved.**

### MIN-IP-005: "or inline" schema location -- FIXED

**Status: RESOLVED**

`README.md` line 37 now says schemas go in `src/shared/__schemas/`, `src/complexity/__schemas/` -- the "or inline" option has been removed.

**Verdict: Fully resolved.**

---

## New Issues Found

### ISSUE-R2-001: Inconsistent research directory paths (CRITICAL)

**Files affected:** `new-skills-needed.md`, `new-agents-needed.md`, `phased-rollout.md`

**Decision 7** mandates the phase-scoped path `.planning/phases/NN-name/research/`. However, multiple locations still reference the non-phase-scoped path `.planning/research/`:

| File                   | Line | Incorrect Path                  | Should Be                                      |
| ---------------------- | ---- | ------------------------------- | ---------------------------------------------- |
| `new-skills-needed.md` | 41   | `.planning/research/`           | `.planning/phases/NN-name/research/`           |
| `new-skills-needed.md` | 88   | `.planning/research/*.md`       | `.planning/phases/NN-name/research/*.md`       |
| `new-skills-needed.md` | 141  | `.planning/research/` directory | `.planning/phases/NN-name/research/`           |
| `new-skills-needed.md` | 259  | `.planning/research/`           | `.planning/phases/NN-name/research/`           |
| `new-agents-needed.md` | 519  | `.planning/research/`           | `.planning/phases/NN-name/research/`           |
| `phased-rollout.md`    | 33   | `.planning/research/` directory | `.planning/phases/NN-name/research/`           |
| `phased-rollout.md`    | 472  | `.planning/research/` populated | `.planning/phases/NN-name/research/` populated |

The correct path IS used in many other locations (e.g., `new-skills-needed.md` lines 60, 75-78, 145, 159, 197, etc.), so this is a partial-fix artifact from the revision agent hitting its rate limit. The inconsistency would confuse implementers about where research files actually go.

**Resolution:** Replace all 7 occurrences of `.planning/research/` with `.planning/phases/NN-name/research/` (or the phase-variable equivalent).

### ISSUE-R2-002: Severity terminology mismatch between reviewer agents and convergence model (IMPORTANT)

**Files affected:** `new-agents-needed.md`, `new-skills-needed.md`

**Decision 3** establishes the gap severity model as **CRITICAL / IMPORTANT / MINOR**. However, the reviewer agent specifications in `new-agents-needed.md` use **CRITICAL / MAJOR / MINOR**:

| File                   | Line | Uses                        | Should Be                       |
| ---------------------- | ---- | --------------------------- | ------------------------------- |
| `new-agents-needed.md` | 545  | `MAJOR`                     | `IMPORTANT`                     |
| `new-agents-needed.md` | 593  | `CRITICAL/MAJOR/MINOR`      | `CRITICAL/IMPORTANT/MINOR`      |
| `new-agents-needed.md` | 659  | `CRITICAL/MAJOR/MINOR`      | `CRITICAL/IMPORTANT/MINOR`      |
| `new-agents-needed.md` | 727  | `CRITICAL/MAJOR/MINOR`      | `CRITICAL/IMPORTANT/MINOR`      |
| `new-skills-needed.md` | 302  | `[MAJOR]`                   | `[IMPORTANT]`                   |
| `new-skills-needed.md` | 311  | `[MAJOR]`                   | `[IMPORTANT]`                   |
| `new-skills-needed.md` | 383  | `CRITICAL, MAJOR, or MINOR` | `CRITICAL, IMPORTANT, or MINOR` |

Meanwhile, `new-skills-needed.md` correctly uses "IMPORTANT" in the convergence logic section (lines 202, 334, 336, 338, 341, 343, 386, 387). This creates a split: the convergence logic says "IMPORTANT" but the reviewer agents that produce findings say "MAJOR". An implementer would have to reconcile these at runtime.

**Resolution:** Replace all instances of "MAJOR" in the reviewer agent specs with "IMPORTANT" to match Decision 3.

### ISSUE-R2-003: Residual snake_case config references in pseudocode (MINOR)

**Files affected:** `phased-rollout.md`, `new-skills-needed.md`

While the Zod schemas and JSON examples correctly use camelCase (per CRIT-IP-001 fix), some pseudocode/prompt references still use snake_case or ambiguous naming:

| File                   | Line | Uses                                   | Should Be                             |
| ---------------------- | ---- | -------------------------------------- | ------------------------------------- |
| `phased-rollout.md`    | 413  | `research.parallel_researchers`        | `research.parallelResearchers`        |
| `phased-rollout.md`    | 417  | `research.review_loop`                 | `research.reviewLoop`                 |
| `phased-rollout.md`    | 431  | `research.plan_review_loop`            | `research.planReviewLoop`             |
| `new-skills-needed.md` | 83   | `research.parallel_researchers: false` | `research.parallelResearchers: false` |

These are in pseudocode sections (not JSON or TypeScript), but they reference config paths that an implementer would need to match against the actual schema. Using the wrong casing in pseudocode could lead to config access bugs.

**Resolution:** Update pseudocode config references to match the camelCase schema keys.

### ISSUE-R2-004: Orchestrator pseudocode step ordering does not match canonical 10-step pipeline (MINOR)

**File:** `phased-rollout.md` lines 408-442

The Phase 6 orchestrator pseudocode shows this v2 flow:

```
Step 2: Research
Step 5: Research Review Loop
Step 6: Graduation
Step 3: Discussion
Step 7: Planning
Step 8: Plan Review Loop
Step 9: Execution
```

Per the canonical pipeline (Decision 1), steps 1-4 are: Ideate, Research, Discuss+Pre-mortem, Deep Expand. The pseudocode skips Step 1 (Ideate), Step 4 (Deep Expand), and Step 10 (Verify+UAT). The comment says "After complexity classification, before discuss" which implies Step 1 happens elsewhere, but the omission of Step 4 and Step 10 from the pseudocode is confusing. Step 4 (Deep Expand) is invoked within the review loop (via `phase-research-expand`), which is correct behavior, but the pseudocode comments label Step 5 (Review) before Step 3 (Discuss), which contradicts the numbered order.

This is a documentation clarity issue, not a logic bug -- the actual pipeline flow is research -> review -> graduate -> discuss -> plan -> plan-review -> execute, which is correct. The step numbers in comments just do not match the linear numbering.

**Resolution:** Add a brief note explaining that the pipeline flow follows a logical dependency order, not strict step-number sequence, or renumber the comments to match the actual execution order.

---

## Repo Structure Validation

### Proposed File Paths vs. Actual Repo

| Proposed Path                                               | Exists?          | Valid Location? | Notes                                                                           |
| ----------------------------------------------------------- | ---------------- | --------------- | ------------------------------------------------------------------------------- |
| `src/agents/general/lu-architecture-researcher.agent.ts`    | No (new)         | Yes             | Matches `{name}.agent.ts` pattern in `src/agents/general/` (35 existing agents) |
| `src/agents/general/lu-implementation-researcher.agent.ts`  | No (new)         | Yes             | Same pattern                                                                    |
| `src/agents/general/lu-ecosystem-researcher.agent.ts`       | No (new)         | Yes             | Same pattern                                                                    |
| `src/agents/general/lu-risk-researcher.agent.ts`            | No (new)         | Yes             | Same pattern                                                                    |
| `src/agents/general/lu-completeness-reviewer.agent.ts`      | No (new)         | Yes             | Same pattern                                                                    |
| `src/agents/general/lu-accuracy-reviewer.agent.ts`          | No (new)         | Yes             | Same pattern                                                                    |
| `src/agents/general/lu-actionability-reviewer.agent.ts`     | No (new)         | Yes             | Same pattern                                                                    |
| `src/agents/general/lu-research-graduator.agent.ts`         | No (new)         | Yes             | Same pattern                                                                    |
| `src/agents/__helpers/researcher-shared-sections.ts`        | No (new)         | Yes             | Matches `__helpers/` kebab-case pattern (12 existing helpers)                   |
| `src/agents/__helpers/research-reviewer-shared-sections.ts` | No (new)         | Yes             | Same pattern                                                                    |
| `src/skills/general/phase-research.skill.ts`                | **Yes** (modify) | Yes             | Existing file confirmed                                                         |
| `src/skills/general/phase-research-expand.skill.ts`         | No (new)         | Yes             | Matches `{name}.skill.ts` pattern (52 existing skills)                          |
| `src/skills/general/phase-research-review.skill.ts`         | No (new)         | Yes             | Same pattern                                                                    |
| `src/skills/general/phase-graduate.skill.ts`                | No (new)         | Yes             | Same pattern                                                                    |
| `src/skills/general/phase-plan-review.skill.ts`             | No (new)         | Yes             | Same pattern                                                                    |
| `src/agents/__helpers/build-agent-registry.ts`              | **Yes** (modify) | Yes             | Confirmed at actual path                                                        |
| `src/skills/__helpers/build-skill-registry.ts`              | **Yes** (modify) | Yes             | Confirmed at actual path                                                        |
| `src/complexity/__helpers/model-routing.ts`                 | **Yes** (modify) | Yes             | Confirmed at actual path                                                        |
| `src/shared/__schemas/lu-config.schemas.ts`                 | **Yes** (modify) | Yes             | Confirmed at actual path                                                        |
| `src/shared/__schemas/research-config.schemas.ts`           | No (new)         | Yes             | Matches `__schemas/` pattern (7 existing schema files)                          |
| `src/shared/__schemas/workflow-version.schemas.ts`          | No (new)         | Yes             | Same pattern                                                                    |
| `src/complexity/__schemas/complexity.schemas.ts`            | **Yes** (modify) | Yes             | Confirmed at actual path                                                        |
| `src/compilers/__helpers/compile.ts`                        | **Yes** (check)  | Yes             | Confirmed at actual path                                                        |
| `.claude/rules/vault-routing.md`                            | **Yes** (modify) | Yes             | Confirmed (project rule)                                                        |
| `~/.claude/rules/vault-guard.md`                            | **Yes** (modify) | Yes             | Confirmed (global rule)                                                         |

### Schema Validation Against Actual Codebase

**AgentFrontmatterSchema fields used by new agents:**

- `name`, `description`, `tools`, `color`: All in schema (lines 61-64)
- `cognition`: In schema (line 66-67)
- `context`: In schema (line 68)
- `background_spawnable`: In schema (line 85)
- `purpose`: In schema (line 87), uses `PurposeCategorySchema` which includes "researcher", "reviewer", "synthesizer"
- `allowed_contexts`: In schema (line 89)

All frontmatter fields are valid. No schema extension needed for new agents.

**ComplexityGateSchema extension:**
The proposed `researchReviewIterations` and `planReviewIterations` fields would need to be added to `ComplexityGateSchema` in `src/complexity/__schemas/complexity.schemas.ts`. The existing schema uses `.int().positive()` for iteration fields (lines 120-123), but the proposed schema uses `.int().nonnegative().default(1)` which allows 0 and provides a default. This is a reasonable choice for optional v2 fields but differs from existing fields that use `.positive()` (min 1, no default). The implementer should choose consistently -- either both use `.positive()` or both use `.nonnegative()`.

**Compiler frontmatter handling:**
The `buildAgentFrontmatter()` function in `compile.ts` (lines 49-75) only emits `name`, `description`, `cognition`, and `context` to the YAML frontmatter. Fields like `purpose`, `allowed_contexts`, `background_spawnable`, and `tools` are NOT emitted to frontmatter -- they are consumed by the TypeScript registry at build time, not at runtime from compiled `.md` files. This is consistent with how existing agents work. The new agents do not require compiler changes.

**Config parser structure:**
The existing `lu-config.schemas.ts` only defines the `lu` (orchestration) section schema. It does NOT define the top-level config shape -- there is no master `ConfigSchema` that composes all sections. The plan should note that either (a) a new top-level config schema needs to be created, or (b) the `research` section is parsed independently (like `LuConfigSchema` is today). This is a design decision for the implementer, not a blocking issue.

---

## Canonical Decision Compliance

| Decision                    | Status         | Notes                                                                                                                  |
| --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| D1: 10-step pipeline        | Compliant      | Pipeline steps referenced correctly; numbering used in pseudocode                                                      |
| D2: Agent names             | Compliant      | All 8 new agents use canonical names                                                                                   |
| D3: Convergence model       | **Partially**  | Convergence logic uses CRITICAL/IMPORTANT/MINOR correctly; reviewer agents use CRITICAL/MAJOR/MINOR (see ISSUE-R2-002) |
| D4: Concept prefix scheme   | Compliant      | `research:*` prefixes, deferred promotion, repo vault routing all correct                                              |
| D5: Graduation scoring      | Compliant      | Weighted sum formula cited correctly at `phased-rollout.md` line 204                                                   |
| D6: Actionability scoring   | Not referenced | Not directly relevant to implementation plan (applies to runtime)                                                      |
| D7: Research file directory | **Partially**  | Correct in most places but 7 residual `.planning/research/` references (see ISSUE-R2-001)                              |
| D8: Gap ID format           | Not referenced | Not directly relevant to implementation plan                                                                           |
| D9: Config key casing       | **Partially**  | Schemas and JSON correct; pseudocode has 4 snake_case references (see ISSUE-R2-003)                                    |
| D10: Model routing presets  | Compliant      | ROUTER for researchers, DEEP_ANALYSIS for reviewers, ORCHESTRATOR for graduator                                        |
| D11: Researcher isolation   | Compliant      | Cold isolation explicitly stated throughout                                                                            |
| D12: Research file naming   | Compliant      | Numbered filenames (01-04) used consistently                                                                           |
| D13: Reviewer count         | Compliant      | Always 3 reviewers, not complexity-dependent; explicit callouts added                                                  |
| D14: Iteration budgets      | Compliant      | Matrix values match Decision 14 exactly                                                                                |
| D15: Unsourced claims       | Not applicable | Implementation plan makes no unsourced quantitative claims                                                             |
| D16: Revision loop targets  | Compliant      | Deep expansion via targeted researchers within review loop                                                             |
| D17: TRIVIAL handling       | Compliant      | All steps run at all levels; TRIVIAL gets fast tier, 1 iteration                                                       |
| D18: Missing items          | Compliant      | Skill registry, build:all, config parser all addressed                                                                 |
| D19: Canonical source       | Compliant      | References other sections rather than redefining                                                                       |

---

## Verdict: NEEDS REVISION (Minor)

The three critical Round 1 issues are fully resolved. The important and minor Round 1 issues are also fully resolved. The plan is structurally sound and ready for implementation with minor corrections.

**Three new issues require fixes before implementation:**

1. **ISSUE-R2-001 (CRITICAL):** 7 residual `.planning/research/` references must be changed to `.planning/phases/NN-name/research/` to match Decision 7. This is a search-and-replace fix.

2. **ISSUE-R2-002 (IMPORTANT):** Reviewer agent severity terminology must change from MAJOR to IMPORTANT across 7 locations to match Decision 3's gap-severity model. Without this fix, reviewer output and convergence logic would use different terminology.

3. **ISSUE-R2-003 (MINOR):** 4 snake_case config references in pseudocode should be updated to camelCase for consistency with the schema.

4. **ISSUE-R2-004 (MINOR):** Orchestrator pseudocode step-number comments could be clarified, but this is non-blocking.

**Recommendation:** Fix ISSUE-R2-001 and ISSUE-R2-002 (both are simple text replacements totaling ~18 edits). ISSUE-R2-003 and ISSUE-R2-004 can be fixed during implementation if needed. After those two fixes, the section is APPROVED for implementation.
