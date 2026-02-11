# Plan 15-03 Summary: Cognition Agent & Tag System

**Status:** COMPLETE
**Phase:** 15 (Cognition Per-Agent Audit)
**Wave:** 2
**Depends on:** 15-02 (completed)
**Delivers:** COGN-05 (tag-based selective recall), COGN-04 (runtime cognition behavior)

## Tasks Completed

### Task 1: Tag Vocabulary Document

**Output:** `.planning/phases/15-cognition-per-agent-audit/TAG-VOCABULARY.md`

- Defined all 14 domain tags with descriptions, example entries, and typical agents
- Detailed tag descriptions with usage context for each tag
- lu-learner guidelines: 1-3 tags per entry, domain-level not keyword-level, common combinations table
- Agent-to-tag mapping reference table (all 25 agents)
- Backward compatibility rules for untagged legacy entries
- Guidelines for proposing new tags

### Task 2: lu-cognition Selective Recall Algorithm

**Modified:** `src/agents/general/lu-cognition.agent.ts`

Added `resolve_cognition_tier` step (new, before selective_recall):

- Reads target agent's compiled .md file YAML frontmatter
- Extracts cognition config (default_tier, promotable_to, memory_tags)
- Reads current complexity from STATE.md
- Applies complexity-driven promotion via cognitionPromotions matrix
- Caps at promotable_to ceiling
- Stores effective_tier for recall

Modified `selective_recall` step:

- **Tier gate:** T0 agents skip recall entirely with minimal report
- **Tag-based pre-filtering:** Filters MEMORY.md entries by agent's memory_tags before scoring
- **Backward compatibility:** Entries without Tags field included in all recalls
- **Wildcard support:** Agents with `["*"]` memory_tags receive all entries
- **Tier-scaled entry limits:** T1: 3-5, T2: 5-7, T3: 7-10 (replaces fixed 5-7)

No existing steps were broken or renumbered.

### Task 3: lu-learner Extraction Template

**Modified:** `src/agents/general/lu-learner.agent.ts`

- Added `Tags:` field to pattern extraction template with example format
- Added `Tags:` field to decision extraction template with example format
- Added `Tags:` field to pitfall extraction template with example format
- Added new `<tag_assignment>` section with:
  - Full 14-tag vocabulary list
  - 4 assignment rules (count, vocabulary-first, domain-level, knowledge-type matching)
  - Common combinations table (7 entry types)
  - Guidelines for proposing new tags

### Task 4: lu-cognition Tier-Aware Output

**Modified:** `src/agents/general/lu-cognition.agent.ts`

Updated `generate_report` step with tier-specific output:

- **Cognition Profile section** (all tiers): agent, default_tier, effective_tier, complexity, memory_tags, entries recalled
- **T0:** Minimal report (profile + status + ready for)
- **T1:** Profile + Project Identity + Memory Recall + Relevant Context + Intuition Flags
- **T2:** Everything from T1 + Session Tracking instructions (WORKING.md sections to write to)
- **T3:** Everything from T2 + Project Identity (full BRAIN.md) + Learning Instructions

Updated `structured_returns` with T0 Stateless and T1+ Normal templates.
Updated `success_criteria` with 12 tier-aware verification checks.

## Build Verification

- `bun run build:all` passes: 178 files generated (25 agents, 37 skills, 22 rules, 10 hooks)
- `.claude/agents/lu-cognition.md` contains YAML frontmatter with T3 cognition config
- `.claude/agents/lu-learner.md` contains tag_assignment section and Tags fields in templates
- `.cursor/agents/*` outputs are consistent with `.claude/agents/*`

## Verification Checklist

- [x] TAG-VOCABULARY.md exists with all 14 tags defined with descriptions
- [x] lu-cognition has `resolve_cognition_tier` step that reads agent frontmatter
- [x] lu-cognition selective recall gates on effective_tier (T0 = skip)
- [x] lu-cognition selective recall pre-filters by agent's memory_tags
- [x] Entry limits scale by tier: T1 (3-5), T2 (5-7), T3 (7-10)
- [x] Legacy entries (no Tags field) are included in all recalls (backward compat)
- [x] lu-learner extraction template includes `Tags:` field
- [x] lu-learner has instructions for tag assignment from vocabulary
- [x] Cognitive report output includes tier resolution section
- [x] Cognitive report scales content by tier (T1 < T2 < T3)
- [x] No existing lu-cognition steps are broken or renumbered
- [x] `bun run build:all` succeeds and compiled output reflects source changes
- [x] Both `.claude/` and `.cursor/` outputs are consistent with source

## Files Changed

| File                                                              | Change                                              |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| `.planning/phases/15-cognition-per-agent-audit/TAG-VOCABULARY.md` | Created (306 lines)                                 |
| `src/agents/general/lu-cognition.agent.ts`                        | Modified (+115 lines in Task 2, +8 lines in Task 4) |
| `src/agents/general/lu-learner.agent.ts`                          | Modified (+64 lines)                                |
| `.claude/agents/lu-cognition.md`                                  | Regenerated by build                                |
| `.claude/agents/lu-learner.md`                                    | Regenerated by build                                |
| `.cursor/agents/lu-cognition.md`                                  | Regenerated by build                                |
| `.cursor/agents/lu-learner.md`                                    | Regenerated by build                                |

## Commits

1. `232ec6a` - docs(cognition): define 14-tag domain vocabulary for MEMORY.md selective recall
2. `bf83900` - feat(cognition): add tier-aware gating and tag-based filtering to lu-cognition recall
3. `1bac3a0` - feat(cognition): add Tags field to lu-learner extraction templates
4. `8efe020` - feat(cognition): add tier-aware cognitive report output to lu-cognition

---

_Completed: 2026-02-11_
_Plan: 15-03 (Cognition Agent & Tag System)_
_Phase: 15 (Cognition Per-Agent Audit)_
