# Review Round 2: 03-muninndb-integration

## Reviewer: MuninnDB Integration Reviewer (Cold Isolation)

## Date: 2026-03-23

## Iteration: 2

## Summary Assessment

The 03-muninndb-integration section has been substantially revised since Round 1. All four critical findings (CRIT-MN-001 through CRIT-MN-004) have been addressed, and the five documents within this section are now internally consistent. The graduation-model.md, concept-prefix-extensions.md, lifecycle.md, and per-task-recall.md form a coherent specification. However, cross-section consistency has **partially regressed** -- the cross-referenced file `01-workflow-steps/06-graduate.md` still contains contradictions that were supposed to be resolved.

---

## Round 1 Fix Verification

### CRIT-MN-001: Scoring Formula -- FIXED in 03-muninndb-integration, PARTIALLY FIXED in cross-references

**Round 1 issue**: graduation-model.md used weighted sum while 04-agent-orchestration/graduation-agent.md used product formula.

**Current state in 03-muninndb-integration**: graduation-model.md (line 172) correctly specifies:

```
score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
threshold = 0.55
```

This matches Decision 5 in CANONICAL-DECISIONS.md exactly.

**Current state in 04-agent-orchestration/graduation-agent.md**: graduation-agent.md (lines 124-173) now correctly uses the weighted sum formula with the 0.55 threshold. It includes the full scoring tables for confidence, actionability, and uniqueness. The actionability table matches the observable signals criteria from Decision 6. The worked examples (lines 170-173) compute correctly: `1.0 * 0.40 + 0.8 * 0.35 + 0.7 * 0.25 = 0.855` (passes) and `0.3 * 0.40 + 0.3 * 0.35 + 0.0 * 0.25 = 0.225` (fails). **FIXED.**

**Residual issue in 01-workflow-steps/06-graduate.md**: See NEW-MN-001 below.

---

### CRIT-MN-002: Concept Prefix Scheme -- FIXED in 03-muninndb-integration, PARTIALLY FIXED in cross-references

**Round 1 issue**: 03-muninndb-integration used `research:*` namespace with deferred promotion, while 01-workflow-steps/06-graduate.md and 04-agent-orchestration/graduation-agent.md wrote directly to `pattern:*`/`pitfall:*`/`decision:*`.

**Current state in 03-muninndb-integration**: All documents consistently use the `research:*` namespace in REPO vault. graduation-model.md (line 278-289) defines the six research subtypes. concept-prefix-extensions.md (lines 26-36) defines the full prefix table. lifecycle.md (lines 207-286) describes promotion from `research:*` to `pattern:*`/`pitfall:*`/`decision:*` by lu-learner in Step 10. **FIXED.**

**Current state in 04-agent-orchestration/graduation-agent.md**: graduation-agent.md (lines 196-222) now correctly uses the `research:*` namespace with deferred promotion. The mapping table (lines 202-214) shows all findings going to `research:*` prefixes in the repo vault. Lines 216-222 explicitly document the deferred promotion model. **FIXED.**

**Residual issue in 01-workflow-steps/06-graduate.md**: See NEW-MN-001 below.

---

### CRIT-MN-003: Agent Identity -- FIXED in 03-muninndb-integration, NOT FIXED in 01-workflow-steps/06-graduate.md

**Round 1 issue**: 06-graduate.md used `lu-learner (adapted)` while 03-muninndb-integration and graduation-agent.md used `lu-research-graduator`.

**Current state in 03-muninndb-integration**: graduation-model.md (lines 144-156) correctly specifies `lu-research-graduator` and includes an explicit callout: "This is NOT lu-learner adapted -- lu-learner retains its existing role in Step 10." **FIXED.**

**Current state in 04-agent-orchestration/graduation-agent.md**: The file is titled "Graduation Agent: lu-research-graduator" and specifies the dedicated agent throughout. **FIXED.**

**Residual issue in 01-workflow-steps/06-graduate.md**: See NEW-MN-001 below.

---

### CRIT-MN-004: Actionability Criteria -- FIXED

**Round 1 issue**: Actionability scoring used subjective categories without objective criteria.

**Current state**: graduation-model.md (lines 192-198) now defines actionability using observable signals, matching Decision 6 in CANONICAL-DECISIONS.md exactly:

| Score | Criteria                                                      |
| ----- | ------------------------------------------------------------- |
| 1.0   | Contains specific function name, parameter, or code pattern   |
| 0.8   | Names a specific technology choice or version constraint      |
| 0.3   | Describes a general strategy without implementation specifics |
| 0.1   | Purely informational, no implementation implication           |

graduation-agent.md (lines 143-151) mirrors this table. The pitfall/risk note in graduation-agent.md (line 152) adds useful clarification about how pitfalls that lack code-pattern specificity should be scored. **FIXED.**

---

### IMP-MN-001: Research Ref Annotation Syntax -- FIXED

**Round 1 issue**: per-task-recall.md used `**Research refs:**` while 01-workflow-steps/09-execute.md used `@research()` and `@engram()`.

**Current state**: per-task-recall.md (lines 14-15) now includes an explicit annotation syntax note clarifying that `**Research refs:**` with comma-separated concept prefixes is the canonical format for this section, and references the alternative `@research()`/`@engram()` syntax from 01-workflow-steps as alternative annotation forms. **FIXED.**

---

### IMP-MN-002: muninn_recall mode:"semantic" Parameter -- FIXED

**Round 1 issue**: per-task-recall.md used `mode: "semantic"` which is not a documented MuninnDB parameter.

**Current state**: The `mode: "semantic"` parameter has been removed from all recall calls. lifecycle.md (line 201) explicitly states: "MuninnDB recall is semantic by default; no `mode` parameter is needed." per-task-recall.md recall protocol (lines 96-101) shows clean `muninn_recall(vault: REPO_VAULT, context: ref)` calls without the mode parameter. **FIXED.**

---

### IMP-MN-003: Cleanup Using Semantic Recall for Enumeration -- FIXED

**Round 1 issue**: Cleanup used `muninn_recall` which could miss low-relevance engrams, leading to orphans.

**Current state**: lifecycle.md (lines 317-321) now uses `muninn_find_by_entity` for enumeration and includes an explicit NOTE: "Do NOT use muninn_recall for enumeration -- semantic recall returns results by relevance score and may miss low-scoring or older engrams, leading to silent orphans." The promotion process (lifecycle.md line 247) also uses `muninn_find_by_entity`. **FIXED.**

---

### IMP-MN-004: decision:\* Vault Routing Gap -- FIXED (within docs)

**Round 1 issue**: `decision:*` was listed as DEFAULT vault in concept-prefix-extensions.md but routed to REPO vault in 06-graduate.md. The vault-routing rule did not include `decision:*`.

**Current state**: concept-prefix-extensions.md (line 16) now shows `decision:*` in the DEFAULT vault with an explicit NOTE: "not in vault-routing rule yet -- see Migration Considerations." Lines 237-242 document the required migration: add both `research:*` and `decision:*` to the vault-routing and vault-guard rules. This is consistent: `research:decision-*` is in REPO (phase-scoped), `decision:*` (promoted, permanent) is in DEFAULT. **FIXED in documentation; migration not yet applied to the actual vault-routing rule.**

---

### IMP-MN-005: Deduplication Similarity Threshold Semantics -- FIXED

**Round 1 issue**: The 0.85 threshold was meaningless without specifying what "similarity" means.

**Current state**: graduation-model.md (lines 212-214) now specifies: "The relevance score is MuninnDB's internal scoring (range 0.0-1.0), returned by muninn_recall for each result." The config table (line 403) also clarifies: "MuninnDB recall relevance score (0.0-1.0) above which engrams are considered duplicate. Uses MuninnDB's internal relevance scoring." **FIXED.**

---

### IMP-MN-006: muninn_feedback Using Concept Prefix Instead of Engram ID -- FIXED

**Round 1 issue**: `muninn_feedback` was called with concept prefix string instead of actual engram ID.

**Current state**: per-task-recall.md (lines 224-233) now includes explicit guidance: capture the engram ID from the recall result, then use that ID for feedback. The code example shows `engram_id = result.engrams[0].id` followed by `muninn_feedback(vault: REPO_VAULT, id: engram_id, useful: true)`. lifecycle.md (lines 268-270) similarly uses `id: research_engram_id` with the comment "actual engram ID, not concept prefix." **FIXED.**

---

### MIN-MN-001: Config Key Inconsistency -- FIXED

**Round 1 issue**: Two different JSON paths for graduation config (`workflow.graduation_threshold` vs `research.graduation.threshold`).

**Current state**: graduation-model.md (lines 379-394) consistently uses `research.graduation.*` with camelCase keys. The config block shows `research.graduation.scoringThreshold`, `research.graduation.confidenceThreshold`, etc. No flat variant remains. lifecycle.md (lines 441-453) mirrors the same structure. Config matches Decision 9 in CANONICAL-DECISIONS.md. **FIXED.**

---

### MIN-MN-002: README Step Numbering -- FIXED

**Round 1 issue**: README diagram step numbering did not match 01-workflow-steps.

**Current state**: README.md (lines 14-24) now shows the correct 10-step numbering matching Decision 1 in CANONICAL-DECISIONS.md: Step 6 = GRADUATION, Step 9 = Execute, Step 10 = Verify + UAT. **FIXED.**

---

### MIN-MN-003: decision:\* Visual Map Consistency -- FIXED

**Round 1 issue**: Visual vault map showed `decision:*` in DEFAULT, but promotion section was inconsistent with 06-graduate.md.

**Current state**: concept-prefix-extensions.md (lines 170-193) visual map correctly shows `decision:*` in DEFAULT vault (permanent, promoted), and `research:decision-*` in REPO vault (phase-scoped). The promotion arrows correctly show research:decision-_ promoting to decision:_ via lu-learner. This is now internally consistent. **FIXED.**

---

### MIN-MN-004: cleanup_retain_promoted Semantics Confusion -- FIXED

**Round 1 issue**: The config field name and behavior were contradictory.

**Current state**: The field has been renamed to `retainPromotedSource` (graduation-model.md line 405, lifecycle.md line 465). The semantics are now clear: "If true (default), keep the research:\* source copy in REPO after promotion for audit trail. If false, source is cleaned up with non-promoted engrams." lifecycle.md (lines 298-301) cleanup logic is now consistent: when `retainPromotedSource` is true, the REPO source is retained; when false, it is cleaned up. **FIXED.**

---

### MIN-MN-005: maxEngramsPerPhase vs maxEngramsPerGraduation Conflict -- FIXED

**Round 1 issue**: graduation-model.md used `max_engrams_per_phase: 20` while graduation-agent.md used `max_engrams_per_graduation: 50`.

**Current state**: Both documents now use `maxEngramsPerGraduation: 50` (camelCase). graduation-model.md (line 388, 402) and graduation-agent.md (line 452) agree on the name and default. lifecycle.md (line 489) clarifies that this is per-graduation-run, not per-phase-total. **FIXED.**

---

## New Issues Found

### NEW-MN-001 (CRITICAL): 01-workflow-steps/06-graduate.md is STILL INCONSISTENT with 03-muninndb-integration and CANONICAL-DECISIONS.md

This is the most significant finding of Round 2. The file `01-workflow-steps/06-graduate.md` was supposed to be aligned with the canonical decisions during Round 1 revisions, but **it was not fully revised**. It contains multiple contradictions:

**A. Agent identity conflict (CRIT-MN-003 not fixed in this file)**

Line 223 of 06-graduate.md lists:

```
| `lu-learner` (adapted) | 1 | Classify findings, write engrams, create links | None | fast (FAST_PROMOTED preset) |
```

This contradicts Decision 2 in CANONICAL-DECISIONS.md, which specifies `lu-research-graduator` (not lu-learner adapted). graduation-model.md and graduation-agent.md both correctly use `lu-research-graduator`. The "Agents Involved" table in 06-graduate.md is wrong.

Note: Line 51 of the same file correctly says "lu-research-graduator agent (Decision 2 -- NOT lu-learner)" and line 53 correctly says "lu-learner retains its existing role in Step 10". So the file contradicts itself internally -- the prose is correct but the agent table at line 223 is not.

**B. Batch graduation still writes to pattern:_/pitfall:_/decision:\* directly (CRIT-MN-002 partially not fixed)**

Section 6.4 (lines 96-145) shows two batch write operations:

- Lines 99-122: Writes `pitfall:bun-ws-close-not-on-network-disconnect`, `pattern:ws-reconnection-state-machine`, `pattern:abort-controller-timer-cleanup`, `pattern:exponential-backoff-jitter` to the **default vault**
- Lines 126-144: Writes `decision:bun-ws-close-code-reconnection-map`, `decision:ws-heartbeat-config`, `decision:ws-connection-sharing` to the **repo vault**

This directly contradicts Decision 4 (write to `research:*` prefixes in REPO vault only, with deferred promotion by lu-learner). The 03-muninndb-integration section and graduation-agent.md both correctly use `research:*` prefixes, but 06-graduate.md's code examples do not.

**C. Section 6.5 links engrams in default vault using concept prefixes as IDs**

Lines 152-168 show `muninn_link` calls using concept prefix strings (`pattern:ws-reconnection-state-machine`, etc.) as `source_id`/`target_id`. These should be actual MuninnDB engram IDs, not concept prefixes. Additionally, all these links are in the default vault against `pattern:*`/`pitfall:*` prefixes, which should not exist yet at graduation time (they should only exist after Step 10 promotion).

**D. Section 6.7 presentation shows default vault engrams**

Lines 188-201 show a summary with "Default vault (cross-cutting): pitfall:..., pattern:..." -- these should be "Repo vault (research:\*)" per the canonical design.

**E. Output table (line 211-217) lists pattern:_ and pitfall:_ in default vault**

The Outputs table still describes graduation writing permanent prefixes to default vault, contradicting Decision 4.

**F. "Handoff to Step 7" (line 273) references `.planning/research/` directory**

Should be `.planning/phases/{N}-{name}/research/` per Decision 7.

**Suggested resolution**: 01-workflow-steps/06-graduate.md needs a comprehensive revision to:

1. Replace the Agents Involved table entry from `lu-learner (adapted)` to `lu-research-graduator`
2. Replace all `pattern:*`/`pitfall:*`/`decision:*` batch writes with `research:*` prefixes in REPO vault
3. Update section 6.5 links to use `research:*` engrams in REPO vault
4. Update section 6.7 presentation to show REPO vault with `research:*` prefixes
5. Update the Outputs table to reflect `research:*` engrams in REPO vault
6. Fix the research directory path in the handoff text

---

### NEW-MN-002 (IMPORTANT): graduation-agent.md isolation field says "warm" but CANONICAL-DECISIONS.md says all researchers use "cold"

graduation-agent.md (line 46) specifies:

```typescript
context: {
  default_tier: "T2",
  promotable_to: "T2",
  isolation: "warm",
},
```

And lines 419-428 explain why warm isolation is chosen. However, Decision 11 in CANONICAL-DECISIONS.md states: "All researchers use cold isolation. This is non-negotiable per the design principles."

The question is whether `lu-research-graduator` is classified as a "researcher" for the purposes of Decision 11. The agent's role is synthesis (not research), and warm isolation is justified by the need to access MuninnDB for deduplication and config for vault routing. However, Decision 11's wording is absolute: "All researchers use cold isolation."

**Suggested resolution**: Either (a) clarify Decision 11 to scope it specifically to the four research agents (lu-architecture-researcher, lu-implementation-researcher, lu-ecosystem-researcher, lu-risk-researcher), excluding the graduator; or (b) change the graduator's isolation to cold and adjust its tool set so that MuninnDB access and config reading happen via explicit tool calls rather than warm context injection. Option (a) is more practical, since the graduator's dedup functionality genuinely requires MuninnDB read access that cold isolation would not provide.

---

### NEW-MN-003 (IMPORTANT): Config schema in 06-implementation-plan/config-changes.md is missing fields present in 03-muninndb-integration

The `ResearchConfigSchema` in config-changes.md (lines 124-209) defines these graduation fields:

```
confidenceThreshold, scoringThreshold, autoCleanupAfterMilestone
```

But graduation-model.md and lifecycle.md also reference these additional graduation config fields:

```
maxEngramsPerGraduation (default 50)
dedupSimilarityThreshold (default 0.85)
retainPromotedSource (default true)
```

These three fields are consistently used in the 03-muninndb-integration section (graduation-model.md line 388-390, lifecycle.md line 448-449, 451) but are absent from the canonical config schema in config-changes.md.

Per Decision 19, `06-implementation-plan/config-changes.md` is the canonical source for config schema. Either the 03-muninndb-integration section is referencing fields that do not exist in the canonical schema, or config-changes.md needs to be updated.

**Suggested resolution**: Add `maxEngramsPerGraduation`, `dedupSimilarityThreshold`, and `retainPromotedSource` to the `graduation` object in config-changes.md's `ResearchConfigSchema`. These are well-defined with clear defaults and documented purposes.

---

### NEW-MN-004 (IMPORTANT): graduation-agent.md config block includes `requireSourceUrl` field not present anywhere else

graduation-agent.md (lines 436-447) shows:

```json
{
  "research": {
    "graduation": {
      "scoringThreshold": 0.55,
      "maxEngramsPerGraduation": 50,
      "requireSourceUrl": false,
      "autoCleanupAfterMilestone": false
    }
  }
}
```

The `requireSourceUrl` field (line 443) is not in graduation-model.md, lifecycle.md, concept-prefix-extensions.md, or config-changes.md. It is an orphan config field that only appears in this one location.

**Suggested resolution**: Either add `requireSourceUrl` to the canonical config schema in config-changes.md and reference it in graduation-model.md, or remove it from graduation-agent.md. Given that graduation-model.md's `confidenceThreshold: "MEDIUM"` already ensures unverified findings do not graduate, `requireSourceUrl` may be redundant. If it has value, document it; if not, remove the orphan.

---

### NEW-MN-005 (MINOR): graduation-agent.md uniqueness weights differ from graduation-model.md

graduation-model.md (lines 200-203):

```
Novel finding (no similar engram exists): 1.0
Partially overlaps existing engram but adds new detail: 0.5
Duplicate of existing engram: 0.0
```

graduation-agent.md (lines 156-162):

```
Novel finding not in MuninnDB: 1.0
Extends existing engram with new detail: 0.7
Confirms existing engram (no new info): 0.2
Duplicates existing engram exactly: 0.0
```

The scales differ: graduation-model.md uses a 3-level scale (1.0, 0.5, 0.0) while graduation-agent.md uses a 4-level scale (1.0, 0.7, 0.2, 0.0). CANONICAL-DECISIONS.md does not specify uniqueness granularity -- it only mandates the weighted sum formula and weights.

**Suggested resolution**: Per Decision 19, `03-muninndb-integration/` is the canonical source for MuninnDB integration. graduation-agent.md should match graduation-model.md's scale, or the two should be reconciled to one canonical set. The 4-level scale from graduation-agent.md is arguably more precise (distinguishing "extends with new detail" at 0.7 from "confirms, no new info" at 0.2), which is useful. Pick one and propagate.

---

### NEW-MN-006 (MINOR): graduation-agent.md engram content format omits source URLs

graduation-agent.md Step 5 (line 244) states: "content: Distilled finding (1-3 sentences, no hedging, **no source URLs**)."

But graduation-model.md (lines 238-240) specifies a content template that includes `Source: {URL}`:

```
{Concise description...}
{Key implementation detail...}
{Source: URL | Confidence: HIGH/MEDIUM}
```

And concept-prefix-extensions.md (lines 60-63) specifies:

```
Source: {URL or "research analysis"} | Confidence: {HIGH|MEDIUM}
Phase: {phase number} | Graduated: {date}
```

Per Decision 19, 03-muninndb-integration is canonical for MuninnDB integration. The engram content format should include source URLs, not exclude them. This is also consistent with one of the stated engram properties: "Traceable: Includes source URL and confidence level" (graduation-model.md line 99).

**Suggested resolution**: Remove "no source URLs" from graduation-agent.md Step 5. Engrams should include source URLs per the canonical content format.

---

## Cross-Section Consistency Check

### 03-muninndb-integration <-> 04-agent-orchestration/graduation-agent.md

| Aspect                  | 03-muninndb-integration                 | graduation-agent.md                     | Consistent?         |
| ----------------------- | --------------------------------------- | --------------------------------------- | ------------------- |
| Scoring formula         | Weighted sum, 0.55 threshold            | Weighted sum, 0.55 threshold            | YES                 |
| Actionability criteria  | Observable signals table (Decision 6)   | Same table + pitfall note               | YES                 |
| Concept prefixes        | research:\* in REPO, deferred promotion | research:\* in REPO, deferred promotion | YES                 |
| Agent name              | lu-research-graduator                   | lu-research-graduator                   | YES                 |
| Model routing           | References ORCHESTRATOR preset          | Specifies ORCHESTRATOR preset           | YES                 |
| Config key casing       | camelCase                               | camelCase                               | YES                 |
| Uniqueness weights      | 3-level (1.0, 0.5, 0.0)                 | 4-level (1.0, 0.7, 0.2, 0.0)            | NO (see NEW-MN-005) |
| Engram content format   | Includes source URL                     | Excludes source URL                     | NO (see NEW-MN-006) |
| maxEngramsPerGraduation | 50                                      | 50                                      | YES                 |
| requireSourceUrl        | Not mentioned                           | false (default)                         | NO (see NEW-MN-004) |

### 03-muninndb-integration <-> 01-workflow-steps/06-graduate.md

| Aspect           | 03-muninndb-integration | 06-graduate.md                                                                 | Consistent?         |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------ | ------------------- |
| Scoring formula  | Weighted sum, 0.55      | Weighted sum, 0.55 (line 56-57)                                                | YES                 |
| Concept prefixes | research:\* in REPO     | Mixed: prose says research:_, code examples say pattern:_/pitfall:_/decision:_ | NO (see NEW-MN-001) |
| Agent name       | lu-research-graduator   | Prose says lu-research-graduator, table says lu-learner (adapted)              | NO (see NEW-MN-001) |
| Vault routing    | All REPO vault          | Mixed: some DEFAULT, some REPO                                                 | NO (see NEW-MN-001) |

### 03-muninndb-integration <-> 06-implementation-plan/config-changes.md

| Aspect                          | 03-muninndb-integration | config-changes.md      | Consistent?         |
| ------------------------------- | ----------------------- | ---------------------- | ------------------- |
| Config key casing               | camelCase               | camelCase              | YES                 |
| Config path                     | research.graduation.\*  | research.graduation.\* | YES                 |
| scoringThreshold default        | 0.55                    | 0.55                   | YES                 |
| confidenceThreshold default     | "MEDIUM"                | "MEDIUM"               | YES                 |
| autoCleanupAfterMilestone       | false                   | false                  | YES                 |
| maxEngramsPerGraduation         | 50                      | NOT PRESENT            | NO (see NEW-MN-003) |
| dedupSimilarityThreshold        | 0.85                    | NOT PRESENT            | NO (see NEW-MN-003) |
| retainPromotedSource            | true                    | NOT PRESENT            | NO (see NEW-MN-003) |
| perTaskRecall.maxEngramsPerTask | Referenced              | 5                      | YES                 |
| Iteration budget table          | Not specified here      | Matches Decision 14    | YES                 |

### 03-muninndb-integration <-> .claude/rules/vault-routing.md

| Aspect              | 03-muninndb-integration      | vault-routing.md                             | Consistent?  |
| ------------------- | ---------------------------- | -------------------------------------------- | ------------ |
| research:\* routing | REPO vault                   | NOT PRESENT (documented as needed migration) | EXPECTED GAP |
| decision:\* routing | DEFAULT vault (for promoted) | NOT PRESENT (documented as needed migration) | EXPECTED GAP |
| Existing prefixes   | All match                    | Canonical source                             | YES          |

The vault-routing.md gaps are expected -- concept-prefix-extensions.md (lines 236-242) explicitly documents that both `research:*` and `decision:*` must be added to the vault-routing rule before v2 deployment. This is a migration item, not a documentation bug.

---

## Backward Compatibility Recheck

The backward compatibility analysis from Round 1 remains valid. Specific verification:

1. **Existing prefixes**: All preserved unchanged in concept-prefix-extensions.md (lines 8-22). No existing prefix has changed vault routing.

2. **New prefix is additive**: `research:*` does not collide with any existing prefix. The prefix uses a colon separator consistent with existing naming.

3. **Config is additive**: All new config fields have defaults. Missing `research` section defaults to features enabled (per ResearchConfigSchema defaults). Missing `workflow.version` defaults to "v1" (per WorkflowVersionSchema default). No existing config path is modified.

4. **Graduation is gated**: `research.graduation.enabled: true` (default) means graduation runs if research files exist. Projects without research files (v1 behavior of skipping research) will see the graduator exit with "No research files found" (graduation-model.md lines 409-419).

5. **vault-guard deployment sequencing**: concept-prefix-extensions.md (lines 237-242) correctly identifies that vault-routing and vault-guard rules must be updated before v2 code deploys. This is documented as a migration dependency.

**One new concern**: The `research.graduation.enabled` field defaults to `true`. This means a project on v1 workflow that happens to have `.planning/phases/NN-name/research/` files (perhaps from manual use) would have graduation attempt to run. The graduator would read the files, score findings, and write `research:*` engrams -- potentially unexpected. However, graduation only runs as Step 6 in the v2 pipeline, and the v2 pipeline only runs when `workflow.version` is "v2". So this is a non-issue: the `enabled` flag is only consulted when the v2 pipeline is active.

---

## Edge Case Recheck

**Round 1 edge cases revisited**:

1. **Graduation produces 0 engrams (all below threshold)**: Now explicitly handled. graduation-model.md (lines 423-428) documents this case with a WARNING in the graduation report and explicit guidance that the planner proceeds without research refs. **ADDRESSED.**

2. **MuninnDB concurrency under load**: Now addressed. lifecycle.md (lines 202-203) includes a concurrency note: "For local MuninnDB instances this is expected to be fine. For remote instances, the orchestrator may optionally batch all recalls for a wave before spawning executors to reduce concurrent load." **ADDRESSED.**

3. **Orphaned engrams from interrupted sessions**: lifecycle.md (lines 469-471) documents partial research graduation. The text could be stronger on the interrupted-after-graduation case, but the milestone cleanup mechanism provides an eventual cleanup path. **ACCEPTABLE.**

4. **Engram bloat from re-graduation**: lifecycle.md (lines 485-489) now clarifies that `maxEngramsPerGraduation` is per-graduation-run and that deduplication mitigates accumulation across re-graduations. **ADDRESSED.**

5. **Cross-vault links**: lifecycle.md (lines 262-265) now includes the NOTE: "muninn_link operates within a single vault. Since the source is in REPO and the target is in DEFAULT, cross-vault links may not be supported. Capture provenance in content text instead." **ADDRESSED.**

---

## Verdict: NEEDS REVISION

The 03-muninndb-integration section itself is in strong shape -- all Round 1 critical and important findings have been fixed, the five documents are internally consistent, and the design is coherent. The section can serve as an implementation specification.

However, **01-workflow-steps/06-graduate.md has not been fully revised** (NEW-MN-001) and still contains the pre-canonical-decision code examples that write directly to `pattern:*`/`pitfall:*`/`decision:*` prefixes, list `lu-learner (adapted)` in the agent table, and show default vault writes during graduation. This is a cross-section inconsistency that would confuse implementers who read 06-graduate.md in isolation.

Additionally, **config-changes.md is missing three graduation config fields** (NEW-MN-003) that the 03-muninndb-integration section references.

**Priority for next iteration**:

1. **NEW-MN-001** (CRITICAL): Revise 01-workflow-steps/06-graduate.md sections 6.4, 6.5, 6.7, the Outputs table, and the Agents Involved table to use `research:*` prefixes, REPO vault, and `lu-research-graduator`
2. **NEW-MN-003** (IMPORTANT): Add `maxEngramsPerGraduation`, `dedupSimilarityThreshold`, and `retainPromotedSource` to config-changes.md's graduation schema
3. **NEW-MN-002** (IMPORTANT): Clarify Decision 11 scope (researchers vs. graduator isolation)
4. **NEW-MN-004** (IMPORTANT): Resolve orphan `requireSourceUrl` field in graduation-agent.md
5. **NEW-MN-005** (MINOR): Reconcile uniqueness weight scales between graduation-model.md and graduation-agent.md
6. **NEW-MN-006** (MINOR): Remove "no source URLs" from graduation-agent.md to match canonical content format

Once NEW-MN-001 and NEW-MN-003 are fixed, the MuninnDB integration documentation will be fully consistent across all cross-referenced sections and ready for implementation.
