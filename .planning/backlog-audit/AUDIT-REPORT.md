# Unified Backlog Audit Report

**Date:** 2026-03-08
**Synthesized by:** lu-roadmap-synthesizer
**Sources:** Architect, Prioritizer, QA Analyst, Product Strategist
**Scope:** 55 pending todos in `.planning/todos/pending/`

---

## 1. Executive Summary

The Luca Framework backlog contains **55 pending items** accumulated across SpacetimeDB-era tech debt, MuninnDB migration work, memory optimization, observer rebuild, and future capabilities. This audit cross-references four specialist analyses to produce a single actionable plan.

**Key findings:**

- **CUT 19 items** (5 obsolete SpacetimeDB + 11 superseded old observer UI + 3 low-value/duplicate) — 35% reduction
- **MERGE 4 groups** (10 items collapse into 4 effective items)
- **Net actionable backlog: 30 items** (down from 55)
- **Next milestone (v3.1) is tightly scoped:** 7 phases, ~35-45 hours, focused on memory effectiveness + platform cleanup
- **Strongest moat opportunity:** Close the learning loop (#95) — no competitor has agents that act on past learnings

**Strategic frame:** The memory audit revealed that Luca captures and recalls learnings but no agent acts on them. Fixing this is the single highest-leverage investment. SpacetimeDB removal is necessary hygiene that unblocks the observer rebuild. Everything else follows from these two tracks.

---

## 2. Items to CUT (19 items)

### 2a. Obsolete — SpacetimeDB Internals (5 items)

All four analysts unanimously agree these target a platform being deleted.

| #      | Title                                  | Rationale                                                                                     |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| **42** | P2: Unbounded table growth TTL cleanup | SpacetimeDB tables/reducers being deleted (#76). MuninnDB handles its own lifecycle.          |
| **43** | P2: Sequence number race condition     | SpacetimeDB ledger race. Local ledger is single-threaded Bun; theoretical risk only. Moot.    |
| **48** | P2: Singleton table constraints        | SpacetimeDB schema being deleted (#76).                                                       |
| **56** | P3: JSON blob normalization            | SpacetimeDB schema being deleted (#76). ROADMAP already deferred this.                        |
| **65** | Rename SpacetimeDB memory fields       | SpacetimeDB package being deleted (#76). The todo itself acknowledges it requires --clear-db. |

**Action:** Close all 5 as OBSOLETE immediately.

### 2b. Superseded — Old Observer UI Polish (11 items)

Since #78 (Strip SpacetimeDB from Observer) deletes ALL existing page components, these items target code that will not exist. The prioritizer scored all 11 with WSJF < 3.5. The architect confirmed zero framework impact. The product strategist confirmed zero strategic alignment. All valid intent is captured by the MuninnDB observer rebuild (#79-87).

| #      | Title                              | Superseded By                                               |
| ------ | ---------------------------------- | ----------------------------------------------------------- |
| **40** | Loading skeleton consistency       | #78 deletes pages; new views (#79-87) build fresh           |
| **47** | Accessibility pass                 | Defer until observer rebuild complete; bake into new views  |
| **49** | Missing empty states               | #78 deletes pages; new views include empty states natively  |
| **66** | Observer Lucide icons sidebar      | Absorbed into observer rebuild design requirements          |
| **67** | Observer color system depth        | Absorbed into observer rebuild design requirements          |
| **68** | Observer typography overhaul       | Absorbed into observer rebuild design requirements          |
| **69** | Observer dashboard layout redesign | #78 deletes dashboard; #80 rebuilds as Session Explorer     |
| **70** | Observer charting library          | Charting decisions made fresh for MuninnDB views            |
| **71** | Observer animations/motion         | Polish — premature before observer rewrite completes        |
| **72** | Observer state diagram redesign    | Old state diagram deleted in #78; rebuilt in MuninnDB views |
| **73** | Observer time range/session picker | Functionality absorbed into #80 Session Explorer            |

**Action:** Close all 11. Create a single design requirements reference doc (`.planning/notes/observer-design-requirements.md`) that consolidates the valid requirements from #66-73 as constraints on the new MuninnDB views.

### 2c. Additional Cuts (3 items)

| #      | Title                    | Rationale                                                                                                       |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **64** | Observer todo tracking   | Superseded by MuninnDB rebuild. Product strategist: zero strategic alignment. Re-create post-rebuild if needed. |
| **74** | Observer command palette | Power user feature. Premature before views exist. Re-create after core MuninnDB views ship.                     |
| **41** | Error boundaries         | Pages being deleted. Requirement absorbed into #78/#80 — new views must include error boundaries from day one.  |

**Action:** Close all 3. Document error boundary requirement in #78 acceptance criteria.

**Total CUT: 19 items** (55 → 36 remaining)

---

## 3. Items to MERGE (4 groups, 10 items → 4 effective items)

### MERGE A: #15 → #95 (Learning Loop absorbs Meta-Cognition)

| Source                          | Target                    | Rationale                                                                                                          |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| #15 (Reflective meta-cognition) | #95 (Close learning loop) | All 4 analysts agree. #15 is explicitly a SUBSET of #95 Phase A. The todo itself says "Consider merging into #95." |

**Action:** Mark #15 as absorbed into #95. Add #15's specific requirements (plan confidence scoring, historical pattern matching) to #95 Phase A acceptance criteria.

### MERGE B: #75 + #76 + #88 → Single SpacetimeDB Removal Phase

| Items         | Merged Title                                     | Rationale                                                                                                                 |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| #75, #76, #88 | "Remove SpacetimeDB: framework + package + docs" | Strict dependency chain (#75→#76→#88). Architect confirms sequential order. Execute as single phase with 3 ordered steps. |

**Action:** Execute as one phase. #75 first (framework surgery), then #76 (delete package), then #88 (clean docs/planning). Keep as separate todos for tracking but execute atomically.

### MERGE C: #90 + #92 → Sub-Agent Memory Pipeline

| Items                                                             | Merged Title                                    | Rationale                                                                                                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #90 (Session context digest), #92 (Inject memory into sub-agents) | "Sub-agent memory pipeline: digest + injection" | #90 is the mechanism, #92 is the goal. Prioritizer: building digests without injecting is waste. Architect: both touch skill→agent boundary. Implement together. |

**Action:** Implement as one phase. #90 (create digest) first, then #92 (inject into prompts) in same phase.

### MERGE D: #89 + #91 → Recall Scoring Optimization

| Items                                                              | Merged Title                                                       | Rationale                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| #89 (Complexity-gated recall depth), #91 (Milestone-scoped recall) | "Recall scoring optimization: complexity gating + milestone decay" | Both modify the same file (`lu-cognition.agent.ts` recall scoring). Combined effort is ~3-4h, smaller than doing separately. |

**Action:** Implement as one phase. Both are config-level changes to the same agent file.

**After merges: 36 - 6 absorbed = 30 effective items**

---

## 4. Prioritized Backlog (30 items after cuts/merges)

Unified priority ranking using: WSJF (prioritizer) as primary sort, architectural risk (architect) as execution constraint, tech debt severity (QA) as urgency signal, strategic alignment (product) as tiebreaker.

| Priority | #               | Title                                               | WSJF | Arch Risk | Tech Debt | Strategy      | Milestone |
| -------- | --------------- | --------------------------------------------------- | ---- | --------- | --------- | ------------- | --------- |
| 1        | **#89+#91**     | Recall scoring: complexity gating + milestone decay | 10.5 | LOW       | MEDIUM    | Tier A        | v3.1      |
| 2        | **#93**         | Automatic session memory cleanup                    | 12.0 | LOW       | HIGH      | Tier A        | v3.1      |
| 3        | **#75+#76+#88** | SpacetimeDB removal (framework + package + docs)    | 9.5  | HIGH      | CRITICAL  | Tier B        | v3.1      |
| 4        | **#90+#92**     | Sub-agent memory pipeline (digest + injection)      | 8.5  | HIGH      | CRITICAL  | Tier S        | v3.1      |
| 5        | **#53**         | Stall detection retry limit                         | 7.3  | MEDIUM    | HIGH      | Tier D        | v3.1      |
| 6        | **#52**         | Agent health check system                           | 6.3  | MEDIUM    | MEDIUM    | Tier D        | v3.1      |
| 7        | **#46**         | Deduplicate sanitizeJsonParse                       | 7.5  | LOW       | HIGH      | Tier E        | v3.1      |
| 8        | **#50**         | Document observability domain                       | 15.0 | LOW       | MEDIUM    | Tier E        | v3.1      |
| 9        | **#45**         | Bridge CLI docs mismatch                            | 5.5  | LOW       | MEDIUM    | Tier E        | v3.1      |
| 10       | **#51**         | Build session lock cleanup                          | 7.5  | LOW       | HIGH      | Tier E        | v3.1      |
| 11       | **#63**         | Complete node:fs to Bun migration                   | 6.5  | MEDIUM    | HIGH      | Tier E        | v3.1      |
| 12       | **#77**         | Build MuninnDB emission layer                       | 4.8  | HIGH      | HIGH      | Tier S        | v3.2      |
| 13       | **#78**         | Strip SpacetimeDB from observer                     | 7.0  | HIGH      | HIGH      | Tier B        | v3.2      |
| 14       | **#79**         | Observer MuninnDB API layer                         | 6.7  | MEDIUM    | MEDIUM    | Tier B        | v3.2      |
| 15       | **#80**         | Session Explorer view                               | 5.7  | LOW       | LOW       | Tier C        | v3.2      |
| 16       | **#81**         | Decision Trail view                                 | 5.3  | LOW       | LOW       | Tier C        | v3.2      |
| 17       | **#82**         | Learning Evolution view                             | 4.7  | LOW       | LOW       | Tier C        | v3.2      |
| 18       | **#87**         | Vault Health Dashboard                              | 4.0  | LOW       | LOW       | Tier C        | v3.2      |
| 19       | **#95**         | Close learning loop (absorbs #15)                   | 5.2  | HIGH      | CRITICAL  | Tier S        | v3.3      |
| 20       | **#13**         | Adaptive complexity self-tuning                     | 4.0  | MEDIUM    | HIGH      | Tier S        | v3.3      |
| 21       | **#94**         | Deferred/lazy recall                                | 5.7  | MEDIUM    | MEDIUM    | Tier A        | v3.3      |
| 22       | **#84**         | Semantic Search view                                | 4.3  | LOW       | NONE      | Tier C        | v3.3      |
| 23       | **#85**         | Contradiction & Conflict view                       | 4.3  | LOW       | NONE      | Tier C        | v3.3      |
| 24       | **#83**         | Knowledge Graph Explorer                            | 2.8  | MEDIUM    | LOW       | Tier C        | v3.3      |
| 25       | **#86**         | Entity Deep Dive view                               | 3.7  | LOW       | NONE      | Tier C        | v3.3      |
| 26       | **#18**         | Semantic memory embeddings                          | 3.0  | MEDIUM    | MEDIUM    | Tier D        | v3.3+     |
| 27       | **#55**         | Tribunal consensus model                            | 2.8  | MEDIUM    | MEDIUM    | Tier D        | v3.3+     |
| 28       | **#54**         | Skill dependency graph                              | 2.6  | MEDIUM    | MEDIUM    | Tier D        | v3.3+     |
| 29       | **#16**         | Cross-agent interop scanner                         | 2.6  | HIGH      | MEDIUM    | Tier D        | v3.3+     |
| 30       | **#17**         | Plugin marketplace                                  | 2.3  | HIGH      | LOW       | Tier S (moat) | v4.0      |

**#37 (Test suite fragility)** is tracked separately — not prioritized in normal flow due to `no-tests.md` rule. Reintroduction is a dedicated effort per `.planning/notes/0-reintroduce-tests.md`.

---

## 5. Milestone Plan

### v3.1.0 — "Memory Intelligence & Platform Cleanup"

**Theme:** Make memory behaviorally effective. Remove dead platform. Improve DX.
**Estimated effort:** 35-45 hours across 7 phases
**Strategic objectives served:** O1 (better code outcomes), O2 (lower token costs)

| Phase | Items                   | Title                       | Effort            | Rationale                                                                                                                                                                                        |
| ----- | ----------------------- | --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | #89+#91                 | Recall scoring optimization | SIMPLE (3-4h)     | Quick win. Immediate 2-3K token savings per task. Both modify same file. Zero risk.                                                                                                              |
| 2     | #93                     | Session memory cleanup      | SIMPLE (2-3h)     | Data hygiene prerequisite. Prevents unbounded vault pollution before heavier memory work.                                                                                                        |
| 3     | #75+#76+#88             | SpacetimeDB removal         | MODERATE (10-13h) | Strict dependency chain. Removes ~200+ lines dead code. Unblocks observer rebuild in v3.2. Close #42, #43, #48, #56, #65 as OBSOLETE after completion.                                           |
| 4     | #90+#92                 | Sub-agent memory pipeline   | MODERATE (9-12h)  | Highest-impact single fix per memory audit. Context preservation goes from ~10% to 60-80% through agent spawn chain. Place helper in `src/shared/__helpers/` to avoid T2 cross-entity violation. |
| 5     | #53                     | Stall detection retry limit | MODERATE (3-4h)   | Prevents infinite verification loops. Without this, stuck workflows burn tokens forever.                                                                                                         |
| 6     | #52                     | Agent health check          | MODERATE (4-6h)   | Validates agent configs at cognitive pre-flight. Catches broken agents before they waste a phase.                                                                                                |
| 7     | #46, #50, #45, #51, #63 | Cleanup sprint              | SIMPLE x5 (6-10h) | DRY dedup, doc gaps, lock cleanup, Bun migration. Batch for efficiency.                                                                                                                          |

**Why this ordering:**

- Phases 1-2 are zero-risk quick wins that deliver immediate token savings
- Phase 3 is necessary hygiene — SpacetimeDB dead code confuses every agent session
- Phase 4 is the transformational fix — sub-agents finally get memory context
- Phases 5-6 improve agentic reliability (prevent stalls, validate agents)
- Phase 7 batches small housekeeping items

**Items explicitly NOT in v3.1 (and why):**

- #77 (MuninnDB emission): COMPLEX effort, better scoped with observer in v3.2
- #95 (learning loop): COMPLEX, needs #92 memory injection stabilized first
- #13 (complexity self-tuning): COMPLEX, depends on recall depth (#89) being proven
- #37 (tests): Separate effort per project rules

### v3.2.0 — "Observer Rebirth"

**Theme:** Replace SpacetimeDB with MuninnDB across the observer stack. Ship first 4 views.
**Estimated effort:** 50-65 hours across 8 phases
**Strategic objectives served:** O3 (robust observability)
**Prerequisite:** v3.1 Phase 3 (SpacetimeDB removal from framework)

| Phase | Items                    | Title                                               | Effort          |
| ----- | ------------------------ | --------------------------------------------------- | --------------- |
| 1     | #77                      | Build MuninnDB emission layer                       | COMPLEX (8-12h) |
| 2     | #78                      | Strip SpacetimeDB from observer                     | MODERATE (4-6h) |
| 3     | #79                      | Observer MuninnDB API layer                         | MODERATE (6-8h) |
| 4     | #80                      | Session Explorer view (establishes design system)   | MODERATE (6-8h) |
| 5     | #81                      | Decision Trail view                                 | MODERATE (6-8h) |
| 6     | #82                      | Learning Evolution view (establishes charts)        | MODERATE (6-8h) |
| 7     | #87                      | Vault Health Dashboard                              | MODERATE (4-6h) |
| 8     | Close old observer items | Close #40, #47, #49, #66-74, #41, #64 as superseded | 15min           |

**Design constraints:** Requirements from cut items #66-74 (icons, color system, typography, charting, animations, layout) should be documented in `.planning/notes/observer-design-requirements.md` and applied as each new view is built. #80 (Session Explorer) establishes the design system; subsequent views inherit it.

**Why #77 before #78:** The emission layer (#77) creates the data pipeline that feeds the new views. Without it, the new observer has no data. The architect confirms #77 can run in parallel with SpacetimeDB removal from the framework (#75) but must complete before observer views are built.

### v3.3.0 — "Cognitive Maturity & Observer Depth"

**Theme:** Self-tuning agents, learning loops, advanced observer views.
**Estimated effort:** 55-75 hours across 8+ phases
**Strategic objectives served:** O1 (better outcomes), O3 (observability depth), O4 (ecosystem groundwork)

| Phase | Items              | Title                                               | Effort                                 |
| ----- | ------------------ | --------------------------------------------------- | -------------------------------------- |
| 1     | #95 (Phases A+B+C) | Close learning loop: Apply-Measure-Refine           | COMPLEX (12-20h)                       |
| 2     | #13                | Adaptive complexity self-tuning                     | COMPLEX (8-12h)                        |
| 3     | #94                | Deferred/lazy recall                                | MODERATE (6-8h)                        |
| 4     | #83                | Knowledge Graph Explorer                            | COMPLEX (6-8h)                         |
| 5     | #84, #85           | Semantic Search + Contradiction views               | MODERATE x2 (6-8h)                     |
| 6     | #86                | Entity Deep Dive view                               | MODERATE (4-6h)                        |
| 7+    | #18, #55, #54, #16 | Semantic embeddings, tribunal, skill graph, interop | COMPLEX x4 (deferred within milestone) |

**Sequencing rationale:**

- #95 (learning loop) first — it's the most transformational item in the entire backlog and requires #92 (shipped in v3.1) to be stable
- #13 (self-tuning) second — feeds back into #89 (recall depth) creating a self-improving loop
- Observer power views (#83-86) ship after core views (v3.2) prove the MuninnDB API
- #18, #55, #54, #16 are lower priority but included in milestone scope for planning purposes; actual execution timing is flexible

### v4.0.0 — "Plugin Ecosystem"

| Items | Title                                      | Effort            |
| ----- | ------------------------------------------ | ----------------- |
| #17   | Plugin Marketplace with Community Registry | CRITICAL (40-60h) |

**Deferred by design.** The intelligence moat (#95, #13) must exist before ecosystem makes sense. Nobody publishes agents for a framework that doesn't learn. T3→T2 tier violation risk needs careful architectural design.

### Deferred Indefinitely

| #   | Title                | Reason                                                                                                                                                     |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #37 | Test suite fragility | Tests intentionally disabled per `.claude/rules/no-tests.md`. Reintroduction is a separate dedicated effort. See `.planning/notes/0-reintroduce-tests.md`. |

---

## 6. Conflicts & Resolutions

### Conflict 1: Test Reintroduction Urgency

**QA says:** #37 is THE most important item. It's the root cause of zero test coverage. Every other item ships without regression protection.

**Product says:** Memory items first. Tests are a DX concern, not a user-facing feature.

**Architect says:** Deferred per ROADMAP and `no-tests.md` rule. Don't attempt until dedicated effort is scoped.

**Resolution: Architect and Product win.** The `no-tests.md` rule exists because `bun test` was orphaning hundreds of processes and freezing the machine. This is a process-level blocker that requires dedicated investigation, not just "fix the tests." Memory items deliver measurable user value now; test reintroduction is infrastructure work that should happen in a dedicated sprint, not interleaved with feature development. However, QA's concern is valid — acknowledge the risk and ensure v3.1 items are implemented with small, reviewable PRs and thorough typechecking.

### Conflict 2: v3.1 Scope — SpacetimeDB Removal vs Memory-First

**Product says:** Memory items (#89-93, #90+#92, #95 Phase A) should be the ENTIRE v3.1. SpacetimeDB removal can wait for v3.2.

**Prioritizer says:** SpacetimeDB removal has high time-criticality (WSJF 8.0-11.0) because dead code confuses agents every session.

**Architect says:** SpacetimeDB removal is a strict dependency chain that unblocks all observer work. Do it alongside memory items.

**Resolution: Include both.** SpacetimeDB removal is 10-13 hours of well-scoped deletion work. It doesn't compete with memory items for complexity budget — it's a different kind of work (deletion vs creation). Running them in the same milestone creates a clean boundary: v3.1 ends with "memory works + dead platform gone," v3.2 starts with "build the new observer." Product's #95 Phase A is deferred to v3.3 because it depends on #92 being stable.

### Conflict 3: Observer UI Items — Cut vs Absorb

**Architect says:** Observer UI polish (#66-74) is isolated and safe to defer to a dedicated milestone.

**Prioritizer says:** All 13 old observer items are SUPERSEDED by #78. Cut them all.

**Product says:** Absorb #66-74 requirements into the observer rebuild as design constraints, not standalone todos.

**QA says:** Low-risk, visual verification only. No opinion on organizational structure.

**Resolution: CUT the todos, ABSORB the requirements.** The individual todo files should be closed. Their valid requirements (color system, typography, charting library, etc.) should be documented in a single `.planning/notes/observer-design-requirements.md` file that serves as a design spec for the MuninnDB observer views. This eliminates 11 items from the backlog while preserving the design intent.

### Conflict 4: #77 (MuninnDB Emission) Placement

**Prioritizer says:** Scope with observer rewrite in v3.1.1 (separate from v3.1).

**Product says:** Place in v3.2 after SpacetimeDB removal.

**Architect says:** Can run in parallel with #75-#76 since it's additive. High risk but well-scoped.

**Resolution: v3.2 Phase 1.** The emission layer is the data pipeline that feeds the observer. It logically belongs with the observer rebuild milestone. Starting v3.2 with #77 means the data pipeline is ready before views are built.

### Conflict 5: #95 Phase A Timing

**Product says:** Include #95 Phase A in v3.1 (item 6 in their "must do next" list).

**Architect says:** #95 depends on #92 (inject memory) being stable. Place in Phase 6 after Phase 5 (#92).

**QA says:** #95 is CRITICAL tech debt but needs test infrastructure. Place in Phase 3 (ambitious items).

**Resolution: Defer to v3.3.** #95 is the most transformational item in the backlog, but it's also the widest blast radius (5 files across 2 tiers). Rushing it into v3.1 while #92 (sub-agent memory injection) is brand new is risky. Let #92 stabilize in v3.1, then #95 in v3.3 has a solid foundation to build on. The product strategist's urgency is correct in spirit — this IS the most important thing — but sequencing it after its dependency stabilizes is safer.

---

## 7. Open Questions — RESOLVED

### Q1: Test Reintroduction Timeline

**Decision:** Move test reintroduction (#37) to last priority. Stays in backlog but deferred indefinitely per existing `no-tests.md` rule.

### Q2: Observer Design Requirements Doc

**Decision:** YES — created `.planning/notes/observer-design-requirements.md` consolidating #66-74 design requirements as constraints on new MuninnDB views.

### Q3: #64 (Observer Todo Tracking) Re-Scope

**Decision:** Re-scoped as #96 (`96-observer-todo-tracking-muninndb.md`) — MuninnDB-native todo tracking view. P3 priority, target v3.3+.

### Q4: #43 (Sequence Number Race)

**Decision:** Closed as obsolete. Bun is single-threaded; race condition is theoretical only.

### Q5: v3.1 Ambition Level

**Decision:** v3.1 scope of 7 phases (~35-45h) is confirmed. Proceed as planned.

---

## 8. Recommended Next Actions

### Immediate (can execute today)

1. **Close 19 items as obsolete/superseded:**
   - Obsolete SpacetimeDB: #42, #43, #48, #56, #65
   - Superseded old observer UI: #40, #47, #49, #66, #67, #68, #69, #70, #71, #72, #73
   - Additional cuts: #41, #64, #74

2. **Mark #15 as absorbed into #95:**
   - Update #95 acceptance criteria to include #15's specific requirements
   - Move #15 to done/absorbed

3. **Update ROADMAP.md:**
   - Add v3.1.0 milestone plan with 7 phases
   - Add v3.2.0, v3.3.0 milestone outlines
   - Move closed items to "Closed" section
   - Remove stale "Deferred" entries for items being cut

### Short-term (this week)

4. **Create `.planning/notes/observer-design-requirements.md`:**
   - Consolidate design intent from #66-74 into a single reference doc
   - This preserves the requirements while eliminating 9 backlog items

5. **Update todo files for merge groups:**
   - #89+#91: Add cross-reference notes
   - #90+#92: Add cross-reference notes
   - #75+#76+#88: Add execution ordering notes

6. **Begin v3.1 Phase 1** (#89+#91 recall scoring optimization):
   - SIMPLE effort, 3-4 hours
   - Modifies `lu-cognition.agent.ts` recall scoring
   - Immediate measurable token savings

### Medium-term (v3.1 execution)

7. Execute v3.1 phases 1-7 in order per milestone plan above
8. After v3.1 Phase 3 (#75+#76+#88), formally close the 5 obsolete SpacetimeDB items
9. After v3.1 completion, archive milestone and begin v3.2 planning

---

## Appendix A: Backlog Reduction Summary

| Category               | Before   | After       | Change               |
| ---------------------- | -------- | ----------- | -------------------- |
| Total items            | 55       | 30          | -25 (45% reduction)  |
| Obsolete (SpacetimeDB) | 5        | 0           | -5 cut               |
| Old observer UI polish | 13       | 0           | -11 cut, -2 absorbed |
| Additional cuts        | 3        | 0           | -3 cut               |
| Merged groups          | 10 items | 4 effective | -6 absorbed          |
| Active backlog         | 55       | 30          | Focused, actionable  |

## Appendix B: Specialist Agreement Matrix

Items where all 4 analysts agree on action:

| #                       | Title                         | Unanimous Action           |
| ----------------------- | ----------------------------- | -------------------------- |
| #42, #43, #48, #56, #65 | SpacetimeDB internals         | CUT (obsolete)             |
| #15                     | Reflective meta-cognition     | MERGE into #95             |
| #89, #91                | Recall scoring items          | High priority, quick win   |
| #92                     | Inject memory into sub-agents | Highest-impact single fix  |
| #95                     | Close learning loop           | Most transformational item |
| #17                     | Plugin marketplace            | Correctly deferred to v4.0 |
| #37                     | Test suite fragility          | Separate dedicated effort  |

Items where analysts disagree (see Section 6 for resolutions):

| #              | Title                | Disagreement                                          |
| -------------- | -------------------- | ----------------------------------------------------- |
| #37            | Test suite fragility | QA: do first. Others: defer.                          |
| #95 Phase A    | Learning loop timing | Product: v3.1. Others: v3.3.                          |
| #77            | MuninnDB emission    | Prioritizer: v3.1.1. Product: v3.2.                   |
| #40-49, #66-74 | Old observer items   | Prioritizer: cut all 13. Product: cut 8, absorb rest. |

---

_Synthesized from: architect-analysis.md, prioritizer-analysis.md, qa-analysis.md, product-analysis.md_
_Methodology: WSJF as primary sort, architectural risk as execution constraint, tech debt severity as urgency signal, strategic alignment as tiebreaker_
