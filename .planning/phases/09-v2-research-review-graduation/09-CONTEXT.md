# Phase 9 Context — v2 Research Infrastructure + Review Loop + MuninnDB Graduation

## Phase Goal

Build the v2 research system: 4 parallel researcher agents, convergence-based review loop with 3 reviewer agents, and MuninnDB graduation for distilling research into semantic memory.

## Decisions

### 1. Agent Architecture: Separate Files, Shared Constants [researched]

**Decision:** Use separate agent files (8 total) with shared prompt constants extracted into helper files. Follow the existing `cold-isolation-block.ts` pattern.

**Rationale:** Matches the codebase's established pattern of separate agent files (34 existing). Shared constants via `researcher-shared-sections.ts` and `research-reviewer-shared-sections.ts` eliminate prompt duplication while preserving clean isolation. Per CANONICAL-DECISIONS.md Decision 2.

**Shared constants to extract:**

- `RESEARCHER_PHILOSOPHY` — investigation mindset, honest reporting
- `RESEARCHER_TOOL_STRATEGY` — Context7 first, official docs, WebSearch
- `RESEARCHER_SOURCE_HIERARCHY` — confidence levels (HIGH/MEDIUM/LOW)
- `RESEARCHER_VERIFICATION_PROTOCOL` — known pitfalls, negative claims
- `RESEARCHER_OUTPUT_FORMAT` — markdown file structure template

### 2. v2 Mode Detection [researched]

**Decision:** Detect v2 mode via `workflow.version` field in `.planning/config.json`. When `"v2"`, use multi-agent research. When absent or `"v1"`, fall back to single `lu-phase-researcher` (v1 behavior).

**Implementation:** The `phase-research` skill reads config and branches:

- v2: Create `research/` directory, spawn 4 researchers in parallel via Task()
- v1: Spawn single lu-phase-researcher, produce single RESEARCH.md

**Note:** The `workflow.version` field does NOT exist yet in config.json. Phase 9 creates the agent/skill infrastructure; Phase 10 (or Phase 6 from v2 rollout) adds config schema changes. For now, skills should check for the field and default to v1 if absent.

### 3. Model Routing Assignments [researched]

Per CANONICAL-DECISIONS.md Decision 10:

| Agent Group           | Preset          | Rationale                                  |
| --------------------- | --------------- | ------------------------------------------ |
| 4 Researchers         | `ROUTER`        | Discovery work, not deep execution         |
| 3 Reviewers           | `DEEP_ANALYSIS` | Review requires careful evaluation         |
| lu-research-graduator | `ORCHESTRATOR`  | Orchestration: scoring, dedup, batch write |

### 4. Convergence Model for Review Loop [researched]

Per CANONICAL-DECISIONS.md Decision 3 — gap-severity model:

- Findings: CRITICAL / IMPORTANT / MINOR
- Loop while any CRITICAL exists
- IMPORTANT: configurable (`continueForImportant`, default: continue if iteration < max)
- Stop: 0 CRITICAL + 0 IMPORTANT, or max iterations
- Gap IDs: reviewer-prefixed (G-COMP-001, G-ACC-001, G-ACT-001) per Decision 8
- Iteration budgets per complexity (Decision 14): TRIVIAL=1, SIMPLE=2, MODERATE=2, COMPLEX=3, CRITICAL=3

### 5. Graduation Scoring [researched]

Per CANONICAL-DECISIONS.md Decision 5:

```
score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
threshold = 0.55
```

Actionability scoring per Decision 6:

- 1.0: specific function/parameter/code pattern
- 0.8: specific technology choice or version
- 0.3: general strategy without specifics
- 0.1: purely informational

Graduation rules:

- HIGH confidence: always graduate
- MEDIUM confidence: graduate with annotation
- LOW/UNVERIFIED: do NOT graduate
- All `research:*` engrams go to REPO vault (not default)
- Concept prefixes: `research:approach-*`, `research:api-*`, `research:pitfall-*`, `research:constraint-*`, `research:decision-*`, `research:pattern-*`

### 6. Research File Layout [researched]

Per CANONICAL-DECISIONS.md Decision 7 — phase-scoped, flat:

```
.planning/phases/NN-name/research/
├── 00-brief.md
├── 01-architecture-patterns.md
├── 02-implementation-approaches.md
├── 03-existing-solutions.md
├── 04-pitfalls-and-risks.md
├── 05-{deep-expand-topic}.md
├── REVIEW-LOG.md
└── GRADUATION-REPORT.md
```

After graduation, archive to `research/archive/` per Decision 24.

### 7. Researcher Isolation: Cold (Non-Negotiable) [researched]

Per CANONICAL-DECISIONS.md Decision 11. All researchers and reviewers use cold isolation. They receive only the phase brief and their assigned research facet — no session context, no executor notes, no cross-agent communication.

### 8. Vault Routing for research:\* Namespace [researched]

New `research:*` prefix routes to REPO vault (per Decision 4):

- Write: REPO vault only (project-scoped research)
- Recall: REPO vault only (executors recall per-task)
- Cleanup: After phase verification, lu-learner promotes high-value engrams to DEFAULT vault (`pattern:*`, `pitfall:*`), then remaining `research:*` engrams are forgotten

Update both `.claude/rules/vault-routing.md` and `~/.claude/rules/vault-guard.md`.

## Scope Boundaries

### In Scope

- 4 researcher agents + shared helper
- 3 reviewer agents + shared helper
- 1 graduator agent
- phase-research skill v2 branch
- phase-research-review skill (new)
- phase-research-expand skill (new)
- phase-graduate skill (new)
- Agent registry updates (8 new entries)
- Skill registry updates (3 new entries)
- Model routing table updates (8 new entries)
- Vault routing rule updates (research:\* namespace)

### Out of Scope (Deferred)

- Config schema changes for `research` section (Phase 10)
- Orchestrator integration in lu.skill.ts (v2 Phase 6, deferred to M2)
- Plan enhancement with research_refs (Phase 10)
- Executor enhancement with per-task recall (Phase 10)
- `workflow.version` config field addition (Phase 10)

## Implementation Notes

- All new agents follow `createAgent()` factory pattern from `~/agents/__helpers/create-agent`
- All new skills follow `createSkill()` factory pattern from `~/skills/__helpers/create-skill`
- Frontmatter fields must be compatible with `src/compilers/__helpers/compile.ts`
- Remember: `bun run build:all` must be run outside Claude Code session after implementation
- No test files per `.claude/rules/no-tests.md` — verify with `bunx --bun tsc --noEmit` only
