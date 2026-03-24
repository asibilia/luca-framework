# Research File Structure

Standards for the research directory layout, file format, finding numbering, and cross-referencing conventions.

## Directory Layout

> **This is the canonical research directory layout** ([Decision 7](../CANONICAL-DECISIONS.md#decision-7-research-file-directory-layout)). All other sections that reference research file paths must use this layout. There is no `.planning/research/` (flat, non-phase-scoped) directory and no `deep/` subdirectory. Deep expand files are numbered 05+ in the same directory.

Every phase that runs research produces a research directory at a predictable location:

```
.planning/phases/NN-name/research/
├── 00-brief.md                      # User's rough idea (input)
├── 01-architecture-patterns.md      # Architecture Researcher output
├── 02-implementation-approaches.md  # Implementation Researcher output
├── 03-existing-solutions.md         # Ecosystem Researcher output
├── 04-pitfalls-and-risks.md         # Risk Researcher output
├── 05-{deep-expand-topic}.md        # Deep expand additions start at 05
├── NN-{topic}.md                    # Additional deep expand or custom researcher files
├── REVIEW-LOG.md                    # Reviewer feedback across iterations
└── GRADUATION-REPORT.md            # What was stored in MuninnDB
```

### File Numbering Convention

| Range               | Purpose                            | Created By                                                |
| ------------------- | ---------------------------------- | --------------------------------------------------------- |
| `00`                | Input brief                        | Orchestrator (copies user's request)                      |
| `01-04`             | Default researcher outputs         | Architecture, Implementation, Ecosystem, Risk researchers |
| `05-99`             | Custom researchers and deep expand | Custom researcher agents or follow-up research            |
| `REVIEW-LOG`        | Review iteration history           | Review orchestrator                                       |
| `GRADUATION-REPORT` | MuninnDB graduation record         | Research synthesizer                                      |

Files `01-04` are always present after a research run. Files `05+` appear only when custom researchers are configured or when the review loop triggers a "deep expand" -- a targeted follow-up investigation into a specific gap identified by reviewers.

### Example: WebSocket Reconnection Phase

```
.planning/phases/05-websocket-reconnection/research/
├── 00-brief.md
├── 01-architecture-patterns.md
├── 02-implementation-approaches.md
├── 03-existing-solutions.md
├── 04-pitfalls-and-risks.md
├── 05-browser-compatibility.md       # Deep expand: reviewers flagged gap
├── REVIEW-LOG.md
└── GRADUATION-REPORT.md
```

In this example, the Completeness Reviewer identified that none of the four researchers investigated browser-specific WebSocket behavior differences. The review loop spawned a targeted "deep expand" researcher to fill this gap, producing `05-browser-compatibility.md`.

## Standard Research File Format

Every research output file (01-NN) follows this mandatory structure:

```markdown
# [Topic Title]

**Researcher:** [Architecture | Implementation | Ecosystem | Risk | Custom: {name}]
**Phase:** [NN] - [Phase Name]
**Date:** [YYYY-MM-DD]
**Overall Confidence:** [HIGH | MEDIUM | LOW]

## Summary

[2-3 paragraph executive summary of findings in this focus area.
What was investigated, what was found, and what it means for planning.]

## Findings

### F-{PREFIX}-001: [Finding Title]

**Confidence:** [HIGH | MEDIUM | LOW | UNVERIFIED]
**Source:** [Source description with URL]
**Verified:** [Yes | No | Partial]

[Finding content: what was discovered, with evidence and reasoning.]

#### Implications

- [How this finding affects the plan]
- [What the planner should do with this information]

#### Open Questions

- [Any unresolved aspects of this finding]

---

### F-{PREFIX}-002: [Finding Title]

[Same structure repeated for each finding]

---

## Sources

### PRIMARY (HIGH confidence)

| #   | URL                                | Accessed   | Type          | Summary                            |
| --- | ---------------------------------- | ---------- | ------------- | ---------------------------------- |
| S1  | https://docs.example.com/websocket | 2026-03-22 | Official docs | WebSocket API specification        |
| S2  | Context7: reconnecting-websocket   | 2026-03-22 | Library docs  | Reconnection configuration options |

### SECONDARY (MEDIUM confidence)

| #   | URL                                                | Accessed   | Type             | Summary                          |
| --- | -------------------------------------------------- | ---------- | ---------------- | -------------------------------- |
| S3  | https://blog.cloudflare.com/websocket-reconnection | 2026-03-22 | Engineering blog | Production reconnection patterns |

### TERTIARY (LOW confidence)

| #   | URL                               | Accessed   | Type          | Summary                   |
| --- | --------------------------------- | ---------- | ------------- | ------------------------- |
| S4  | https://stackoverflow.com/q/12345 | 2026-03-22 | Community Q&A | Backoff timing discussion |

## Metadata

**Findings count:** [N]
**Confidence breakdown:** [X] HIGH, [Y] MEDIUM, [Z] LOW
**Research duration:** [estimated minutes]
**Token usage:** [approximate tokens consumed]
```

### Mandatory Sections

Every research file MUST include these four sections. Files missing any of these sections will be flagged by the Completeness Reviewer.

| Section      | Purpose                          | What Goes Wrong Without It                         |
| ------------ | -------------------------------- | -------------------------------------------------- |
| **Summary**  | Quick orientation for readers    | Reviewer must read entire file to understand scope |
| **Findings** | Structured, numbered discoveries | Findings cannot be cross-referenced or tracked     |
| **Sources**  | Provenance for every claim       | Accuracy cannot be verified; hallucination risk    |
| **Metadata** | Research quality indicators      | Review loop cannot assess research thoroughness    |

> **Confidence distribution guidance:** A research file where fewer than 50% of findings are at MEDIUM or higher confidence should be flagged by the Accuracy Reviewer for insufficient verification effort. This signals that the researcher did not adequately attempt the verification upgrade path (see [source-confidence-model.md](source-confidence-model.md)).

### Optional Sections

These sections are encouraged but not required:

| Section                        | When to Include                                                       |
| ------------------------------ | --------------------------------------------------------------------- |
| **Implications** (top-level)   | When findings collectively suggest a specific architectural direction |
| **Open Questions** (top-level) | When multiple findings share unresolved questions                     |
| **Alternatives Considered**    | When the researcher evaluated multiple approaches                     |
| **Code Examples**              | When specific code patterns illustrate findings                       |

## Finding Numbering System

Every discrete finding gets a unique identifier for cross-referencing across files, review logs, and plan tasks.

### Format

```
F-{PREFIX}-{NNN}
```

| Component | Values                           | Description                                          |
| --------- | -------------------------------- | ---------------------------------------------------- |
| `F`       | Always "F"                       | Marks this as a finding (vs. a source S, or a gap G) |
| `PREFIX`  | ARCH, IMPL, ECO, RISK, or custom | Identifies which researcher produced it              |
| `NNN`     | 001-999                          | Sequential number within that researcher's output    |

### Prefix Registry

| Prefix | Researcher                    | Example    |
| ------ | ----------------------------- | ---------- |
| `ARCH` | Architecture Researcher       | F-ARCH-001 |
| `IMPL` | Implementation Researcher     | F-IMPL-001 |
| `ECO`  | Ecosystem Researcher          | F-ECO-001  |
| `RISK` | Risk Researcher               | F-RISK-001 |
| `BROW` | Custom: Browser Compatibility | F-BROW-001 |
| `A11Y` | Custom: Accessibility         | F-A11Y-001 |
| `PERF` | Custom: Performance           | F-PERF-001 |
| `SEC`  | Custom: Security Deep-Dive    | F-SEC-001  |

Custom prefixes should be 3-4 uppercase characters that clearly identify the research domain.

### Cross-Referencing Findings

Findings can be referenced from any document in the research directory or from plan tasks:

**Within research files:**

```markdown
This pattern aligns with the state machine approach documented in F-ARCH-001.
The thundering herd risk (F-RISK-001) makes jitter mandatory, not optional.
```

**In REVIEW-LOG.md:**

```markdown
### Gap G-COMP-001: Browser WebSocket Differences

F-IMPL-001 recommends `reconnecting-websocket` but does not address
browser-specific behavior. F-ECO-001 lists libraries without noting
which browsers they support. This gap requires a deep expand.

**Related findings:** F-IMPL-001, F-ECO-001
**Severity:** IMPORTANT
```

**In plan tasks:**

```markdown
### Task 3: Implement Backoff Calculator

Based on F-IMPL-001 (exponential backoff parameters) and
F-RISK-001 (thundering herd mitigation), implement the backoff
calculator with mandatory jitter.

**Verification:** Confirm jitter randomization per F-RISK-001.
```

### Gap Numbering

> **This is the canonical gap ID format** ([Decision 8](../CANONICAL-DECISIONS.md#decision-8-gap-id-format)). Gap IDs are **reviewer-prefixed** -- the ID tells you WHO found it. Severity is a mutable field on each gap, not embedded in the ID. Do NOT use `GAP-C-001` / `GAP-I-001` (severity-prefixed) format.

Reviewers use a parallel numbering scheme for gaps they identify:

```
G-{REVIEWER_PREFIX}-{NNN}: [severity: CRITICAL | IMPORTANT | MINOR] Description...
```

| Prefix | Reviewer               | Agent Name                  |
| ------ | ---------------------- | --------------------------- |
| `COMP` | Completeness Reviewer  | `lu-completeness-reviewer`  |
| `ACC`  | Accuracy Reviewer      | `lu-accuracy-reviewer`      |
| `ACT`  | Actionability Reviewer | `lu-actionability-reviewer` |

Example: `G-COMP-003: [severity: IMPORTANT] Offline message queue strategies not explored` is the third gap identified by the Completeness Reviewer, classified as IMPORTANT. The severity can change across iterations (e.g., upgraded from MINOR to IMPORTANT), but the ID `G-COMP-003` remains stable.

## Source Citation Format

Every finding must cite at least one source. Sources are listed in the Sources section at the bottom of each file and referenced inline.

### Source Entry Format

Each source entry includes five fields:

| Field        | Required | Description                                                |
| ------------ | -------- | ---------------------------------------------------------- |
| **#**        | Yes      | Source identifier (S1, S2, ...) for inline references      |
| **URL**      | Yes      | Full URL, or "Context7: {library-id}" for Context7 sources |
| **Accessed** | Yes      | Date the source was accessed (YYYY-MM-DD)                  |
| **Type**     | Yes      | Source type (see type taxonomy below)                      |
| **Summary**  | Yes      | One-line description of what was found at this source      |

### Source Type Taxonomy

| Type                    | Confidence Tier | Examples                                      |
| ----------------------- | --------------- | --------------------------------------------- |
| Official docs           | PRIMARY         | MDN, library documentation sites              |
| Library docs (Context7) | PRIMARY         | Context7 query results                        |
| Release notes           | PRIMARY         | GitHub releases, changelogs                   |
| Engineering blog        | SECONDARY       | Cloudflare blog, Netflix tech blog            |
| Tutorial (verified)     | SECONDARY       | Official tutorials, verified community guides |
| Community Q&A           | TERTIARY        | Stack Overflow, GitHub Discussions            |
| Blog post (unverified)  | TERTIARY        | Personal blogs, Medium posts                  |
| AI-generated            | REJECTED        | Do not cite AI-generated content as a source  |

### Inline Source References

Within finding content, reference sources by their identifier:

```markdown
The WebSocket API requires explicit close frame handling [S1].
The `reconnecting-websocket` library handles this automatically [S2],
though the Cloudflare engineering team recommends additional health
checks for production deployments [S3].
```

## Confidence Level Assignment

Each finding's confidence level is determined by its strongest supporting source:

| Confidence     | Criteria                                                  | Example                                                          |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| **HIGH**       | Verified by Context7 or official documentation            | "WebSocket.readyState has 4 values" (MDN docs)                   |
| **MEDIUM**     | Verified by official blog or multiple independent sources | "Jitter prevents thundering herd" (Cloudflare + AWS blogs agree) |
| **LOW**        | Single community source, unverified claim                 | "Most teams use 1s base delay" (one Stack Overflow answer)       |
| **UNVERIFIED** | Training data only, no external verification (internal only -- never in output) | UNVERIFIED is an internal classification used during verification. It must never appear in the final research file. |

See [source-confidence-model.md](source-confidence-model.md) for the complete confidence model including propagation rules and staleness handling.

## Maximum File Size Guidance

Research files should be focused and scannable, not exhaustive. If a file grows too large, it signals that the researcher's scope is too broad.

| Guideline         | Limit         | Action When Exceeded                                     |
| ----------------- | ------------- | -------------------------------------------------------- |
| Findings per file | 8-12 findings | Split into sub-topics or prioritize top findings         |
| File length       | 300-500 lines | Remove low-value findings, compress verbose descriptions |
| Source count      | 10-20 sources | Focus on highest-quality sources, remove redundant ones  |
| Code examples     | 3-5 per file  | Move additional examples to an appendix or separate file |

**Quality over quantity.** Eight well-sourced, high-confidence findings are more valuable to the planner than twenty shallow, low-confidence findings. If a researcher reaches the findings cap, they should prioritize by confidence level (HIGH first) and planning impact (findings that change plan structure over findings that are merely informative).

## The Brief File (00-brief.md)

The brief is the user's raw request, captured verbatim by the orchestrator before research begins. It serves as the shared input to all researchers.

### Format

```markdown
# Research Brief

**Phase:** [NN] - [Phase Name]
**Created:** [YYYY-MM-DD]
**Source:** User request via /lu

## User's Request

[Verbatim copy of the user's request, unedited]

## Locked Decisions (from CONTEXT.md)

[If CONTEXT.md exists, list locked decisions that constrain research]

- Decision 1: [description]
- Decision 2: [description]

## Claude's Discretion Areas

[If CONTEXT.md exists, list areas where the researcher has freedom]

- Area 1: [description]
- Area 2: [description]

## Out of Scope

[If CONTEXT.md exists, list deferred items to ignore]

- Deferred 1: [description]
```

### WebSocket Reconnection Example

```markdown
# Research Brief

**Phase:** 05 - WebSocket Reconnection
**Created:** 2026-03-22
**Source:** User request via /lu

## User's Request

Add automatic WebSocket reconnection with exponential backoff,
connection health monitoring, and message queue replay on reconnect.

## Locked Decisions (from CONTEXT.md)

- Use native WebSocket API (not socket.io)
- Backoff must include jitter
- Health check interval: 30 seconds

## Claude's Discretion Areas

- Choice of reconnection library (or hand-roll)
- Message queue implementation (in-memory vs IndexedDB)
- Health check mechanism (ping/pong vs custom heartbeat)

## Out of Scope

- Server-side WebSocket handling
- WebSocket compression (deferred to later phase)
```

## The Review Log (REVIEW-LOG.md)

The review log tracks every review iteration, including reviewer assessments, identified gaps, and researcher responses. See [review-loop-convergence.md](review-loop-convergence.md) for the full review process; here we document the file format.

### Format

```markdown
# Research Review Log

**Phase:** [NN] - [Phase Name]
**Research files reviewed:** [count]
**Review iterations:** [count]
**Final status:** [CONVERGED | CONVERGED_WITH_NOTES | MAX_ITERATIONS | ESCALATED]

---

## Iteration 1

**Date:** [YYYY-MM-DD]
**Reviewed files:** 01-architecture-patterns.md, 02-implementation-approaches.md,
03-existing-solutions.md, 04-pitfalls-and-risks.md

### Completeness Reviewer

| Gap ID     | Severity  | Description                              | Related Findings      |
| ---------- | --------- | ---------------------------------------- | --------------------- |
| G-COMP-001 | CRITICAL  | No browser compatibility analysis        | F-IMPL-001, F-ECO-001 |
| G-COMP-002 | IMPORTANT | Missing offline message queue strategies | F-ARCH-001            |

### Accuracy Reviewer

| Gap ID    | Severity  | Description                              | Related Findings |
| --------- | --------- | ---------------------------------------- | ---------------- |
| G-ACC-001 | IMPORTANT | F-ECO-001 download stats may be outdated | F-ECO-001        |

### Actionability Reviewer

| Gap ID    | Severity | Description                                              | Related Findings |
| --------- | -------- | -------------------------------------------------------- | ---------------- |
| G-ACT-001 | MINOR    | F-ARCH-001 state machine lacks concrete TypeScript types | F-ARCH-001       |

### Iteration Summary

- **CRITICAL gaps:** 1
- **IMPORTANT gaps:** 2
- **MINOR gaps:** 1
- **Decision:** Continue (CRITICAL gaps remain)

---

## Iteration 2

**Date:** [YYYY-MM-DD]
**Actions taken:**

- Deep expand: 05-browser-compatibility.md created (addresses G-COMP-001)
- F-ECO-001 download stats updated with current npm data (addresses G-ACC-001)
- F-ARCH-001 now includes TypeScript state enum (addresses G-ACT-001)

### Completeness Reviewer

| Gap ID     | Severity  | Description                           | Related Findings |
| ---------- | --------- | ------------------------------------- | ---------------- |
| G-COMP-002 | IMPORTANT | Offline queue strategies still sparse | F-ARCH-001       |

### Accuracy Reviewer

No gaps identified.

### Actionability Reviewer

No gaps identified.

### Iteration Summary

- **CRITICAL gaps:** 0
- **IMPORTANT gaps:** 1
- **MINOR gaps:** 0
- **Decision:** Converged (0 CRITICAL, 1 IMPORTANT within tolerance)
```

## The Graduation Report (GRADUATION-REPORT.md)

After the review loop converges, verified findings are "graduated" into MuninnDB for long-term recall. The graduation report documents what was stored.

### Format

```markdown
# Research Graduation Report

**Phase:** [NN] - [Phase Name]
**Graduated:** [YYYY-MM-DD]
**Findings graduated:** [N] of [M] total
**MuninnDB vault:** [vault name]

## Graduated Findings

| Finding ID | Concept                              | Vault          | Confidence |
| ---------- | ------------------------------------ | -------------- | ---------- |
| F-ARCH-001 | pattern:websocket-state-machine      | luca-framework | HIGH       |
| F-IMPL-001 | pattern:exponential-backoff-params   | default        | HIGH       |
| F-RISK-001 | pitfall:thundering-herd-reconnection | default        | HIGH       |
| F-ECO-001  | pattern:reconnecting-websocket-lib   | default        | MEDIUM     |

## Not Graduated (and why)

| Finding ID | Reason                                       |
| ---------- | -------------------------------------------- |
| F-ECO-002  | LOW confidence, single source only           |
| F-IMPL-003 | Phase-specific, not reusable across projects |

## Graduation Criteria Applied

- HIGH confidence findings: Always graduated
- MEDIUM confidence findings: Graduated if actionable and cross-project
- LOW confidence findings: Not graduated (insufficient verification)
- UNVERIFIED findings: Never graduated

## MuninnDB Storage Details

Each graduated finding was stored with:

- **Vault routing:** Per vault-routing.md rules (patterns -> default, session -> repo)
- **Concept prefix:** Mapped from finding type (F-ARCH -> pattern:, F-RISK -> pitfall:)
- **Content:** Finding summary + implications + source URLs
- **Links:** Related findings linked via muninn_link
```

## File Lifecycle

Research files move through a defined lifecycle:

```
Created (by researcher)
    │
    ▼
Under Review (by review loop)
    │
    ├── Updated (researcher fixes gaps)
    │   │
    │   ▼
    │   Under Review (next iteration)
    │
    ▼
Converged (review loop complete)
    │
    ▼
Graduated (findings stored in MuninnDB)
    │
    ▼
Archived (available for reference, not in active context)
```

After graduation, research files remain on disk for reference but are not loaded into agent context windows during execution. Instead, agents recall specific findings from MuninnDB using semantic search, which returns only the findings relevant to their current task.
