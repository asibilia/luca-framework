---
title: Upgrade observer memory page and context bar with full memory system observability
area: observer
created: 2026-03-14
source: conversation
---

## Context

The observer's memory page currently shows 4 basic data streams (vault stats, brain tree, engram list, session activity) and the header context bar shows only a % usage indicator with zone color. This gives minimal insight into how the auto-compacting memory optimization system actually works — compaction events, recall effectiveness, checkpoint status, memory health signals, and temporal context are all invisible.

The underlying data is rich: MuninnDB already exposes coherence subscores, entity graphs, contradiction detection, score explanations, and temporal timelines via 15 API routes (only 4 currently used). The hooks write checkpoint data, context metrics, and zone transitions. The shared schemas define memory feedback, phase metrics, and recall cache structures — none surfaced in the UI.

Inspiration: Mastra AI's observational memory system offers text-first memory inspection, real-time token metrics, observation/reflection timeline markers, priority-based coloring, drill-down from summary to detail, and cost dashboards. Their key insight: make memory operations visible and debuggable, not a black box.

## Task

### Phase 1: Design the Full Memory Observability Page

Do an extensive review and design a comprehensive `/memory` page upgrade. The page should answer these questions at a glance:

1. **What's happening right now?** — Context usage, active zone, time in session, compaction risk
2. **How healthy is my memory?** — Coherence, contradictions, staleness, duplication pressure
3. **What does the AI remember?** — Brain tree, patterns, decisions, pitfalls with relevance scores
4. **How effective is recall?** — Precision, hit rate, token cost, confidence calibration
5. **What happened over time?** — Compaction timeline, checkpoint history, zone transitions

### Data Sources to Surface (inventory from audit)

**Already have APIs, not displayed:**

| Data                   | Source            | API Route                            | Display As                                                                                        |
| ---------------------- | ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Coherence subscores    | MuninnDB stats    | `/api/muninn/stats`                  | Health gauge with orphan ratio, contradiction density, duplication pressure, temporal variance    |
| Entity knowledge graph | MuninnDB entity   | `/api/muninn/entity/[name]`          | Interactive entity directory with mention counts, relationships                                   |
| Entity timeline        | MuninnDB timeline | `/api/muninn/entity/[name]/timeline` | Temporal view of when entities were first seen and referenced                                     |
| Score explanations     | MuninnDB explain  | `/api/muninn/explain`                | Score breakdown per recalled engram (semantic similarity, decay, hebbian boost, access frequency) |
| Contradictions         | MuninnDB          | `/api/muninn/contradictions`         | Warning list of contradicting memories with resolution suggestions                                |
| Entity clusters        | MuninnDB          | `/api/muninn/entity-clusters`        | Co-occurrence visualization showing related concepts                                              |
| Full graph             | MuninnDB          | `/api/muninn/graph-data`             | Network visualization of memory relationships                                                     |

**Have schemas, need APIs:**

| Data                   | Schema                        | Display As                                                         |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Phase memory metrics   | `MemoryPhaseMetricsSchema`    | Per-phase recall precision, hit rate, token injection, staleness % |
| Memory feedback        | `MemoryFeedbackEntrySchema`   | Per-engram usefulness tracking, phase-by-phase validation          |
| Memory health summary  | `MemoryHealthSummarySchema`   | Overall health status with degradation indicators                  |
| Confidence calibration | `ConfidenceActualEntrySchema` | How well confidence scores predict actual usefulness               |

**Have hook data, need APIs:**

| Data                  | Written By                   | File                                                | Display As                                                             |
| --------------------- | ---------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Checkpoint state      | `pre-compact-checkpoint.sh`  | `.planning/.context-checkpoint.json`                | Last checkpoint: phase, complexity, branch, recent files, trigger type |
| Compaction history    | `session-compact-restore.sh` | MuninnDB `session:checkpoint`                       | Timeline of compaction events with context % at each                   |
| Zone transitions      | `context-check-throttled.sh` | `.planning/.context-metrics.json`                   | Zone transition timeline (peak→good→degrading→stop)                    |
| Proactive checkpoints | `context-check-throttled.sh` | `.planning/.context-metrics.json` checkpoints array | Checkpoint markers on the context usage timeline                       |

### Proposed Page Sections

**Section 1: Session Status (hero area)**

- Real-time context usage gauge (large, prominent)
- Session duration, tool call count, compaction count
- Current zone with time-in-zone
- Last checkpoint timestamp and trigger type
- Active model info

**Section 2: Memory Health Dashboard**

- Coherence score (large) with subscore breakdown:
  - Orphan ratio (engrams with no links)
  - Contradiction density (conflicting memories)
  - Duplication pressure (near-duplicate engrams)
  - Temporal variance (recency distribution)
- Staleness indicator (% of engrams with no positive feedback)
- Contradiction alerts (if any detected)

**Section 3: Recall Effectiveness**

- Per-phase recall precision chart (% of recalled engrams that were useful)
- Hit rate trend (phases where at least one recalled engram was useful)
- Token cost of memory injection per phase
- Confidence calibration curve (predicted vs actual usefulness)

**Section 4: Memory Timeline**

- Horizontal timeline showing:
  - Engram creation events (dots by type: pattern, decision, pitfall)
  - Compaction events (vertical markers)
  - Zone transitions (color bands)
  - Checkpoint events (bookmark markers)
  - Recall events (connection lines to engrams)

**Section 5: Brain Tree & Engrams (existing, enhanced)**

- Brain tree panel (keep existing, add score component breakdown on hover)
- Engram list with interactive filters (type, entity, confidence, staleness)
- Each engram shows: score explanation, recall count, last useful phase

**Section 6: Knowledge Graph (new)**

- Entity relationship visualization
- Entity directory with mention counts and timeline
- Cluster view showing co-occurring concepts

### Phase 2: Design the Compact Header Bar

After the full page is designed, derive a compact navbar snapshot that gives ambient awareness:

**Current bar:** `[brain icon] [1px progress bar] [%]`

**Proposed bar (concepts to evaluate):**

- Context usage % + zone color (keep)
- Compaction count badge (how many times compacted this session)
- Memory health indicator (green/yellow/red dot based on coherence)
- Last checkpoint age ("2m ago" — how stale is our safety net)
- Session engram count (how many memories captured)
- Click opens full `/memory` page

The exact compact bar design should be informed by what proves most valuable on the full page.

## Notes

- Mastra reference: Their text-first approach (not graphs/vectors) makes memory debuggable. Luca should similarly make the memory system's decisions transparent, not just its state.
- The existing `useMemory` hook fetches 4 data streams; the upgraded page will need additional hooks or an expanded hook for the new data sources.
- Some data (phase metrics, feedback) lives in MuninnDB engrams — new API routes or recall queries will be needed to extract and aggregate it.
- The entity graph visualization could use a library like react-force-graph or d3-force, but start simple (directory list) and add visualization later.
- This todo is intentionally broad — it should be broken into phases during roadmap planning. The design phase comes first, then implementation.
