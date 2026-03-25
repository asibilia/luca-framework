# Canonical Decisions — V2 Cross-Section Conflict Resolution

**Created**: 2026-03-22
**Purpose**: This document resolves all cross-section conflicts identified in Review Round 1.
**Authority**: All revision agents MUST follow these decisions. If a section contradicts this document, the section is wrong.

---

## Decision 1: Canonical Step Numbering

**Resolves**: CRIT-DP-001, CRIT-WS-001, CRIT-RS-001, CRIT-AO-005, CRIT-OQ-001

The canonical 10-step pipeline is:

| Step | Name                 | Short ID        |
| ---- | -------------------- | --------------- |
| 1    | Ideate               | ideate          |
| 2    | Research             | research        |
| 3    | Discuss + Pre-mortem | discuss         |
| 4    | Deep Expand          | deep-expand     |
| 5    | Review Research      | review-research |
| 6    | Graduate to MuninnDB | graduate        |
| 7    | Plan                 | plan            |
| 8    | Review Plan          | review-plan     |
| 9    | Execute              | execute         |
| 10   | Verify + UAT         | verify          |

- `review-impl` is NOT a separate step — it is part of Step 10
- All sections must use this numbering
- The v1 15-step pipeline maps as follows: v1 steps 1-3 (model resolution, cognitive pre-flight, validation) happen WITHIN v2 steps as sub-processes, not as top-level steps. The v2 numbering is the user-facing pipeline; v1's 15-step list is the internal implementation checklist

---

## Decision 2: Canonical Agent Names

**Resolves**: CRIT-WS-003, CRIT-RL-002, CRIT-RL-003, CRIT-MN-003

Use NEW specialized agents, not reused v1 agents:

| Role                      | Agent Name                                          | Notes                                   |
| ------------------------- | --------------------------------------------------- | --------------------------------------- |
| Architecture Researcher   | `lu-architecture-researcher`                        | NEW                                     |
| Implementation Researcher | `lu-implementation-researcher`                      | NEW                                     |
| Ecosystem Researcher      | `lu-ecosystem-researcher`                           | NEW                                     |
| Risk Researcher           | `lu-risk-researcher`                                | NEW                                     |
| Completeness Reviewer     | `lu-completeness-reviewer`                          | NEW                                     |
| Accuracy Reviewer         | `lu-accuracy-reviewer`                              | NEW                                     |
| Actionability Reviewer    | `lu-actionability-reviewer`                         | NEW                                     |
| Research Graduator        | `lu-research-graduator`                             | NEW, dedicated (NOT lu-learner adapted) |
| Plan Reviewers            | `code-architect`, `dx-advocate`, `security-auditor` | EXISTING agents reused                  |

- `lu-phase-researcher` is NOT used in v2 research steps (replaced by 4 specialized researchers)
- `lu-verifier` is NOT used as a research reviewer (replaced by 3 specialized reviewers)
- `lu-learner` is NOT used for graduation (replaced by dedicated lu-research-graduator)
- `lu-learner` retains its existing role in Step 10 (post-verification learning extraction + promotion)

---

## Decision 3: Convergence Model

**Resolves**: CRIT-RL-001

Use the **gap-severity model** from `05-review-loops/`:

- Findings classified as CRITICAL / IMPORTANT / MINOR
- Loop continues while any CRITICAL findings exist
- Loop MAY continue for IMPORTANT findings (configurable, default: continue if iteration < max)
- Loop stops when 0 CRITICAL + 0 IMPORTANT, or max iterations reached

The 7-dimension scoring model (scores 1-10, thresholds >= 7/10) from `01-workflow-steps/05-review-research.md` is **REMOVED**. `05-review-loops/` is the canonical specification for convergence.

---

## Decision 4: Concept Prefix Scheme

**Resolves**: CRIT-MN-002

Use the **`research:*` namespace with deferred promotion** from `03-muninndb-integration/`:

- Graduation (Step 6) writes to `research:*` prefixes in REPO vault
- Prefixes: `research:approach-*`, `research:api-*`, `research:pitfall-*`, `research:constraint-*`, `research:decision-*`, `research:pattern-*`
- lu-learner (Step 10, after verification) may PROMOTE high-value `research:*` engrams to permanent `pattern:*`/`pitfall:*`/`decision:*` in DEFAULT vault
- Graduation does NOT write directly to `pattern:*`/`pitfall:*`/`decision:*`

---

## Decision 5: Graduation Scoring Formula

**Resolves**: CRIT-MN-001

Use **weighted sum** (not product):

```
score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
threshold = 0.55
```

Rationale: A single zero dimension should not annihilate the entire score.

---

## Decision 6: Actionability Scoring Criteria

**Resolves**: CRIT-MN-004

Define actionability by observable signals:

| Score | Criteria                                                      | Example                                                           |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1.0   | Contains specific function name, parameter, or code pattern   | "Use `Bun.serve({ websocket: { ... } })` with `idleTimeout: 120`" |
| 0.8   | Names a specific technology choice or version constraint      | "Use Bun's built-in WebSocket, not the `ws` package"              |
| 0.3   | Describes a general strategy without implementation specifics | "Implement exponential backoff for reconnection"                  |
| 0.1   | Purely informational, no implementation implication           | "WebSocket protocol was standardized in RFC 6455"                 |

---

## Decision 7: Research File Directory Layout

**Resolves**: CRIT-RS-002

Canonical layout is **phase-scoped, flat (no deep/ subdir)**:

```
.planning/phases/NN-name/research/
├── 00-brief.md
├── 01-architecture-patterns.md
├── 02-implementation-approaches.md
├── 03-existing-solutions.md
├── 04-pitfalls-and-risks.md
├── 05-{deep-expand-topic}.md       # Deep expand additions start at 05
├── NN-{topic}.md
├── REVIEW-LOG.md
└── GRADUATION-REPORT.md
```

- No `.planning/research/` (flat, non-phase-scoped) directory
- No `deep/` subdirectory
- Deep expand files are numbered 05+ in the same directory

---

## Decision 8: Gap ID Format

**Resolves**: CRIT-RS-003

Use **reviewer-prefixed IDs** with severity as a field:

```
G-COMP-001: [severity: CRITICAL] Description...
G-ACC-001: [severity: IMPORTANT] Description...
G-ACT-001: [severity: MINOR] Description...
```

- ID prefix tells you WHO found it (stable across iterations)
- Severity is a mutable field (can be upgraded/downgraded across iterations)
- Do NOT use `GAP-C-001` / `GAP-I-001` format

---

## Decision 9: Config Key Casing

**Resolves**: CRIT-IP-001

Use **camelCase** for all config keys (match existing convention):

```json
{
  "research": {
    "parallelResearchers": 4,
    "reviewLoop": {
      "maxIterations": 3,
      "continueForImportant": true
    },
    "planReviewLoop": {
      "maxIterations": 2
    },
    "graduation": {
      "confidenceThreshold": "MEDIUM",
      "scoringThreshold": 0.55,
      "autoCleanupAfterPhase": true
    },
    "perTaskRecall": {
      "enabled": true,
      "maxEngramsPerTask": 5
    }
  }
}
```

---

## Decision 10: Model Routing Presets

**Resolves**: CRIT-AO-001, CRIT-AO-002

| Agent                 | Preset          | Rationale                                                         |
| --------------------- | --------------- | ----------------------------------------------------------------- |
| 4 Researchers         | `ROUTER`        | Research is discovery, not deep execution; cost savings justified |
| 3 Reviewers           | `DEEP_ANALYSIS` | Review requires careful evaluation                                |
| lu-research-graduator | `ORCHESTRATOR`  | Graduation is orchestration (scoring, dedup, batch write)         |

---

## Decision 11: Researcher Isolation

**Resolves**: CRIT-AO-003

All researchers use **cold isolation**. This is non-negotiable per the design principles.

---

## Decision 12: Research File Naming

**Resolves**: CRIT-AO-004

Use **numbered filenames**: `01-architecture-patterns.md`, `02-implementation-approaches.md`, `03-existing-solutions.md`, `04-pitfalls-and-risks.md`

Numbering defines reading order and matches the multi-agent-research spec.

---

## Decision 13: Reviewer Count

**Resolves**: CRIT-RL-004

**3 reviewers at all complexity levels** for both research review and plan review. Complexity affects model tier and iteration budget, not reviewer count.

---

## Decision 14: Iteration Budgets

**Resolves**: CRIT-RL-005, CRIT-RL-006

| Complexity | Research Review Max | Plan Review Max |
| ---------- | ------------------- | --------------- |
| TRIVIAL    | 1                   | 1               |
| SIMPLE     | 2                   | 1               |
| MODERATE   | 2                   | 2               |
| COMPLEX    | 3                   | 2               |
| CRITICAL   | 3                   | 3               |

---

## Decision 15: Unsourced Quantitative Claims

**Resolves**: CRIT-DP-002

Reframe the quality degradation curve and cost claims as **design assumptions**, not empirical observations:

- "We model the degradation curve as..." (not "observed across models...")
- "We assume catching errors in research/planning is significantly cheaper than..." (not "research suggests...")

---

## Decision 16: Revision Loop Targets

**Resolves**: CRIT-WS-002

When Step 5 review identifies gaps in deep expansion files (from Step 4), the revision spawns **targeted researcher agents** for those specific gaps. The revision does NOT re-enter Step 4 as a whole — it is a focused re-expansion within the Step 5 review loop.

---

## Decision 17: TRIVIAL Complexity Handling

**Resolves**: CRIT-OQ-002

**All 10 steps run at all complexity levels** (preserving v1 invariant). For TRIVIAL:

- Researchers use `fast` tier, reduced token budgets
- Review loops max at 1 iteration
- Graduation still runs (but may graduate 0 engrams)
- No steps are skipped based on complexity alone

Remove any text suggesting TRIVIAL tasks skip research or planning phases.

---

## Decision 18: Missing Implementation Items

**Resolves**: CRIT-IP-002, CRIT-IP-003

Add to implementation plan:

- `src/skills/__helpers/build-skill-registry.ts` in Phases 2, 3, 4 modified files
- `bun run build:all` step in ALL phase verification sections (not just Phase 1)
- `src/skills/__schemas/skill.schemas.ts` if schema updates needed
- Compiler verification for new skill/agent output formats

---

## Decision 20: Orchestrator Location

**Resolves**: Q2

Enhance the existing `lu.skill.ts` with a v2 branch. Do NOT create a separate `lu-v2.skill.ts`. The v2 pipeline is gated by `workflow.version: "v2"` in config.json or the `--v2` CLI flag. When v2 is not enabled, v1 behavior is unchanged.

---

## Decision 21: Research Engram Lifecycle

**Resolves**: Q4

Clean up `research:*` engrams **after phase completion**. When a phase's verification passes (Step 10), the orchestrator:

1. lu-learner promotes high-value `research:*` engrams to permanent `pattern:*`/`pitfall:*`/`decision:*` in DEFAULT vault
2. Remaining `research:*` engrams are deleted from REPO vault via `muninn_forget`
3. The `research:*` namespace is confirmed empty for that phase

This is aggressive cleanup but appropriate because:

- Valuable findings survive via promotion to permanent namespaces
- Phase-scoped research is unlikely to be useful after execution validates or invalidates it
- Prevents engram bloat in the repo vault

The `research.graduation.autoCleanupAfterPhase` config key controls this (default: `true`).

---

## Decision 22: Reviewer Disagreement Resolution

**Resolves**: Q7

When reviewers disagree on IMPORTANT findings:

- **CRITICAL from ANY reviewer** always blocks — no override
- **IMPORTANT findings**: the orchestrator takes its best judgment call. If the finding is clearly actionable, treat it as blocking. If ambiguous, log it as an advisory note in REVIEW-LOG.md and proceed
- **If genuinely uncertain**: escalate to user with the specific disagreement summarized
- This follows the existing Luca pattern where oversight level determines escalation threshold

---

## Decision 23: Deep Expand Is Mandatory

**Resolves**: Q13

**Always run Deep Expand** (Step 4), even if initial research (Step 2) appears comprehensive. Rationale:

- Initial research covers breadth (4 facets); Deep Expand covers depth (specialist topics from discussion)
- Skipping it creates a shortcut that undermines the "front-load research" philosophy
- At TRIVIAL complexity, Deep Expand runs with `fast` tier and minimal depth — cheap enough to always include
- The review loop (Step 5) provides the quality gate, not skipping steps

---

## Decision 24: Research File Archival

**Resolves**: Q14

After graduation (Step 6), research files are **archived** (not deleted):

1. Move `research/` contents to `research/archive/` subdirectory within the phase
2. GRADUATION-REPORT.md and REVIEW-LOG.md remain in `research/` (they're process artifacts, not research content)
3. Archived files are NOT deleted from disk — a separate cleanup system will handle purging later
4. Archived files are NOT committed to git separately (they stay in the working tree until the phase commit)

Layout after archival:

```
.planning/phases/NN-name/research/
├── archive/
│   ├── 01-architecture-patterns.md
│   ├── 02-implementation-approaches.md
│   ├── 03-existing-solutions.md
│   ├── 04-pitfalls-and-risks.md
│   └── 05-{topic}.md
├── REVIEW-LOG.md
└── GRADUATION-REPORT.md
```

---

## Decision 19: Canonical Source Designation

To prevent future cross-section conflicts, each topic has ONE canonical source:

| Topic                | Canonical Source                                | Other sections should... |
| -------------------- | ----------------------------------------------- | ------------------------ |
| Step definitions     | `01-workflow-steps/`                            | Reference, not redefine  |
| Research file format | `02-research-system/research-file-structure.md` | Reference, not redefine  |
| Confidence model     | `02-research-system/source-confidence-model.md` | Reference, not redefine  |
| Convergence criteria | `05-review-loops/convergence-criteria.md`       | Reference, not redefine  |
| Review protocols     | `05-review-loops/`                              | Reference, not redefine  |
| Agent specifications | `04-agent-orchestration/`                       | Reference, not redefine  |
| MuninnDB integration | `03-muninndb-integration/`                      | Reference, not redefine  |
| Iteration budgets    | `05-review-loops/iteration-budgets.md`          | Reference, not redefine  |
| Config schema        | `06-implementation-plan/config-changes.md`      | Reference, not redefine  |
