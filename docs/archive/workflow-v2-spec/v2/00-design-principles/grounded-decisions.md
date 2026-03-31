# Grounded Decisions

> Every implementation decision must trace to a verified source. If you cannot point to documentation
> that confirms an approach works, you do not use that approach. This is the single highest-leverage
> principle for eliminating hallucinated code.

---

## The "No Guesswork" Principle

AI models are trained on vast corpora of code and documentation. When they encounter a gap in their knowledge, they do not stop and say "I don't know." They interpolate. They generate plausible-sounding code that looks correct, follows reasonable patterns, and compiles cleanly -- but calls APIs that do not exist, uses deprecated methods, or applies patterns from the wrong library version.

This is not a bug. It is the defining behavior of language models: they produce the most likely continuation of the context. When the context lacks specific information about an API, the most likely continuation is a reasonable-looking API call based on patterns from pre-training. The problem is that "reasonable-looking" and "correct" are different things.

### Examples of Ungrounded Decisions

These are real failure patterns observed in Luca v1 sessions:

| Failure               | What the model generated                                  | What was actually correct                              | Why it happened                                                     |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| **Hallucinated API**  | `Bun.serve({ routes: { ... } })` with nested route groups | `Bun.serve()` routes are flat, not nestable            | Model interpolated from Express.js patterns                         |
| **Deprecated method** | `crypto.createCipher()` for encryption                    | `crypto.createCipheriv()` (the non-deprecated version) | Pre-training data included older Node.js docs                       |
| **Wrong version**     | Used Zod v4 `.pipe()` syntax                              | Project uses Zod v3, which does not have `.pipe()`     | Model defaulted to the latest version in training data              |
| **Invented config**   | `bunfig.toml` with `[build] target = "browser"`           | Bun's bunfig.toml does not support this field          | Model interpolated from Cargo.toml patterns                         |
| **Wrong library**     | Used `node:fs` for file operations                        | Project convention requires `Bun.file()` API           | Model defaulted to pre-training defaults despite project convention |

Every one of these produced code that compiled, passed superficial review, and looked correct. The errors were only caught downstream -- in integration tests, manual testing, or production.

### Why This Matters More for AI Than for Humans

A human developer who encounters a gap in their knowledge opens the documentation. They search Stack Overflow. They read the changelog. They verify before committing. A language model does none of this by default -- it interpolates instantly and moves on, with no awareness that it interpolated at all.

V2 makes verification the default. Research happens before planning, not as a side effect during execution.

---

## Source Hierarchy

Not all sources are equally reliable. V2 defines a strict hierarchy:

```
TIER 1 (Highest Confidence)
+--------------------------------------------------+
| Context7 MCP -- live, versioned API docs          |
| Project codebase -- grep/read actual source files |
+--------------------------------------------------+
            |
            v
TIER 2 (High Confidence)
+--------------------------------------------------+
| Official documentation via WebFetch               |
| (docs.bun.sh, zod.dev, typescriptlang.org, etc.) |
+--------------------------------------------------+
            |
            v
TIER 3 (Medium Confidence)
+--------------------------------------------------+
| Multiple independent sources agree                |
| (2+ blog posts, tutorials, or discussions         |
|  that describe the same pattern consistently)     |
+--------------------------------------------------+
            |
            v
TIER 4 (Low Confidence)
+--------------------------------------------------+
| Single unverified source                          |
| (one blog post, one forum answer, one tutorial)   |
+--------------------------------------------------+
            |
            v
TIER 5 (Unacceptable)
+--------------------------------------------------+
| Model's pre-training knowledge alone              |
| (no external source consulted or cited)           |
+--------------------------------------------------+
```

### Tier Descriptions

**Tier 1: Live API Documentation (Context7 MCP + Codebase)**

Context7 provides live, version-specific API documentation. When a researcher queries Context7 for "Bun.serve() route handling", it returns the actual current documentation -- not what the model remembers from training. The project codebase is equally authoritative: if you can `grep` for how something is used in the existing code, that is a verified pattern.

Tier 1 findings are HIGH confidence by default. They represent ground truth.

**Fallback when Context7 is unavailable**: If Context7 is unreachable (network issues, rate limiting) or lacks coverage for a given library, the researcher falls back to Tier 2 (official documentation via WebFetch). In this case, Tier 2 becomes the practical top of the hierarchy for that finding. The researcher must note in the research file that Context7 was unavailable and why.

**Tier 2: Official Documentation (WebFetch)**

When Context7 does not cover a topic, the researcher fetches official documentation directly. This means navigating to `docs.bun.sh`, `zod.dev`, or the relevant library's official docs and reading the current version.

Tier 2 findings are HIGH confidence, but must note the version of the documentation consulted. APIs change between versions.

**Tier 3: Corroborated Community Sources (WebSearch + Verification)**

When official docs do not cover a specific pattern or edge case, the researcher turns to community sources. These are MEDIUM confidence only if multiple independent sources describe the same pattern consistently. If three different blog posts all describe the same approach to Bun WebSocket authentication, that is more reliable than one post.

Tier 3 findings must note that they are community-sourced and list the corroborating sources.

**Tier 4: Single Unverified Source**

A single blog post, forum answer, or tutorial. These are LOW confidence and must be flagged as such. They may be used as starting points for further research but should not be trusted as implementation guidance without corroboration.

**Tier 5: Pre-Training Knowledge (Unacceptable)**

"I know how to do this from my training data" is never sufficient. Pre-training data is a mix of correct, outdated, and incorrect information. Without an external source to verify against, the model cannot distinguish between them.

Tier 5 is explicitly prohibited in v2. Every research finding must cite at least one external source. Findings that rely solely on Tier 5 sources are automatically assigned UNVERIFIED confidence (see confidence model below) and are rejected from both research files and graduation.

---

## The Confidence Model

Each research finding carries a confidence tag that determines how it can be used downstream. The canonical specification lives in [`02-research-system/source-confidence-model.md`](../02-research-system/source-confidence-model.md); what follows is a summary of the principles.

### Confidence Levels

| Level          | Definition                                                                   | Graduation Eligible | Use in Planning       | Use in Execution                       |
| -------------- | ---------------------------------------------------------------------------- | ------------------- | --------------------- | -------------------------------------- |
| **HIGH**       | Verified against Tier 1 or Tier 2 source; current version confirmed          | Yes                 | Direct reference      | Direct implementation                  |
| **MEDIUM**     | Multiple Tier 3 sources agree, or single Tier 2 source for non-critical path | Yes (with flag)     | Reference with caveat | Implementation with verification step  |
| **LOW**        | Single Tier 3 or Tier 4 source; not corroborated                             | No                  | Flagged as uncertain  | Must re-research before implementation |
| **UNVERIFIED** | Model knowledge only; no external source                                     | No                  | Rejected              | Rejected                               |

### Confidence Assignment in Practice

A researcher produces a finding. Before recording it in the research file, they must assign a confidence level:

```markdown
## Finding: Bun.serve() Route Handling

**Confidence**: HIGH
**Source**: Context7 MCP (bun@1.1.x docs, retrieved 2026-03-22)

Bun.serve() accepts a `routes` object where keys are URL patterns
and values are handler functions. Routes are flat -- no nesting or
grouping is supported. Middleware is applied globally via the `fetch`
handler, not per-route.

### Verified Pattern

...code example from official docs...

### Key Constraints

- No route groups or nested routes
- No per-route middleware
- Static routes checked before dynamic routes
```

Compare with a LOW confidence finding:

```markdown
## Finding: Bun WebSocket Authentication Patterns

**Confidence**: LOW
**Source**: Single blog post (https://example.com/bun-ws-auth, 2025-11-15)
**Action Required**: Verify against official docs before implementation

The blog post suggests using upgrade headers to pass JWT tokens during
WebSocket handshake. This pattern has not been verified against official
Bun documentation. The blog was written for Bun 1.0 and may not apply
to the current version.

### Unverified Pattern

...code example from blog post...

### Risks

- Pattern may not work in current Bun version
- No official documentation confirms this approach
- Only one source found
```

---

## How Grounding Changes the Executor's Job

In v1, the executor's job is: "Given this task description, figure out how to implement it and write the code."

In v2, the executor's job is: "Given this task description AND the researched approach with verified patterns, follow the approach and write the code."

This is a fundamental shift. The executor is no longer a researcher-implementer hybrid. It is a pure implementer that follows verified instructions.

```
v1 Executor Workflow:
+---------------------------------------------------+
| 1. Read task description                          |
| 2. Think about how to implement it                |
| 3. Search codebase for patterns (maybe)           |
| 4. Write code based on model knowledge            |
| 5. Hope the API calls are correct                 |
+---------------------------------------------------+

v2 Executor Workflow:
+---------------------------------------------------+
| 1. Read task description                          |
| 2. Load referenced research file(s)               |
| 3. Follow the verified pattern from research      |
| 4. Write code using documented API calls          |
| 5. Flag any gap where research is insufficient    |
+---------------------------------------------------+
```

When an executor encounters a gap -- something the research did not cover -- it does **not** fill the gap with interpolation. Instead, it flags the gap for additional research. This is the "no guesswork" principle in action: uncertainty is surfaced, not hidden.

---

## Research Graduation Model

Not all research findings persist. V2 uses a graduation model where findings must earn their way into long-term memory. The canonical graduation specification (scoring formula, concept prefixes, deferred promotion) lives in [`03-muninndb-integration/`](../03-muninndb-integration/README.md); what follows is a summary of the principles.

### The Graduation Pipeline

```
Research Finding (initial)
        |
        v
Review by Cold Reviewer
        |
   +----+----+
   |         |
 PASS      FAIL --> Researcher re-researches with reviewer feedback
   |
   v
Confidence Assessment
   |
   +------+------+------+
   |      |      |      |
  HIGH  MEDIUM  LOW   UNVERIFIED
   |      |      |      |
   v      v      |      v
Graduate Graduate |   Rejected
to MuninnDB       |
(deferred)        v
              Flagged for
              re-research
```

### What Graduates

Only HIGH and MEDIUM confidence findings become MuninnDB engrams. This ensures that long-term memory contains only verified information.

```typescript
// Graduated engram example (writes to research:* prefix, NOT pattern:*)
muninn_remember(
  vault: "luca-framework",
  concept: "research:pattern-bun-serve-route-handling",
  content: `Bun.serve() routes are flat key-value pairs. No nesting or
  grouping. Middleware via global fetch handler only. Verified against
  Context7 docs (bun@1.1.x, 2026-03-22). Confidence: HIGH.`
)
// Note: Promotion to pattern:* in the default vault happens later in
// Step 10 via lu-learner, after verification confirms the finding's
// value. Graduation (Step 6) always writes to research:* prefixes.
```

### What Does NOT Graduate

- **LOW confidence findings** remain in research files (accessible to this project) but are not promoted to MuninnDB. They might be useful for this specific task but are not reliable enough for cross-session recall.
- **UNVERIFIED findings** are rejected outright. They are not recorded in research files or MuninnDB.
- **Outdated findings** -- when a graduated engram is contradicted by a newer Tier 1/2 source, it is updated or deprecated in MuninnDB.

### Why Graduation Matters

MuninnDB is cross-session memory. A finding that graduates will influence future sessions -- potentially months later, in different contexts. If LOW confidence or UNVERIFIED findings graduate, they become "established patterns" that future agents treat as ground truth. This is how hallucinations become permanent.

The graduation threshold is intentionally strict. It is better to re-research a finding in a future session than to trust a LOW confidence finding from months ago.

---

## Grounding in the v2 Pipeline

For the canonical step definitions, see [`01-workflow-steps/`](../01-workflow-steps/README.md). The summary below focuses on how grounding manifests at each step.

**Steps 1-2 (Ideate + Research)**: The ideator identifies research topics with expected source tiers. Four specialized researchers (`lu-architecture-researcher`, `lu-implementation-researcher`, `lu-ecosystem-researcher`, `lu-risk-researcher`) each query Context7 MCP (Tier 1), falling back to WebFetch (Tier 2) and web search (Tier 3-4). Each writes a self-contained research file with confidence level and source citation.

**Step 5 (Review Research)**: Three cold reviewers (`lu-completeness-reviewer`, `lu-accuracy-reviewer`, `lu-actionability-reviewer`) evaluate each research file independently. They verify that confidence levels match source tiers, that cited sources support the findings, and that gaps are identified. The reviewer has **no access to the researcher's conversation history.** See [`05-review-loops/`](../05-review-loops/README.md) for the convergence criteria.

**Step 6 (Graduate to MuninnDB)**: `lu-research-graduator` scores findings using a weighted formula and writes HIGH/MEDIUM confidence findings to `research:*` prefixes in the repo vault. See [`03-muninndb-integration/`](../03-muninndb-integration/README.md) for the graduation specification.

**Steps 7-9 (Plan + Execute)**: The planner references graduated research files by path; executors load only the files tagged for their specific task. If an executor encounters a gap, it flags it rather than interpolating.

---

## Anti-Patterns

### Anti-Pattern 1: "I Know How to Do This"

```
RESEARCHER: "Bun.serve() supports route groups using the following pattern..."
SOURCE: None (model pre-training knowledge)
CONFIDENCE: Should be UNVERIFIED, but recorded as HIGH

PROBLEM: The researcher "knows" the API from pre-training but never
verified it. The API may have changed, or the model may be conflating
Bun with another framework.
```

**Prevention**: V2 requires every finding to cite an external source. "I know" is not a source.

### Anti-Pattern 2: Confidence Inflation

```
RESEARCHER: "Found this pattern in a blog post from 2024."
SOURCE: Single blog post (Tier 4)
CONFIDENCE: Recorded as MEDIUM (should be LOW)

PROBLEM: The researcher inflates confidence because the finding
"looks right" or because they want it to graduate to MuninnDB.
```

**Prevention**: Cold reviewers specifically check confidence levels against source tiers. A single Tier 4 source cannot support MEDIUM confidence.

### Anti-Pattern 3: Outdated Sources

```
RESEARCHER: "Official docs say to use createCipher() for encryption."
SOURCE: Node.js v12 documentation (Tier 2, but outdated)
CONFIDENCE: HIGH

PROBLEM: The source is official documentation, but for a version that
is no longer current. The API has been deprecated.
```

**Prevention**: Research files must note the version of the documentation consulted. Reviewers check version currency.

### Anti-Pattern 4: Executor Gap-Filling

```
EXECUTOR: "The research file covers authentication but not
authorization. I'll implement authorization based on my knowledge
of common patterns."

PROBLEM: The executor fills a research gap with interpolation,
defeating the purpose of grounding.
```

**Prevention**: Executors are instructed to flag gaps, not fill them. Flagged gaps trigger additional research before the executor proceeds.

---

## Measuring Grounding Effectiveness

V2 tracks grounding quality through process data:

| Metric                     | What It Measures                                             | Target                                                                           |
| -------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Source citation rate**   | % of research findings with external sources                 | 100% (strict)                                                                    |
| **Confidence accuracy**    | % of findings where reviewer agrees with assigned confidence | >90%                                                                             |
| **Graduation rate**        | % of findings that reach HIGH/MEDIUM confidence              | 60-80% (too high = not researching hard topics; too low = poor research quality) |
| **Executor gap flags**     | Number of gaps flagged by executors during implementation    | Trending toward zero (research is comprehensive)                                 |
| **Post-review downgrades** | % of findings downgraded by cold reviewer                    | <20% (too high = researchers are inflating confidence)                           |

These metrics feed into the process retrospective and inform future research quality improvements.

---

## Key Takeaways

1. **Grounding is not optional.** Every implementation decision must trace to a real source. "The model knows how" is never sufficient.

2. **The source hierarchy is strict.** Tier 1 (live docs) > Tier 2 (official docs) > Tier 3 (corroborated community) > Tier 4 (single source) > Tier 5 (pre-training only, rejected).

3. **Confidence levels determine usability.** HIGH and MEDIUM graduate to MuninnDB. LOW stays in project files. UNVERIFIED is rejected.

4. **Executors follow, they do not research.** The executor's job changes from "figure out how" to "follow the verified approach." Gaps are flagged, not filled.

5. **Graduation protects long-term memory.** Only verified findings enter MuninnDB. This prevents hallucinations from becoming "established patterns" in future sessions.

6. **Cold review prevents confidence inflation.** A reviewer who did not produce the research has no incentive to inflate its confidence level.

---

## Related Documents

- [README.md](README.md) -- How grounded decisions connect to other v2 principles
- [agent-isolation-patterns.md](agent-isolation-patterns.md) -- Why cold reviewers are essential for honest confidence assessment
- [multi-file-architecture.md](multi-file-architecture.md) -- How research files are structured and organized
- [context-rot-prevention.md](context-rot-prevention.md) -- How targeted research files reduce executor context usage
