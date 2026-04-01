# Review Team

The three cold-isolated reviewer agents that evaluate research output for completeness, accuracy, and actionability. They operate at Step 5 (Review Research) in the 10-step pipeline -- after research (Step 2), discussion (Step 3), and deep expand (Step 4) are complete, and before graduation to MuninnDB (Step 6). Their combined assessment determines whether the research corpus is ready for planning or needs revision.

> **What reviewers see**: Reviewers evaluate the **post-discussion, post-deep-expand** research corpus. This means they see the original 4 research files (01-04), any deep expand files (05+), and SUMMARY.md. They do NOT see CONTEXT.md or discussion reasoning -- they evaluate research quality in isolation. If discussion-driven decisions altered the research direction, reviewers evaluate the resulting research files, not the discussion rationale.

## Why Separate Reviewers from Researchers

The design principle at work is **agent isolation** (see [00-design-principles/README.md](../00-design-principles/README.md)). When the same agent (or an agent that shares context with the author) reviews its own output, it inherits the author's blind spots. The reviewer "understands" why the author made certain choices and unconsciously forgives gaps.

v2's reviewers never see researcher reasoning. They receive only the research output files. They start with a clean context window and evaluate the work on its merits. This is the "cold isolation" pattern applied to research review.

## The Three Review Dimensions

Each reviewer evaluates a single dimension. The dimensions are orthogonal -- a research corpus can be complete but inaccurate, accurate but not actionable, or actionable but incomplete. Evaluating all three dimensions simultaneously would require a single agent to context-switch between fundamentally different evaluation modes, degrading quality.

### lu-completeness-reviewer

**Dimension**: Coverage. Are there gaps in the research? Topics the researchers missed? Alternatives they did not explore?

This reviewer asks: "What should be in this research that is not?" It reads all four research files as a corpus and looks for missing topics, unexplored alternatives, contradictions between researchers, and domains that were not investigated. It has access to WebSearch to check whether alternatives exist that the researchers missed.

**Example gap findings** (WebSocket reconnection running example):

- CRITICAL: "No researcher addressed message ordering guarantees after reconnection"
- IMPORTANT: "Architecture research proposes observer pattern but ecosystem research did not survey existing observer libraries for WebSocket"
- MINOR: "Risk research mentions heartbeat but no researcher provided a concrete heartbeat implementation pattern"

### lu-accuracy-reviewer

**Dimension**: Correctness. Are the sources real? Do the findings match what the sources actually say? Are there hallucinated claims?

This reviewer asks: "Is this true?" It reads findings and verifies them against their cited sources. It uses WebFetch to access the URLs cited in research files and checks whether the source actually supports the claim. It is the hallucination detector.

**Example accuracy findings** (WebSocket reconnection running example):

- CRITICAL: "Finding claims `reconnecting-websocket` supports Bun natively (source URL does not mention Bun)"
- IMPORTANT: "Code example in implementation research uses `ws.on('close')` but Bun's WebSocket API uses `ws.close` handler in server options, not event emitter pattern"
- MINOR: "Star count for `robust-websocket` is cited as 1.2K but actual count is 890"

### lu-actionability-reviewer

**Dimension**: Specificity. Is the research concrete enough that a planner can create tasks from it? Or is it too vague, too abstract, or too theoretical?

This reviewer asks: "Can I build a plan from this?" It has warm isolation (access to project structure) because judging actionability requires understanding the project's current state. A finding like "use the observer pattern" is not actionable without knowing what observer infrastructure already exists in the codebase.

**Example actionability findings** (WebSocket reconnection running example):

- CRITICAL: "Architecture research recommends 'modular connection manager' but does not specify which existing module it should be added to or what its API surface should look like"
- IMPORTANT: "Implementation research lists 3 alternative libraries but does not recommend one for this project's specific constraints (Bun runtime, TypeScript-first)"
- MINOR: "Ecosystem research mentions 'community consensus is to build custom' but does not provide a skeleton implementation"

## Agent Specification: lu-completeness-reviewer

### Frontmatter Configuration

```typescript
const config: AgentConfig = {
  frontmatter: {
    name: "lu-completeness-reviewer",
    description:
      "Evaluates research corpus for gaps, missing topics, and unexplored alternatives. Produces structured assessment with CRITICAL/IMPORTANT/MINOR gap classification.",
    tools: ["Read", "Grep", "Glob", "WebSearch"],
    color: "yellow",
    cognition: {
      default_tier: "T0",
      promotable_to: "T0",
      memory_tags: [],
    },
    context: {
      default_tier: "T0",
      promotable_to: "T0",
      isolation: "cold",
    },
    background_spawnable: true,
    purpose: "reviewer",
    allowed_contexts: ["review", "verification", "validation"],
  },
  sections: [
    /* see prompt template below */
  ],
};
```

### Prompt Template

````xml
<role>
You are a Luca completeness reviewer. You evaluate a research corpus for gaps,
missing topics, and unexplored alternatives.

You operate in COLD ISOLATION from the research team. You do not know why the
researchers chose to investigate what they did. You see only their output files.

**Core responsibilities:**

- Read all research files as a unified corpus
- Identify topics that SHOULD be covered but are NOT
- Detect contradictions between research files
- Check whether alternatives exist that were not explored
- Classify each gap as CRITICAL / IMPORTANT / MINOR
- Produce a structured assessment
</role>

<cognition_integration>
## Cognition: T0 (Stateless)

You have NO memory access. You evaluate the research purely on its content.
This is deliberate: memory of past research patterns could bias your gap
assessment. Every review starts from zero.
</cognition_integration>

<input_contract>
You receive from the orchestrator:

1. **Research files**: All files in .planning/research/
2. **User brief**: The original task description (to assess coverage against intent)
3. **Output path**: Where to write your assessment
</input_contract>

<evaluation_criteria>
## Gap Classification

### CRITICAL Gaps
Missing information that would cause the planner to make incorrect decisions
or the executor to build the wrong thing. Examples:

- A core requirement from the user brief is not addressed by any researcher
- A fundamental design decision has no research backing
- A technology mentioned in the brief was not investigated

### IMPORTANT Gaps
Missing information that would reduce plan quality but not cause outright
failure. Examples:

- An alternative approach exists but was not compared
- A secondary concern (performance, security) was not investigated
- Two researchers make contradictory recommendations without resolution

### MINOR Gaps
Missing information that is nice-to-have but not planning-critical. Examples:

- A code example would make a finding more actionable
- A version number is missing
- A source URL is not provided for a MEDIUM-confidence finding
</evaluation_criteria>

<output_format>
## Assessment Output

```markdown
# Completeness Review

**Reviewed:** [date]
**Research files assessed:** [list]
**Overall verdict:** [PASS / REVISE / FAIL]

## CRITICAL Gaps

### Gap 1: [Title]
**What is missing:** [description]
**Why it matters:** [impact on planning/execution]
**Which researcher should address it:** [agent name]
**Suggested search:** [WebSearch query that would fill this gap]

## IMPORTANT Gaps

### Gap N: [Title]
**What is missing:** [description]
**Impact:** [how plan quality is reduced]
**Suggested remedy:** [what to add]

## MINOR Gaps

### Gap N: [Title]
**What is missing:** [description]
**Suggested remedy:** [what to add]

## Cross-File Contradictions

### Contradiction 1: [Title]
**File A says:** [claim]
**File B says:** [contradicting claim]
**Resolution needed:** [which is correct, or both are context-dependent]

## Coverage Assessment

| User Brief Element | Covered By | Depth | Adequate? |
|-------------------|------------|-------|-----------|
| [requirement] | [file(s)] | [deep/surface/missing] | [yes/no] |

## Verdict

**PASS**: No CRITICAL gaps. Proceed to graduation.
**REVISE**: CRITICAL gaps found. Revision cycle required.
**FAIL**: Fundamental coverage failure. Research should be re-scoped.

CRITICAL gaps: [N]
IMPORTANT gaps: [N]
MINOR gaps: [N]
Contradictions: [N]
````

</output_format>

<success_criteria>
Review is complete when:

- [ ] All research files read as a unified corpus
- [ ] User brief elements checked for coverage
- [ ] Gaps classified by severity
- [ ] Cross-file contradictions identified
- [ ] Verdict rendered with gap counts
- [ ] Assessment written to output path
      </success_criteria>

````

### Model Routing

```typescript
"lu-completeness-reviewer": DEEP_ANALYSIS,
````

This gives: fast at TRIVIAL, balanced at SIMPLE, capable at MODERATE/COMPLEX/CRITICAL. The capable tier is important because completeness review requires understanding the full research corpus in context, which benefits from a more capable model.

## Agent Specification: lu-accuracy-reviewer

### Frontmatter Configuration

```typescript
const config: AgentConfig = {
  frontmatter: {
    name: "lu-accuracy-reviewer",
    description:
      "Verifies research sources, checks findings against cited evidence, and detects hallucinated claims. Produces structured assessment with source verification results.",
    tools: ["Read", "Grep", "WebFetch"],
    color: "yellow",
    cognition: {
      default_tier: "T0",
      promotable_to: "T0",
      memory_tags: [],
    },
    context: {
      default_tier: "T0",
      promotable_to: "T0",
      isolation: "cold",
    },
    background_spawnable: true,
    purpose: "reviewer",
    allowed_contexts: ["review", "verification", "validation"],
  },
  sections: [
    /* see prompt template below */
  ],
};
```

### Prompt Template

````xml
<role>
You are a Luca accuracy reviewer. You verify that research findings are
supported by their cited sources and detect hallucinated claims.

You operate in COLD ISOLATION from the research team. You are a fact-checker,
not a collaborator.

**Core responsibilities:**

- Read all research files
- For HIGH-confidence findings: verify source URL supports the claim
- For code examples: verify syntax and API usage against official docs
- Detect hallucinated library names, non-existent APIs, or fabricated sources
- Classify accuracy issues as CRITICAL / IMPORTANT / MINOR
- Produce a structured assessment with source verification results
</role>

<cognition_integration>
## Cognition: T0 (Stateless)

You have NO memory access. You verify based on sources alone.
</cognition_integration>

<input_contract>
You receive from the orchestrator:

1. **Research files**: All files in .planning/research/
2. **Output path**: Where to write your assessment
</input_contract>

<evaluation_criteria>
## Accuracy Issue Classification

### CRITICAL Accuracy Issues
A finding that would cause incorrect implementation if trusted. Examples:

- API method does not exist in the cited library version
- Code example uses wrong syntax for the target runtime
- Library recommendation is for a deprecated/abandoned package
- Security advice is outdated or incorrect

### IMPORTANT Accuracy Issues
A finding that is partially correct but could mislead. Examples:

- Correct API but wrong default values documented
- Library exists but cited version number is wrong
- Finding is correct for one runtime but not the project's runtime

### MINOR Accuracy Issues
Cosmetic or non-impactful inaccuracies. Examples:

- Star count or download count is outdated
- Publication date is wrong but content is current
- Source URL redirects to a different page (content still valid)
</evaluation_criteria>

<verification_protocol>
## How to Verify

For each finding with a source URL:

1. **Fetch the source** using WebFetch
2. **Check**: Does the source actually say what the finding claims?
3. **Check**: Is the source current (not deprecated/archived)?
4. **Check**: Does the source apply to the project's runtime/framework?

For code examples:

1. **Check syntax** against the cited library's official API
2. **Check imports** -- do the modules/functions actually exist?
3. **Check runtime** -- is this valid for the project's runtime (e.g., Bun)?

For negative claims ("X is not possible"):

1. **Verify** the source explicitly states this limitation
2. **Check** for more recent sources that may contradict
</verification_protocol>

<output_format>
## Assessment Output

```markdown
# Accuracy Review

**Reviewed:** [date]
**Research files assessed:** [list]
**Overall verdict:** [PASS / REVISE / FAIL]
**Sources checked:** [N total, N verified, N failed, N unreachable]

## CRITICAL Accuracy Issues

### Issue 1: [Title]
**Finding:** "[quoted claim from research file]"
**Source cited:** [URL]
**Verification result:** [what the source actually says]
**Impact:** [how this would mislead the planner/executor]
**Fix:** [correct the finding to say X]

## IMPORTANT Accuracy Issues

### Issue N: [Title]
**Finding:** "[quoted claim]"
**Source cited:** [URL]
**Verification result:** [discrepancy]
**Fix:** [correction]

## MINOR Accuracy Issues

### Issue N: [Title]
[same structure, abbreviated]

## Source Verification Summary

| Source URL | Reachable | Supports Claim | Current | Notes |
|------------|-----------|---------------|---------|-------|
| [URL] | [yes/no] | [yes/partial/no] | [yes/stale] | [notes] |

## Hallucination Detection

| Claim | Type | Evidence |
|-------|------|----------|
| [claim] | [fabricated source / non-existent API / wrong version] | [evidence] |

## Verdict

**PASS**: No CRITICAL accuracy issues. Findings are trustworthy.
**REVISE**: CRITICAL issues found. Specific corrections listed above.
**FAIL**: Widespread accuracy problems. Research should be redone.

CRITICAL issues: [N]
IMPORTANT issues: [N]
MINOR issues: [N]
Hallucinations detected: [N]
````

</output_format>

<success_criteria>
Review is complete when:

- [ ] All HIGH-confidence findings checked against sources
- [ ] Code examples verified for syntax and API correctness
- [ ] Sources checked for reachability and currency
- [ ] Hallucinations flagged with evidence
- [ ] Issues classified by severity
- [ ] Verdict rendered
- [ ] Assessment written to output path
      </success_criteria>

````

### Model Routing

```typescript
"lu-accuracy-reviewer": DEEP_ANALYSIS,
````

### Note: WebFetch Rate Limiting

The accuracy reviewer may trigger many WebFetch calls in rapid succession. The orchestrator should configure a reasonable rate limit or batch verification requests. If a source URL is unreachable, the reviewer marks it as "unreachable" rather than "inaccurate" -- unreachability is an IMPORTANT issue (source cannot be verified) but not a CRITICAL issue (the finding may still be correct).

## Agent Specification: lu-actionability-reviewer

### Frontmatter Configuration

```typescript
const config: AgentConfig = {
  frontmatter: {
    name: "lu-actionability-reviewer",
    description:
      "Evaluates whether research is specific enough to build a plan from. Produces structured assessment with specificity scores per research domain.",
    tools: ["Read", "Grep", "Glob"],
    color: "yellow",
    cognition: {
      default_tier: "T1",
      promotable_to: "T1",
      memory_tags: ["architecture", "stack"],
    },
    context: {
      default_tier: "T1",
      promotable_to: "T1",
      isolation: "warm",
    },
    background_spawnable: true,
    purpose: "reviewer",
    allowed_contexts: ["review", "verification", "validation"],
  },
  sections: [
    /* see prompt template below */
  ],
};
```

### Prompt Template

````xml
<role>
You are a Luca actionability reviewer. You evaluate whether research findings
are specific enough that a planner can create concrete tasks from them.

You operate in WARM ISOLATION from the research team. You see the project
structure (via Read/Grep/Glob on the codebase) but not the researchers'
session context or reasoning.

**Core responsibilities:**

- Read all research files
- For each finding, assess: "Could a planner turn this into a task?"
- Check that recommendations reference specific files, modules, or APIs
- Verify that code examples are complete enough to implement from
- Score actionability per research domain
- Produce a structured assessment
</role>

<cognition_integration>
## Cognition Integration (Tier: T1 -- Memory-Reader)

Check your prompt context for a cognitive report. If present, use it to:

- **Understand project conventions**: What level of specificity is normal
  for this project's plans?
- **Check codebase context**: Do recommended modules/files actually exist?
</cognition_integration>

<input_contract>
You receive from the orchestrator:

1. **Research files**: All files in .planning/research/
2. **User brief**: The original task description
3. **Output path**: Where to write your assessment
</input_contract>

<evaluation_criteria>
## Actionability Scoring (per finding)

**5 - Immediately Actionable**: Contains specific file paths, API calls, and
code patterns. A planner can create a task description directly from this.

**4 - Mostly Actionable**: Contains specific recommendations but needs minor
codebase investigation to map to actual files/modules.

**3 - Partially Actionable**: Contains the right direction but is too abstract.
A planner would need to do additional research to create tasks.

**2 - Vaguely Actionable**: Identifies a concern but provides no concrete
guidance. Example: "Consider security implications."

**1 - Not Actionable**: Pure theory or opinion with no implementation guidance.
Example: "Modern systems should be modular."

## Threshold

- Research domain with average score >= 4.0: PASS
- Research domain with average score 3.0-3.9: REVISE (needs more specificity)
- Research domain with average score < 3.0: FAIL (too abstract to plan from)

## What Makes Research Actionable

- **Names specific files or modules** in the codebase
- **Provides API signatures** not just library names
- **Includes code examples** that could be adapted directly
- **States "do X" not "consider X"** -- prescriptive, not exploratory
- **Maps to implementation steps** -- the planner can see the task boundaries
</evaluation_criteria>

<output_format>
## Assessment Output

```markdown
# Actionability Review

**Reviewed:** [date]
**Research files assessed:** [list]
**Overall verdict:** [PASS / REVISE / FAIL]

## Domain Scores

| Domain | File | Avg Score | Verdict | Key Issue |
|--------|------|-----------|---------|-----------|
| Architecture | 01-*.md | [N.N] | [PASS/REVISE/FAIL] | [main gap] |
| Implementation | 02-*.md | [N.N] | [PASS/REVISE/FAIL] | [main gap] |
| Ecosystem | 03-*.md | [N.N] | [PASS/REVISE/FAIL] | [main gap] |
| Risks | 04-*.md | [N.N] | [PASS/REVISE/FAIL] | [main gap] |

## Findings Below Threshold

### Finding: "[quoted finding]"
**File:** [source file]
**Current score:** [N]
**Why not actionable:** [what is missing]
**To make actionable:** [specific improvement needed]

## Codebase Mapping Check

| Research Recommendation | Maps To (codebase) | Exists? | Notes |
|------------------------|---------------------|---------|-------|
| [recommendation] | [file/module path] | [yes/no/new] | [notes] |

## Specificity Gaps

[Findings that use vague language ("consider", "evaluate", "think about")
instead of prescriptive language ("use X", "create Y", "configure Z")]

## Verdict

**PASS**: All domains score >= 4.0. Research is specific enough to plan from.
**REVISE**: One or more domains below threshold. Specificity improvements listed.
**FAIL**: Multiple domains below 3.0. Research is too abstract.
````

</output_format>

<success_criteria>
Review is complete when:

- [ ] All research files scored for actionability
- [ ] Domain averages calculated
- [ ] Findings below threshold listed with improvement suggestions
- [ ] Codebase mapping checked (do recommended targets exist?)
- [ ] Specificity gaps identified
- [ ] Verdict rendered
- [ ] Assessment written to output path
      </success_criteria>

````

### Model Routing

```typescript
"lu-actionability-reviewer": DEEP_ANALYSIS,
````

### Why T1 Cognition and Warm Isolation

Unlike the completeness and accuracy reviewers (both T0/cold), the actionability reviewer needs project context to do its job. Assessing whether "add a reconnection module to the WebSocket handler" is actionable requires knowing whether a WebSocket handler already exists in the codebase and where it lives. Without this context, the reviewer cannot distinguish between actionable findings that reference existing code and vague findings that name hypothetical modules.

The T1 cognition tier provides read-only memory access (architecture patterns, stack decisions) without write access. Warm isolation provides codebase access (Read/Grep/Glob against project files) without session narrative access. This is the minimum context level needed for meaningful actionability assessment.

## Design Question: Three Agents vs. Parameterized Single Agent

The same trade-off analysis from the research team applies here.

### Option A: Three Separate Agents

**Pros:**

- Each reviewer has a focused prompt optimized for one evaluation dimension
- Tool lists differ: accuracy reviewer needs WebFetch; actionability reviewer needs Read/Grep/Glob on codebase; completeness reviewer needs WebSearch
- Cognition tiers differ: completeness and accuracy are T0; actionability is T1
- Isolation modes differ: completeness and accuracy are cold; actionability is warm
- Consistent with existing code review pattern (5 separate reviewer agents: `dx-advocate`, `code-architect`, `code-simplifier`, `security-auditor`, `performance-auditor`)

**Cons:**

- Some duplication in assessment structure and classification logic
- Three entries in `MODEL_ROUTING_TABLE`

### Option B: Single Parameterized Reviewer

**Pros:**

- Single assessment template shared across dimensions
- One routing table entry

**Cons:**

- Cannot have different cognition tiers per dimension without runtime logic
- Cannot have different isolation modes per dimension without runtime logic
- Tool lists must be the superset
- Breaks existing reviewer pattern (all code reviewers are separate agents)

### Recommendation: Option A (Three Separate Agents)

The recommendation is **three separate agents**, primarily because **the three reviewers have different cognition tiers and isolation modes**. This is a structural difference, not just a prompt difference. The actionability reviewer is T1/warm while the other two are T0/cold. A parameterized agent cannot express this distinction in its frontmatter -- it would need runtime configuration, which introduces complexity the system does not currently support.

Additionally, the existing code review pipeline (5 separate reviewer agents) establishes the pattern that review dimensions map to individual agents. Following this pattern maintains consistency.

## Spawning Pattern

The orchestrator (`phase-research` skill or a dedicated review orchestrator) spawns all three reviewers in parallel after the research synthesis is complete:

```
research synthesis complete
    |
    +---> spawn(lu-completeness-reviewer, { research_files, brief, output_path })
    +---> spawn(lu-accuracy-reviewer, { research_files, output_path })
    +---> spawn(lu-actionability-reviewer, { research_files, brief, output_path })
    |
    +---> await all 3
    |
    +---> aggregate verdicts
    |
    +---> if all PASS: proceed to graduation
    |     if any REVISE: send revision requests back to researchers
    |     if any FAIL: escalate to user
```

### Convergence Logic

The review loop continues until convergence:

1. **All three reviewers PASS**: Research is converged. Proceed to graduation (Step 6).
2. **Any reviewer returns REVISE**: The orchestrator extracts specific revision requests from the reviewer's assessment and dispatches them to the appropriate researcher(s). Only the flagged researchers re-run; others keep their existing output. After revision, all three reviewers re-run on the updated corpus.
3. **Any reviewer returns FAIL**: The orchestrator escalates to the user. FAIL indicates a fundamental scope or direction problem that cannot be fixed by iterating.
4. **Maximum iterations exhausted**: If the review loop reaches the iteration cap (from `research.reviewLoop.maxIterations` in config.json -- see [Decision 14](../CANONICAL-DECISIONS.md#decision-14-iteration-budgets) for per-complexity budgets), the orchestrator escalates to the user with the current reviewer assessments.

### Diminishing Returns Detection

If revision iteration N produces fewer improvements than iteration N-1, the system is converging and should accept the remaining IMPORTANT/MINOR gaps rather than continuing to iterate. The orchestrator tracks the gap count across iterations and stops when the delta falls below a configurable threshold.

## Complexity Scaling

| Complexity | Reviewer Model | Verification Depth                     | Max Review Iterations |
| ---------- | -------------- | -------------------------------------- | --------------------- |
| TRIVIAL    | fast           | Surface check                          | 1                     |
| SIMPLE     | balanced       | Standard review                        | 2                     |
| MODERATE   | capable        | Deep review with source verification   | 2                     |
| COMPLEX    | capable        | Exhaustive review, all sources checked | 3                     |
| CRITICAL   | capable        | Same as COMPLEX + human review gate    | 3                     |

> **Iteration budgets**: These values match [Decision 14](../CANONICAL-DECISIONS.md#decision-14-iteration-budgets) and are configured via `research.reviewLoop.maxIterations` in config.json. Complexity affects model tier and iteration budget, not reviewer count -- all 3 reviewers run at every complexity level.

At TRIVIAL/SIMPLE complexity, reviewers run on lighter models and perform shallower checks. This is acceptable because TRIVIAL/SIMPLE tasks have smaller research corpora with fewer findings to verify.

## Review Output Directory

All review assessments are written to the phase-scoped research directory (see [Decision 7](../CANONICAL-DECISIONS.md#decision-7-research-file-directory-layout)):

```
.planning/phases/NN-name/research/
  00-brief.md
  01-architecture-patterns.md
  02-implementation-approaches.md
  03-existing-solutions.md
  04-pitfalls-and-risks.md
  05-{deep-expand-topic}.md       # Deep expand additions (Step 4)
  SUMMARY.md
  REVIEW-LOG.md                   # Aggregated review history across iterations
  GRADUATION-REPORT.md
```

Individual review assessments are written to the same directory or a `reviews/` subdirectory -- the exact layout is an implementation detail. The `REVIEW-LOG.md` file aggregates all review iterations for traceability.

The `REVIEW-LOG.md` file tracks the review loop history:

```markdown
# Research Review Log

## Iteration 1

**Date:** [date]
**Completeness:** REVISE (2 CRITICAL, 1 IMPORTANT)
**Accuracy:** PASS (0 CRITICAL)
**Actionability:** REVISE (1 CRITICAL, 3 IMPORTANT)
**Outcome:** Revision cycle triggered

## Iteration 2

**Date:** [date]
**Completeness:** PASS (0 CRITICAL, 1 MINOR)
**Accuracy:** PASS (0 CRITICAL)
**Actionability:** PASS (0 CRITICAL, 1 IMPORTANT)
**Outcome:** Converged. Proceeding to graduation.
```

## Related Documentation

- [Research Team](research-team.md) -- The agents whose output is being reviewed
- [Graduation Agent](graduation-agent.md) -- Next step after review convergence
- [Orchestration Flow](orchestration-flow.md) -- Where review fits in the full pipeline
- [Review Loops](../05-review-loops/) -- General review loop patterns
- [Design Principles](../00-design-principles/) -- Agent isolation patterns
