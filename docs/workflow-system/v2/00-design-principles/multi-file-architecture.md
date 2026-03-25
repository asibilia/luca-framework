# Multi-File Architecture

> Many small files, each independently verifiable by a focused agent. The file system is not
> just storage -- it is the architecture. Directory structure is the table of contents. File
> boundaries are context boundaries. The number of files is a design decision, not an
> implementation detail.

---

## Why Many Small Files > One Large Document

### The Monolithic Document Problem

In Luca v1, research produces a single RESEARCH.md. Planning produces a single PLAN.md. As tasks grow in complexity, these documents grow proportionally:

```
TRIVIAL task:   RESEARCH.md = 200 lines     PLAN.md = 100 lines
SIMPLE task:    RESEARCH.md = 500 lines     PLAN.md = 250 lines
MODERATE task:  RESEARCH.md = 1500 lines    PLAN.md = 600 lines
COMPLEX task:   RESEARCH.md = 4000+ lines   PLAN.md = 1500+ lines
CRITICAL task:  RESEARCH.md = 8000+ lines   PLAN.md = 3000+ lines
```

A COMPLEX task's RESEARCH.md consumes 4000+ lines of context when loaded. An agent that needs one specific finding (say, the correct API for database migrations) must load all 4000 lines to find it. This wastes context budget on irrelevant information and pushes the agent toward the degradation curve.

### The Multi-File Alternative

V2 replaces monolithic documents with a directory of focused files:

```
v1:
.planning/research/
  RESEARCH.md                         (4000+ lines, everything in one file)

v2:
.planning/research/
  00-research-index.md                (50 lines, table of contents)
  auth-token-validation.md            (200 lines, one concern)
  database-migration-strategy.md      (300 lines, one concern)
  error-handling-patterns.md          (250 lines, one concern)
  bun-websocket-configuration.md      (180 lines, one concern)
  rate-limiting-approaches.md         (220 lines, one concern)
  REVIEW-LOG.md                       (100 lines, review history)
```

Total content is similar (~1300 lines vs. a comparable v1 RESEARCH.md), but the structure is fundamentally different. An executor that needs database migration information loads only `database-migration-strategy.md` (300 lines), not 4000+ lines of everything.

---

## Files as Context Slots

Each file serves as a "context slot" -- a discrete unit of information that can be selectively loaded by an agent. This is the key insight that connects multi-file architecture to context rot prevention.

### Selective Loading

```
Executor for Task 1 (auth endpoint):
  Loads: auth-token-validation.md          (200 lines)
  Loads: error-handling-patterns.md        (250 lines)
  Total research context: 450 lines

Executor for Task 2 (database migration):
  Loads: database-migration-strategy.md    (300 lines)
  Loads: error-handling-patterns.md        (250 lines)
  Total research context: 550 lines

Executor for Task 3 (WebSocket handler):
  Loads: bun-websocket-configuration.md    (180 lines)
  Loads: auth-token-validation.md          (200 lines)
  Loads: rate-limiting-approaches.md       (220 lines)
  Total research context: 600 lines
```

No executor loads more than 600 lines of research context. In v1, all three executors would load the same 4000+ line RESEARCH.md.

### The Loading Protocol

The plan explicitly references which research files each task needs:

```markdown
## Task 3: Implement WebSocket Handler

**Research Files**:

- `.planning/research/bun-websocket-configuration.md`
- `.planning/research/auth-token-validation.md`
- `.planning/research/rate-limiting-approaches.md`

**Implementation**:
Follow the WebSocket initialization pattern from bun-websocket-configuration.md.
Apply token validation from auth-token-validation.md during the upgrade handshake.
Apply rate limiting from rate-limiting-approaches.md to message handling.
```

When the orchestrator spawns an executor for Task 3, it loads exactly these three files -- no more, no less.

---

## Directory Structure as Table of Contents

### The Index File

Every research directory includes an index file that serves as both navigation and summary:

```markdown
# Research Index

## Findings Summary

| File                           | Confidence | Key Finding                                       | Reviewed |
| ------------------------------ | ---------- | ------------------------------------------------- | -------- |
| auth-token-validation.md       | HIGH       | JWT validation via Bun.serve() upgrade headers    | Yes (v2) |
| database-migration-strategy.md | HIGH       | Drizzle ORM push strategy for schema changes      | Yes (v1) |
| error-handling-patterns.md     | MEDIUM     | Zod safeParse for all external input boundaries   | Yes (v1) |
| bun-websocket-configuration.md | HIGH       | Bun.serve() WebSocket via `websocket` field       | Yes (v2) |
| rate-limiting-approaches.md    | LOW        | Token bucket via in-memory Map; needs re-research | No       |

## Review Status

- Total findings: 5
- Reviewed (passed): 4
- Pending review: 1
- Review iterations completed: 2

## Gaps Identified

- [ ] No research on connection pooling for database
- [ ] Rate limiting approach needs corroboration (LOW confidence)
```

The index provides:

- **At-a-glance status** of all research
- **Confidence levels** without reading individual files
- **Review tracking** across the research phase
- **Gap identification** for planning purposes

### Directory Layout Conventions

The canonical directory layout is phase-scoped and flat (no deep/ subdirectory). See [`02-research-system/research-file-structure.md`](../02-research-system/research-file-structure.md) for the canonical research file specification. The layout below is illustrative of the principles; the exact structure is defined in [`01-workflow-steps/`](../01-workflow-steps/README.md):

```
.planning/phases/NN-name/research/
  00-brief.md                         # Research brief from ideation
  01-architecture-patterns.md         # Numbered research files (one per topic)
  02-implementation-approaches.md
  03-existing-solutions.md
  04-pitfalls-and-risks.md
  05-{deep-expand-topic}.md           # Deep expand additions start at 05+
  REVIEW-LOG.md                       # Review iteration history
  GRADUATION-REPORT.md                # Graduation results
```

Key conventions:

- **Phase-scoped**: Research lives under the phase directory, not in a global `.planning/research/` folder
- **Numbered files**: The numeric prefix defines reading order and matches researcher assignment
- **Flat structure**: No subdirectories within the research folder; deep expand files are numbered 05+ in the same directory
- **kebab-case**: File slugs follow project convention

---

## Enabling Parallel Research

Multi-file architecture is what makes parallel research possible. When research topics are independent, different agents can write to different files simultaneously without conflicts.

### Parallel Research Flow

```
Ideate Phase identifies 5 research topics:
  1. Auth token validation
  2. Database migration strategy
  3. Error handling patterns
  4. WebSocket configuration
  5. Rate limiting approaches

Research Phase (parallel):
  Agent A -----> auth-token-validation.md
  Agent B -----> database-migration-strategy.md
  Agent C -----> error-handling-patterns.md
  Agent D -----> bun-websocket-configuration.md
  Agent E -----> rate-limiting-approaches.md

  All 5 agents run simultaneously.
  No file conflicts because each writes to a different file.
  Wall-clock time = time of slowest researcher (not sum of all).
```

### Dependency Handling

Some research topics depend on others. For example, "WebSocket authentication" depends on "auth token validation." V2 handles this through sequencing:

```
Independent topics (parallel):
  Agent A: auth-token-validation.md
  Agent B: database-migration-strategy.md
  Agent C: error-handling-patterns.md

Dependent topics (after dependencies complete):
  Agent D: bun-websocket-configuration.md
           (loads auth-token-validation.md as input)
  Agent E: rate-limiting-approaches.md
           (loads bun-websocket-configuration.md as input)
```

The ideate phase identifies dependencies and sequences research accordingly. Independent topics run in Wave 1; dependent topics run in Wave 2, loading their dependencies as input files.

---

## The REVIEW-LOG Pattern

Every directory that goes through a review loop includes a REVIEW-LOG.md that tracks the history of review iterations.

### Structure

```markdown
# Review Log

## Iteration 1 (2026-03-22)

**Reviewer**: Cold reviewer (research-review agent)
**Files Reviewed**: 5 of 5
**Result**: 3 passed, 2 need revision

### Passed

- auth-token-validation.md (HIGH confidence confirmed)
- database-migration-strategy.md (HIGH confidence confirmed)
- error-handling-patterns.md (MEDIUM confidence confirmed)

### Revision Required

- bun-websocket-configuration.md
  - Issue: Claims `Bun.serve()` supports `websocket.perMessageDeflate` option.
    Could not verify this in Context7 docs. Please re-check.
  - Action: Re-research with explicit Context7 query for compression options.

- rate-limiting-approaches.md
  - Issue: Confidence marked MEDIUM but only one source cited.
    Needs corroboration or downgrade to LOW.
  - Action: Search for additional sources or downgrade confidence.

---

## Iteration 2 (2026-03-22)

**Reviewer**: Cold reviewer (research-review agent, fresh instance)
**Files Reviewed**: 2 of 2 (revised files only)
**Result**: 1 passed, 1 downgraded

### Passed

- bun-websocket-configuration.md (HIGH confidence confirmed after revision)
  - `perMessageDeflate` removed; compression handled at transport level
  - Updated with verified Context7 source

### Downgraded

- rate-limiting-approaches.md
  - Downgraded from MEDIUM to LOW
  - Only one community source found after additional research
  - Flagged: will not graduate to MuninnDB
  - Usable for this project with caution
```

### Why Track Review History

1. **Audit trail**: Anyone (human or agent) can see what was reviewed, what was flagged, and how issues were resolved.
2. **Pattern detection**: Over time, review logs reveal recurring issues (e.g., "researchers consistently inflate confidence for community-sourced findings").
3. **Graduation evidence**: The review log provides proof that a finding was independently verified before graduation.
4. **Process improvement**: Review logs feed into the learning capture phase -- patterns of review failure become MuninnDB engrams.

---

## File Lifecycle

Each file in the v2 architecture has a defined lifecycle:

```
                 +----------+
                 | Creation |
                 +----+-----+
                      |
                      v
              +-------+--------+
              | Initial Review |
              +-------+--------+
                      |
              +-------+-------+
              |               |
            PASS            FAIL
              |               |
              v               v
       +------+------+  +----+------+
       | Active Use  |  | Revision  |
       | (referenced |  | (re-write |
       |  by plan +  |  |  based on |
       |  executors) |  |  feedback) |
       +------+------+  +-----+-----+
              |                |
              |    (loops back to review)
              |
              v
       +------+------+
       | Graduation  |
       | (HIGH/MED   |
       |  -> MuninnDB|
       |  engram)    |
       +------+------+
              |
              v
       +------+------+
       | Archive     |
       | (retained   |
       |  in project |
       |  files for  |
       |  reference) |
       +-------------+
```

### Lifecycle Stages

**Creation**: A researcher writes the initial file. The file includes findings, confidence level, sources, and any caveats.

**Initial Review**: A cold reviewer evaluates the file. The review result goes into REVIEW-LOG.md.

**Active Use**: Files that pass review are referenced by the plan and loaded by executors. They are the ground truth for implementation.

**Revision**: Files that fail review are sent back to the researcher with feedback. The researcher revises and the file goes through review again.

**Graduation**: Files with HIGH or MEDIUM confidence findings have their key content stored as MuninnDB engrams for cross-session recall.

**Archive**: After the task completes, files remain in the project directory for reference. They are not deleted because they may be useful for future work in the same domain.

### File Versioning

Research files are iteratively revised during the review loop before being committed as a batch. Within the review loop, version tracking happens through REVIEW-LOG.md, which records what changed between iterations. Git commits happen after the review loop completes (i.e., the files are not committed after every revision -- they are committed once they reach their reviewed state). This does not mean git is avoided during research; it means files are treated as working drafts until the review loop closes.

---

## Each File Is Independently Verifiable

This is the property that makes multi-file architecture work with agent isolation.

### What "Independently Verifiable" Means

A file is independently verifiable if a reviewer can evaluate it without reading any other file in the directory. The file must contain:

1. **What was researched**: The question or topic.
2. **What was found**: The findings, with enough detail to evaluate.
3. **Where it was found**: Source citations with enough specificity to re-check.
4. **How confident we are**: Confidence level with justification.
5. **What the limitations are**: Caveats, version constraints, known gaps.

A reviewer should be able to pick up any single file, evaluate it, and produce a review verdict without knowing what other research exists.

### File Template

The canonical research file template is defined in [`02-research-system/research-file-structure.md`](../02-research-system/research-file-structure.md). The simplified version below illustrates the self-containment principle:

```markdown
# {Topic Title}

**Confidence**: HIGH | MEDIUM | LOW
**Sources**: {List of sources with URLs and versions}
**Reviewed**: Yes (iteration N) | No
**Last Updated**: {Date}

## Question

{What question does this research answer?}

## Findings

{Core findings, organized for clarity}

### Verified Pattern

{Code example or configuration from official sources}

### Key Constraints

{Limitations, version requirements, known edge cases}

## Sources

1. {Source 1: URL, type (Context7/official docs/community), version, date accessed}
2. {Source 2: ...}

## Caveats

{What this research does NOT cover, known gaps, risks}
```

### Why This Template Matters

The template enforces self-containment. A reviewer reading `bun-websocket-configuration.md` does not need to know about `auth-token-validation.md` to evaluate whether the WebSocket findings are correct. Each file stands alone.

This also means files can be reviewed in parallel. Five cold reviewers can evaluate five research files simultaneously because no file depends on another for comprehension.

---

## Practical Considerations

### When Files Are Too Small

A file that contains a single line ("Use Bun.serve() for the HTTP server") is not useful as a standalone context slot. It lacks the depth needed for an executor to implement anything. Minimum useful file size is approximately 100-200 lines.

If a finding is too small for a standalone file, it belongs in a broader file (e.g., "bun-api-patterns.md" that covers multiple related Bun APIs).

### When Files Are Too Large

A file that exceeds 500-600 lines is approaching the point where loading it consumes significant context budget. If a file grows beyond this range, consider splitting it:

- **Split by sub-topic**: If `database-strategy.md` covers both migration and query optimization, split into `database-migration.md` and `database-query-optimization.md`.
- **Split by depth**: If the file has a summary and deep-dive, keep the summary in the main file and link to a deep-dive companion file.

### File Count Trade-Offs

| Concern           | Fewer Files                  | More Files                         |
| ----------------- | ---------------------------- | ---------------------------------- |
| Navigation        | Easier to browse             | Requires index file                |
| Context loading   | More wasted context per load | More precise context per load      |
| Parallel research | Fewer parallel agents        | More parallel agents               |
| Review overhead   | Fewer review cycles          | More review cycles                 |
| Coherence         | Natural narrative flow       | Requires explicit cross-references |

The sweet spot for a COMPLEX task is typically 5-10 research files. MODERATE tasks might have 2-4. TRIVIAL/SIMPLE tasks still run the research phase (all steps run at all complexity levels) but typically produce 1-2 files with reduced depth.

### Cross-File References

When one file references another (e.g., "See `auth-token-validation.md` for the JWT verification approach"), the reference should be:

- **Explicit**: Use the file path, not a vague description.
- **Optional**: The referencing file should be understandable without the referenced file.
- **Directional**: Reference should explain what the other file provides, so the reader can decide whether to load it.

```markdown
## Authentication During WebSocket Upgrade

For JWT token validation during the upgrade handshake, this implementation
follows the pattern documented in `auth-token-validation.md` (HIGH confidence,
verified against Context7). The key constraint: tokens must be passed via
the `Sec-WebSocket-Protocol` header, not query parameters.
```

The reader knows what the referenced file covers and what the key finding is, without needing to load it.

---

## Key Takeaways

1. **Many small files beat one large document** because agents can load exactly what they need. Context budget is spent on relevant information, not noise.

2. **Directory structure is the table of contents.** An index file provides navigation, but the file names themselves should be descriptive enough to understand the content without opening them.

3. **Each file must be independently verifiable.** A reviewer should be able to evaluate any single file without reading the rest of the directory.

4. **Parallel research requires file-per-concern.** Independent agents writing to independent files eliminates conflicts and enables concurrent work.

5. **The REVIEW-LOG tracks review history.** It provides an audit trail, enables pattern detection, and supports the graduation decision.

6. **File lifecycle is explicit**: creation, review, active use, graduation, archive. Every file's current status should be visible in the index.

7. **File size has a sweet spot.** Too small (< 100 lines) and it lacks useful depth. Too large (> 500 lines) and it wastes context budget. Target 150-400 lines per file.

8. **This document focuses on research files.** Implementation tracking files (per-task notes, implementation review logs) follow similar principles but are specified in [`01-workflow-steps/`](../01-workflow-steps/README.md) under the Execute and Verify steps.

---

## Related Documents

- [README.md](README.md) -- How multi-file architecture connects to other v2 principles
- [context-rot-prevention.md](context-rot-prevention.md) -- Files as external memory for context rot prevention
- [grounded-decisions.md](grounded-decisions.md) -- How research files are produced with verified content
- [agent-isolation-patterns.md](agent-isolation-patterns.md) -- How file boundaries enable cold review isolation
