# Tag Vocabulary: Cognition Domain Tags

> Formal reference for the domain tag system used in MEMORY.md entries and per-agent cognition configuration.
> Created as part of Plan 15-03 (Phase 15: Cognition Per-Agent Audit).

## Overview

Domain tags provide coarse-grained categorization for MEMORY.md entries, enabling tag-based selective recall in lu-cognition. Tags describe the **domain** of knowledge, not specific content. Keyword scoring within lu-cognition handles specificity; tags handle domain filtering.

**Key principles:**

- Tags are broad domain categories, not fine-grained keywords
- Each MEMORY.md entry gets 1-3 tags
- Agents declare which tags they care about via `memory_tags` in their cognition config
- Entries without tags are included in ALL agent recalls (legacy backward compatibility)

## Tag Definitions

| Tag            | Domain                                   | Matches Entries About                                        |
| -------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `coding`       | Code patterns, implementation approaches | Implementation techniques, code structure, refactoring       |
| `patterns`     | Validated development patterns           | Proven approaches, architectural patterns, design patterns   |
| `pitfalls`     | Known issues and gotchas                 | Bugs encountered, failure modes, things that break           |
| `conventions`  | Project conventions                      | Naming, formatting, API conventions, coding standards        |
| `architecture` | System design and structure              | Component design, layering, module boundaries                |
| `planning`     | Plan structure and validation            | Wave structure, plan-checker findings, dependency management |
| `verification` | Testing and verification                 | Verification pipeline, signal tiers, quality gates           |
| `testing`      | Test patterns and tooling                | Test frameworks, test strategies, bun test patterns          |
| `debugging`    | Bug investigation patterns               | Debug strategies, root cause analysis, hypothesis testing    |
| `stack`        | Technology choices                       | Bun, TypeScript, framework decisions, library selection      |
| `security`     | Security patterns and concerns           | Input validation, credential handling, injection prevention  |
| `performance`  | Performance optimization                 | Startup time, bundle size, lazy loading, caching             |
| `decisions`    | Architectural decisions                  | Past choices with rationale, trade-off analysis              |
| `complexity`   | Complexity gating system                 | Tier mapping, gating rules, agent scaling                    |

## Detailed Tag Descriptions

### `coding`

Code-level patterns and implementation approaches. Covers how code is written, structured, and organized at the function/module level.

**Example entries:**

- "Zod safeParse at API boundaries"
- "Dual-package CLI pattern"
- "Factory functions over classes"

**Typical agents:** lu-executor, code-developer

### `patterns`

Validated development patterns that have been proven to work. Higher-level than `coding` -- describes repeatable approaches and architectural recipes.

**Example entries:**

- "Wave-based parallelization"
- "Registry pattern for diverse toolchains"
- "Metadata-driven configuration"

**Typical agents:** lu-executor, lu-planner, lu-cognition

### `pitfalls`

Known issues, gotchas, and failure modes. Things that have gone wrong and should be avoided in the future.

**Example entries:**

- "`|| true` swallows exit codes"
- "Bun.spawn has no built-in timeout"
- "Registry entries are class constructors not instances"

**Typical agents:** lu-debugger, lu-executor, lu-verifier

### `conventions`

Project-level conventions and standards. Naming patterns, formatting rules, API conventions.

**Example entries:**

- "No raw JSON.parse on external data"
- "YAML generation via js-yaml"
- "kebab-case for all file names"

**Typical agents:** lu-executor, lu-pr-reviewer

### `architecture`

System-level design decisions and structural patterns. How components relate, layering, module boundaries.

**Example entries:**

- "Template architecture separation"
- "Layered verification pipeline"
- "Agent compiler output separation"

**Typical agents:** lu-planner, lu-phase-researcher, code-architect

### `planning`

Plan structure, wave grouping, dependency management, and plan validation patterns.

**Example entries:**

- "Wave restructuring from dependency analysis"
- "Plan-checker bug prevention"
- "Phase boundary verification"

**Typical agents:** lu-planner, lu-plan-checker

### `verification`

Verification and quality assurance patterns. The verification pipeline, signal tiers, quality gates.

**Example entries:**

- "Verification signal taxonomy (T1-T4)"
- "Specification anchoring via additive steps"
- "Harness/hook boundary"

**Typical agents:** lu-verifier, lu-executor

### `testing`

Test patterns, frameworks, and tooling. How tests are written, organized, and run.

**Example entries:**

- "bun test patterns"
- "Parser registry for diverse toolchains"
- "Test file naming conventions"

**Typical agents:** lu-verifier, lu-debugger

### `debugging`

Bug investigation patterns, root cause analysis techniques, and hypothesis-driven debugging.

**Example entries:**

- "Memory-aided debugging"
- "Hypothesis testing workflow"
- "Error pattern recognition"

**Typical agents:** lu-debugger

### `stack`

Technology choices and tooling decisions. Framework selection, library evaluation, runtime behavior.

**Example entries:**

- "UnJS ecosystem for CLI"
- "Bun.spawn quirks"
- "Bun vs Node.js differences"

**Typical agents:** lu-phase-researcher, lu-executor

### `security`

Security patterns, input validation, credential handling, and injection prevention.

**Example entries:**

- "EJS restriction"
- "Credential sanitization"
- "Input validation at boundaries"

**Typical agents:** security-auditor, lu-executor

### `performance`

Performance optimization patterns, lazy loading, caching, bundle size management.

**Example entries:**

- "Surgical performance optimization"
- "Lazy loading patterns"
- "Build output caching"

**Typical agents:** performance-auditor, lu-executor

### `decisions`

Architectural and design decisions with rationale. Trade-off analysis and choice documentation.

**Example entries:**

- "Specification anchoring vs goal drift"
- "5-level complexity with 3 behavioral tiers"
- "Metadata registry over class registry"

**Typical agents:** lu-planner, lu-cognition

### `complexity`

The complexity gating system itself. Tier mapping, gating rules, agent scaling, promotion logic.

**Example entries:**

- "N-level to M-tier compression"
- "Self-gating agents via always-apply rules"
- "Complexity-driven tier promotion"

**Typical agents:** lu-router, lu-cognition

## Guidelines for lu-learner

When assigning tags to new MEMORY.md entries, follow these rules:

### Tag Count

- **Assign 1-3 tags per entry** (prefer fewer, more relevant tags)
- Most entries need only 1-2 tags
- Use 3 tags only when an entry genuinely spans multiple domains

### Tag Selection

1. **Use existing vocabulary first** -- always check the 14 defined tags above before proposing a new tag
2. **Tags describe the DOMAIN**, not the specific content. "Bun.spawn timeout" is tagged `[stack, pitfalls]`, not `[bun, spawn, timeout]`
3. **Match the knowledge type**, not just the topic:
   - A coding pattern about security gets `[coding, security]`
   - A decision about testing framework gets `[decisions, testing]`
   - A pitfall in the build system gets `[pitfalls, stack]`

### Cross-Domain Entries

Entries can belong to multiple domains. Common combinations:

| Entry Type                        | Typical Tags                |
| --------------------------------- | --------------------------- |
| Implementation pattern            | `[coding, patterns]`        |
| Security implementation pattern   | `[security, patterns]`      |
| Architecture decision             | `[architecture, decisions]` |
| Test framework pitfall            | `[testing, pitfalls]`       |
| Build/tooling decision            | `[stack, decisions]`        |
| Verification pattern              | `[verification, patterns]`  |
| Performance optimization approach | `[performance, coding]`     |

### Proposing New Tags

If no existing tag fits an entry's domain:

1. **Verify the entry genuinely falls outside all 14 tags** -- most entries fit somewhere
2. **Propose a new tag** with a clear domain description
3. **Include justification** in the entry's notes
4. **New tags should be as broad as existing tags** -- no fine-grained tags like `bun-testing` or `zod-validation`

The tag vocabulary is intentionally small (14 tags). Keyword scoring inside lu-cognition handles fine-grained matching. Tags only need to get entries into the right domain bucket.

### Example Tagged Entry

```markdown
#### Zod safeParse at API boundaries

- **Pattern**: Replace `as TypeName` casts with `zodSchema.safeParse()`
- **When to use**: Any external API response parsing
- **Agent**: executor
- **Relevant to**: [executor, verifier]
- **Tags**: [coding, patterns, security]
- **Confidence**: High
- **Added**: 2026-02-10
```

## Agent-to-Tag Mapping

Reference table showing which agents declare interest in which tags:

| Agent                   | Memory Tags                                         |
| ----------------------- | --------------------------------------------------- |
| lu-cognition            | `["*"]` (all tags -- wildcard)                      |
| lu-debugger             | `["debugging", "pitfalls", "testing"]`              |
| lu-learner              | `["patterns", "decisions", "pitfalls"]`             |
| lu-router               | `["architecture", "complexity"]`                    |
| lu-executor             | `["coding", "patterns", "pitfalls", "conventions"]` |
| lu-planner              | `["architecture", "planning", "decisions"]`         |
| lu-verifier             | `["verification", "pitfalls", "testing"]`           |
| lu-phase-researcher     | `["stack", "architecture"]`                         |
| lu-plan-checker         | `["planning", "pitfalls"]`                          |
| lu-pr-reviewer          | `["conventions", "patterns"]`                       |
| lu-project-researcher   | `[]` (T0 -- no recall)                              |
| lu-research-synthesizer | `[]` (T0 -- no recall)                              |
| lu-roadmapper           | `[]` (T0 -- no recall)                              |
| lu-integration-checker  | `[]` (T0 -- no recall)                              |
| lu-codebase-mapper      | `[]` (T0 -- no recall)                              |
| code-architect          | `[]` (T0 -- no recall)                              |
| code-developer          | `[]` (T0 -- no recall)                              |
| code-simplifier         | `[]` (T0 -- no recall)                              |
| dx-advocate             | `[]` (T0 -- no recall)                              |
| performance-auditor     | `[]` (T0 -- no recall)                              |
| security-auditor        | `[]` (T0 -- no recall)                              |
| product                 | `[]` (T0 -- no recall)                              |
| qa-plan-generator       | `[]` (T0 -- no recall)                              |
| ui                      | `[]` (T0 -- no recall)                              |
| ux                      | `[]` (T0 -- no recall)                              |

## Backward Compatibility

- **Entries without a `Tags:` field** are included in ALL agent recalls regardless of the agent's `memory_tags` configuration
- This ensures existing MEMORY.md entries are not lost during the migration period
- As lu-learner adds tags to new entries and existing entries are retroactively tagged, the tag-based filtering becomes more precise over time

---

_Created: 2026-02-11_
_Plan: 15-03 (Cognition Agent & Tag System)_
_Phase: 15 (Cognition Per-Agent Audit)_
