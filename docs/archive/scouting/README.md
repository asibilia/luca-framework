# Luca Scout Pipeline

Automated article intelligence for agentic development research. The Scout pipeline ingests external articles, assesses their relevance to the Luca framework, researches implementation approaches, and produces actionable todos -- all enforced by a deterministic state machine that prevents the LLM from skipping steps.

## Quick Start

1. Drop one or more URLs into `docs/scouting/inbox.md` under the `## Pending` heading:

   ```markdown
   ## Pending

   - https://example.com/article-about-agentic-patterns
   - https://example.com/another-interesting-article
   ```

2. Run the scout pipeline:

   ```
   /scout
   ```

3. Check `docs/scouting/INDEX.md` for results. The index is auto-maintained and shows integrated articles, in-progress work, deferred items, and manual-review items.

## Commands

| Command                            | What it does                                        |
| ---------------------------------- | --------------------------------------------------- |
| `/scout`                           | Process all pending URLs from `inbox.md`            |
| `/scout https://url`               | Process a single URL directly (skips inbox)         |
| `/scout --review`                  | List all items in manual review                     |
| `/scout --review {slug}`           | Re-process a specific manual-review item            |
| `/scout --review {slug} --dismiss` | Dismiss an item from manual review                  |
| `/scout --deferred`                | List deferred items ranked by value                 |
| `/scout --deferred {slug}`         | Re-evaluate a deferred item's conditions to revisit |

## Pipeline Architecture

```
inbox.md --> Ingest --> Relevance Gate --> Research --> Analyze --> Impl Research --> READY
                              |                                                      |
                              v LOW                                            Integration
                        manual-review/                                        /    |    \
                                                                     integrate  defer  conflict
                                                                         |        |       |
                                                                  Plan -> Graduate  deferred/  manual-review/
                                                                         |
                                                                      INDEX.md
```

The pipeline has two phases:

**Phase A -- Per-Article** (runs sequentially for each URL):
Each article moves through six stages independently. A dedicated sub-agent handles each stage, receiving only the context it needs. No agent sees the full pipeline.

**Phase B -- Cross-Cutting Batch** (runs once after all articles reach READY):
Analyzes the batch as a whole for cross-article themes, generates todos, captures findings in memory, and updates the index.

## State Lifecycle

Every article is tracked by a state file at `docs/scouting/.scout-state/{slug}.json`. The state machine enforces a strict directed acyclic graph -- no transitions are allowed outside this table.

### Per-Article States

| State               | Description                                         | Next States                 |
| ------------------- | --------------------------------------------------- | --------------------------- |
| `PENDING`           | URL queued, not yet fetched                         | INGESTED                    |
| `INGESTED`          | Raw content fetched, digest created                 | RELEVANCE_CHECKED           |
| `RELEVANCE_CHECKED` | Relevance score computed                            | RESEARCHED or LOW_RELEVANCE |
| `RESEARCHED`        | Deep research complete (ecosystem + implementation) | ANALYZED                    |
| `ANALYZED`          | Impact analysis and gap mapping complete            | IMPL_RESEARCHED             |
| `IMPL_RESEARCHED`   | Concrete implementation approaches documented       | READY                       |
| `READY`             | Per-article pipeline complete, awaiting batch       | INTEGRATION_ANALYZED        |

### Cross-Cutting States

| State                  | Description                              | Next States                             |
| ---------------------- | ---------------------------------------- | --------------------------------------- |
| `INTEGRATION_ANALYZED` | Cross-article cohesion analysis complete | TODOS_CREATED, DEFERRED, or CONFLICTING |
| `TODOS_CREATED`        | Work items generated from analysis       | MEMORY_CAPTURED                         |
| `MEMORY_CAPTURED`      | Findings stored in MuninnDB              | INDEXED                                 |
| `INDEXED`              | Added to INDEX.md                        | COMPLETE                                |

### Terminal States

| State           | Description                       | How to re-enter            |
| --------------- | --------------------------------- | -------------------------- |
| `COMPLETE`      | Fully processed                   | N/A (done)                 |
| `LOW_RELEVANCE` | Scored below relevance threshold  | `/scout --review {slug}`   |
| `DEFERRED`      | Valid but intentionally postponed | `/scout --deferred {slug}` |
| `CONFLICTING`   | Conflicts with existing work      | `/scout --review {slug}`   |

### Transition Diagram

```
PENDING -> INGESTED -> RELEVANCE_CHECKED -> RESEARCHED -> ANALYZED -> IMPL_RESEARCHED -> READY
                              |
                              +-> LOW_RELEVANCE (terminal)

READY -> INTEGRATION_ANALYZED -> TODOS_CREATED -> MEMORY_CAPTURED -> INDEXED -> COMPLETE
                |
                +-> DEFERRED (terminal)
                +-> CONFLICTING (terminal)
```

## Document Types

### Digests (`docs/scouting/digests/`)

Per-article summary and research output. Created during INGESTED, expanded during RESEARCHED.

Contains:

- **Summary** -- 3-5 sentences capturing key points
- **Key Concepts** -- Bulleted list of main concepts
- **Techniques and Patterns** -- Specific approaches described
- **Related Work** -- Ecosystem context (added by research stage)
- **Technique Deep-Dive** -- Implementation details (added by research stage)

### Impact Analyses (`docs/scouting/digests/{slug}-impact.md`)

Framework gap analysis produced during ANALYZED stage, expanded during IMPL_RESEARCHED.

Contains:

- **Gap Analysis table** -- Area, Current State, Potential Improvement, Effort
- **Applicable Patterns** -- How article patterns map to framework capabilities
- **Implementation Approaches** -- Concrete code-level strategies (added by impl research)
- **Recommended Actions** -- Priority-ordered checkbox list (P0/P1/P2)

### Integration Analyses (`docs/scouting/integration/`)

Cross-article batch analysis produced during INTEGRATION_ANALYZED state.

Contains:

- **Cross-Scout Cohesion Analysis** -- Themes across multiple articles
- **Framework Fit Assessment** -- Alignment with framework direction
- **Integration Priority Ordering** -- Ordered list with rationale
- **Per-Scout Verdicts** -- integrate, defer, or conflict for each article

### Deferred Items (`docs/scouting/deferred/`)

Valid work intentionally postponed to a future milestone.

Contains:

- Links to original digest and impact documents
- **Why Deferred** -- Reasoning for postponement
- **Conditions to Revisit** -- Specific triggers or milestones that make the item actionable
- **Value If Implemented** -- Expected benefit to the framework

### Manual Review Items (`docs/scouting/manual-review/`)

Items that need human judgment before proceeding.

Three reasons an item lands here:

- **low-relevance** -- Automated scoring flagged as tangential; human confirms or overrides
- **todo-conflict** -- Recommendations conflict with existing planned work
- **fetch-failed** -- Source URL could not be retrieved (paywall, 404, timeout)

## Anti-Step-Skipping

The state machine exists because LLMs are prone to "efficiency shortcuts" -- reasoning that a step is unnecessary and jumping ahead. The Scout pipeline prevents this through three mechanisms:

1. **Deterministic orchestrator.** The `/scout` skill is a flat `Agent()` orchestrator with `disable-model-invocation: true`. It follows the state machine table mechanically. It does not reason about whether steps should be skipped.

2. **Progressive disclosure.** Each sub-agent receives only its step's context. The ingest agent gets only the URL. The relevance agent gets only the digest path. No agent has enough context to attempt a multi-step shortcut.

3. **Validated transitions.** The `validateScoutTransition()` function enforces the directed acyclic graph. If code attempts `PENDING -> READY`, the validation rejects it with a clear error. State advances only after the expected output artifact is confirmed to exist on disk.

Together these ensure every article passes through every required analysis stage, even when the LLM "knows" the answer from the article title alone.

## Error Recovery

State files are the resume mechanism. If the pipeline is interrupted at any point:

- Re-run `/scout` and it picks up each article from its current state
- State transitions are atomic: the state file advances only AFTER the output artifact is written to disk
- Agent failures leave the state unchanged, so the next run retries the failed step
- The `.scout-state/` directory is the source of truth; `INDEX.md` is regenerated from it

## Integration with Milestone Planning

Deferred items feed back into Luca's milestone planning workflow:

1. Run `/scout --deferred` to list all postponed items with their conditions-to-revisit and value rankings
2. During `/milestone-new`, deferred scout items with met conditions are surfaced as candidate work items
3. The `scout-graduate` step stores deferral decisions in MuninnDB with `scout:decision-{slug}` concept prefixes, so future milestone planning can semantically recall why items were deferred and under what conditions they should return

Deferred items are never silently dropped. They persist in `docs/scouting/deferred/` and in MuninnDB until explicitly integrated or dismissed.

## Memory

The Scout pipeline captures findings in MuninnDB (the repo vault) using `scout:*` concept prefixes:

| Concept Prefix           | What it captures                                          |
| ------------------------ | --------------------------------------------------------- |
| `scout:technique-{slug}` | Novel techniques discovered (what the article taught us)  |
| `scout:pattern-{slug}`   | Patterns applicable to framework (how to apply it)        |
| `scout:decision-{slug}`  | Integration decisions made (why integrate/defer/conflict) |

### Graduation Threshold

Not every finding becomes a long-term memory. Each candidate is scored:

```
score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
```

Only findings scoring above **0.55** are stored. This prevents MuninnDB from accumulating low-value noise.

### Engram Linking

Related engrams are linked in MuninnDB's graph:

- `scout:technique-X` links to `scout:decision-X` (technique informs decision)
- `scout:pattern-X` links to existing `pattern:*` engrams when related patterns are found

These links allow future sessions to recall not just individual findings but the reasoning chain that connected them.

## Directory Structure

```
docs/scouting/
  inbox.md              # Drop URLs here
  INDEX.md              # Auto-generated tracking table
  README.md             # This file
  .scout-state/         # Per-article state files (JSON)
  digests/              # Article summaries and impact analyses
  integration/          # Cross-article batch analyses
  deferred/             # Postponed items with revisit conditions
  manual-review/        # Items needing human judgment
```
