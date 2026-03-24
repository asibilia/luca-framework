# Research Review Protocol

> The convergence-based review loop that verifies research completeness, accuracy, and actionability before findings feed into planning. **This section is the canonical specification** for the research review loop (Decision 19).

---

## Position in the Pipeline

The research review loop is Step 5 of the Luca v2 workflow. It sits between research production (Steps 2 and 4) and research graduation (Step 6):

```
Step 2: Initial Research -----> .planning/phases/{NN}-{name}/research/01-04*.md
Step 3: Discuss + Pre-mortem -> CONTEXT.md (locks decisions)
Step 4: Deep Expand ----------> .planning/phases/{NN}-{name}/research/05-*.md
                                        |
                                        v
                          +=========================+
                          |  Step 5: REVIEW RESEARCH |
                          |                         |
                          |  Iteration 1:           |
                          |    Spawn 3 reviewers    |
                          |    Collect findings     |
                          |    Aggregate + decide   |
                          |                         |
                          |  If CRITICAL gaps:      |
                          |    Re-expand (targeted) |
                          |    Iteration 2...       |
                          |                         |
                          |  If converged:          |
                          |    APPROVED             |
                          +=========================+
                                        |
                                        v
                          Step 6: Graduate to MuninnDB
```

---

## Trigger Conditions

The research review loop activates when:

1. **Initial research** (Step 2) has produced at least one research file in `.planning/phases/{NN}-{name}/research/`
2. **Deep expansion** (Step 4) has completed (if applicable at this complexity level)
3. The orchestrator has confirmed that all expected research facets have corresponding files

All 10 steps run at all complexity levels (Decision 17). For TRIVIAL tasks, reviewers use the `fast` model tier and the 1-iteration cap keeps overhead minimal.

---

## Reviewer Agents

Three independent reviewer agents are spawned in **cold isolation**. Each evaluates the same research corpus from a different analytical lens. **3 reviewers run at all complexity levels** (Decision 13) -- complexity affects model tier and iteration budget, not reviewer count.

| Agent Name                      | Lens        | What They Evaluate                                                                                             |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| **`lu-completeness-reviewer`**  | Coverage    | Are all facets of the task covered? Are there gaps in the research surface area?                               |
| **`lu-accuracy-reviewer`**      | Correctness | Do findings match their cited sources? Are confidence levels appropriate? Are there contradictions?            |
| **`lu-actionability-reviewer`** | Usefulness  | Can a planner create concrete tasks from these findings? Is the level of detail sufficient for implementation? |

These are NEW dedicated agents (Decision 2), not reused v1 agents. They are not `lu-verifier` instances.

### Cold Isolation Enforcement

Each reviewer receives:

```
INPUT:
  .planning/phases/{NN}-{name}/research/*.md    (all research files, flat directory)
  .planning/phases/{NN}-{name}/CONTEXT.md       (locked decisions from Step 3)
  User intent from Step 1                       (what was asked for)

NOT INCLUDED:
  Researcher session context       (reasoning, tool calls, web searches)
  MuninnDB session engrams         (session:research-* entries)
  Intermediate drafts              (any files deleted during research)
  Other reviewers' findings        (reviewers do not see each other)
```

Research files use the phase-scoped flat directory layout (Decision 7): `.planning/phases/{NN}-{name}/research/`. There is no `deep/` subdirectory -- deep expand files are numbered 05+ in the same directory.

Reviewers are spawned in parallel. They do not communicate. This prevents one reviewer's framing from biasing another's evaluation.

### Model Tier

Reviewer agents use the DEEP_ANALYSIS routing preset from the model routing table:

| Complexity | Model Tier |
| ---------- | ---------- |
| TRIVIAL    | fast       |
| SIMPLE     | balanced   |
| MODERATE   | capable    |
| COMPLEX    | capable    |
| CRITICAL   | capable    |

Research review quality is critical -- an error that passes review propagates through planning and execution. The capable tier is used for MODERATE+ complexity to maximize detection sensitivity.

---

## Review Output Format

Each reviewer produces a structured review document following this format:

```markdown
## Review: [Reviewer Name] - Iteration [N]

**Research corpus**: [count] files reviewed
**Iteration**: [N] of [max]
**Timestamp**: [ISO 8601]

### Critical Gaps (blocks planning)

These gaps, if left unaddressed, will cause the planner to make assumptions
that are likely to produce incorrect tasks.

- G-COMP-001: [severity: CRITICAL] [description] -- [which file] -- [suggested resolution]
- G-COMP-002: [severity: CRITICAL] [description] -- [which file] -- [suggested resolution]

### Important Gaps (improves quality)

These gaps do not block planning but will reduce execution quality if not addressed.

- G-COMP-003: [severity: IMPORTANT] [description] -- [which file] -- [suggested resolution]
- G-COMP-004: [severity: IMPORTANT] [description] -- [which file] -- [suggested resolution]

### Minor Gaps (nice to have)

These gaps are informational. Addressing them would improve the research but
is not necessary for successful planning and execution.

- G-COMP-005: [severity: MINOR] [description] -- [which file] -- [suggested resolution]

### Accuracy Concerns

Findings where the stated content may be incorrect, outdated, or misinterpreted.

- G-ACC-001: [severity: CRITICAL/IMPORTANT] [finding ID] -- [concern] -- [verification needed]
- G-ACC-002: [severity: CRITICAL/IMPORTANT] [finding ID] -- [concern] -- [verification needed]

### Verdict: CONTINUE / APPROVED

**Rationale**: [1-2 sentences explaining the verdict]
```

### Finding ID Convention (Decision 8)

Finding IDs use **reviewer-prefixed IDs** with severity as a mutable field:

```
G-COMP-NNN   Completeness reviewer finding (lu-completeness-reviewer)
G-ACC-NNN    Accuracy reviewer finding (lu-accuracy-reviewer)
G-ACT-NNN    Actionability reviewer finding (lu-actionability-reviewer)
```

The ID prefix identifies WHO found it (stable across iterations). Severity is a mutable field within the finding (can be upgraded/downgraded across iterations). The NNN counter is per-reviewer, per-iteration. Across iterations, new findings get new IDs. Repeated findings from a prior iteration retain their original ID with a note indicating they were not addressed.

Do NOT use the `GAP-C-001` / `GAP-I-001` format (severity-prefixed IDs). The reviewer prefix is stable; severity can change.

---

## Aggregation

After all three reviewers complete, the orchestrator collects and merges their findings:

```
Reviewer 1 (Completeness): 2 critical, 3 important, 1 minor
Reviewer 2 (Accuracy):     0 critical, 1 important, 2 accuracy concerns
Reviewer 3 (Actionability): 1 critical, 2 important, 0 minor
                            ─────────────────────────────────
Merged:                     3 critical, 6 important, 1 minor, 2 accuracy
```

### Deduplication

The orchestrator identifies duplicate findings across reviewers. Two findings are considered duplicates if they reference the same research file and describe the same gap or concern. When duplicates are found:

- The finding is kept once in the merged list
- All reviewer sources are noted (e.g., "flagged by Completeness and Actionability reviewers")
- The higher severity classification is used (e.g., if one reviewer rated it IMPORTANT and another CRITICAL, it is CRITICAL)

### Conflict Resolution

If reviewers contradict each other (e.g., one says a finding is accurate, another flags it as inaccurate), the conflict is elevated to CRITICAL status and requires investigation.

---

## Loop Decision

The orchestrator evaluates the merged finding list against the following decision tree:

```
                    Merged findings
                         |
                         v
              Any CRITICAL gaps?
              /              \
           YES                NO
            |                  |
            v                  v
    iteration < max?    Any IMPORTANT gaps?
    /           \        /              \
  YES            NO   YES               NO
   |              |     |                 |
   v              v     v                 v
 LOOP         ESCALATE  iteration < max?  APPROVED
(re-expand)  (to user)  /           \
                       YES            NO
                        |              |
                        v              v
                      LOOP          APPROVED
                   (re-expand)   (move to graduation)
```

Decision rules:

1. **Any CRITICAL gaps** and iteration < max --> **LOOP** (re-expand on specific gaps)
2. **Any CRITICAL gaps** and iteration >= max --> **ESCALATE** to user with gap summary
3. **Only IMPORTANT gaps** and `continueForImportant` is true and iteration < max --> **LOOP** (re-expand on specific gaps)
4. **Only IMPORTANT gaps** and (`continueForImportant` is false OR iteration >= max) --> **APPROVED** (note gaps as caveats)
5. **Only MINOR gaps or no gaps** --> **APPROVED** (move to graduation)

The `continueForImportant` config flag (default: `true`) controls whether IMPORTANT findings trigger additional iterations. When `true`, the loop continues for IMPORTANT findings until the iteration budget is exhausted. When `false`, only CRITICAL findings trigger looping. See `research.reviewLoop.continueForImportant` in config.json (Decision 9: camelCase config keys).

Accuracy concerns follow the same severity-based logic: an accuracy concern on a HIGH-confidence finding is effectively CRITICAL (it could propagate a factual error into the plan). This elevation is captured in the formal convergence model (see [convergence-criteria.md](convergence-criteria.md)).

---

## Re-Expansion (Targeted)

When the loop decides to continue, it does NOT re-run the full research phase. Instead, it spawns **targeted researchers** for the specific gaps identified:

```
Merged critical gaps:
  G-COMP-001: [severity: CRITICAL] Missing backoff jitter strategy (05-exponential-backoff.md)
  G-COMP-002: [severity: CRITICAL] No error classification for disconnect types (01-architecture-patterns.md)
  G-ACC-002:  [severity: CRITICAL] Bun WebSocket API method name may be incorrect (02-implementation-approaches.md)

Targeted re-expansion:
  Researcher A: Investigate backoff jitter strategies for WebSocket reconnection
  Researcher B: Research WebSocket disconnect error codes and classification
  Researcher C: Verify Bun WebSocket API method names against official docs
```

Each targeted researcher:

- Receives the specific gap description and the relevant research file
- Has access to the same tools as the original researchers (Context7, WebFetch, WebSearch)
- Produces an **addendum** to the original research file (not a full rewrite)
- Is spawned in cold isolation (does not see the reviewer's reasoning or the original researcher's context)

### Addendum Format

Targeted researchers append to the relevant research file:

```markdown
---

## Addendum: Iteration [N] - [Gap ID]

**Triggered by**: [Gap description from reviewer]
**Researcher**: [Agent name]
**Timestamp**: [ISO 8601]

### Findings

[New findings addressing the specific gap]

### Source Verification

[Sources consulted, confidence levels assigned]
```

After all targeted researchers complete, the loop returns to the review phase with the updated corpus.

---

## REVIEW-LOG.md

Each iteration's reviews and researcher responses are appended to `.planning/phases/{NN}-{name}/research/REVIEW-LOG.md`. This file provides a complete audit trail of the review process:

```markdown
# Research Review Log

## Iteration 1

### Reviews

#### lu-completeness-reviewer

[Full review output]

#### lu-accuracy-reviewer

[Full review output]

#### lu-actionability-reviewer

[Full review output]

### Aggregated Findings

- 3 CRITICAL gaps
- 6 IMPORTANT gaps
- 1 MINOR gap
- 2 Accuracy concerns

### Decision: LOOP (3 critical gaps remain)

### Targeted Re-Expansion

- Researcher A: backoff-jitter-strategy (addressing G-COMP-001)
- Researcher B: disconnect-error-classification (addressing G-COMP-002)
- Researcher C: bun-api-verification (addressing G-ACC-002)

---

## Iteration 2

### Reviews

#### lu-completeness-reviewer

[Full review output]

#### lu-accuracy-reviewer

[Full review output]

#### lu-actionability-reviewer

[Full review output]

### Aggregated Findings

- 0 CRITICAL gaps
- 2 IMPORTANT gaps
- 3 MINOR gaps
- 0 Accuracy concerns

### Decision: APPROVED (no critical gaps, only important/minor remain)

### Notes for Planning

- G-COMP-004: Connection health monitoring metrics are underspecified.
  Planner should request clarification during planning or add a
  contingency task.
- G-ACT-003: Edge case for rapid reconnect during server restart
  is acknowledged but not deeply researched. Low risk for initial
  implementation.
```

The REVIEW-LOG is committed alongside the research files. It is available to the planner as optional context but is not required reading -- the research files themselves contain the verified findings.

---

## Example Walkthrough

Using the running example: "Add WebSocket reconnection logic with exponential backoff to a Bun HTTP server."

### Research Corpus After Steps 2 and 4

Research files use the phase-scoped flat directory layout (Decision 7):

```
.planning/phases/01-websocket-reconnection/research/
  00-brief.md                       (research brief)
  01-architecture-patterns.md       (reconnection strategies, backoff algorithms)
  02-implementation-approaches.md   (Bun.serve() WebSocket config, event handlers)
  03-existing-solutions.md          (heartbeat patterns, timeout detection)
  04-pitfalls-and-risks.md          (message buffering, replay-on-reconnect)
  05-exponential-backoff.md         (jitter, cap, reset strategies — deep expand)
  06-bun-ws-internals.md            (Bun WebSocket lifecycle, readyState — deep expand)
```

### Iteration 1

**lu-completeness-reviewer** produces:

```markdown
## Review: lu-completeness-reviewer - Iteration 1

**Research corpus**: 7 files reviewed
**Iteration**: 1 of 2

### Critical Gaps (blocks planning)

- G-COMP-001: [severity: CRITICAL] No jitter strategy specified for backoff
  algorithm -- 05-exponential-backoff.md -- Research should document which
  jitter approach (full, equal, decorrelated) and why. Without this, the
  planner will either pick arbitrarily or omit jitter entirely.

- G-COMP-002: [severity: CRITICAL] Missing error classification for
  disconnect types -- 01-architecture-patterns.md -- Different disconnect
  causes (server restart, network failure, auth expiry) require different
  reconnection strategies. Research does not distinguish between them.

### Important Gaps (improves quality)

- G-COMP-003: [severity: IMPORTANT] No discussion of maximum reconnection
  attempts -- 01-architecture-patterns.md -- The research describes the
  backoff curve but not when to give up entirely.

- G-COMP-004: [severity: IMPORTANT] Connection health monitoring lacks
  specific metric thresholds -- 03-existing-solutions.md -- Heartbeat
  interval and timeout values are not researched. Planner will need to guess.

### Minor Gaps (nice to have)

- G-COMP-005: [severity: MINOR] No comparison of reconnection libraries --
  01-architecture-patterns.md -- Not needed since we are implementing
  from scratch, but would provide validation of the chosen approach.

### Accuracy Concerns

(none)

### Verdict: CONTINUE

**Rationale**: Two critical gaps would force the planner to make ungrounded
decisions about jitter strategy and error handling.
```

**lu-accuracy-reviewer** produces:

```markdown
## Review: lu-accuracy-reviewer - Iteration 1

**Research corpus**: 7 files reviewed
**Iteration**: 1 of 2

### Critical Gaps (blocks planning)

(none)

### Important Gaps (improves quality)

- G-ACC-001: [severity: IMPORTANT] Bun WebSocket readyState values should
  be verified against current Bun version -- 06-bun-ws-internals.md --
  Research references WebSocket.OPEN = 1 but does not specify which Bun
  version this applies to.

### Minor Gaps (nice to have)

(none)

### Accuracy Concerns

- G-ACC-002: [severity: CRITICAL] Finding F-BWS-003 states that Bun.serve()
  WebSocket uses `ws.close(code, reason)` but the official Bun docs show
  the method signature as `ws.close()` without parameters in some versions --
  02-implementation-approaches.md -- Verify against current Bun docs via Context7.

### Verdict: CONTINUE

**Rationale**: G-ACC-002 could lead to a runtime error if the executor uses
the wrong method signature.
```

**lu-actionability-reviewer** produces:

```markdown
## Review: lu-actionability-reviewer - Iteration 1

**Research corpus**: 7 files reviewed
**Iteration**: 1 of 2

### Critical Gaps (blocks planning)

- G-ACT-001: [severity: CRITICAL] Exponential backoff parameters (base,
  multiplier, cap) are described conceptually but no concrete recommended
  values are provided -- 05-exponential-backoff.md -- A planner cannot
  create an implementation task without knowing the starting delay,
  multiplier, and maximum delay values.

### Important Gaps (improves quality)

- G-ACT-002: [severity: IMPORTANT] Message queue replay lacks a concrete
  data structure recommendation -- 04-pitfalls-and-risks.md -- Research
  describes the concept but does not recommend whether to use an array,
  ring buffer, or persistent store.

- G-ACT-003: [severity: IMPORTANT] No TypeScript type definitions proposed
  for the reconnection state machine -- 01-architecture-patterns.md --
  Would accelerate planning if key types were sketched in research.

### Minor Gaps (nice to have)

(none)

### Accuracy Concerns

(none)

### Verdict: CONTINUE

**Rationale**: G-ACT-001 blocks the planner from creating a concrete
backoff implementation task.
```

### Aggregation

```
Merged CRITICAL: 3
  G-COMP-001: [severity: CRITICAL] Missing jitter strategy
  G-COMP-002: [severity: CRITICAL] Missing disconnect error classification
  G-ACT-001:  [severity: CRITICAL] Missing concrete backoff parameter values
    --> Merged with G-COMP-001 (same topic, elevated scope)

Merged IMPORTANT: 5
  G-COMP-003: [severity: IMPORTANT] No max reconnection attempts
  G-COMP-004: [severity: IMPORTANT] No health monitoring thresholds
  G-ACC-001:  [severity: IMPORTANT] Bun version verification for readyState
  G-ACT-002:  [severity: IMPORTANT] Message queue data structure
  G-ACT-003:  [severity: IMPORTANT] TypeScript type proposals

Accuracy Concerns (elevated to CRITICAL): 1
  G-ACC-002: [severity: CRITICAL] ws.close() method signature

Decision: LOOP (3 critical gaps + 1 critical accuracy concern)
```

### Targeted Re-Expansion

Three targeted researchers are spawned:

1. **Jitter + backoff parameters**: Research jitter strategies (full, equal, decorrelated), recommend concrete values (base: 1000ms, multiplier: 2, cap: 30000ms, jitter: full)
2. **Disconnect error classification**: Research WebSocket close codes (1000-1015), map each to a reconnection strategy (immediate, backoff, no-retry)
3. **Bun ws.close() verification**: Query Context7 for current Bun WebSocket API, verify method signatures

Each researcher appends an addendum to the relevant research file.

### Iteration 2

After re-expansion, reviewers are spawned again (fresh instances, cold isolation). This time:

```
Merged CRITICAL: 0
Merged IMPORTANT: 2
  G-COMP-004: [severity: IMPORTANT] Health monitoring thresholds still underspecified
  G-ACT-002:  [severity: IMPORTANT] Message queue data structure (addressed but
    reviewer wants more detail on memory limits)

Decision: APPROVED (no critical gaps, 2 important gaps noted as caveats)
```

The research corpus is now approved for graduation to MuninnDB.

---

## Edge Cases

### All Reviewers Approve on Iteration 1

This is the ideal case. The research is comprehensive and the review loop completes in a single iteration. Common for SIMPLE tasks with narrow scope.

### Reviewers Disagree on Severity

If one reviewer rates a gap as CRITICAL and another rates the same gap as IMPORTANT, the higher severity wins. The orchestrator logs the disagreement in REVIEW-LOG.md.

### Accuracy Concern Invalidates a Finding

If an accuracy concern proves that a HIGH-confidence finding is incorrect, the finding must be removed or corrected before the research can be approved. The targeted researcher verifies the correct information and updates the research file.

### Max Iterations Reached Without Convergence

If critical gaps remain after the maximum iterations, the orchestrator:

1. Compiles a summary of remaining gaps
2. Writes the summary to REVIEW-LOG.md
3. Presents the summary to the user for a decision
4. The user can: (a) manually address the gaps, (b) accept the risk and continue, or (c) abort the phase

---

## Related Documentation

- [README.md](README.md) -- Overview of both review loops
- [convergence-criteria.md](convergence-criteria.md) -- Formal convergence model
- [iteration-budgets.md](iteration-budgets.md) -- Token budgets and iteration caps
- [Research System](../02-research-system/) -- How the research corpus is produced
- [Design Principles: Agent Isolation](../00-design-principles/) -- Theoretical basis for cold isolation
