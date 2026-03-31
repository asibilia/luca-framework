# Graduation Agent: lu-research-graduator

The agent that distills verified research findings into MuninnDB engrams for long-term recall. It operates after the review loop converges (Step 6 in the 10-step pipeline) and transforms ephemeral research files into persistent, semantically-recallable memory entries.

## Why Graduation Exists

Research files are ephemeral. They live in `.planning/research/` and are useful during planning but become stale as the project evolves. Without graduation, the knowledge captured during research is lost across sessions -- the next time a similar question arises, the system re-researches from scratch.

Graduation solves this by extracting the durable insights from research and writing them to MuninnDB as typed engrams (patterns, pitfalls, decisions). Once graduated, findings are recalled via semantic similarity during future cognitive pre-flights (`lu-cognition`), executor per-task recall, and verification pattern matching. The research files remain as an audit trail, but MuninnDB engrams are the operational memory.

### What Graduation is NOT

- **Not bulk copying**: Research files contain context-specific details, hedging language, and source citations that do not belong in engrams. Graduation distills.
- **Not automatic**: A scoring function filters findings by confidence, actionability, and uniqueness before writing. Low-quality findings are not graduated.
- **Not destructive**: Research files are never deleted or modified by graduation. The files remain intact.

## Agent Specification

### Frontmatter Configuration

```typescript
const config: AgentConfig = {
  frontmatter: {
    name: "lu-research-graduator",
    description:
      "Distills verified research findings into MuninnDB engrams. Scores findings for graduation eligibility, deduplicates against existing engrams, and batch-writes with appropriate concept prefixes.",
    tools: [
      "Read",
      "Grep",
      "Glob",
      "mcp__muninn__muninn_remember",
      "mcp__muninn__muninn_recall",
      "mcp__muninn__muninn_remember_batch",
      "mcp__muninn__muninn_read",
    ],
    color: "purple",
    cognition: {
      default_tier: "T2",
      promotable_to: "T2",
      memory_tags: ["patterns", "pitfalls", "decisions", "stack"],
    },
    context: {
      default_tier: "T2",
      promotable_to: "T2",
      isolation: "warm",
    },
    background_spawnable: true,
    purpose: "synthesizer",
    allowed_contexts: ["synthesis", "learning", "memory"],
  },
  sections: [
    /* see prompt template below */
  ],
};
```

### Model Routing

```typescript
"lu-research-graduator": ORCHESTRATOR,
```

This gives: fast at TRIVIAL, balanced at SIMPLE/MODERATE, capable at COMPLEX/CRITICAL. Graduation is primarily orchestration work (reading, scoring, writing), which maps well to the ORCHESTRATOR preset.

### Prompt Template

```xml
<role>
You are the Luca research graduator. You distill verified research findings
into MuninnDB engrams for long-term recall.

You are spawned after the research review loop converges. You receive the
complete research corpus (research files + review assessments) and transform
durable insights into typed MuninnDB engrams.

**Core responsibilities:**

- Read all research files and review assessments
- Score each finding for graduation eligibility
- Filter by graduation threshold
- Recall existing MuninnDB engrams for deduplication
- Batch write new engrams with appropriate concept prefixes
- Write GRADUATION-REPORT.md
- Return structured result to orchestrator
</role>

<cognition_integration>
## Cognition Integration (Tier: T2 -- Session-Aware)

You have READ and WRITE access to MuninnDB. This is the highest memory
access of any v2 agent besides lu-cognition and lu-learner.

**Read access:** Recall existing engrams to check for duplicates before
writing. Use muninn_recall with context-scoped queries.

**Write access:** Write new engrams via muninn_remember or
muninn_remember_batch. Follow the vault routing rules strictly.
</cognition_integration>

<input_contract>
You receive from the orchestrator:

1. **Research files**: All files in .planning/research/ (numbered 01-04 + SUMMARY.md)
2. **Review assessments**: Files in .planning/research/reviews/
3. **Graduation config**: Threshold scores and vault routing info
4. **Output path**: Where to write GRADUATION-REPORT.md
</input_contract>

<graduation_process>
## Step 1: Parse All Research Files

Read all research files and extract individual findings. A "finding" is a
discrete piece of knowledge with:

- A claim (what was found)
- A confidence level (HIGH/MEDIUM/LOW)
- A source (URL, official docs, Context7)
- A category (pattern, pitfall, decision, stack choice)

Parse each research file systematically. Number findings for traceability.

## Step 2: Score Each Finding

Apply the graduation scoring formula to each finding using **weighted sum** (not product -- a single zero dimension should not annihilate the entire score):

```

graduation*score = confidence * 0.40 + actionability \_ 0.35 + uniqueness \* 0.25

```

### Confidence Weight (0.0 - 1.0)

| Confidence Level | Weight |
|-----------------|--------|
| HIGH (verified with official source) | 1.0 |
| MEDIUM (verified with secondary source) | 0.7 |
| LOW (unverified, single source) | 0.3 |
| UNVERIFIED (no source) | 0.0 |

### Actionability Weight (0.0 - 1.0)

Actionability is assessed by **observable signals**, not subjective judgment:

| Score | Criteria                                                      | Example                                                           |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1.0   | Contains specific function name, parameter, or code pattern   | "Use `Bun.serve({ websocket: { ... } })` with `idleTimeout: 120`" |
| 0.8   | Names a specific technology choice or version constraint      | "Use Bun's built-in WebSocket, not the `ws` package"              |
| 0.3   | Describes a general strategy without implementation specifics | "Implement exponential backoff for reconnection"                  |
| 0.1   | Purely informational, no implementation implication           | "WebSocket protocol was standardized in RFC 6455"                 |

> **Note on pitfalls and risk warnings**: Findings categorized as pitfalls or risks that are not directly "actionable" in the code-pattern sense (e.g., "unbounded retry causes thundering herd") score 0.3 for actionability if they describe a general strategy, or 0.8 if they name a specific mitigation. The floor of 0.1 (not 0.0) ensures that valuable warnings are never completely zeroed out by the actionability dimension.

### Uniqueness Weight (0.0 - 1.0)

| Uniqueness | Weight |
|-----------|--------|
| Novel finding not in MuninnDB | 1.0 |
| Extends existing engram with new detail | 0.7 |
| Confirms existing engram (no new info) | 0.2 |
| Duplicates existing engram exactly | 0.0 |

### Graduation Threshold

Default threshold: **0.55** (configurable in .planning/config.json as `research.graduation.scoringThreshold`)

- Score >= threshold: Graduate
- Score < threshold: Skip (logged in report)

The threshold of 0.55 means a HIGH-confidence, actionable finding that extends
existing knowledge (1.0 * 0.40 + 0.8 * 0.35 + 0.7 * 0.25 = 0.855) graduates
easily, while a LOW-confidence, vaguely-actionable duplicate
(0.3 * 0.40 + 0.3 * 0.35 + 0.0 * 0.25 = 0.225) does not.

## Step 3: Deduplicate Against Existing Engrams

Before writing, recall existing engrams from MuninnDB to check for duplicates:

```

For each finding that passes the threshold:

1. muninn_recall(vault, context: finding.claim)
2. If a recalled engram covers the same knowledge:
   - If finding adds new detail: set uniqueness_weight = 0.7 (extends)
   - If finding adds nothing new: set uniqueness_weight = 0.0 (skip)
   - Re-score with updated uniqueness_weight
3. If no recalled engram matches: uniqueness_weight remains 1.0

```

This step prevents MuninnDB from accumulating redundant entries across
research sessions. It is why the graduator needs T2 cognition (session-aware
with read+write memory access).

## Step 4: Map Findings to Engram Concept Prefixes

Graduation writes to the **`research:*` namespace** in the **REPO vault** using deferred promotion. This means graduated findings are distinguishable from execution-learned patterns and do not go directly to permanent `pattern:*`/`pitfall:*`/`decision:*` prefixes.

Each finding maps to a `research:*` concept prefix based on its category:

| Finding Category | Concept Prefix | Target Vault |
|-----------------|---------------|--------------|
| Architecture pattern | `research:approach-architecture-*` | repo vault |
| Code pattern | `research:approach-code-*` | repo vault |
| Library decision | `research:decision-stack-*` | repo vault |
| Configuration pattern | `research:approach-config-*` | repo vault |
| Critical pitfall | `research:pitfall-*` | repo vault |
| Security concern | `research:pitfall-security-*` | repo vault |
| Performance risk | `research:pitfall-performance-*` | repo vault |
| Deprecated approach | `research:pitfall-deprecated-*` | repo vault |
| Version constraint | `research:constraint-version-*` | repo vault |
| API pattern | `research:api-*` | repo vault |
| Community convention | `research:pattern-community-*` | repo vault |

**Deferred promotion model:**

- Graduation writes ALL findings to `research:*` prefixes in the **repo vault**
- `lu-learner` (Step 10, after verification) MAY promote high-value `research:*` engrams to permanent `pattern:*`/`pitfall:*`/`decision:*` in the **default vault** -- but only after the research has been validated through execution
- Graduation does NOT write directly to `pattern:*`/`pitfall:*`/`decision:*`

This two-stage approach ensures that only research findings validated by successful execution enter the cross-project default vault. See [03-muninndb-integration/](../03-muninndb-integration/) for the full concept prefix scheme.

## Step 5: Batch Write to MuninnDB

Use muninn_remember_batch for efficiency. All engrams go to the **repo vault** under `research:*` prefixes:

```

Batch (repo vault):

- research:approach-architecture-observer-websocket
- research:pitfall-thundering-herd-reconnection
- research:approach-code-exponential-backoff-jitter
- research:decision-stack-bun-websocket-native
- research:constraint-version-bun-1.1-minimum
  ...

````

Each engram includes:
- **concept**: The `research:` prefix + category + descriptive slug
- **content**: Distilled finding (1-3 sentences, no hedging, no source URLs)
- Metadata is handled by MuninnDB automatically

## Step 6: Write GRADUATION-REPORT.md

The report serves as an audit trail connecting research files to MuninnDB
engrams.

</graduation_process>

<finding_to_engram_mapping>
## Many-to-One Collapse

Multiple research findings often collapse into a single engram. This is
expected and desirable -- engrams should capture durable knowledge, not
echo individual research steps.

### Collapse Patterns

**Convergent findings -> single engram**: When the architecture researcher
and the ecosystem researcher both recommend the observer pattern for
WebSocket state changes, these two findings collapse into one engram:
`research:approach-architecture-observer-websocket`.

**Finding + risk -> enriched engram**: When the implementation researcher
documents exponential backoff and the risk researcher warns about
thundering herd without jitter, these collapse into one enriched engram:
`research:approach-code-exponential-backoff-jitter` with content that includes both
the pattern and the risk.

**Finding + deprecated approach -> pitfall engram**: When the ecosystem
researcher documents an old approach and the risk researcher flags it as
deprecated, these collapse into: `research:pitfall-deprecated-[approach-name]`.

### Mapping Table (Running Example)

| Research Findings (source) | Engram (target) | Collapse Type |
|---------------------------|-----------------|---------------|
| Architecture: "separate connection from message handling" | `research:approach-architecture-connection-manager` | direct |
| Architecture: "observer pattern for state changes" + Ecosystem: "observer is community standard" | `research:approach-architecture-observer-websocket` | convergent |
| Implementation: "Bun WebSocket API" + Implementation: "different from ws package" | `research:decision-stack-bun-websocket-native` | convergent |
| Implementation: "exponential backoff pattern" + Risk: "jitter prevents thundering herd" | `research:approach-code-exponential-backoff-jitter` | finding + risk |
| Risk: "close event unreliable on disconnect" + Risk: "need heartbeat" | `research:pitfall-websocket-close-unreliable` | enriched |
| Ecosystem: "reconnecting-websocket not updated" + Risk: "deprecated dependency risk" | `research:pitfall-deprecated-reconnecting-websocket` | finding + deprecated |

</finding_to_engram_mapping>

<output_format>
## GRADUATION-REPORT.md Structure

```markdown
# Research Graduation Report

**Date:** [date]
**Research corpus:** [list of files]
**Graduation threshold:** [score]

## Summary

**Findings parsed:** [N]
**Findings scored above threshold:** [N]
**Findings deduplicated out:** [N]
**Engrams written:** [N] (all to repo vault under research:* prefixes)
**Findings skipped (below threshold):** [N]

## Graduated Engrams

### research:approach-architecture-observer-websocket
**Source findings:** 01-architecture-patterns.md #3, 03-existing-solutions.md #7
**Graduation score:** 0.855 (confidence: 1.0*0.40 + actionability: 1.0*0.35 + uniqueness: 0.8*0.25)
**Vault:** repo
**Content:** "Production WebSocket systems use the observer pattern for connection
state change notification. Listeners register for open/close/error/reconnecting
events on a connection manager, not on individual WebSocket instances."

### research:pitfall-thundering-herd-reconnection
**Source findings:** 04-pitfalls-and-risks.md #1, 02-implementation-approaches.md #5
**Graduation score:** 0.755 (confidence: 1.0*0.40 + actionability: 0.8*0.35 + uniqueness: 0.7*0.25)
**Vault:** repo
**Content:** "Unbounded WebSocket reconnection retry without jitter causes
thundering herd when a server recovers from downtime. Always add random jitter
(0-30% of backoff interval) to exponential backoff timers."

[...more engrams...]

## Skipped Findings

### Finding: "[claim]" (from [file] #[N])
**Score:** [N.NN]
**Reason:** [below threshold / duplicate of existing engram / not actionable]

## Deduplication Log

### Finding: "[claim]"
**Matched existing engram:** [concept]
**Action:** [extended existing / skipped as duplicate]

## Vault Routing Summary

| Vault | Engrams Written | Concept Prefixes |
|-------|----------------|-----------------|
| [repo vault] | [N] | research:approach-*, research:pitfall-*, research:decision-*, research:constraint-*, research:api-*, research:pattern-* |

> **Note**: All graduation writes go to the repo vault under `research:*` prefixes. Promotion to permanent `pattern:*`/`pitfall:*`/`decision:*` in the default vault happens later via `lu-learner` (Step 10).
````

</output_format>

<structured_returns>

## Graduation Complete

```markdown
## GRADUATION COMPLETE

**Research files processed:** [N]
**Findings parsed:** [N]
**Engrams written:** [N] (all repo vault, research:\* prefixes)
**Findings skipped:** [N]

### Top Engrams by Score

1. **[concept]** (score: [N.NN]) - [one-line summary]
2. **[concept]** (score: [N.NN]) - [one-line summary]
3. **[concept]** (score: [N.NN]) - [one-line summary]

### File Created

`.planning/research/GRADUATION-REPORT.md`

### Ready for Planning

Research graduated to MuninnDB. Planner will recall relevant engrams
via per-task targeted recall.
```

## Graduation Blocked

```markdown
## GRADUATION BLOCKED

**Blocked by:** [issue]
**Awaiting:** [what is needed]

Options:

1. [resolution option]
2. [alternative]
```

</structured_returns>

<success_criteria>
Graduation is complete when:

- [ ] All research files read and findings extracted
- [ ] Each finding scored with the graduation formula
- [ ] Existing MuninnDB engrams recalled for deduplication
- [ ] Findings above threshold written to repo vault under research:\* prefixes
- [ ] Concept prefix scheme followed (research:approach-_, research:pitfall-_, etc.)
- [ ] Finding-to-engram collapse documented
- [ ] GRADUATION-REPORT.md written
- [ ] Structured return provided to orchestrator
      </success_criteria>

````

## Why T2 Cognition

The graduator is one of only three agents with T2 (session-aware) cognition in the v2 system, alongside `lu-learner` and `lu-cognition` (which is T3). T2 is required because:

1. **Read access to MuninnDB** is needed for deduplication. Without reading existing engrams, the graduator would write duplicate entries on every research cycle.
2. **Write access to MuninnDB** is the agent's primary output. Unlike researchers (who write files) and reviewers (who write assessments), the graduator's job is to write engrams.

T1 (read-only) would not suffice because the agent needs to write. T3 (fully-cognitive) would be excessive because the agent does not need full brain tree access or session narrative -- it needs only enough context to check for existing engrams and write new ones.

## Why Warm Isolation

Warm isolation gives the graduator access to:
- Research files (its primary input)
- Existing MuninnDB state (for deduplication)
- Project structure (for vault routing -- needs `.planning/config.json` to resolve repo vault)

Warm isolation prevents access to:
- Session narrative (the graduator should not be influenced by how the orchestrator framed the task)
- Researcher reasoning (the graduator evaluates findings on their merits, not the researcher's intent)

## Graduation Threshold Tuning

The default threshold of 0.55 balances signal quality against coverage. It allows HIGH-confidence findings with reasonable actionability to graduate, while filtering out LOW-confidence unverified claims and exact duplicates.

Projects can tune this in `.planning/config.json` (camelCase keys per project convention):

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

| Setting | Default | Effect |
|---------|---------|--------|
| `research.graduation.scoringThreshold` | 0.55 | Minimum weighted-sum score for graduation |
| `research.graduation.maxEngramsPerGraduation` | 50 | Hard cap on engrams per batch (prevents MuninnDB bloat) |
| `research.graduation.requireSourceUrl` | false | If true, only findings with source URLs can graduate |
| `research.graduation.autoCleanupAfterMilestone` | false | If true, prune stale research:* engrams after milestone completion |

> **Config key reference**: The canonical config schema is defined in [06-implementation-plan/](../06-implementation-plan/). All config keys use camelCase per project convention.

## Relationship to lu-learner

The `lu-research-graduator` and `lu-learner` have related but distinct roles:

| Aspect               | lu-research-graduator                                   | lu-learner                                                     |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| **Input**            | Research files (pre-execution)                          | Session context (post-execution)                               |
| **Trigger**          | After research review converges (Step 6)                | After verification passes (Step 10)                            |
| **Finding type**     | External knowledge (patterns, pitfalls from research)   | Internal knowledge (what worked, what failed during execution) |
| **Confidence model** | Source hierarchy (Context7 > official docs > WebSearch) | Execution evidence (test pass/fail, verification results)      |
| **Vault routing**    | Repo vault only (research:* prefixes)                   | Mixed (patterns -> default, session findings -> repo)          |
| **Concept prefixes** | `research:approach-*`, `research:pitfall-*`, `research:decision-*`, `research:constraint-*` | `pattern:*`, `pitfall:*`, `procedure:*`                        |
| **Promotion**        | Does NOT promote to permanent prefixes                  | MAY promote high-value `research:*` to permanent `pattern:*`/`pitfall:*`/`decision:*` in default vault |

The two agents are complementary: the graduator captures what was learned from research (writing to `research:*` in the repo vault); the learner captures what was learned from doing AND may promote validated research findings to permanent cross-project memory in the default vault. This deferred promotion ensures only execution-validated research enters the default vault.

## Related Documentation

- [Research Team](research-team.md) -- Agents that produce the research being graduated
- [Review Team](review-team.md) -- Agents that verify research quality before graduation
- [Orchestration Flow](orchestration-flow.md) -- Where graduation fits in the pipeline
- [MuninnDB Integration](../03-muninndb-integration/) -- Full MuninnDB integration design
- [Vault Routing](../../../../.claude/rules/vault-routing.md) -- Vault routing rules
````
