# Research Memory Lifecycle

The full lifecycle of research-originated memories in Luca v2, from initial creation as research files through graduation, recall, promotion, and eventual cleanup.

## Lifecycle Overview

Research memories pass through seven stages, each corresponding to a workflow step. The lifecycle is designed to ensure that valuable findings persist while ephemeral phase-specific context is eventually cleaned up.

```
 STEP 2                  STEP 5                   STEP 6
 Research                Review Research           Graduate
+----------+          +----------+             +----------+
| CREATE   | -------> | VALIDATE | ----------> | GRADUATE |
| Research |          | Research |             | Distill  |
| files    |          | review   |             | to       |
| written  |          | loop     |             | MuninnDB |
+----------+          +----------+             +----+-----+
                                                    |
                                                    |  research:* engrams
                                                    |  written to REPO vault
                                                    v
 STEP 7               STEP 9                   STEP 10
 Plan                 Execute                  Verify + UAT
+----------+        +----------+             +----------+
| REFERENCE| -----> | RECALL   | ----------> | PROMOTE  |
| Planner  |        | Executor |             | lu-      |
| embeds   |        | recalls  |             | learner  |
| refs in  |        | per-task |             | promotes |
| PLAN.md  |        | context  |             | to perm. |
+----------+        +----------+             +----+-----+
                                                  |
                                                  |  Promoted engrams
                                                  |  (pattern:*/pitfall:*)
                                                  |  written to DEFAULT vault
                                                  v
 MILESTONE                                   PERMANENT
 Completion                                  Memory
+----------+                              +----------+
| CLEANUP  |                              | RETAIN   |
| research:|                              | pattern: |
| engrams  |                              | pitfall: |
| removed  |                              | decision:|
| from REPO|                              | persist  |
+----------+                              +----------+
```

## Stage 1: Creation (Step 2 -- Research)

**When**: During the research phase (Step 2), after ideation.

**What happens**: Research agents write findings to markdown files in the phase research directory.

**Artifacts produced**:

```
.planning/phases/{N}-{name}/research/
  ws-reconnection-strategy.md
  bun-websocket-api.md
  message-queue-replay.md
  connection-health-monitoring.md
```

**Key properties**:

- Files are **ephemeral** -- they exist on disk, not in MuninnDB
- Files contain **full detail** -- citations, examples, alternatives, confidence reasoning
- Files are written by **isolated agents** -- each researcher writes independently
- Files follow the **research file format** (see 02-research-system/research-file-structure.md)

**MuninnDB interaction**: None. Research files are not stored in MuninnDB at this stage.

## Stage 2: Validation (Step 5 -- Review Research)

**When**: After all research agents complete (Steps 2-4), before graduation.

**What happens**: Review agents evaluate research files for completeness, accuracy, and actionability. The review loop iterates until convergence or budget exhaustion.

**Artifacts produced**:

```
.planning/phases/{N}-{name}/research/
  REVIEW-LOG.md        (reviewer feedback, gap identification)
  REVIEW-SUMMARY.md    (consolidated review status)
```

**Key properties**:

- Reviewers are **cold-isolated** from researchers
- Review may flag **gaps** that trigger additional research
- Confidence levels may be **adjusted** based on review
- Findings flagged as LOW confidence may be **downgraded**

**MuninnDB interaction**: None directly. However, reviewers may recall existing engrams to check for contradictions with prior knowledge.

## Stage 3: Graduation (Step 6)

**When**: After the research review loop completes, before planning begins.

**What happens**: The lu-research-graduator agent reads all research files, scores each finding, deduplicates against existing MuninnDB engrams, and writes qualifying findings as `research:*` engrams.

**Artifacts produced**:

```
MuninnDB (REPO vault):
  research:approach-ws-reconnect
  research:api-bun-websocket
  research:pitfall-ws-memory-leak
  research:pattern-exponential-backoff
  research:constraint-bun-ws-version
  research:decision-ws-library-choice

.planning/phases/{N}-{name}/research/
  GRADUATION-REPORT.md    (audit trail: what graduated, what was skipped)
```

**Key properties**:

- Engrams are **persistent** in MuninnDB (survive session boundaries)
- Engrams are **distilled** -- 50-150 tokens each (vs. 2000-4000 tokens per file)
- Engrams are **semantically searchable** via MuninnDB recall
- Each engram includes **phase metadata** (phase number, graduation date)
- The graduation report provides **full audit trail**

**Detailed process**: See [graduation-model.md](graduation-model.md).

## Stage 4: Reference (Step 7 -- Plan)

**When**: During plan creation, after graduation.

**What happens**: The planner reads the graduation report, understands what research context is available, and embeds `research:*` concept prefixes as research refs in each PLAN.md task.

**Artifacts produced**:

```
.planning/phases/{N}-{name}/plans/
  PLAN-01.md   (contains Research refs: lines per task)
```

**Key properties**:

- Research refs are **concept prefixes**, not content -- the planner writes the key, not the value
- Each task receives **2-4 refs** matching its implementation scope
- The planner does NOT copy engram content into the plan
- Refs create a **contract**: "this task needs this context, and MuninnDB has it"

**MuninnDB interaction**: Planner recalls `research:*` engrams to verify they exist and to understand their scope before assigning refs to tasks.

**Example**:

```markdown
#### Task 2.2: Add reconnection logic with exponential backoff

**Research refs:** research:approach-ws-reconnect, research:pattern-exponential-backoff, research:pitfall-ws-memory-leak
**Verification:** Connection resumes within 2s after network drop
```

## Stage 5: Recall (Step 9 -- Execute)

**When**: When an executor starts a specific task during wave-based execution.

**What happens**: The orchestrator (phase-execute) parses research refs from the task, recalls each ref from MuninnDB, and injects the results into the executor's context as a `<research_context>` block.

**Detailed protocol**:

```
1. Parse research refs from task:
   refs = ["research:approach-ws-reconnect",
           "research:pattern-exponential-backoff",
           "research:pitfall-ws-memory-leak"]

2. For each ref, recall from REPO vault:
   for ref in refs:
     result = muninn_recall(vault: REPO_VAULT, context: ref)
     if result.engrams.length > 0:
       context.append(result.engrams[0])
     else:
       gaps.append(ref)  # research gap

3. Inject into executor prompt:
   <research_context>
   ## research:approach-ws-reconnect
   {engram content}

   ## research:pattern-exponential-backoff
   {engram content}

   ## research:pitfall-ws-memory-leak
   {engram content}
   </research_context>

4. Executor implements task with this context
```

**Key properties**:

- Recall is **per-task** -- each task gets its own context slice
- Recall is **targeted** -- only the refs listed in the task are recalled
- Research gaps are **flagged** in the executor's summary
- Executor also receives **cognition context** (patterns, pitfalls from prior sessions)

**MuninnDB interaction**: `muninn_recall` for each research ref, vault: REPO_VAULT. MuninnDB recall is semantic by default; no `mode` parameter is needed.

**Concurrency note**: In wave-based parallel execution, multiple executors may issue concurrent `muninn_recall` calls (e.g., 5 executors x 3 refs = 15 concurrent recalls). For local MuninnDB instances this is expected to be fine. For remote instances, the orchestrator may optionally batch all recalls for a wave before spawning executors to reduce concurrent load.

**Detailed protocol**: See [per-task-recall.md](per-task-recall.md).

## Stage 6: Promotion (Step 10 -- Verify + UAT)

**When**: After execution completes and verification passes (or fails), lu-learner runs.

**What happens**: lu-learner evaluates all `research:*` engrams used during the phase. Findings that were validated by successful execution are candidates for promotion to permanent engrams.

**Promotion decision matrix**:

```
+-------------------------------+-----------------------------+------------------+
| Research Engram Outcome       | Promotion Target            | Vault            |
+-------------------------------+-----------------------------+------------------+
| Approach validated by         | pattern:{approach-name}     | DEFAULT          |
| successful execution          |                             |                  |
+-------------------------------+-----------------------------+------------------+
| Pitfall confirmed during      | pitfall:{pitfall-name}      | DEFAULT          |
| execution (or avoided         |                             |                  |
| because of the warning)       |                             |                  |
+-------------------------------+-----------------------------+------------------+
| Decision held up through      | decision:{decision-name}    | DEFAULT          |
| verification                  |                             |                  |
+-------------------------------+-----------------------------+------------------+
| API pattern used correctly    | pattern:{api-pattern-name}  | DEFAULT          |
| and verified                  |                             |                  |
+-------------------------------+-----------------------------+------------------+
| Constraint verified           | (not promoted -- constraints | --               |
| (version check passed)        |  are phase-specific)        |                  |
+-------------------------------+-----------------------------+------------------+
| Approach was NOT used         | (not promoted -- unused)    | --               |
| by any executor               |                             |                  |
+-------------------------------+-----------------------------+------------------+
| Approach failed during        | pitfall:{approach-name}-    | DEFAULT          |
| execution or verification     |   failure                   |                  |
+-------------------------------+-----------------------------+------------------+
```

**Promotion process**:

```
1. lu-learner enumerates all research:* engrams from REPO vault
   Use muninn_find_by_entity(vault: REPO_VAULT, entity: "research")
   to get an exhaustive list (semantic recall may miss low-relevance engrams)

2. For each research:* engram:
   a. Check executor summaries -- was this engram used?
   b. Check verification results -- did tasks using it pass?
   c. Apply promotion decision matrix

3. For engrams that qualify for promotion:
   a. Create new engram in DEFAULT vault with permanent prefix:
      muninn_remember(vault: DEFAULT_VAULT,
        concept: "pattern:ws-reconnect-exponential-backoff",
        content: "{distilled content + validation context}")

   b. Record provenance in the promoted engram's content
      (include "Validated from research:approach-ws-reconnect in phase N")
      NOTE: muninn_link operates within a single vault. Since the source
      is in REPO and the target is in DEFAULT, cross-vault links may not
      be supported. Capture provenance in content text instead.

   c. Provide positive feedback on the research engram:
      muninn_feedback(vault: REPO_VAULT,
        id: research_engram_id,  # actual engram ID, not concept prefix
        useful: true)

4. For engrams that were not used or failed:
   a. Provide negative or neutral feedback
   b. Do not promote
   c. Note in learning extraction summary
```

**Key properties**:

- Promotion is **selective** -- not all research engrams get promoted
- Promoted engrams move from **REPO to DEFAULT vault** (project-scoped to cross-cutting)
- Promoted engrams change **prefix** (research:_ to pattern:_/pitfall:_/decision:_)
- The original research engram **remains** in REPO vault until cleanup
- Promotion creates a **new** engram; it does not move or rename the original
- lu-learner adds **validation context** to the promoted content ("Validated in phase N, task M")

## Stage 7: Cleanup (After Milestone Completion)

**When**: After a milestone boundary, triggered by `/milestone-complete`.

**What happens**: `research:*` engrams that are no longer needed are removed from the REPO vault to prevent engram bloat.

**Cleanup rules**:

```
For each research:* engram in REPO vault:

  IF engram was promoted to pattern:*/pitfall:*/decision:*:
    -> Check config: retainPromotedSource == true?
      -> Yes: RETAIN (keeps source in REPO as audit trail; promoted version persists in DEFAULT)
      -> No:  CLEAN UP (promoted version in DEFAULT is the surviving copy)

  IF engram was NOT promoted AND milestone is complete:
    -> Check config: autoCleanupAfterMilestone == true?
      -> Yes: CLEAN UP via muninn_forget
      -> No:  RETAIN (manual cleanup later)

  IF engram was NOT promoted AND milestone is NOT complete:
    -> RETAIN (may be needed in future phases of this milestone)
```

**Implementation**:

```
# Cleanup protocol (run by milestone-complete skill)

1. Enumerate all research:* engrams from REPO vault:
   Use muninn_find_by_entity(vault: REPO_VAULT, entity: "research")
   NOTE: Do NOT use muninn_recall for enumeration -- semantic recall
   returns results by relevance score and may miss low-scoring or
   older engrams, leading to silent orphans.

2. For each engram, check promotion status:
   - Check if engram content includes "Promoted to:" annotation
     (written by lu-learner during Stage 6)
   - Or search DEFAULT vault for pattern:*/pitfall:*/decision:*
     engrams whose content references the research engram
   - If promoted version exists: mark for cleanup

3. For non-promoted engrams:
   - Check config.research.graduation.autoCleanupAfterMilestone
   - If true: mark for cleanup
   - If false: retain

4. For promoted engrams:
   - Check config.research.graduation.retainPromotedSource
   - If true: retain (keeps audit trail in REPO)
   - If false: mark for cleanup (promoted version persists in DEFAULT)

5. Execute cleanup:
   for engram_id in cleanup_list:
     muninn_forget(vault: REPO_VAULT, id: engram_id)

6. Log cleanup in milestone summary:
   "Cleaned up N research engrams (M promoted, K expired, J retained)"
```

**Key properties**:

- Cleanup is **configurable** -- `autoCleanupAfterMilestone` (default: false) and `retainPromotedSource` (default: true)
- Promoted engrams have their permanent version in DEFAULT vault; the REPO source is retained by default for audit trail
- Non-promoted engrams default to **retained** after milestone (autoCleanupAfterMilestone is false by default)
- Cleanup targets only `research:*` prefix -- never touches `pattern:*`, `session:*`, etc.
- Enumeration uses `muninn_find_by_entity`, not semantic recall, to guarantee exhaustive coverage

## Lifecycle Summary Table

| Stage     | Step      | Agent                                           | MuninnDB Operation                                       | Artifact                                   |
| --------- | --------- | ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Create    | 2         | lu-research-\*                                  | None                                                     | Research files (.md)                       |
| Validate  | 5         | lu-completeness/accuracy/actionability-reviewer | muninn_recall (existing)                                 | REVIEW-LOG.md                              |
| Graduate  | 6         | lu-research-graduator                           | muninn_remember_batch (REPO)                             | research:\* engrams + GRADUATION-REPORT.md |
| Reference | 7         | lu-planner                                      | muninn_recall (REPO)                                     | Research refs in PLAN.md                   |
| Recall    | 9         | lu-executor (via orchestrator)                  | muninn_recall (REPO)                                     | research_context block in executor prompt  |
| Promote   | 10        | lu-learner                                      | muninn_remember (DEFAULT) + muninn_feedback (REPO)       | pattern:_/pitfall:_/decision:\* engrams    |
| Cleanup   | Milestone | milestone-complete                              | muninn_find_by_entity (enumerate) + muninn_forget (REPO) | Cleanup log in milestone summary           |

## Full Lifecycle Diagram

```
                                  Time --->

  STEP 2          STEP 5           STEP 6           STEP 7
  Research        Review Research   Graduate         Plan
  --------        ---------------   --------         ----

  [research       [REVIEW-LOG      [GRADUATION      [PLAN.md
   files           validates        -REPORT.md       with
   written]        findings]        written]         refs]
      |                |                |               |
      v                v                v               v
  .planning/       .planning/       MuninnDB         PLAN.md
  research/        research/        (REPO vault)     tasks
  *.md files       REVIEW-LOG.md    research:*       reference
                   REVIEW-          engrams          engrams
                   SUMMARY.md

                                        |
                    +-------------------+-------------------+
                    |                                       |
                    v                                       v
               STEP 9                                 STEP 10
               Execute                               Verify + UAT
               -------                               -----------

               [Executors                         [lu-learner
                recall                             evaluates
                per-task                           + promotes]
                context]                               |
                    |                                   |
                    v                                   v
               Executor gets                      DEFAULT vault
               ~400 tokens of                     pattern:*
               targeted context                   pitfall:*
               (vs ~10,000 from                   decision:*
               raw files)                         (permanent)

                                                       |
                                                       v
                                                  MILESTONE
                                                  ---------

                                                  [Cleanup
                                                   research:*
                                                   from REPO]
                                                       |
                                                       v
                                                  REPO vault
                                                  research:*
                                                  engrams
                                                  REMOVED
```

## Retention Rules

| Engram Type                   | Retention Policy                                         | Survives Milestone?           | Survives Project End?  |
| ----------------------------- | -------------------------------------------------------- | ----------------------------- | ---------------------- |
| `research:*` (promoted)       | Retained by default (`retainPromotedSource: true`)       | Yes (default) / No (if false) | No (was in REPO vault) |
| `research:*` (not promoted)   | Retained by default (`autoCleanupAfterMilestone: false`) | Yes (default) / No (if true)  | No                     |
| `pattern:*` (from promotion)  | Permanent                                                | Yes                           | Yes (in DEFAULT vault) |
| `pitfall:*` (from promotion)  | Permanent                                                | Yes                           | Yes (in DEFAULT vault) |
| `decision:*` (from promotion) | Permanent                                                | Yes                           | Yes (in DEFAULT vault) |
| `session:*`                   | Cleared by lu-learner                                    | No                            | No                     |
| `brain:project-*`             | Permanent (project-scoped)                               | Yes                           | No (REPO vault)        |
| `brain:user-*`                | Permanent (cross-cutting)                                | Yes                           | Yes (DEFAULT vault)    |

## Configuration Reference

All lifecycle behavior is configurable in `.planning/config.json` under `research.graduation` (camelCase per Decision 9):

```json
{
  "research": {
    "graduation": {
      "enabled": true,
      "scoringThreshold": 0.55,
      "confidenceThreshold": "MEDIUM",
      "maxEngramsPerGraduation": 50,
      "dedupSimilarityThreshold": 0.85,
      "autoCleanupAfterMilestone": false,
      "retainPromotedSource": true
    }
  }
}
```

| Field                       | Impact on Lifecycle                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                   | If false, Stage 3 (Graduation) is skipped entirely. Executors operate without research context.                                     |
| `scoringThreshold`          | Determines which findings graduate. Lower threshold = more engrams = more context for executors.                                    |
| `confidenceThreshold`       | Hard floor. Prevents unverified findings from entering MuninnDB regardless of score.                                                |
| `maxEngramsPerGraduation`   | Caps total engrams per graduation run. Prevents bloat in research-heavy phases.                                                     |
| `dedupSimilarityThreshold`  | Controls deduplication sensitivity. Lower threshold = more aggressive dedup. Uses MuninnDB recall relevance score (0.0-1.0).        |
| `autoCleanupAfterMilestone` | If true, non-promoted research:\* engrams are cleaned up after milestone. Default false (retained).                                 |
| `retainPromotedSource`      | If true (default), keep research:\* source in REPO after promotion for audit trail. If false, source cleaned up with other engrams. |

## Edge Cases

### Multi-Session Phases

If a phase spans multiple sessions (common for COMPLEX/CRITICAL phases), research engrams persist across sessions because they are in MuninnDB, not in session context. The executor in session 2 can recall engrams graduated in session 1.

### Phase Re-Planning

If a phase is re-planned (plans are regenerated), research refs in the new plans may reference different engrams. Previously graduated engrams remain available -- the planner simply selects different refs.

### Graduation After Partial Research

If research was interrupted (session ended mid-research), graduation processes only the files that exist. Incomplete research directories produce fewer engrams. The planner must work with what graduated.

### Promoted Engram Contradicts Research

If lu-learner promotes a finding and later research in a different phase contradicts it, the new research engram coexists with the promoted engram. lu-learner in the later phase can `muninn_evolve` the promoted engram with updated content or create a new pitfall engram noting the contradiction.

### Engram Bloat Across Many Phases

A project with 20+ phases could accumulate hundreds of `research:*` engrams if cleanup is disabled. The `maxEngramsPerGraduation` cap and milestone cleanup prevent this. Even without cleanup, REPO vault engrams are project-scoped and do not affect other projects.

Note: `maxEngramsPerGraduation` is per-graduation-run, not per-phase-total. If a phase is re-planned and re-graduated, the new run can add up to `maxEngramsPerGraduation` additional engrams. The deduplication step (Step 3 in the graduation process) mitigates this by evolving existing engrams rather than creating duplicates.

## Related Documentation

- [graduation-model.md](graduation-model.md) -- Stage 3 in detail
- [concept-prefix-extensions.md](concept-prefix-extensions.md) -- The research:\* prefix namespace
- [per-task-recall.md](per-task-recall.md) -- Stage 5 (Recall) in detail
- [Research System](../02-research-system/) -- Stages 1-2 (Creation and Validation)
- [Design Principles](../00-design-principles/) -- Why this lifecycle exists
