# WSJF Prioritization Analysis

**Agent:** lu-roadmap-prioritizer
**Date:** 2026-03-08
**Input:** 55 pending todos from `.planning/todos/pending/`
**Methodology:** WSJF = (Business Value + Time Criticality + Risk Reduction) / Effort

---

## 1. Full WSJF Scorecard

### Strategic Objectives (weighted into scoring)

1. **Better code outcomes** — agent decision-making, plan quality, verification
2. **Lower token costs** — memory overhead, recall optimization, waste elimination
3. **Robust observability** — MuninnDB-based observer pipeline
4. **Effective packaging/distribution** — plugin marketplace, cross-agent interop

### Effort Mapping

| Complexity | Effort Points |
| ---------- | ------------- |
| TRIVIAL    | 1             |
| SIMPLE     | 2             |
| MODERATE   | 3             |
| COMPLEX    | 5             |
| CRITICAL   | 8             |

---

### Complete Scorecard (sorted by WSJF descending)

| Rank | Todo | Title                                     | BV  | TC  | RR  | Effort       | WSJF     | Recommended Action               |
| ---- | ---- | ----------------------------------------- | --- | --- | --- | ------------ | -------- | -------------------------------- |
| 1    | #89  | Complexity-gated recall depth             | 8   | 8   | 6   | 2 (SIMPLE)   | **11.0** | new-phase: Memory Optimization   |
| 2    | #91  | Aggressive milestone-scoped recall        | 7   | 7   | 6   | 2 (SIMPLE)   | **10.0** | new-phase: Memory Optimization   |
| 3    | #50  | Document observability domain             | 5   | 6   | 4   | 1 (TRIVIAL)  | **15.0** | absorb: Cleanup Sprint           |
| 4    | #93  | Automatic session memory cleanup          | 8   | 8   | 8   | 2 (SIMPLE)   | **12.0** | new-phase: Memory Optimization   |
| 5    | #46  | Deduplicate sanitizeJsonParse             | 5   | 5   | 5   | 2 (SIMPLE)   | **7.5**  | absorb: Cleanup Sprint           |
| 6    | #90  | Session context digest reuse              | 9   | 8   | 7   | 3 (MODERATE) | **8.0**  | new-phase: Memory Optimization   |
| 7    | #92  | Inject memory into sub-agent prompts      | 10  | 9   | 8   | 3 (MODERATE) | **9.0**  | new-phase: Memory Pipeline       |
| 8    | #75  | Remove SpacetimeDB from framework         | 7   | 9   | 8   | 3 (MODERATE) | **8.0**  | new-phase: SpacetimeDB Cleanup   |
| 9    | #76  | Delete luca-spacetime package             | 6   | 9   | 7   | 2 (SIMPLE)   | **11.0** | new-phase: SpacetimeDB Cleanup   |
| 10   | #88  | Clean up SpacetimeDB docs/planning        | 5   | 8   | 6   | 2 (SIMPLE)   | **9.5**  | new-phase: SpacetimeDB Cleanup   |
| 11   | #77  | Build MuninnDB emission layer             | 9   | 8   | 7   | 5 (COMPLEX)  | **4.8**  | new-phase: MuninnDB Emission     |
| 12   | #78  | Strip SpacetimeDB from observer           | 6   | 8   | 7   | 3 (MODERATE) | **7.0**  | new-phase: SpacetimeDB Cleanup   |
| 13   | #95  | Close learning loop: Apply-Measure-Refine | 10  | 7   | 9   | 5 (COMPLEX)  | **5.2**  | new-milestone: v3.2.0            |
| 14   | #45  | Bridge CLI docs mismatch                  | 4   | 4   | 3   | 2 (SIMPLE)   | **5.5**  | absorb: Cleanup Sprint           |
| 15   | #51  | Build session lock cleanup                | 5   | 5   | 5   | 2 (SIMPLE)   | **7.5**  | absorb: Cleanup Sprint           |
| 16   | #63  | Complete node:fs to Bun migration         | 5   | 4   | 4   | 2 (SIMPLE)   | **6.5**  | absorb: Cleanup Sprint           |
| 17   | #53  | Stall detection retry limit               | 8   | 6   | 8   | 3 (MODERATE) | **7.3**  | new-phase: Agentic Reliability   |
| 18   | #52  | Agent health check system                 | 7   | 5   | 7   | 3 (MODERATE) | **6.3**  | new-phase: Agentic Reliability   |
| 19   | #94  | Deferred/lazy recall                      | 7   | 5   | 5   | 3 (MODERATE) | **5.7**  | new-phase: Memory Pipeline       |
| 20   | #13  | Adaptive complexity self-tuning           | 8   | 5   | 7   | 5 (COMPLEX)  | **4.0**  | new-milestone: v3.2.0            |
| 21   | #79  | Observer MuninnDB API layer               | 8   | 7   | 5   | 3 (MODERATE) | **6.7**  | new-phase: Observer MuninnDB     |
| 22   | #80  | Observer session explorer view            | 7   | 6   | 4   | 3 (MODERATE) | **5.7**  | new-phase: Observer MuninnDB     |
| 23   | #15  | Reflective meta-cognition                 | 8   | 5   | 6   | 5 (COMPLEX)  | **3.8**  | MERGE into #95                   |
| 24   | #37  | Test suite fragility                      | 6   | 4   | 7   | 5 (COMPLEX)  | **3.4**  | DEFER (tests disabled by design) |
| 25   | #81  | Observer decision trail view              | 7   | 5   | 4   | 3 (MODERATE) | **5.3**  | new-phase: Observer MuninnDB     |
| 26   | #55  | Tribunal consensus model                  | 6   | 3   | 5   | 5 (COMPLEX)  | **2.8**  | DEFER to v3.2.0                  |
| 27   | #54  | Skill dependency graph                    | 5   | 3   | 5   | 5 (COMPLEX)  | **2.6**  | DEFER to v3.2.0                  |
| 28   | #82  | Observer learning evolution view          | 6   | 4   | 4   | 3 (MODERATE) | **4.7**  | new-phase: Observer MuninnDB     |
| 29   | #16  | Cross-agent interop scanner               | 6   | 3   | 4   | 5 (COMPLEX)  | **2.6**  | DEFER to v3.2.0                  |
| 30   | #83  | Observer knowledge graph view             | 7   | 4   | 3   | 5 (COMPLEX)  | **2.8**  | new-phase: Observer MuninnDB     |
| 31   | #84  | Observer semantic search view             | 6   | 4   | 3   | 3 (MODERATE) | **4.3**  | new-phase: Observer MuninnDB     |
| 32   | #85  | Observer contradiction view               | 6   | 3   | 4   | 3 (MODERATE) | **4.3**  | new-phase: Observer MuninnDB     |
| 33   | #86  | Observer entity deep dive view            | 5   | 3   | 3   | 3 (MODERATE) | **3.7**  | new-phase: Observer MuninnDB     |
| 34   | #87  | Observer vault health view                | 5   | 3   | 4   | 3 (MODERATE) | **4.0**  | new-phase: Observer MuninnDB     |
| 35   | #64  | Observer todo tracking                    | 4   | 3   | 2   | 3 (MODERATE) | **3.0**  | new-phase: Observer MuninnDB     |
| 36   | #18  | Semantic memory embeddings                | 7   | 3   | 5   | 5 (COMPLEX)  | **3.0**  | DEFER to v3.2.0+                 |
| 37   | #17  | Plugin marketplace                        | 9   | 4   | 5   | 8 (CRITICAL) | **2.3**  | new-milestone: v4.0.0            |
| 38   | #40  | Loading skeleton consistency              | 3   | 2   | 2   | 2 (SIMPLE)   | **3.5**  | SUPERSEDED by #78                |
| 39   | #41  | Error boundaries                          | 4   | 2   | 3   | 2 (SIMPLE)   | **4.5**  | SUPERSEDED by #78                |
| 40   | #47  | Accessibility pass                        | 3   | 2   | 2   | 2 (SIMPLE)   | **3.5**  | SUPERSEDED by #78                |
| 41   | #49  | Missing empty states                      | 3   | 2   | 2   | 2 (SIMPLE)   | **3.5**  | SUPERSEDED by #78                |
| 42   | #66  | Observer Lucide icons sidebar             | 3   | 2   | 1   | 2 (SIMPLE)   | **3.0**  | SUPERSEDED by #78                |
| 43   | #67  | Observer color system depth               | 3   | 2   | 1   | 3 (MODERATE) | **2.0**  | SUPERSEDED by #78                |
| 44   | #68  | Observer typography overhaul              | 3   | 2   | 1   | 3 (MODERATE) | **2.0**  | SUPERSEDED by #78                |
| 45   | #69  | Observer dashboard layout redesign        | 4   | 2   | 1   | 5 (COMPLEX)  | **1.4**  | SUPERSEDED by #78                |
| 46   | #70  | Observer charting library                 | 4   | 2   | 1   | 3 (MODERATE) | **2.3**  | SUPERSEDED by #78                |
| 47   | #71  | Observer animations/motion                | 2   | 1   | 1   | 3 (MODERATE) | **1.3**  | SUPERSEDED by #78                |
| 48   | #72  | Observer state diagram redesign           | 4   | 2   | 1   | 5 (COMPLEX)  | **1.4**  | SUPERSEDED by #78                |
| 49   | #73  | Observer time range/session picker        | 4   | 2   | 1   | 3 (MODERATE) | **2.3**  | SUPERSEDED by #78                |
| 50   | #74  | Observer command palette                  | 3   | 1   | 1   | 3 (MODERATE) | **1.7**  | SUPERSEDED by #78                |
| 51   | #42  | Unbounded table growth (SpacetimeDB)      | 0   | 0   | 0   | -            | **0.0**  | CUT: OBSOLETE                    |
| 52   | #43  | Sequence number race (SpacetimeDB)        | 0   | 0   | 0   | -            | **0.0**  | CUT: OBSOLETE                    |
| 53   | #48  | Singleton table constraints (SpacetimeDB) | 0   | 0   | 0   | -            | **0.0**  | CUT: OBSOLETE                    |
| 54   | #56  | JSON blob normalization (SpacetimeDB)     | 0   | 0   | 0   | -            | **0.0**  | CUT: OBSOLETE                    |
| 55   | #65  | Rename SpacetimeDB memory fields          | 0   | 0   | 0   | -            | **0.0**  | CUT: OBSOLETE                    |

---

## 2. Items Recommended to CUT (Obsolete / Misaligned)

### Definitively Obsolete (SpacetimeDB internals — platform being removed)

| Todo    | Title                            | Reason                                                    |
| ------- | -------------------------------- | --------------------------------------------------------- |
| **#42** | P2: Unbounded table growth       | SpacetimeDB table — entire platform being deleted via #76 |
| **#43** | P2: Sequence number race         | SpacetimeDB ledger race — platform being deleted          |
| **#48** | P2: Singleton table constraints  | SpacetimeDB schema — platform being deleted               |
| **#56** | P3: JSON blob normalization      | SpacetimeDB schema — platform being deleted               |
| **#65** | Rename SpacetimeDB memory fields | SpacetimeDB fields — platform being deleted               |

### Superseded by SpacetimeDB Observer Rewrite (#78)

These old-design observer UI items target the SpacetimeDB-based observer which is being gutted. #78 deletes ALL SpacetimeDB hooks and page components. These items become meaningless once #78 executes — the UI they reference will no longer exist. New MuninnDB views (#79-87) replace their intent.

| Todo    | Title                              | Superseded By                                                       |
| ------- | ---------------------------------- | ------------------------------------------------------------------- |
| **#40** | Loading skeleton consistency       | #78 deletes pages, #79-87 rebuilds them fresh                       |
| **#41** | Error boundaries                   | #78 deletes pages, rebuilt with error boundaries from scratch       |
| **#47** | Accessibility pass                 | #78 deletes pages, #79-87 can bake in a11y from day one             |
| **#49** | Missing empty states               | #78 deletes pages, #79-87 includes empty states natively            |
| **#66** | Observer Lucide icons sidebar      | #78 keeps shared UI, but sidebar redesigned for MuninnDB views      |
| **#67** | Observer color system depth        | Design system work should happen AFTER MuninnDB rewrite, not before |
| **#68** | Observer typography overhaul       | Same — design system is post-rewrite work                           |
| **#69** | Observer dashboard layout redesign | #78 deletes dashboard, #80 rebuilds as session explorer             |
| **#70** | Observer charting library          | Charting decisions made fresh for MuninnDB views                    |
| **#71** | Observer animations/motion         | Polish — far premature before observer rewrite completes            |
| **#72** | Observer state diagram redesign    | Old state diagram deleted in #78, rebuilt in MuninnDB views         |
| **#73** | Observer time range/session picker | Functionality absorbed into #80 session explorer                    |
| **#74** | Observer command palette           | Power user feature — premature before views exist                   |

**Recommendation:** CUT all 13 superseded items. Any valid intent is captured by #79-87. Re-create post-rewrite UI polish todos only after MuninnDB views are functional.

**Total CUT count: 18 items (5 obsolete + 13 superseded)**

---

## 3. Items Recommended to MERGE (Overlapping Scope)

| Merge Group                        | Items                | Merged Title                                                            | Rationale                                                                                                                                                                                             |
| ---------------------------------- | -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Memory Recall Quick Wins**       | #89, #91             | "Optimize MuninnDB recall scoring: complexity gating + milestone decay" | Both modify the same file (`lu-cognition.agent.ts` recall scoring section). Combined effort is ~3-4 hours, smaller than doing them separately.                                                        |
| **SpacetimeDB Removal**            | #75, #76, #88        | "Remove SpacetimeDB from framework, delete package, and clean docs"     | Sequential dependency chain that should execute as a single phase. #75 first (framework), then #76 (package deletion), then #88 (doc cleanup).                                                        |
| **Observer SpacetimeDB Strip**     | #78 + aspects of #88 | "Strip SpacetimeDB from observer and clean references"                  | #78 removes SpacetimeDB from observer, #88 includes observer-adjacent doc cleanup. Execute together.                                                                                                  |
| **Learning Loop + Meta-Cognition** | #95, #15             | "Close the learning loop (subsumes reflective meta-cognition)"          | #15 (reflective meta-cognition) is explicitly noted as a SUBSET of #95 Phase A. The todo itself says "Consider merging into #95." Do it.                                                              |
| **Sub-Agent Memory Injection**     | #92, #90             | "Inject memory context into sub-agents via session digest"              | #90 (digest reuse) is the mechanism, #92 (inject memory into prompts) is the goal. Building digests without injecting them is waste; injecting without digests duplicates tokens. Implement together. |

---

## 4. Recommended Milestone Groupings

### v3.1.0 — "Memory Intelligence & Platform Cleanup" (RECOMMENDED NEXT)

**Theme:** Reduce token waste, close the memory gap, remove dead platform

| Phase | Items                   | Title                                                                              | Effort    | WSJF Range |
| ----- | ----------------------- | ---------------------------------------------------------------------------------- | --------- | ---------- |
| 1     | #75, #76, #88 (merged)  | SpacetimeDB removal from framework + package + docs                                | MODERATE  | 8.0-11.0   |
| 2     | #89+#91 (merged)        | Recall scoring optimization: complexity gating + milestone decay                   | SIMPLE    | 10.0-11.0  |
| 3     | #93                     | Automatic session memory cleanup                                                   | SIMPLE    | 12.0       |
| 4     | #90+#92 (merged)        | Session digest + sub-agent memory injection                                        | MODERATE  | 8.0-9.0    |
| 5     | #53                     | Stall detection and retry limits                                                   | MODERATE  | 7.3        |
| 6     | #52                     | Agent health check system                                                          | MODERATE  | 6.3        |
| 7     | #46, #50, #45, #51, #63 | Cleanup sprint: dedup sanitizeJson, docs, bridge docs, lock cleanup, Bun migration | SIMPLE x5 | 5.5-7.5    |

**Estimated total effort:** 8-10 phases, ~40-50 hours
**Strategic alignment:** Objectives 1 (better outcomes via memory) + 2 (lower costs via recall optimization) + partial 3 (removes SpacetimeDB blocker for observer)

### v3.1.1 — "Observer MuninnDB Rewrite"

**Theme:** Replace SpacetimeDB observer with MuninnDB-native views

| Phase | Items | Title                           | Effort   |
| ----- | ----- | ------------------------------- | -------- |
| 1     | #78   | Strip SpacetimeDB from observer | MODERATE |
| 2     | #77   | Build MuninnDB emission layer   | COMPLEX  |
| 3     | #79   | Observer MuninnDB API layer     | MODERATE |
| 4     | #80   | Session Explorer view           | MODERATE |
| 5     | #81   | Decision Trail view             | MODERATE |
| 6     | #82   | Learning Evolution view         | MODERATE |
| 7     | #84   | Semantic Search view            | MODERATE |
| 8     | #85   | Contradiction view              | MODERATE |
| 9     | #87   | Vault Health dashboard          | MODERATE |
| 10    | #83   | Knowledge Graph Explorer        | COMPLEX  |
| 11    | #86   | Entity Deep Dive view           | MODERATE |
| 12    | #64   | Todo tracking in observer       | MODERATE |

**Estimated total effort:** 12 phases, ~60-80 hours
**Strategic alignment:** Objective 3 (robust observability)
**Note:** #77 (emission layer) could be pulled into v3.1.0 if it needs to ship before views.

### v3.2.0 — "Cognitive Maturity"

**Theme:** Self-tuning agents, learning loops, advanced memory

| Phase | Items            | Title                                                      | Effort   |
| ----- | ---------------- | ---------------------------------------------------------- | -------- |
| 1     | #95+#15 (merged) | Close learning loop: Apply-Measure-Refine + meta-cognition | COMPLEX  |
| 2     | #13              | Adaptive complexity self-tuning                            | COMPLEX  |
| 3     | #94              | Deferred/lazy recall                                       | MODERATE |
| 4     | #18              | Semantic memory embeddings                                 | COMPLEX  |
| 5     | #55              | Tribunal consensus model                                   | COMPLEX  |
| 6     | #54              | Skill dependency graph                                     | COMPLEX  |
| 7     | #16              | Cross-agent interop scanner                                | COMPLEX  |

**Estimated total effort:** 7 phases, ~60-80 hours
**Strategic alignment:** Objectives 1 (better outcomes) + 4 (interop/packaging)

### v4.0.0 — "Plugin Ecosystem"

| Phase | Items | Title                                      | Effort   |
| ----- | ----- | ------------------------------------------ | -------- |
| 1-N   | #17   | Plugin Marketplace with Community Registry | CRITICAL |

**Strategic alignment:** Objective 4 (packaging/distribution)
**Note:** Deferred by design. CRITICAL effort (8 points), requires registry infra. Only pursue after v3.x matures the core platform.

### Deferred Indefinitely

| Todo | Title                | Reason                                                                                                           |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| #37  | Test suite fragility | Tests intentionally disabled. Reintroduction is a separate effort per project rules. Do not score as actionable. |

---

## 5. Top 10 Highest-Priority Items (with Rationale)

### Tier 1: Immediate Quick Wins (WSJF > 9.0)

| Rank  | Todo                                         | WSJF      | Rationale                                                                                                                                 |
| ----- | -------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | #50 (Document observability domain)          | 15.0      | TRIVIAL effort, pure documentation gap. 15-minute fix. Highest WSJF by far due to minimal effort.                                         |
| **2** | #93 (Automatic session memory cleanup)       | 12.0      | SIMPLE effort, prevents unbounded MuninnDB growth. Critical data hygiene. Stale session engrams pollute all future recall.                |
| **3** | #89+#91 merged (Recall scoring optimization) | 10.0-11.0 | SIMPLE effort, both modify same file. 2-3K token savings per task. 80% of tasks are MODERATE — this saves tokens on the majority of work. |
| **4** | #76 (Delete luca-spacetime package)          | 11.0      | SIMPLE effort, entire dead package. Reduces repo surface area. Prerequisite cleared by #75.                                               |

### Tier 2: High-Impact Moderate Effort (WSJF 7.0-9.5)

| Rank  | Todo                                                 | WSJF    | Rationale                                                                                                                                                                       |
| ----- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5** | #88 (Clean up SpacetimeDB docs)                      | 9.5     | SIMPLE effort. Documentation debt creates confusion for every session. Time-critical because SpacetimeDB references actively mislead agents.                                    |
| **6** | #92+#90 merged (Sub-agent memory injection + digest) | 8.0-9.0 | MODERATE effort. **Single highest-impact fix** per the memory audit. Context drops from 100% to 10% through the agent spawn chain — this fix preserves 60-80% context fidelity. |
| **7** | #75 (Remove SpacetimeDB from framework)              | 8.0     | MODERATE effort. Gateway to all observer work. Dead code causes confusion. High time criticality — blocks #77, #78, #79-87.                                                     |
| **8** | #90 (Session context digest reuse)                   | 8.0     | MODERATE effort. 2-3.8K tokens saved per phase. Reduces redundant MuninnDB queries.                                                                                             |

### Tier 3: Strategic High-Value (WSJF 5.0-7.5)

| Rank   | Todo                                              | WSJF | Rationale                                                                                                                                                              |
| ------ | ------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9**  | #46+#51 (Deduplicate sanitizeJson + lock cleanup) | 7.5  | SIMPLE efforts. Pure code quality. Both are DRY violations that compound tech debt.                                                                                    |
| **10** | #53 (Stall detection retry limit)                 | 7.3  | MODERATE effort. Prevents infinite verification loops. Without this, a stuck workflow burns tokens forever with no escalation. Directly serves "better code outcomes." |

---

## 6. Recommended Next Milestone Scope

### v3.1.0 — "Memory Intelligence & Platform Cleanup"

**Why this scope:**

1. **Highest aggregate WSJF.** The top 10 items by WSJF all fall within this milestone's scope.
2. **Strategic alignment.** Directly serves objectives 1 (better outcomes via memory injection) and 2 (lower costs via recall optimization). Partially unblocks objective 3 (observer) by removing SpacetimeDB.
3. **Manageable size.** 7 phases, ~40-50 hours. Consistent with recent milestones (v3.0.0 was 14 phases).
4. **Foundation-first.** Memory optimization and SpacetimeDB cleanup are prerequisites for all future work. Observer rewrite (#78) needs SpacetimeDB removed. Learning loop (#95) needs memory injection (#92) working. Every deferred item benefits from completing this milestone first.

**Phase execution order (dependency-driven):**

```
Phase 1: SpacetimeDB removal (#75 + #76 + #88)    -- unblocks observer work
Phase 2: Recall scoring (#89 + #91)                -- quick win, immediate savings
Phase 3: Session cleanup (#93)                     -- quick win, data hygiene
Phase 4: Sub-agent memory injection (#90 + #92)    -- highest impact, needs clean recall
Phase 5: Stall detection (#53)                     -- agentic reliability
Phase 6: Agent health check (#52)                  -- agentic reliability
Phase 7: Cleanup sprint (#46, #50, #45, #51, #63)  -- DRY, docs, migrations
```

**Items explicitly NOT in v3.1.0 (and why):**

- #77 (MuninnDB emission): COMPLEX effort, better scoped with observer rewrite in v3.1.1
- #95 (learning loop): COMPLEX effort, needs memory injection (#92) stabilized first
- #13 (complexity self-tuning): Depends on model routing stabilizing
- #17 (plugin marketplace): CRITICAL effort, v4.0.0 territory
- #37 (test suite): Tests intentionally disabled, separate effort

---

## 7. Dependency Map

```
#75 (Remove SpacetimeDB from framework)
  └── #76 (Delete luca-spacetime package)
       └── #88 (Clean up SpacetimeDB docs/planning)
            └── #78 (Strip SpacetimeDB from observer)
                 └── #77 (Build MuninnDB emission layer)
                      └── #79 (Observer MuninnDB API layer)
                           └── #80-87 (Observer views)

#89+#91 (Recall optimization)
  └── #90+#92 (Session digest + memory injection)
       └── #94 (Deferred/lazy recall)
            └── #95+#15 (Learning loop + meta-cognition)
                 └── #13 (Adaptive complexity self-tuning)
                      └── #18 (Semantic memory embeddings)

#52 (Agent health check)
  └── #54 (Skill dependency graph)

#53 (Stall detection)
  └── #55 (Tribunal consensus model)
```

---

## 8. Summary Statistics

| Category                              | Count                          |
| ------------------------------------- | ------------------------------ |
| Total pending todos                   | 55                             |
| Recommended CUT (obsolete)            | 5                              |
| Recommended CUT (superseded)          | 13                             |
| Recommended MERGE                     | 5 merge groups (10 items -> 5) |
| Active items after cuts               | 37                             |
| Active items after cuts + merges      | 32                             |
| WSJF > 5.0 (high priority)            | 21                             |
| WSJF 3.0-5.0 (medium priority)        | 10                             |
| WSJF < 3.0 (low priority / deferred)  | 6                              |
| Items for v3.1.0 (next milestone)     | 13 (via 7 phases, some merged) |
| Items for v3.1.1 (observer rewrite)   | 12                             |
| Items for v3.2.0 (cognitive maturity) | 7                              |
| Items for v4.0.0 (plugin ecosystem)   | 1                              |
| Deferred indefinitely                 | 1 (#37)                        |

---

_Analysis produced by lu-roadmap-prioritizer | WSJF methodology | 2026-03-08_
