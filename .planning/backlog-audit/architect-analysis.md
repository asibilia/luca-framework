# Architectural Impact Analysis — Backlog Audit

**Analyst:** lu-roadmap-architect
**Date:** 2026-03-08
**Scope:** 55 pending todos in `.planning/todos/pending/`
**Context Tier:** T1 (Recall-Aware)

---

## 1. Executive Summary

55 pending todos analyzed across 7 categories. Key findings:

- **6 items OBSOLETE** (SpacetimeDB migration renders them moot)
- **7 items HIGH architectural risk** (cross-cutting, tier boundary changes, or new domain creation)
- **4 migration items form a strict dependency chain** (#75 -> #76 -> #78 -> #88)
- **Memory optimization items (#89-#95) are the highest-value cluster** with clear internal ordering
- **Observer UI items (#66-#74, #80-#87) are isolated** from framework core — safe to defer or parallelize

---

## 2. Items Flagged as OBSOLETE

These items reference SpacetimeDB infrastructure that is being replaced by MuninnDB. They are superseded by the migration chain (#75, #76, #77, #78, #88).

| Todo    | Title                                         | Reason Obsolete                                                                                                                               |
| ------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **#42** | P2: Unbounded table growth TTL cleanup        | References SpacetimeDB tables/reducers/indexes. TTL is a MuninnDB concern now (#93 covers cleanup).                                           |
| **#43** | P2: Sequence number race condition            | References SpacetimeDB ledger with in-memory `_nextSeq`. Ledger moving to MuninnDB/local JSONL.                                               |
| **#48** | P2: Singleton table constraints               | References `packages/luca-spacetime/spacetimedb/src/schema.ts`. Package being deleted (#76).                                                  |
| **#56** | P3: JSON blob normalization                   | References SpacetimeDB schema normalization. Package being deleted (#76). ROADMAP already defers.                                             |
| **#65** | Rename SpacetimeDB memory fields *Json -> *Md | References `src/memory/__helpers/bridge.ts` and SpacetimeDB schema. Memory migrated to MuninnDB. Package being deleted (#76).                 |
| **#64** | Observer todo tracking                        | References SpacetimeDB table for todo persistence. Observer being rebuilt with MuninnDB (#78, #79). Can be re-scoped for MuninnDB if desired. |

**Recommendation:** Mark #42, #43, #48, #56, #65 as OBSOLETE/CLOSED. Re-scope #64 as a MuninnDB-native feature if still desired.

---

## 3. Dependency Graph

### 3.1 SpacetimeDB -> MuninnDB Migration Chain (STRICT ORDER)

```
#75 (Remove SpacetimeDB from framework)
  └──> #76 (Delete luca-spacetime package)
         └──> #78 (Strip SpacetimeDB from observer)
                └──> #88 (Clean up SpacetimeDB docs/planning)
                       └──> Mark #42, #43, #48, #56, #65 OBSOLETE
```

**#77 (Build MuninnDB emission layer)** runs in PARALLEL with #75-#76, as it is additive.

### 3.2 Observer Rebuild Chain (after #78)

```
#79 (MuninnDB API layer)
  └──> #80 (Session Explorer view)      ─┐
  └──> #81 (Decision Trail view)         │
  └──> #82 (Learning Evolution view)     │  All parallel, all depend on #79
  └──> #83 (Knowledge Graph view)        │
  └──> #84 (Semantic Search view)        │
  └──> #85 (Contradiction view)          │
  └──> #86 (Entity Deep Dive view)       │
  └──> #87 (Vault Health Dashboard)     ─┘
```

### 3.3 Observer UI Polish Chain (deferred, independent)

```
#66 (Lucide icons) ── no dependencies
#67 (Color system) ── no dependencies
#68 (Typography)   ── depends on #67 (needs design tokens)
#69 (Dashboard layout) ── depends on #67, #68
#70 (Charting library) ── depends on #67
#71 (Animations)   ── depends on #67
#72 (State diagram) ── depends on #70, #71
#73 (Time range picker) ── depends on observer rebuild (#78, #79)
#74 (Command palette) ── no dependencies
```

### 3.4 Memory Optimization Chain

```
#89 (Complexity-gated recall depth)     ─┐
#91 (Milestone-scoped recall)            ├── Quick wins, independent, run first
#93 (Session memory cleanup)            ─┘

#90 (Session context digest)            ─┐
#92 (Inject memory into sub-agents)      ├── Moderate effort, depend on #89/#91 for context
                                        ─┘

#94 (Deferred/lazy recall)              ── depends on #89, #92

#95 (Close learning loop)              ── depends on #92 (sub-agents need memory to apply it)
  └──> #15 (Reflective meta-cognition) ── subset of #95 Phase A

#13 (Adaptive complexity self-tuning)  ── depends on #89 (recall depth scales with complexity)
#18 (Semantic memory embeddings)       ── depends on #89, #91, #95 (apply after quick wins)
```

### 3.5 Framework Infrastructure Items (independent)

```
#46 (Deduplicate sanitizeJsonParse)    ── T0 shared, no dependencies
#50 (Document observability domain)    ── docs only, no dependencies
#45 (Bridge docs mismatch)            ── docs only, no dependencies
#51 (Stale session lock cleanup)       ── T3 build scripts, no dependencies
#63 (node:fs to Bun migration)        ── cross-cutting T0/T1, no dependencies
#52 (Agent health check)              ── T2 agents, no dependencies
#53 (Stall detection retry limit)      ── T1 iteration/state, no dependencies
#54 (Skill dependency graph)           ── T2 skills, no dependencies
#55 (Tribunal consensus model)        ── T2 agents, no dependencies
#37 (Test suite fragility)            ── cross-cutting, deferred per ROADMAP + no-tests rule
```

### 3.6 Future / Large Efforts

```
#16 (Cross-agent interop scanner)      ── NEW DOMAIN (src/interop/), depends on #50
#17 (Plugin marketplace)              ── CRITICAL complexity, new package, v4.0.0 candidate
```

### 3.7 Observer Non-SpacetimeDB UI Items

```
#40 (Loading skeleton consistency)     ── observer UI, independent
#41 (Error boundaries)                ── observer UI, independent
#47 (Accessibility pass)              ── observer UI, independent
#49 (Missing empty states)            ── observer UI, depends on #40
```

---

## 4. Architectural Risk Assessment

### HIGH Risk (7 items)

| Todo    | Title                                | Risk Factors                                                                                       | Domains Touched                            |
| ------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **#75** | Remove SpacetimeDB from framework    | T1 state domain surgery, bridge command removal, hook script changes, env var cleanup              | state (T1), hooks (T3), shared             |
| **#77** | Build MuninnDB emission layer        | New emitter module replacing observer-emitter.ts, affects state persistence pipeline, hook scripts | state (T1), hooks (T3), observability (T1) |
| **#78** | Strip SpacetimeDB from observer      | Delete 30+ generated files, remove provider, delete 17 hooks, delete all pages                     | luca-observer (full package)               |
| **#92** | Inject memory into sub-agent prompts | Cross-cutting T2->T1 changes, modifies agent/skill boundary, new shared helper                     | agents (T2), skills (T2), shared (T0)      |
| **#95** | Close the learning loop              | Modifies 5 files across 2 tiers (T2 agents, T2 skills), changes agent behavioral semantics         | agents (T2), skills (T2), planner (T1)     |
| **#16** | Cross-agent interop scanner          | Creates NEW domain (src/interop/ at T1), modifies context assembler, updates bridge                | NEW T1 domain, context (T1), state (T1)    |
| **#17** | Plugin marketplace                   | CRITICAL complexity, new package, registry infrastructure, modifies compilers + agents schemas     | compilers (T3), agents (T2), new package   |

### MEDIUM Risk (16 items)

| Todo    | Title                              | Risk Factors                                                          |
| ------- | ---------------------------------- | --------------------------------------------------------------------- |
| **#13** | Adaptive complexity self-tuning    | Touches T0 complexity + T1 iteration/planner, adds schemas            |
| **#15** | Reflective meta-cognition          | New helper in T1 planner, schema additions, cross-tier with iteration |
| **#18** | Semantic memory embeddings         | Modifies lu-cognition (T2 agents), may add shared helper (T0)         |
| **#76** | Delete luca-spacetime package      | Package deletion, workspace config changes (contained blast radius)   |
| **#79** | Observer MuninnDB API layer        | 7 new API routes, new data access patterns                            |
| **#88** | Cleanup SpacetimeDB docs/planning  | Touches rules, roadmap, multiple docs (wide but low-risk changes)     |
| **#90** | Session context digest reuse       | Modifies phase-execute skill + 3 agents, new engram pattern           |
| **#94** | Deferred/lazy recall               | Changes lu-cognition eager-load behavior, new agent frontmatter field |
| **#52** | Agent health check                 | New helper in T2 agents, integrates with cognitive pre-flight         |
| **#53** | Stall detection retry limit        | XState context changes, new guard, ledger writes                      |
| **#54** | Skill dependency graph             | New schema in T2 skills, topological sort implementation              |
| **#55** | Tribunal consensus model           | New schema in T2 agents, debate type abstraction                      |
| **#63** | node:fs to Bun migration           | 7 files across luca-framework, API-level changes                      |
| **#41** | Error boundaries                   | New shared component, wraps all observer pages                        |
| **#83** | Knowledge Graph Explorer           | New graph visualization library dependency, complex rendering         |
| **#64** | Observer todo tracking (re-scoped) | New view, filesystem read integration                                 |

### LOW Risk (32 items)

| Todo    | Title                         | Risk Factors                                      |
| ------- | ----------------------------- | ------------------------------------------------- |
| **#37** | Test suite fragility          | Deferred per ROADMAP and no-tests rule            |
| **#40** | Loading skeleton consistency  | Import replacement, 7 pages, no logic changes     |
| **#45** | Bridge docs mismatch          | Documentation only                                |
| **#46** | Deduplicate sanitizeJsonParse | T0 shared refactor, 3 files, import updates       |
| **#47** | Accessibility pass            | Aria attributes and focus rings, no logic changes |
| **#49** | Missing empty states          | UI component additions, no data changes           |
| **#50** | Document observability domain | Documentation only                                |
| **#51** | Stale session lock cleanup    | Build script improvement, 1 file                  |
| **#66** | Lucide icons sidebar          | UI dependency addition, component swap            |
| **#67** | Color system depth            | CSS design tokens only                            |
| **#68** | Typography overhaul           | CSS/font changes only                             |
| **#69** | Dashboard layout redesign     | Component layout restructure                      |
| **#70** | Charting library              | Library swap, component updates                   |
| **#71** | Animations/motion             | New library, component wrappers                   |
| **#72** | State diagram redesign        | SVG rendering replacement                         |
| **#73** | Time range/session picker     | New UI controls                                   |
| **#74** | Command palette               | New UI component                                  |
| **#80** | Session Explorer view         | New page, depends on API layer                    |
| **#81** | Decision Trail view           | New page, depends on API layer                    |
| **#82** | Learning Evolution view       | New page, depends on API layer                    |
| **#84** | Semantic Search view          | New page, depends on API layer                    |
| **#85** | Contradiction view            | New page, depends on API layer                    |
| **#86** | Entity Deep Dive view         | New page, depends on API layer                    |
| **#87** | Vault Health Dashboard        | New page, depends on API layer                    |
| **#89** | Complexity-gated recall depth | Config change + 1 agent edit                      |
| **#91** | Milestone-scoped recall       | Weight tuning in 1 agent file                     |
| **#93** | Session memory cleanup        | Hook script additions, 2 files                    |
| **#42** | Unbounded table growth        | OBSOLETE                                          |
| **#43** | Sequence number race          | OBSOLETE                                          |
| **#48** | Singleton table constraints   | OBSOLETE                                          |
| **#56** | JSON blob normalization       | OBSOLETE                                          |
| **#65** | Rename SpacetimeDB fields     | OBSOLETE                                          |

---

## 5. Tier Impact Map

### T0 Foundation (shared, complexity) — 3 items

| Todo | Domain                  | Impact                                 |
| ---- | ----------------------- | -------------------------------------- |
| #46  | shared                  | Add shared helper (low churn)          |
| #13  | complexity              | Add schemas + helpers (moderate churn) |
| #89  | complexity (via config) | Config-level change (minimal churn)    |

**T0 Risk Assessment:** Low. #46 is a pure dedup. #13 adds to complexity schemas. #89 is config. No T0 structural changes proposed.

### T1 Core (context, planner, harness, iteration, observability) — 8 items

| Todo | Domain                     | Impact                                      |
| ---- | -------------------------- | ------------------------------------------- |
| #75  | state (bridge/persistence) | Remove SpacetimeDB emitter, bridge commands |
| #77  | state (new emitter)        | Add MuninnDB emission module                |
| #15  | planner                    | New plan-reflection helper + schemas        |
| #13  | iteration (checkpoint)     | Trigger reassessment at wave boundaries     |
| #53  | iteration/state            | Add retry counter + stall guard             |
| #50  | observability (docs)       | Documentation only                          |
| #16  | NEW (interop)              | Creates new T1 domain                       |
| #45  | state (docs)               | Documentation only                          |

**T1 Risk Assessment:** Moderate. The SpacetimeDB removal (#75) and MuninnDB emission (#77) are significant T1 surgery but well-scoped. #16 creates a new domain, which is the highest-risk T1 change.

### T2 Entity (agents, skills, rules) — 12 items

| Todo | Domain                     | Impact                                  |
| ---- | -------------------------- | --------------------------------------- |
| #52  | agents                     | New health check helper                 |
| #55  | agents                     | New tribunal consensus schema           |
| #54  | skills                     | New dependency graph schema             |
| #89  | agents (lu-cognition)      | Recall depth scaling                    |
| #91  | agents (lu-cognition)      | Recall weight tuning                    |
| #90  | skills + agents            | Digest creation + injection             |
| #92  | agents + skills            | Memory context injection (cross-entity) |
| #94  | agents (lu-cognition)      | Lazy recall pattern                     |
| #95  | agents + skills            | Learning loop closure (5 files)         |
| #13  | agents (via model routing) | Model upgrade on promotion              |
| #15  | agents (via planner)       | Plan confidence scoring                 |
| #18  | agents (lu-cognition)      | Embedding-aware scoring                 |

**T2 Risk Assessment:** Moderate-High. #92 and #95 cross the agents/skills boundary (both T2 but entity isolation concern). However, both modifications are in the skill->agent spawning boundary, which is an established pattern (skills spawn agents via Task()). No direct agents<->skills import violations.

### T3 Build (compilers, hooks) — 4 items

| Todo | Domain          | Impact                        |
| ---- | --------------- | ----------------------------- |
| #75  | hooks (scripts) | Update session scripts        |
| #77  | hooks (scripts) | Update emission scripts       |
| #93  | hooks (scripts) | Add cleanup to persist script |
| #17  | compilers       | Extend manifest for registry  |

**T3 Risk Assessment:** Low-Moderate. Hook script changes are safe (T3 is terminal). #17's compiler changes are significant but far-future (v4.0.0).

### Observer Package (luca-observer) — 22 items

| Todo               | Domain           | Impact                          |
| ------------------ | ---------------- | ------------------------------- |
| #78                | full package     | Strip SpacetimeDB (destructive) |
| #79                | API routes       | Build MuninnDB API layer        |
| #80-#87            | pages/views      | 8 new MuninnDB-native views     |
| #40, #41, #47, #49 | UI components    | Polish and accessibility        |
| #66-#74            | UI design system | 9 visual/UX improvements        |

**Observer Risk Assessment:** HIGH for #78 (full gut), LOW for everything else (isolated package, no framework impact).

---

## 6. Recommended Execution Ordering

### Phase 1: Foundation Cleanup (LOW risk, HIGH value)

_Can run in parallel. No cross-dependencies._

| Order | Todo | Effort | Rationale                                                |
| ----- | ---- | ------ | -------------------------------------------------------- |
| 1a    | #46  | 1-2h   | Deduplicate sanitizeJsonParse — T0 shared cleanup        |
| 1b    | #50  | 15min  | Document observability domain — documentation gap        |
| 1c    | #45  | 1-2h   | Fix bridge docs mismatch — documentation gap             |
| 1d    | #51  | 1h     | Stale session lock cleanup — DX improvement              |
| 1e    | #63  | 3-4h   | Complete node:fs to Bun migration — convention alignment |

### Phase 2: SpacetimeDB Removal (STRICT ORDER)

| Order | Todo                                      | Effort | Rationale                                          |
| ----- | ----------------------------------------- | ------ | -------------------------------------------------- |
| 2a    | #75                                       | 6-8h   | Remove SpacetimeDB from framework (must be first)  |
| 2b    | #76                                       | 1-2h   | Delete luca-spacetime package (depends on #75)     |
| 2c    | #78                                       | 4-6h   | Strip SpacetimeDB from observer (depends on #76)   |
| 2d    | #88                                       | 2-3h   | Clean up docs/planning references (depends on #78) |
| 2e    | Close #42, #43, #48, #56, #65 as OBSOLETE | 15min  | Formal closure                                     |

### Phase 3: MuninnDB Emission (parallel with Phase 2b-2d)

| Order | Todo | Effort | Rationale                                           |
| ----- | ---- | ------ | --------------------------------------------------- |
| 3a    | #77  | 8-12h  | Build MuninnDB emission layer (can start after #75) |

### Phase 4: Memory Quick Wins (independent, parallel)

| Order | Todo | Effort | Rationale                                           |
| ----- | ---- | ------ | --------------------------------------------------- |
| 4a    | #89  | 2-3h   | Complexity-gated recall depth — quick token savings |
| 4b    | #91  | 1-2h   | Milestone-scoped recall — quick token savings       |
| 4c    | #93  | 2-3h   | Session memory cleanup — prevents vault pollution   |

### Phase 5: Memory Architecture (depends on Phase 4)

| Order | Todo | Effort | Rationale                                           |
| ----- | ---- | ------ | --------------------------------------------------- |
| 5a    | #92  | 6-8h   | Inject memory into sub-agents — highest-impact fix  |
| 5b    | #90  | 3-4h   | Session context digest — reduces injection overhead |

### Phase 6: Learning Loop (depends on Phase 5)

| Order | Todo | Effort | Rationale                                                   |
| ----- | ---- | ------ | ----------------------------------------------------------- |
| 6a    | #95  | 12-20h | Close learning loop — most transformational item            |
| 6b    | #94  | 6-8h   | Deferred/lazy recall — optimization (can parallel with #95) |

### Phase 7: Observer MuninnDB Rebuild (depends on Phase 2c)

| Order | Todo    | Effort    | Rationale                                  |
| ----- | ------- | --------- | ------------------------------------------ |
| 7a    | #79     | 6-8h      | Build MuninnDB API layer (must be first)   |
| 7b    | #80     | 6-8h      | Session Explorer view (priority 1)         |
| 7c-7h | #81-#87 | 4-8h each | Remaining 7 views (all parallel after #79) |

### Phase 8: Agent Intelligence (depends on Phase 4, 5)

| Order | Todo | Effort | Rationale                                 |
| ----- | ---- | ------ | ----------------------------------------- |
| 8a    | #52  | 4-6h   | Agent health check system                 |
| 8b    | #53  | 3-4h   | Stall detection retry limit               |
| 8c    | #13  | 8-12h  | Adaptive complexity self-tuning           |
| 8d    | #15  | 8-12h  | Reflective meta-cognition (subset of #95) |

### Phase 9: Observer UI Polish (independent, defer to dedicated milestone)

| Order | Todo               | Effort    | Rationale                                       |
| ----- | ------------------ | --------- | ----------------------------------------------- |
| 9a-9d | #40, #41, #47, #49 | 2-4h each | Existing UI fixes (can run anytime after #78)   |
| 9e-9m | #66-#74            | 4-8h each | Design system overhaul (dedicated UI milestone) |

### Phase 10: Advanced / Future

| Order | Todo | Effort | Rationale                                                  |
| ----- | ---- | ------ | ---------------------------------------------------------- |
| 10a   | #54  | 6-8h   | Skill dependency graph                                     |
| 10b   | #55  | 6-8h   | Tribunal consensus model                                   |
| 10c   | #18  | 8-12h  | Semantic memory embeddings (after #89, #91, #95)           |
| 10d   | #16  | 12-16h | Cross-agent interop scanner (new domain, defer to v3.1.0+) |
| 10e   | #17  | 40-60h | Plugin marketplace (CRITICAL, v4.0.0)                      |
| 10f   | #37  | TBD    | Test reintroduction (separate dedicated effort)            |

---

## 7. Strategic Alignment Scores

Scale: 0-3 (how many of the 4 strategic objectives the item serves)

**Objectives:**

1. Better code outcomes
2. Lower token costs
3. Robust observability
4. Effective packaging/distribution

| Todo                    | Score        | Objectives Served                                                                                                  |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| #95                     | **3**        | (1) code outcomes via applied learning, (2) token cost via refined recall, (3) observability via feedback tracking |
| #92                     | **2**        | (1) code outcomes via informed sub-agents, (2) token cost via targeted injection                                   |
| #77                     | **2**        | (1) code outcomes via structured event capture, (3) observability via MuninnDB emission                            |
| #89                     | **2**        | (2) token cost reduction, (1) code outcomes via focused recall                                                     |
| #90                     | **2**        | (2) token cost reduction, (1) code outcomes via shared context                                                     |
| #91                     | **2**        | (2) token cost reduction, (1) code outcomes via relevant recall                                                    |
| #93                     | **2**        | (2) token cost reduction (cleanup), (3) observability (clean vault)                                                |
| #13                     | **2**        | (1) code outcomes via right-sized resources, (2) token cost via accurate model routing                             |
| #52                     | **2**        | (1) code outcomes via validated agents, (3) observability via health reporting                                     |
| #75                     | **2**        | (3) observability (migration prerequisite), (2) token cost (remove dead code)                                      |
| #79                     | **2**        | (3) observability (MuninnDB API), (1) code outcomes via insight visibility                                         |
| #15                     | **2**        | (1) code outcomes via plan quality, (2) token cost via fewer iterations                                            |
| #17                     | **2**        | (4) packaging/distribution, (1) code outcomes via community agents                                                 |
| #16                     | **2**        | (4) packaging/distribution, (1) code outcomes via interop awareness                                                |
| #18                     | **2**        | (2) token cost via precise recall, (1) code outcomes via relevant context                                          |
| #94                     | **2**        | (2) token cost reduction, (1) code outcomes via on-demand recall                                                   |
| #76                     | **1**        | (2) token cost (remove dead package)                                                                               |
| #78                     | **1**        | (3) observability (migration step)                                                                                 |
| #88                     | **1**        | (3) observability (doc cleanup)                                                                                    |
| #46                     | **1**        | (1) code outcomes (DRY principle)                                                                                  |
| #63                     | **1**        | (1) code outcomes (convention alignment)                                                                           |
| #53                     | **1**        | (1) code outcomes (prevents infinite loops)                                                                        |
| #54                     | **1**        | (1) code outcomes (execution ordering)                                                                             |
| #55                     | **1**        | (1) code outcomes (debate quality)                                                                                 |
| #50                     | **1**        | (1) code outcomes (documentation)                                                                                  |
| #45                     | **1**        | (1) code outcomes (documentation)                                                                                  |
| #51                     | **1**        | (1) code outcomes (DX improvement)                                                                                 |
| #80-#87                 | **1** each   | (3) observability                                                                                                  |
| #40, #41, #47, #49      | **1** each   | (3) observability (UI quality)                                                                                     |
| #64                     | **1**        | (3) observability                                                                                                  |
| #37                     | **1**        | (1) code outcomes (testing)                                                                                        |
| #66-#74                 | **0-1** each | (3) observability polish (nice-to-have)                                                                            |
| #42, #43, #48, #56, #65 | **0**        | OBSOLETE                                                                                                           |

---

## 8. Cross-Cutting Architectural Concerns

### 8.1 Entity Isolation Compliance

All memory optimization items (#89-#95) modify agents and/or skills. The key question: do they violate entity isolation (agents cannot import from skills, and vice versa)?

**Assessment:** No violations. The modifications are:

- Agent frontmatter changes (no imports)
- Skill-side Task() prompt modifications (skills spawn agents, established pattern)
- New shared helper in `src/agents/__helpers/` or `src/shared/__helpers/` (T0/T2 internal)

#92 creates a helper function `buildMemoryContextBlock()`. If placed in `src/agents/__helpers/`, skills would need to import it (T2 cross-entity violation). **Recommendation:** Place in `src/shared/__helpers/` (T0) to avoid violation.

### 8.2 New Domain Risk (#16)

Creating `src/interop/` at T1 is the only proposed new domain. Risks:

- Must not import from T2 (agents/skills/rules)
- Context assembler (T1) would consume interop output — valid T1->T1
- Bridge (T1 state) would add a subcommand — valid T1 internal

**Assessment:** Architecturally sound if properly scoped to T1. Defer to v3.1.0+ as ROADMAP suggests.

### 8.3 Circular Dependency Risks

No circular dependency risks identified. All proposed changes follow downward import direction:

- Memory items: T2 agents/skills consuming T0 shared helpers
- Migration items: T3 hooks calling T1 state
- Observer items: isolated package, no framework imports

### 8.4 #95 Blast Radius

The learning loop closure (#95) modifies 5 files across lu-planner, lu-executor, lu-learner (agents), and phase-execute, milestone-complete (skills). This is the widest blast radius of any single item.

**Mitigation:** Phased delivery (A/B/C) naturally limits per-phase risk. Phase A alone touches 2 agent files. Phase B adds 1 skill file. Phase C adds 2 more files. Each phase is independently valuable and testable.

---

## 9. Key Architectural Recommendations

1. **Execute SpacetimeDB removal (#75-#76-#78-#88) as the immediate next milestone.** This is blocking cleanup that makes 6 items obsolete and unblocks observer rebuild.

2. **Memory optimization quick wins (#89, #91, #93) should run immediately** — they're independent, low-risk, and deliver measurable token savings.

3. **#92 (inject memory into sub-agents) is the single highest architectural impact item.** It crosses the skill->agent boundary at prompt-construction time. Place the helper in T0 (shared) to avoid tier violations.

4. **#95 (close learning loop) should absorb #15 (reflective meta-cognition)** — #15 is explicitly identified as a subset of #95 Phase A. Do not implement separately.

5. **Observer UI polish (#66-#74) should be a dedicated milestone**, not interleaved with infrastructure work. These are isolated and have zero framework impact.

6. **#17 (plugin marketplace) remains correctly deferred to v4.0.0.** It would introduce T3->T2 tier violation risk (compilers needing to understand agent schemas for packaging). Needs careful architectural design.

7. **#37 (test reintroduction) must respect the no-tests rule** (.claude/rules/no-tests.md). Do not attempt until the dedicated test reintroduction effort is scoped and the process-orphaning root cause is resolved.
