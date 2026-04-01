# Source Confidence Model

How research findings are graded for confidence, how sources are ranked in a hierarchy, and how confidence propagates through the planning pipeline.

## Confidence Levels

Every research finding carries one of four confidence levels:

| Level          | Meaning                                                     | How to Use in Planning                                     |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| **HIGH**       | Verified by authoritative source; can be treated as fact    | Plan tasks can depend on this finding directly             |
| **MEDIUM**     | Supported by credible sources but not definitively verified | Plan tasks should include a validation step                |
| **LOW**        | Based on limited evidence; may be inaccurate                | Plan tasks must NOT depend on this finding without upgrade |
| **UNVERIFIED** | No external verification; based solely on AI training data (internal only -- never in output) | Do not include in research output; do not use in planning. This is an internal classification used during the verification protocol. UNVERIFIED findings must never appear in the final research file -- the researcher must either upgrade them or omit them entirely. |

### Decision Matrix

When a planner encounters a finding, its confidence level determines the planning response:

```
HIGH confidence finding
  └── Use directly in plan tasks
      └── No additional validation needed

MEDIUM confidence finding
  └── Use in plan tasks WITH a validation sub-task
      └── "Verify that [finding] holds for our specific context"

LOW confidence finding
  └── Do NOT use in plan tasks
      └── Either: trigger deep expand to upgrade confidence
      └── Or: flag for human review before planning proceeds

UNVERIFIED finding
  └── REJECTED — never appears in research output
      └── Researcher must attempt verification or omit entirely
```

## Source Hierarchy

Sources are ranked by authority. A finding's confidence level is determined by its highest-ranked supporting source.

### Tier 1: PRIMARY Sources (HIGH confidence)

These sources are authoritative, current, and versioned. Findings verified by PRIMARY sources receive HIGH confidence.

| Source Type                | Description                                                       | Examples                                                        |
| -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| **Context7 library docs**  | Current, version-aware documentation queried via Context7 MCP     | `mcp__context7__query-docs` results for any supported library   |
| **Official documentation** | Publisher's own documentation site, verified via WebFetch         | MDN Web Docs, React docs, Bun docs, Node.js docs                |
| **Official release notes** | Changelogs and release announcements from the project maintainers | GitHub Releases page, CHANGELOG.md, official blog release posts |
| **API specifications**     | Formal specifications published by standards bodies               | W3C WebSocket Protocol (RFC 6455), ECMAScript specification     |

**Why Context7 is highest priority:** Context7 provides documentation that is current (synced with latest releases), version-specific (you can query for a specific version), and structured (designed for programmatic consumption). Unlike web-fetched documentation, Context7 results are unlikely to be stale or mislabeled.

**Example:**

```markdown
## F-IMPL-001: WebSocket readyState Values

**Confidence:** HIGH
**Source:** Context7: websocket-api (S1), MDN WebSocket.readyState (S2)

The WebSocket.readyState property has four possible values:

- 0 (CONNECTING): Connection not yet open
- 1 (OPEN): Connection open and ready
- 2 (CLOSING): Connection in the process of closing
- 3 (CLOSED): Connection closed or could not be opened

Both Context7 [S1] and MDN [S2] confirm these values. This is a
stable part of the WebSocket specification and unlikely to change.
```

### Tier 2: SECONDARY Sources (MEDIUM confidence)

These sources are credible but not authoritative. Findings verified only by SECONDARY sources receive MEDIUM confidence. If multiple independent SECONDARY sources agree, confidence may be upgraded to HIGH (see Confidence Upgrade Protocol below).

| Source Type                                            | Description                                                                     | Examples                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Official blog posts**                                | Technical posts from the project's engineering team                             | Cloudflare Blog, Vercel Blog, Deno Blog                                             |
| **Official release notes (non-primary)**               | Release announcements that discuss features but are not the canonical changelog | Blog posts announcing a new version, conference talk slides                         |
| **Community tutorials verified against official docs** | Tutorials that cite and link to official documentation                          | Egghead courses that reference React docs, official-tutorial-style community guides |
| **Multiple independent web sources agreeing**          | When 3+ unrelated sources describe the same behavior                            | Three separate blog posts all documenting the same API pattern                      |

**Why "verified against official docs" matters:** A community tutorial that says "use X approach" is MEDIUM confidence only if the tutorial links to or cites the official documentation for X. A tutorial that does NOT reference official docs is TERTIARY (LOW confidence) because it may be based on outdated information or misunderstanding.

**Example:**

```markdown
## F-RISK-001: Thundering Herd on Server Restart

**Confidence:** MEDIUM
**Source:** Cloudflare Engineering Blog (S1), AWS Architecture Blog (S2)

When a WebSocket server restarts, all clients reconnect simultaneously.
Without jitter, this creates a thundering herd that can crash the server again.

Both Cloudflare [S1] and AWS [S2] document this pattern independently.
Neither is the "official" source for WebSocket reconnection behavior
(no such standard exists), but independent agreement from two major
infrastructure providers gives MEDIUM confidence.

Note: This could be upgraded to HIGH if we find an RFC or W3C document
that explicitly addresses reconnection behavior.
```

### Tier 3: TERTIARY Sources (LOW confidence)

These sources provide useful signals but cannot be trusted without verification. Findings based solely on TERTIARY sources receive LOW confidence.

| Source Type                        | Description                                                | Examples                                                       |
| ---------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| **Single web search result**       | One blog post, one tutorial, one article                   | A single Medium post about WebSocket best practices            |
| **Community Q&A**                  | Stack Overflow answers, GitHub Discussions, Reddit threads | Stack Overflow answer with 50 upvotes but no official citation |
| **Unverified community tutorials** | Tutorials that do not cite official documentation          | Personal blog tutorial on "How I built WebSocket reconnection" |
| **npm/package metadata**           | Download counts, star counts, last publish date            | "reconnecting-websocket has 850K weekly downloads"             |

**Why even include LOW confidence findings?** LOW confidence findings serve as leads for further investigation. A Stack Overflow answer suggesting "use jitter in backoff" is not authoritative on its own, but it points the researcher toward a topic that should be verified via PRIMARY or SECONDARY sources.

**Example:**

```markdown
## F-ECO-003: Community Preference for 1-Second Base Delay

**Confidence:** LOW
**Source:** Stack Overflow discussion (S4)

A Stack Overflow thread with 47 upvotes suggests that most production
WebSocket systems use a 1-second base delay for exponential backoff.

This is a single community source without official verification.
The actual optimal base delay likely depends on the specific use case
(real-time gaming vs. chat vs. data streaming).

Note: This finding should NOT be used directly in planning. If backoff
timing is critical, a deep expand should verify against production
case studies or official library defaults.
```

### Tier 4: REJECTED Sources (UNVERIFIED)

These sources MUST NOT be cited in research output. If a researcher can only support a claim with REJECTED sources, the claim must be omitted or explicitly flagged as "unverifiable."

| Source Type                                   | Why Rejected                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| **AI-generated content without verification** | LLM training data is 6-18 months stale and may contain hallucinations           |
| **SEO-optimized listicles**                   | "Top 10 WebSocket Libraries in 2026" articles are often inaccurate and outdated |
| **Paid promotional content**                  | Sponsored posts lack objectivity                                                |
| **Undated sources**                           | Without a publication date, staleness cannot be assessed                        |

**The cardinal rule:** If a researcher's only evidence for a claim is "I know this from my training data," the finding is UNVERIFIED and must not be included in the research output. The researcher should attempt to verify the claim via WebSearch + WebFetch, or document it as an Open Question.

## Verification Protocol

Every LOW confidence finding should attempt an upgrade to MEDIUM or HIGH through cross-referencing.

### Upgrade Path

```
LOW confidence (single community source)
  │
  ├── Can Context7 verify?
  │   YES → Upgrade to HIGH
  │   NO  ↓
  │
  ├── Can official docs verify (WebFetch)?
  │   YES → Upgrade to HIGH
  │   NO  ↓
  │
  ├── Do 3+ independent sources agree?
  │   YES → Upgrade to MEDIUM
  │   NO  ↓
  │
  ├── Does 1 credible secondary source confirm?
  │   YES → Upgrade to MEDIUM
  │   NO  ↓
  │
  └── Remains LOW
      └── Flag for deep expand or human review
```

### Downgrade Path

Confidence can also decrease:

| Trigger                                      | Action                                            |
| -------------------------------------------- | ------------------------------------------------- |
| Source URL returns 404                       | Downgrade one level; flag as "source unavailable" |
| Source contradicts a higher-authority source | Downgrade to LOW; document contradiction          |
| Source publication date > 12 months old      | Downgrade one level (see Staleness Rules)         |
| Reviewer identifies hallucination            | Remove finding entirely                           |

### Verification Checklist (per finding)

Before finalizing a finding's confidence level, the researcher must answer:

- [ ] Is the source URL accessible and returning the expected content?
- [ ] Is the source dated within the last 12 months (or is the topic stable)?
- [ ] Does the source explicitly support the claim (not just tangentially related)?
- [ ] Have I checked for contradicting sources?
- [ ] If LOW confidence, have I attempted the upgrade path?

## Confidence Propagation

Confidence is not confined to research files. It propagates forward into planning and execution.

### How Propagation Works

```
Research Finding (F-IMPL-001, HIGH confidence)
  │
  └── Referenced by Plan Task
      │
      └── Task inherits finding's confidence
          │
          ├── HIGH → Task proceeds normally
          ├── MEDIUM → Task includes validation step
          └── LOW → Task blocked; needs upgrade first
```

### Propagation Rules

| Scenario                                        | Propagated Confidence | Planning Impact                          |
| ----------------------------------------------- | --------------------- | ---------------------------------------- |
| Task depends on 1 HIGH finding                  | HIGH                  | No additional validation                 |
| Task depends on 1 MEDIUM finding                | MEDIUM                | Add validation sub-task                  |
| Task depends on 1 LOW finding                   | LOW                   | Block task; upgrade finding first        |
| Task depends on multiple findings, all HIGH     | HIGH                  | No additional validation                 |
| Task depends on multiple findings, mixed levels | Lowest level wins     | Plan for the weakest link                |
| Task depends on finding + codebase evidence     | Upgrade by one level  | Codebase evidence strengthens confidence |

### Example: Propagation in a Plan Task

```markdown
### Task 5: Configure Backoff Parameters

**Depends on:**

- F-IMPL-001 (backoff formula): HIGH confidence
- F-RISK-001 (jitter requirement): HIGH confidence [via MEDIUM, upgraded]
- F-ECO-003 (1s base delay): LOW confidence

**Task confidence:** LOW (lowest dependency wins)

**Planning response:** Do NOT hardcode 1s base delay based on F-ECO-003.
Instead, add a sub-task: "Benchmark base delay values (500ms, 1s, 2s)
under load test conditions to determine optimal default."
```

## Staleness Rules

Research findings degrade over time. The technology landscape changes, libraries release new versions, and previously-correct information becomes outdated.

### Staleness Thresholds

The table below shows **generic** staleness thresholds. These are overridden by source-type-specific degradation rates from the Staleness Exceptions table that follows -- always use the more aggressive (shorter) threshold when a source-type-specific rate applies.

| Source Age   | Generic Action                                        |
| ------------ | ----------------------------------------------------- |
| 0-6 months   | No adjustment (unless source type degrades faster)    |
| 6-12 months  | Flag as "aging" in metadata; no confidence change yet |
| 12-18 months | Downgrade confidence one level                        |
| 18-24 months | Downgrade confidence two levels (maximum: to LOW)     |
| 24+ months   | Mark as STALE; do not use without re-verification     |

### Staleness Exceptions

Some source types have faster or slower degradation than the generic thresholds. **When a source-type-specific rate is more aggressive than the generic threshold, the source-type rate takes precedence.**

| Topic Type                | Staleness Behavior                | Effective "No Adjustment" Window | Examples                                          |
| ------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------------- |
| Language specifications   | No degradation                    | Unlimited                        | ECMAScript spec, WebSocket RFC                    |
| Fundamental algorithms    | No degradation                    | Unlimited                        | Exponential backoff formula, binary search        |
| Architecture patterns     | Slow degradation (24+ months)     | 24 months                        | State machine patterns, event-driven architecture |
| Library APIs              | Standard degradation              | 6 months (per generic table)     | Any specific library version's API surface        |
| Community practices       | Fast degradation (6+ months)      | 3 months                         | "Best library for X" recommendations              |
| Download/popularity stats | Very fast degradation (3+ months) | 0 months (always verify)         | npm download counts, GitHub stars                 |

> **Example:** A finding citing npm download stats from 4 months ago falls within the generic "0-6 months: No adjustment" window, but the source-type-specific rate for download/popularity stats is "Very fast degradation (3+ months)". The source-type rate takes precedence: this finding should be flagged as aging and the stats re-verified.

### How Staleness Interacts with Confidence

Staleness downgrades are cumulative with source-based confidence:

```
Finding originally HIGH confidence (official docs from 2024-06)
  │
  Today: 2026-03-22 (21 months later)
  │
  └── 18-24 month rule: downgrade two levels
      └── HIGH → MEDIUM → LOW
      └── This finding is now LOW confidence due to staleness
      └── Researcher should attempt re-verification with current sources
```

## Handling Conflicting Sources

When two or more sources contradict each other, the research file must document both perspectives rather than silently choosing one.

### Conflict Documentation Format

```markdown
## F-IMPL-004: Maximum Reconnection Attempts

**Confidence:** LOW (conflicting sources)
**Conflict type:** Disagreement on recommended value

### Source A: reconnecting-websocket docs [S2]

Default: maxRetries = Infinity (reconnect forever)
Rationale: Server may recover eventually; permanent disconnection is worse

### Source B: Cloudflare blog post [S3]

Recommendation: maxRetries = 10 (fail after ~5 minutes with exponential backoff)
Rationale: Infinite retry wastes resources when server is permanently down

### Analysis

Both approaches have merit. The choice depends on the application:

- Chat/collaboration apps: Infinite retry (user expects reconnection)
- Data streaming: Bounded retry (stale data is worse than disconnection)

### Resolution

**Flag for human review.** The planner cannot choose between these
approaches without knowing the application's tolerance for stale connections.

### Implications

- The reconnection manager MUST expose maxRetries as a configuration option
- The default value should be decided during planning, not research
```

### Conflict Resolution Hierarchy

When sources conflict, attempt resolution in this order:

1. **Higher-authority source wins.** PRIMARY source trumps SECONDARY; SECONDARY trumps TERTIARY.
2. **More recent source wins** (when same authority tier). A 2026 blog post trumps a 2024 blog post.
3. **Domain-specific source wins.** A WebSocket-focused guide trumps a general networking guide.
4. **If still unresolved: document both and flag for human review.** Do not silently choose.

### When to Escalate to Human Review

Flag for human review when:

- Two PRIMARY sources contradict each other (rare but possible across library versions)
- The conflict affects a critical architectural decision
- The conflict cannot be resolved by additional research within budget
- The correct answer depends on product requirements, not technical facts

## Confidence in the Review Loop

Reviewers assess confidence levels as part of their evaluation:

### Accuracy Reviewer's Confidence Checks

The Accuracy Reviewer specifically examines:

| Check                   | What It Catches                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| Source verification     | Does the cited URL actually support the claim?                                  |
| Confidence inflation    | Did the researcher assign HIGH to a finding with only TERTIARY sources?         |
| Missing verification    | Did the researcher skip the upgrade path for LOW findings?                      |
| Stale sources           | Are any sources past the staleness threshold?                                   |
| Hallucination detection | Does the finding cite a source that does not exist or says something different? |

### Review-Triggered Confidence Changes

| Reviewer Finding                    | Action                                                       |
| ----------------------------------- | ------------------------------------------------------------ |
| Source does not support claim       | Downgrade to LOW or remove finding                           |
| Source URL is 404                   | Downgrade one level; researcher must find alternative source |
| Confidence inflation detected       | Correct confidence level; flag researcher pattern            |
| Additional source found by reviewer | May upgrade confidence if source is credible                 |

## Summary Table: Source-to-Confidence Mapping

| Source Type                       | Default Confidence | Can Upgrade To                   | Staleness Rate |
| --------------------------------- | ------------------ | -------------------------------- | -------------- |
| Context7 library docs             | HIGH               | --                               | Standard       |
| Official documentation (WebFetch) | HIGH               | --                               | Standard       |
| Official release notes            | HIGH               | --                               | Standard       |
| API specifications (RFC, W3C)     | HIGH               | --                               | None (stable)  |
| Official blog posts               | MEDIUM             | HIGH (with official docs)        | Standard       |
| Verified community tutorials      | MEDIUM             | HIGH (with Context7)             | Standard       |
| Multiple independent web sources  | MEDIUM             | HIGH (with official docs)        | Fast           |
| Single web search result          | LOW                | MEDIUM (with 2+ sources)         | Fast           |
| Community Q&A                     | LOW                | MEDIUM (with official blog)      | Fast           |
| npm/package metadata              | LOW                | MEDIUM (with multiple snapshots) | Very fast      |
| AI training data only             | UNVERIFIED         | LOW (with single source)         | N/A (rejected) |
