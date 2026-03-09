# Product Strategy Alignment Analysis

**Date:** 2026-03-08
**Analyst:** Product Strategist
**Scope:** All 55 pending todos in `.planning/todos/pending/`

---

## Strategic Objectives Reference

| #   | Objective                        | Core Metric                                         |
| --- | -------------------------------- | --------------------------------------------------- |
| O1  | Better code outcomes             | AI produces better code with Luca than without      |
| O2  | Lower token costs                | Reduce memory overhead, eliminate waste             |
| O3  | Robust observability             | MuninnDB-based observer pipeline users actually use |
| O4  | Effective packaging/distribution | Share agents, consume community packages, interop   |

---

## 1. Strategic Alignment Matrix

### Tier S: Transformational (Unlocks new capability categories)

| #   | Title                                     | O1  | O2  | O3  | O4  | User Impact      | Moat            | Action       |
| --- | ----------------------------------------- | --- | --- | --- | --- | ---------------- | --------------- | ------------ |
| 95  | Close Learning Loop: Apply-Measure-Refine | 4   | 2   | 3   | 0   | **Extreme**      | **Strong**      | KEEP         |
| 92  | Inject Memory into Sub-Agent Prompts      | 4   | 1   | 0   | 0   | **Extreme**      | Strong          | KEEP         |
| 77  | Build MuninnDB Emission Layer             | 2   | 0   | 4   | 0   | High             | Strong          | KEEP         |
| 17  | Plugin Marketplace                        | 1   | 0   | 0   | 4   | High (long-term) | **Very Strong** | KEEP (defer) |
| 13  | Adaptive Complexity Self-Tuning           | 4   | 3   | 0   | 0   | High             | **Strong**      | KEEP         |

### Tier A: High-Impact Quick Wins (Memory audit, token savings)

| #   | Title                              | O1  | O2  | O3  | O4  | User Impact | Moat   | Action |
| --- | ---------------------------------- | --- | --- | --- | --- | ----------- | ------ | ------ |
| 89  | Complexity-Gated Recall Depth      | 1   | 4   | 0   | 0   | High        | Medium | KEEP   |
| 90  | Session Context Digest Reuse       | 2   | 4   | 0   | 0   | High        | Medium | KEEP   |
| 91  | Aggressive Milestone-Scoped Recall | 1   | 3   | 0   | 0   | Medium      | Low    | KEEP   |
| 93  | Automatic Session Memory Cleanup   | 1   | 3   | 0   | 0   | Medium      | Low    | KEEP   |
| 94  | Deferred/Lazy Recall               | 0   | 4   | 0   | 0   | Medium      | Medium | KEEP   |

### Tier B: Core Infrastructure (SpacetimeDB removal, observer foundation)

| #   | Title                             | O1  | O2  | O3  | O4  | User Impact | Moat   | Action |
| --- | --------------------------------- | --- | --- | --- | --- | ----------- | ------ | ------ |
| 75  | Remove SpacetimeDB from Framework | 0   | 1   | 3   | 0   | Medium      | N/A    | KEEP   |
| 76  | Delete luca-spacetime Package     | 0   | 0   | 2   | 0   | Low         | N/A    | KEEP   |
| 78  | Strip SpacetimeDB from Observer   | 0   | 0   | 3   | 0   | Medium      | N/A    | KEEP   |
| 88  | Cleanup SpacetimeDB Docs/Planning | 0   | 0   | 1   | 0   | Low         | N/A    | KEEP   |
| 79  | Observer MuninnDB API Layer       | 0   | 0   | 4   | 0   | High        | Medium | KEEP   |

### Tier C: Observer Views (MuninnDB-native, high observability impact)

| #   | Title                         | O1  | O2  | O3  | O4  | User Impact | Moat       | Action |
| --- | ----------------------------- | --- | --- | --- | --- | ----------- | ---------- | ------ |
| 80  | Session Explorer View         | 0   | 0   | 4   | 0   | High        | Medium     | KEEP   |
| 81  | Decision Trail View           | 1   | 0   | 4   | 0   | High        | Strong     | KEEP   |
| 82  | Learning Evolution View       | 1   | 0   | 4   | 0   | High        | Strong     | KEEP   |
| 83  | Knowledge Graph Explorer      | 0   | 0   | 4   | 0   | High        | **Strong** | KEEP   |
| 84  | Semantic Search View          | 0   | 0   | 3   | 0   | Medium      | Medium     | KEEP   |
| 85  | Contradiction & Conflict View | 1   | 0   | 3   | 0   | Medium      | **Strong** | KEEP   |
| 86  | Entity Deep Dive View         | 0   | 0   | 3   | 0   | Medium      | Medium     | KEEP   |
| 87  | Vault Health Dashboard        | 0   | 1   | 3   | 0   | Medium      | Low        | KEEP   |

### Tier D: Framework Improvements (Moderate impact)

| #   | Title                          | O1  | O2  | O3  | O4  | User Impact | Moat   | Action         |
| --- | ------------------------------ | --- | --- | --- | --- | ----------- | ------ | -------------- |
| 15  | Reflective Meta-Cognition      | 3   | 1   | 0   | 0   | High        | Strong | MERGE into #95 |
| 18  | Semantic Memory Embeddings     | 2   | 2   | 0   | 0   | Medium      | Medium | KEEP (defer)   |
| 52  | Agent Health Check             | 2   | 0   | 1   | 0   | Medium      | Low    | KEEP           |
| 53  | Stall Detection & Retry Limits | 3   | 1   | 0   | 0   | Medium      | Low    | KEEP           |
| 55  | Tribunal Consensus Model       | 2   | 0   | 0   | 0   | Low         | Medium | DEFER          |
| 16  | Cross-Agent Interop Scanner    | 1   | 0   | 0   | 3   | Medium      | Medium | KEEP (defer)   |
| 54  | Skill Dependency Graph         | 1   | 0   | 0   | 1   | Low         | Low    | DEFER          |

### Tier E: DX & Housekeeping

| #   | Title                             | O1  | O2  | O3  | O4  | User Impact | Moat | Action       |
| --- | --------------------------------- | --- | --- | --- | --- | ----------- | ---- | ------------ |
| 46  | Deduplicate sanitizeJsonParse     | 1   | 0   | 0   | 0   | Low         | None | KEEP (batch) |
| 50  | Document Observability Domain     | 0   | 0   | 1   | 0   | Low         | None | KEEP (batch) |
| 45  | Bridge CLI Docs Mismatch          | 0   | 0   | 0   | 0   | Low         | None | KEEP (batch) |
| 51  | Build Session Lock Cleanup        | 0   | 0   | 0   | 0   | Medium      | None | KEEP         |
| 63  | Complete node:fs to Bun Migration | 0   | 0   | 0   | 0   | Low         | None | KEEP (batch) |
| 37  | Test Suite Fragility              | 1   | 0   | 0   | 0   | Medium      | None | REWRITE      |

### Tier F: Obsolete / CUT / Superseded by SpacetimeDB Removal

| #   | Title                                  | O1  | O2  | O3  | O4  | User Impact | Moat | Action  |
| --- | -------------------------------------- | --- | --- | --- | --- | ----------- | ---- | ------- |
| 42  | TTL Cleanup for SpacetimeDB Tables     | 0   | 0   | 0   | 0   | None        | None | **CUT** |
| 43  | Sequence Number Race in Ledger         | 0   | 0   | 0   | 0   | None        | None | **CUT** |
| 48  | Singleton Table Constraints            | 0   | 0   | 0   | 0   | None        | None | **CUT** |
| 56  | JSON Blob Normalization                | 0   | 0   | 0   | 0   | None        | None | **CUT** |
| 65  | Rename SpacetimeDB Fields *Json to *Md | 0   | 0   | 0   | 0   | None        | None | **CUT** |
| 64  | Observer Todo Tracking                 | 0   | 0   | 1   | 0   | Low         | None | **CUT** |

### Tier G: Old Observer UI Polish (Conflicts with MuninnDB Rebuild)

| #   | Title                          | O1  | O2  | O3  | O4  | User Impact | Moat   | Action                      |
| --- | ------------------------------ | --- | --- | --- | --- | ----------- | ------ | --------------------------- |
| 40  | Loading Skeleton Consistency   | 0   | 0   | 1   | 0   | Low         | None   | **CUT**                     |
| 41  | Error Boundaries               | 0   | 0   | 2   | 0   | Low         | None   | MERGE into #78              |
| 47  | Accessibility Pass             | 0   | 0   | 1   | 0   | Low         | None   | DEFER                       |
| 49  | Missing Empty States           | 0   | 0   | 1   | 0   | Low         | None   | **CUT**                     |
| 66  | Lucide Icons & Sidebar         | 0   | 0   | 2   | 0   | Low         | None   | MERGE into observer rebuild |
| 67  | Color System Depth             | 0   | 0   | 2   | 0   | Low         | None   | MERGE into observer rebuild |
| 68  | Typography Overhaul            | 0   | 0   | 2   | 0   | Low         | None   | MERGE into observer rebuild |
| 69  | Dashboard Layout Redesign      | 0   | 0   | 2   | 0   | Low         | None   | MERGE into observer rebuild |
| 70  | Charting Library               | 0   | 0   | 2   | 0   | Medium      | None   | MERGE into observer rebuild |
| 71  | Animations & Motion            | 0   | 0   | 1   | 0   | Low         | None   | MERGE into observer rebuild |
| 72  | State Diagram Redesign         | 0   | 0   | 3   | 0   | Medium      | Medium | MERGE into observer rebuild |
| 73  | Time Range & Session Picker    | 0   | 0   | 3   | 0   | Medium      | Low    | MERGE into observer rebuild |
| 74  | Command Palette & Keyboard Nav | 0   | 0   | 2   | 0   | Medium      | Low    | MERGE into observer rebuild |

---

## 2. Items Recommended to CUT (6 items)

### CUT with immediate effect

| #      | Title                                  | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **42** | TTL Cleanup for SpacetimeDB Tables     | **SpacetimeDB is dead.** This todo targets SpacetimeDB tables and reducers that will be deleted (#76). MuninnDB handles its own data lifecycle.                                                                                                                                                                                                                                                                                  |
| **43** | Sequence Number Race in Ledger         | **SpacetimeDB is dead.** The sequence number issue was in the SpacetimeDB emission pipeline. Local ledger is single-threaded Bun (race condition is theoretical only). After SpacetimeDB removal, this is moot.                                                                                                                                                                                                                  |
| **48** | Singleton Table Constraints            | **SpacetimeDB is dead.** Unique constraints on SpacetimeDB singleton tables — the tables themselves are being deleted.                                                                                                                                                                                                                                                                                                           |
| **56** | JSON Blob Normalization                | **SpacetimeDB is dead.** Evaluating normalization of JSON blobs in SpacetimeDB schema that will be deleted.                                                                                                                                                                                                                                                                                                                      |
| **65** | Rename SpacetimeDB Fields *Json to *Md | **SpacetimeDB is dead.** Renaming fields in a schema/package that will be deleted (#76). The todo itself acknowledges this requires `--clear-database`.                                                                                                                                                                                                                                                                          |
| **64** | Observer Todo Tracking                 | **Superseded by MuninnDB observer rebuild.** This todo proposed reading `.planning/todos/` from the filesystem and optionally writing to SpacetimeDB. The observer is being rebuilt from scratch with MuninnDB-native views (#80-87). If todo tracking is valuable, it belongs as a MuninnDB view, not a filesystem reader. The current backlog audit (#89-95) has higher priority. CUT now, re-evaluate after observer rebuild. |

### CUT from old observer UI polish

| #      | Title                        | Rationale                                                                                                                                                                                           |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **40** | Loading Skeleton Consistency | Observer pages are being deleted (#78) and rebuilt with MuninnDB views. Fixing loading skeletons on pages about to be deleted is waste. New views should have proper loading states from the start. |
| **49** | Missing Empty States         | Same rationale as #40 — pages being deleted. New MuninnDB views should include empty states by default.                                                                                             |

**Total CUT: 8 items** -- reduces backlog from 55 to 47.

---

## 3. Items Recommended to MERGE (12 items)

### MERGE A: #15 (Reflective Meta-Cognition) into #95 (Close Learning Loop)

**Rationale:** The memory audit explicitly identified #15 as a SUBSET of #95 Phase A. Reflective meta-cognition IS pattern application in lu-planner. Maintaining both creates confusion about scope.

**Action:** Absorb #15's specific implementation details (plan confidence score, historical pattern matching) into #95 Phase A, step 1 (pattern application in lu-planner). Mark #15 as done/absorbed.

### MERGE B: #41 (Error Boundaries) into #78 (Strip SpacetimeDB from Observer)

**Rationale:** When SpacetimeDB hooks are deleted, all the crash-prone JSON parsing code goes with them. Error boundaries are still needed for the rebuilt MuninnDB views, but they should be built into the new architecture from the start, not retrofitted to the old one.

**Action:** Add "include React error boundaries in all new MuninnDB views" as a requirement in #78 or the first MuninnDB view (#80).

### MERGE C: Old Observer UI Polish (#66-74) into Observer Rebuild

**Rationale:** Nine separate todos (#66-74) describe UI polish for the old SpacetimeDB-based observer: icons, color system, typography, layout, charts, animations, state diagram, time picker, command palette. Since #78 deletes all existing page components, these items describe requirements for the NEW observer, not fixes to the old one.

**Action:** Create a single "Observer Design System & UX Requirements" reference document that consolidates #66-74's requirements. Each MuninnDB view (#80-87) should incorporate these design standards during implementation. Individual todos #66-74 should be marked as "absorbed into observer rebuild" and moved to done.

**Merge mapping:**

- #66 (Lucide icons, sidebar) -- sidebar design requirement for new observer shell
- #67 (Color system) -- design token requirement for new observer
- #68 (Typography) -- type scale requirement for new observer
- #69 (Dashboard layout) -- layout requirement for new Session Explorer (#80)
- #70 (Charting) -- charting requirement for Learning Evolution (#82) and Vault Health (#87)
- #71 (Animations) -- motion requirement, apply to all new views
- #72 (State diagram) -- specific component for Session Explorer (#80)
- #73 (Time range/session picker) -- filter component for all new views
- #74 (Command palette) -- power user feature, implement after core views ship

---

## 4. Recommended Milestone Themes

### Milestone v3.1: "Memory That Works" (Next milestone -- HIGHEST PRIORITY)

**Theme:** Close the learning loop and make memory behaviorally effective.

**Why this first:** The memory audit's findings are devastating: Luca captures and recalls learnings but no agent acts on them. This is the difference between a demo and a product. Every day this stays open, agents produce code that ignores their own past experience. This directly serves O1 (better code outcomes) and O2 (lower token costs).

**Items (ordered):**

1. **#89** Complexity-gated recall depth (SIMPLE, 2-3h) -- quick token savings
2. **#91** Aggressive milestone-scoped recall (SIMPLE, 1-2h) -- quick noise reduction
3. **#93** Automatic session memory cleanup (SIMPLE, 2-3h) -- hygiene prerequisite
4. **#90** Session context digest reuse (MODERATE, 3-4h) -- token savings + foundation for #92
5. **#92** Inject memory into sub-agent prompts (MODERATE, 6-8h) -- highest-impact single fix
6. **#95** Close the learning loop, Phase A: APPLY (COMPLEX, 6-8h) -- transformational
7. **#13** Adaptive complexity self-tuning (COMPLEX, 8-12h) -- moat builder, feeds back into #89

**Estimated total effort:** 30-40 hours
**Token savings:** ~10-15K tokens per session (5-8% of 200K context)
**Code quality impact:** Agents apply past patterns, avoid past pitfalls, respect past decisions

### Milestone v3.2: "Observer Rebirth" (Second milestone)

**Theme:** Replace SpacetimeDB with MuninnDB across the entire stack and ship the first 4 observer views.

**Why second:** The observer is the user's window into what the AI is doing. With memory now behaviorally effective (v3.1), users need to SEE the decisions, learnings, and evolution. This is also necessary hygiene -- SpacetimeDB dead code creates confusion.

**Items (ordered):**

1. **#75** Remove SpacetimeDB from framework (infrastructure cleanup)
2. **#76** Delete luca-spacetime package (infrastructure cleanup)
3. **#77** Build MuninnDB emission layer (new infrastructure)
4. **#78** Strip SpacetimeDB from observer (infrastructure cleanup)
5. **#88** Cleanup SpacetimeDB docs/planning (documentation)
6. **#79** Observer MuninnDB API layer (API foundation)
7. **#80** Session Explorer view (priority view #1)
8. **#81** Decision Trail view (priority view #2)
9. **#82** Learning Evolution view (priority view #3)
10. **#87** Vault Health Dashboard (operational view)

Design requirements from #66-74 should be applied to all new views.

**Estimated total effort:** 60-80 hours

### Milestone v3.3: "Intelligence & Ecosystem" (Third milestone)

**Theme:** Advanced intelligence features and ecosystem groundwork.

**Items:**

- **#83** Knowledge Graph Explorer (hero observer view)
- **#84** Semantic Search view
- **#85** Contradiction & Conflict view
- **#86** Entity Deep Dive view
- **#95** Close the learning loop, Phases B+C: MEASURE + REFINE
- **#18** Semantic memory embeddings (if MuninnDB doesn't natively support)
- **#94** Deferred/lazy recall
- **#16** Cross-agent interop scanner (ecosystem groundwork)
- **#17** Plugin marketplace (begin design/prototyping)
- **#52** Agent health check
- **#53** Stall detection & retry limits

---

## 5. "Must Do Next" List

Items that unlock the most value soonest, in strict execution order:

| Priority | #              | Title                              | Why NOW                                              | Effort | Unlocks                                 |
| -------- | -------------- | ---------------------------------- | ---------------------------------------------------- | ------ | --------------------------------------- |
| 1        | **89**         | Complexity-gated recall depth      | Immediate token savings, zero risk, config change    | 2-3h   | Proves memory optimization pattern      |
| 2        | **91**         | Aggressive milestone-scoped recall | Same rationale, stacks with #89                      | 1-2h   | Cleaner recall for all downstream items |
| 3        | **93**         | Automatic session memory cleanup   | Hygiene prerequisite, prevents MuninnDB pollution    | 2-3h   | Clean vault for all downstream items    |
| 4        | **90**         | Session context digest reuse       | Highest-ROI token optimization per audit             | 3-4h   | Foundation for #92                      |
| 5        | **92**         | Inject memory into sub-agents      | **Audit's #1 finding.** Sub-agents are memory-blind. | 6-8h   | #95 becomes possible                    |
| 6        | **95 Phase A** | Close learning loop: APPLY         | **Most transformational item in entire backlog.**    | 6-8h   | Memory becomes behavioral               |

These 6 items (19-28 hours total) represent the highest-impact work in the entire backlog. They directly address the memory audit's critical findings and transform Luca from "AI with a diary it never reads" to "AI that learns from experience."

---

## 6. "Moat Builders" List

Items that create lasting competitive advantage:

| #      | Title                           | Moat Type                              | Why Defensible                                                                                                                                                                                                    |
| ------ | ------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **95** | Close Learning Loop             | **Behavioral intelligence moat**       | No competitor has agents that act on past learnings. This is not a feature -- it's a fundamental architecture difference. Once working, every session makes Luca smarter. Compounding advantage.                  |
| **13** | Adaptive Complexity Self-Tuning | **Dynamic resource optimization moat** | No competitor does mid-execution complexity reassessment. Tasks that grow in scope get more resources automatically. Reduces user intervention.                                                                   |
| **17** | Plugin Marketplace              | **Network effects moat**               | Each published agent/skill increases platform value for all users. First mover wins -- once users invest in publishing Luca-format agents, switching costs increase. Strongest long-term moat but highest effort. |
| **83** | Knowledge Graph Explorer        | **Observability differentiation moat** | Interactive force-directed graph of AI's understanding. No dev tool shows this. Visual "wow factor" that demonstrates intelligence depth.                                                                         |
| **85** | Contradiction & Conflict View   | **Trust mechanism moat**               | Proactively shows conflicting AI beliefs. No competitor does this. Builds trust by showing the AI is self-aware about its own inconsistencies.                                                                    |
| **92** | Inject Memory into Sub-Agents   | **Context preservation moat**          | Solves the "memory dilution curve" that all multi-agent systems suffer from. This is a deep architectural advantage that's hard to replicate.                                                                     |
| **18** | Semantic Memory Embeddings      | **Recall precision moat**              | Semantic similarity over lexical matching. Fundamentally better recall. But only matters AFTER the learning loop is closed (#95) -- otherwise you're precisely recalling patterns nobody acts on.                 |

### Moat Strategy Summary

**Short-term moat (v3.1):** Behavioral intelligence -- memory that actually works. This is the fastest path to differentiation because the infrastructure (MuninnDB) already exists.

**Medium-term moat (v3.2-3.3):** Observability depth -- letting users SEE intelligence in action. Knowledge graph, decision trails, contradiction detection. These are visual proof of the intelligence moat.

**Long-term moat (v3.3+):** Ecosystem network effects via plugin marketplace. Highest effort, highest ceiling. Deferred correctly because the intelligence moat must exist first (nobody publishes agents for a framework that doesn't learn).

---

## 7. Observer Strategy Recommendation

### Problem Statement

There are two sets of observer todos in conflict:

- **Old UI polish (#66-74):** 9 items targeting the SpacetimeDB-based observer (design system, charts, animations, etc.)
- **New MuninnDB views (#79-87):** 9 items building a MuninnDB-native observer from scratch

Since #78 (Strip SpacetimeDB from Observer) deletes all existing page components, the old UI polish items target code that will not exist.

### Recommendation: Absorb, Don't Maintain Both

**Do NOT maintain two parallel observer tracks.** Instead:

1. **Consolidate #66-74 into a design requirements doc** (`.planning/notes/observer-design-requirements.md`)
   - Extract the specific requirements: color system tokens, type scale, chart library choice, animation patterns, sidebar grouping, keyboard shortcuts
   - These become constraints on the new MuninnDB views, not standalone work items

2. **Delete #66-74 as independent todos** (mark as absorbed)

3. **Build design system INTO the new views as they're implemented:**
   - #80 (Session Explorer) establishes the layout, sidebar, color system, typography
   - #82 (Learning Evolution) establishes the charting library and patterns
   - #83 (Knowledge Graph) establishes the interactive visualization approach
   - Later views inherit the established design system

4. **Defer power-user features:**
   - Command palette (#74) and time range picker (#73) are valuable but not MVP
   - Ship 4 core views first, then add cross-cutting UX features

### Observer Build Order

```
Phase 1: Infrastructure
  #75 → #76 → #78 → #88 (SpacetimeDB removal)
  #77 (MuninnDB emission layer)
  #79 (MuninnDB API layer)

Phase 2: Core Views (ship as a batch)
  #80 Session Explorer (establishes design system)
  #81 Decision Trail
  #82 Learning Evolution (establishes charts)
  #87 Vault Health

Phase 3: Power Views
  #83 Knowledge Graph Explorer
  #84 Semantic Search
  #85 Contradiction & Conflict
  #86 Entity Deep Dive

Phase 4: UX Polish (post-MVP)
  Command palette, keyboard nav, animations
  Time range selector, session comparison
  Accessibility pass
```

### Why This Order

- Phase 1 is pure cleanup -- no user value but removes dead code and enables everything else
- Phase 2 delivers the "minimum useful observer" -- a user can browse sessions, trace decisions, track learning growth, and check vault health
- Phase 3 delivers the "wow" views that demonstrate MuninnDB's unique capabilities
- Phase 4 is polish that makes the tool delightful for daily use

---

## 8. Additional Observations

### Items That Need Rewriting

| #      | Title                | Issue                                                                                                                                            | Recommendation                                                                                                                                  |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **37** | Test Suite Fragility | References test infrastructure that was intentionally removed. The `.claude/rules/no-tests.md` rule prohibits test files. This todo is in limbo. | REWRITE to scope as "design test reintroduction strategy" rather than "fix 29 failing tests." Link to `.planning/notes/0-reintroduce-tests.md`. |

### Effort-to-Impact Winners

The memory audit items (#89, #91, #93) are the best effort-to-impact ratio in the entire backlog:

- **#89:** 2-3 hours for 2-3K token savings per MODERATE task
- **#91:** 1-2 hours for 30% noise reduction in recall
- **#93:** 2-3 hours to prevent unbounded vault pollution

Total: 5-8 hours to measurably improve every future session.

### Risk Items

- **#95 without #92 is meaningless:** If sub-agents don't receive memory context (#92), they can't act on it (#95). These MUST be sequenced correctly.
- **#77 is the observer bottleneck:** Until the MuninnDB emission layer exists, the observer has no data to display. This blocks all 8 MuninnDB views.
- **#17 (Plugin Marketplace) is correctly deferred:** The intelligence moat must exist before ecosystem makes sense. Nobody publishes agents for a framework that doesn't learn.

### Items Not Serving Any Objective

| #   | Title                    | Assessment                                                                                                            |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 47  | Accessibility Pass       | Correct but zero strategic alignment. DEFER until observer rebuild is complete, then apply to new views.              |
| 54  | Skill Dependency Graph   | No known bugs. Theoretical improvement. DEFER indefinitely.                                                           |
| 55  | Tribunal Consensus Model | Current tribunal works. Enhancement, not a gap. DEFER until debate pattern is proven (see MEMORY.md debate findings). |

---

## 9. Summary Scorecard

| Metric                                        | Count |
| --------------------------------------------- | ----- |
| Total pending todos                           | 55    |
| Recommended CUT                               | 8     |
| Recommended MERGE (absorbed into other items) | 12    |
| Remaining actionable items                    | 35    |
| "Must do next" items                          | 6     |
| Moat builders identified                      | 7     |
| Milestone themes defined                      | 3     |

### Net Backlog After Actions

If all CUT and MERGE recommendations are executed:

- **55 → 35 actionable items** (36% reduction)
- Clearer priorities, no dead SpacetimeDB items, no duplicate observer tracks
- First milestone (v3.1) is tightly scoped at 6 items / 19-28 hours
