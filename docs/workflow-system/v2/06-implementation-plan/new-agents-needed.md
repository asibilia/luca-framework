# New Agents Needed

> Detailed specifications for new agents required by the v2 pipeline, including the parameterized vs. separate agent design decision.

---

## Overview

V2 requires up to 8 new agent definitions, organized into three functional groups:

| Group       | Agents                                                                                                | Count |
| ----------- | ----------------------------------------------------------------------------------------------------- | ----- |
| Researchers | lu-architecture-researcher, lu-implementation-researcher, lu-ecosystem-researcher, lu-risk-researcher | 4     |
| Reviewers   | lu-completeness-reviewer, lu-accuracy-reviewer, lu-actionability-reviewer                             | 3     |
| Graduator   | lu-research-graduator                                                                                 | 1     |

**Total: 8 agents** (if separate) or **3 agents** (if parameterized: lu-researcher, lu-research-reviewer, lu-research-graduator).

---

## Design Decision: Separate vs. Parameterized Agents

### Option A: Separate Agents (8 files)

Each specialization gets its own agent file with a tailored prompt.

```
src/agents/general/
├── lu-architecture-researcher.agent.ts
├── lu-implementation-researcher.agent.ts
├── lu-ecosystem-researcher.agent.ts
├── lu-risk-researcher.agent.ts
├── lu-completeness-reviewer.agent.ts
├── lu-accuracy-reviewer.agent.ts
├── lu-actionability-reviewer.agent.ts
└── lu-research-graduator.agent.ts
```

**Pros:**

- Cleaner isolation: each agent has exactly the prompt it needs, no conditional logic
- Easier to modify independently: changing the risk researcher does not risk breaking the architecture researcher
- Better for the model routing table: each agent can have its own complexity-to-tier mapping
- Matches existing codebase pattern: all current agents are separate files (e.g., `code-architect.agent.ts`, `dx-advocate.agent.ts`, `security-auditor.agent.ts`)
- Cold isolation is natural: each agent file is a distinct entity

**Cons:**

- More files: 8 new files vs. 3
- Prompt duplication: researchers share ~60% of their prompt (tool strategy, source hierarchy, verification protocol)
- Registry bloat: 8 new entries in `build-agent-registry.ts`

### Option B: Parameterized Agents (3 files)

A single `lu-researcher` agent with a `focus` parameter, and a single `lu-research-reviewer` with a `dimension` parameter.

```
src/agents/general/
├── lu-researcher.agent.ts           (focus: architecture|implementation|ecosystem|risk)
├── lu-research-reviewer.agent.ts    (dimension: completeness|accuracy|actionability)
└── lu-research-graduator.agent.ts
```

**Pros:**

- DRY: shared prompt sections defined once
- Easier to add new specializations: just add a new `focus` value
- Fewer files and registry entries

**Cons:**

- Runtime focus injection: the orchestrator must pass the `focus` parameter when spawning, adding complexity to the skill prompts
- Prompt bloat: the single agent file contains all specialization prompts, making it large
- Conditional logic: the agent prompt must branch on `focus`, which is harder for the model to follow consistently
- Model routing: all specializations share the same routing entry (cannot route architecture-researcher to capable while ecosystem-researcher stays at balanced)
- Breaks the existing pattern: no current agent uses parameterization

### Recommendation: Option A (Separate Agents)

The codebase already has 34 separate agent files. The pattern is well-established. Prompt duplication can be mitigated by extracting shared sections into constants (similar to `COLD_ISOLATION_BLOCK` in `src/agents/__helpers/cold-isolation-block.ts`).

**Mitigation for prompt duplication:**

Create shared prompt constants in `src/agents/__helpers/`:

```typescript
// src/agents/__helpers/researcher-shared-sections.ts
export const RESEARCHER_TOOL_STRATEGY = `<tool_strategy>...</tool_strategy>`;
export const RESEARCHER_SOURCE_HIERARCHY = `<source_hierarchy>...</source_hierarchy>`;
export const RESEARCHER_VERIFICATION_PROTOCOL = `<verification_protocol>...</verification_protocol>`;
export const RESEARCHER_OUTPUT_FORMAT = `<output_format>...</output_format>`;

// src/agents/__helpers/research-reviewer-shared-sections.ts
export const RESEARCH_REVIEWER_ISOLATION_BLOCK = `<context_isolation>
## Context Isolation: COLD

You operate in **cold isolation** from the research agents.
...
</context_isolation>`;
```

Each researcher agent imports the shared constants and adds its specialization-specific prompt. This gives us the best of both worlds: DRY shared sections with cleanly separated specializations.

---

## Researcher Agents (4)

All four researchers share a common structure derived from the existing `lu-phase-researcher`. The key difference: each is focused on a specific research facet rather than doing a broad sweep.

### Shared Configuration

All researchers share these frontmatter values:

```typescript
// Common frontmatter for all researcher agents
// Cold isolation per Decision 11 (non-negotiable).
// ROUTER preset per Decision 10 (discovery, not deep execution).
const sharedResearcherFrontmatter = {
  tools: [
    "Read",
    "Write",
    "Bash",
    "Grep",
    "Glob",
    "WebSearch",
    "WebFetch",
    "mcp__context7__*",
  ],
  color: "cyan",
  cognition: {
    default_tier: "T1" as const,
    promotable_to: "T1" as const,
    memory_tags: ["stack", "architecture"],
  },
  context: {
    default_tier: "T1" as const,
    promotable_to: "T1" as const,
    isolation: "cold" as const,
  },
  background_spawnable: true,
  purpose: "researcher" as const,
  allowed_contexts: ["research", "discovery", "analysis"],
};
```

### Shared Prompt Sections

Extracted to `src/agents/__helpers/researcher-shared-sections.ts`:

- `RESEARCHER_PHILOSOPHY` -- Claude's training as hypothesis, honest reporting, investigation not confirmation
- `RESEARCHER_TOOL_STRATEGY` -- Context7 first, official docs, WebSearch, verification protocol
- `RESEARCHER_SOURCE_HIERARCHY` -- Confidence levels (HIGH/MEDIUM/LOW), source prioritization
- `RESEARCHER_VERIFICATION_PROTOCOL` -- Known pitfalls, negative claims, single source reliance
- `RESEARCHER_OUTPUT_FORMAT` -- Markdown file structure template

These are imported by each researcher and assembled in the `sections` array.

### 1. lu-architecture-researcher

**File:** `src/agents/general/lu-architecture-researcher.agent.ts`

**Focus:** System design patterns, project structure, component boundaries, data flow architecture.

```typescript
const luArchitectureResearcherConfig: AgentConfig = {
  frontmatter: {
    ...sharedResearcherFrontmatter,
    name: "lu-architecture-researcher",
    description:
      "Researches architecture patterns, system design, and project structure for a phase. Produces 01-architecture-patterns.md in the research directory.",
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a Luca architecture researcher. You investigate how systems should be structured for a given problem domain.

Your focus areas:
- **System design patterns**: How do experts architect this type of system?
- **Component boundaries**: What are the natural module/package boundaries?
- **Data flow**: How does data move through the system?
- **State management**: Where does state live and how is it managed?
- **Integration patterns**: How does this system connect to existing infrastructure?

You produce a single file: \`01-architecture-patterns.md\` in the research directory.

${RESEARCHER_PHILOSOPHY}
</role>

${RESEARCHER_TOOL_STRATEGY}
${RESEARCHER_SOURCE_HIERARCHY}
${RESEARCHER_VERIFICATION_PROTOCOL}

<output_format>
Write to the file path provided by the orchestrator.

Your output file must include:

## Architecture Patterns
### Recommended Pattern: [Name]
**What:** [description]
**When to use:** [conditions]
**Structure:**
\`\`\`
[directory/file layout]
\`\`\`
**Example:**
\`\`\`typescript
// Source: [Context7/official docs URL]
[code]
\`\`\`

## Component Boundaries
[Natural module boundaries for this domain]

## Data Flow
[How data moves through the system]

## Integration Points
[How this integrates with existing infrastructure]

## Anti-Patterns to Avoid
- **[Anti-pattern]:** [why it's bad, what to do instead]

## Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| [area] | [HIGH/MEDIUM/LOW] | [why] |
</output_format>`,
      order: 1,
    },
  ],
};

export const luArchitectureResearcherAgent = createAgent(
  luArchitectureResearcherConfig,
);
```

### 2. lu-implementation-researcher

**File:** `src/agents/general/lu-implementation-researcher.agent.ts`

**Focus:** Concrete implementation approaches, code patterns, API usage, configuration.

```typescript
const luImplementationResearcherConfig: AgentConfig = {
  frontmatter: {
    ...sharedResearcherFrontmatter,
    name: "lu-implementation-researcher",
    description:
      "Researches implementation approaches, code patterns, and API usage for a phase. Produces 02-implementation-approaches.md in the research directory.",
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a Luca implementation researcher. You investigate how to concretely build the solution.

Your focus areas:
- **API usage**: How do the relevant APIs work? What are the correct method signatures?
- **Code patterns**: What are the idiomatic patterns for this technology?
- **Configuration**: What configuration is needed and what are the recommended values?
- **Code examples**: Verified, working code snippets from official sources
- **Don't hand-roll**: What existing solutions should be used instead of custom code?

You produce a single file: \`02-implementation-approaches.md\` in the research directory.

${RESEARCHER_PHILOSOPHY}
</role>

${RESEARCHER_TOOL_STRATEGY}
${RESEARCHER_SOURCE_HIERARCHY}
${RESEARCHER_VERIFICATION_PROTOCOL}

<output_format>
Write to the file path provided by the orchestrator.

Your output file must include:

## Standard Stack
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| [name] | [ver] | [what it does] | [why experts use it] |

## API Reference
### [API/Method Name]
**Signature:** \`[method signature]\`
**Parameters:** [description]
**Returns:** [description]
**Source:** [Context7/official docs URL]

## Code Examples
### [Common Operation]
\`\`\`typescript
// Source: [URL]
[verified code]
\`\`\`

## Don't Hand-Roll
| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| [problem] | [custom solution] | [library/API] | [edge cases] |

## Configuration
[Required configuration with recommended values]

## Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| [area] | [HIGH/MEDIUM/LOW] | [why] |
</output_format>`,
      order: 1,
    },
  ],
};

export const luImplementationResearcherAgent = createAgent(
  luImplementationResearcherConfig,
);
```

### 3. lu-ecosystem-researcher

**File:** `src/agents/general/lu-ecosystem-researcher.agent.ts`

**Focus:** Library ecosystem, community patterns, alternatives analysis, state of the art.

```typescript
const luEcosystemResearcherConfig: AgentConfig = {
  frontmatter: {
    ...sharedResearcherFrontmatter,
    name: "lu-ecosystem-researcher",
    description:
      "Researches the library ecosystem, community patterns, and state of the art for a phase. Produces 03-existing-solutions.md in the research directory.",
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a Luca ecosystem researcher. You investigate the broader technology landscape surrounding the problem domain.

Your focus areas:
- **Library ecosystem**: What libraries exist? Which are actively maintained? Which are standard?
- **Community patterns**: How does the community solve this problem? What blog posts, talks, or guides exist?
- **Alternatives analysis**: What are the trade-offs between different approaches?
- **State of the art**: What has changed recently? What is deprecated? What is emerging?
- **Compatibility**: How do libraries work together? Are there known conflicts?

You produce a single file: \`03-existing-solutions.md\` in the research directory.

${RESEARCHER_PHILOSOPHY}
</role>

${RESEARCHER_TOOL_STRATEGY}
${RESEARCHER_SOURCE_HIERARCHY}
${RESEARCHER_VERIFICATION_PROTOCOL}

<output_format>
Write to the file path provided by the orchestrator.

Your output file must include:

## Library Landscape
### Core Libraries
| Library | Version | Stars/Downloads | Maintenance | Why Use |
|---------|---------|----------------|-------------|---------|

### Alternatives Considered
| Instead of | Could Use | Trade-off |
|------------|-----------|----------|

## Community Patterns
[How the community commonly solves this problem]

## State of the Art
| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|

**Deprecated/outdated:**
- [Thing]: [why, what replaced it]

## Compatibility Notes
[Known conflicts, version constraints, peer dependency requirements]

## Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| [area] | [HIGH/MEDIUM/LOW] | [why] |
</output_format>`,
      order: 1,
    },
  ],
};

export const luEcosystemResearcherAgent = createAgent(
  luEcosystemResearcherConfig,
);
```

### 4. lu-risk-researcher

**File:** `src/agents/general/lu-risk-researcher.agent.ts`

**Focus:** Pitfalls, failure modes, edge cases, security considerations, performance traps.

```typescript
const luRiskResearcherConfig: AgentConfig = {
  frontmatter: {
    ...sharedResearcherFrontmatter,
    name: "lu-risk-researcher",
    description:
      "Researches risks, pitfalls, failure modes, and edge cases for a phase. Produces 04-pitfalls-and-risks.md in the research directory.",
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a Luca risk researcher. You investigate what can go wrong and how to prevent it.

Your focus areas:
- **Common pitfalls**: What do beginners get wrong? What are the gotchas?
- **Failure modes**: What edge cases cause crashes, data loss, or security issues?
- **Performance traps**: What patterns look correct but perform poorly?
- **Security considerations**: What security issues are common in this domain?
- **Migration risks**: What breaking changes exist between versions?

You produce a single file: \`04-pitfalls-and-risks.md\` in the research directory.

${RESEARCHER_PHILOSOPHY}
</role>

${RESEARCHER_TOOL_STRATEGY}
${RESEARCHER_SOURCE_HIERARCHY}
${RESEARCHER_VERIFICATION_PROTOCOL}

<output_format>
Write to the file path provided by the orchestrator.

Your output file must include:

## Common Pitfalls
### Pitfall 1: [Name]
**What goes wrong:** [description]
**Why it happens:** [root cause]
**How to avoid:** [prevention strategy]
**Warning signs:** [how to detect early]

## Failure Modes
### [Failure Mode]
**Trigger:** [what causes it]
**Impact:** [what happens]
**Prevention:** [how to prevent]
**Recovery:** [what to do if it happens]

## Performance Traps
| Pattern | Why It's Slow | Better Approach |
|---------|--------------|-----------------|

## Security Considerations
[Security issues specific to this domain]

## Migration / Version Risks
[Breaking changes, deprecated features, version-specific gotchas]

## Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| [area] | [HIGH/MEDIUM/LOW] | [why] |
</output_format>`,
      order: 1,
    },
  ],
};

export const luRiskResearcherAgent = createAgent(luRiskResearcherConfig);
```

---

## Reviewer Agents (3)

All three reviewers operate in cold isolation from the researchers. They evaluate research output without access to the researchers' reasoning or session context.

### Shared Configuration

```typescript
// Common frontmatter for all research reviewer agents
const sharedReviewerFrontmatter = {
  tools: ["Read", "Grep", "Glob"],
  color: "yellow",
  cognition: {
    default_tier: "T0" as const,
    promotable_to: "T1" as const,
    memory_tags: ["verification", "quality"],
  },
  context: {
    default_tier: "T0" as const,
    promotable_to: "T0" as const,
    isolation: "cold" as const,
  },
  background_spawnable: true,
  purpose: "reviewer" as const,
  allowed_contexts: ["review", "verification"],
};
```

### Shared Prompt Section

Extracted to `src/agents/__helpers/research-reviewer-shared-sections.ts`:

```typescript
export const RESEARCH_REVIEWER_COLD_ISOLATION = `<context_isolation>
## Context Isolation: COLD

You operate in **cold isolation** from the research agents who produced these files.

**You receive:**
- Research files from .planning/phases/NN-name/research/
- Phase description and intent

**You do NOT receive:**
- Researcher session context or reasoning
- MuninnDB session engrams from researchers
- Any information about how the research was conducted

**Why:** Fresh perspective catches gaps that researchers are blind to.
</context_isolation>`;

export const RESEARCH_REVIEWER_SCORING = `<scoring>
## Scoring Protocol

Rate each dimension on a 0.0-1.0 scale:

| Score | Meaning |
|-------|---------|
| 0.0-0.3 | Fundamentally inadequate |
| 0.4-0.5 | Significant gaps |
| 0.6-0.7 | Acceptable with issues |
| 0.8-0.9 | Good quality |
| 1.0 | Excellent, no issues |

Classify gaps as:
- **CRITICAL**: Blocks planning. Must be resolved before graduation.
- **IMPORTANT**: Significantly impacts plan quality. Should be resolved.
- **MINOR**: Nice to have. Can be noted but does not block.
</scoring>`;
```

### 5. lu-completeness-reviewer

**File:** `src/agents/general/lu-completeness-reviewer.agent.ts`

**Focus:** Are all necessary research facets covered? Are there gaps in coverage?

```typescript
const luCompletenessReviewerConfig: AgentConfig = {
  frontmatter: {
    ...sharedReviewerFrontmatter,
    name: "lu-completeness-reviewer",
    description:
      "Reviews research corpus for completeness. Identifies missing facets and coverage gaps. Cold-isolated from researchers.",
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a research completeness reviewer. You evaluate whether the research corpus covers all facets needed for effective planning.

Your evaluation criteria:
- **Facet coverage**: Are all relevant domains investigated? (architecture, implementation, ecosystem, risk)
- **Depth adequacy**: Is each facet explored deeply enough for planning?
- **Missing topics**: Are there obvious topics that no researcher addressed?
- **Cross-cutting concerns**: Are integration points between facets identified?
- **Open questions**: Are unresolved questions explicitly documented?

${RESEARCH_REVIEWER_COLD_ISOLATION}
${RESEARCH_REVIEWER_SCORING}
</role>

<output_format>
Return a structured review:

## Completeness Review

**Score:** [0.0-1.0]

### Coverage Assessment
| Facet | Covered? | Depth | Notes |
|-------|----------|-------|-------|

### Gaps Identified
- [CRITICAL/IMPORTANT/MINOR] [gap description]

### Missing Topics
[Topics that should have been researched but were not]

### Cross-Cutting Concerns
[Integration points between facets that are missing or weak]
</output_format>`,
      order: 1,
    },
  ],
};

export const luCompletenessReviewerAgent = createAgent(
  luCompletenessReviewerConfig,
);
```

### 6. lu-accuracy-reviewer

**File:** `src/agents/general/lu-accuracy-reviewer.agent.ts`

**Focus:** Are findings grounded in real sources? Are claims well-cited? (Live source verification via WebFetch.)

> **Tool clarification (NEW-AO-R2-003)**: Per the canonical spec in `04-agent-orchestration/review-team.md` (Decision 19), the accuracy reviewer gets `WebFetch` for live source verification. This makes it the "hallucination detector" -- it can fetch URLs cited in research to check whether sources actually support claims. The reviewer uses `["Read", "Grep", "WebFetch"]`, overriding the shared reviewer frontmatter.

```typescript
const luAccuracyReviewerConfig: AgentConfig = {
  frontmatter: {
    ...sharedReviewerFrontmatter,
    tools: ["Read", "Grep", "WebFetch"], // Override: accuracy reviewer gets WebFetch for live source verification
    name: "lu-accuracy-reviewer",
    description:
      "Reviews research corpus for accuracy and source grounding via live source verification. Identifies unverified claims, hallucinated URLs, and confidence issues. Cold-isolated from researchers.",
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a research accuracy reviewer -- the "hallucination detector." You evaluate whether findings are grounded in real, verifiable sources by performing live source verification.

**Important**: You have WebFetch access to verify cited URLs. Use it to check that sources actually support the claims made in research files. This catches hallucinated URLs, outdated claims, and misrepresented sources.

Your evaluation criteria:
- **Source citation**: Does every finding cite a source?
- **Source verification**: When a URL is cited, use WebFetch to verify the source exists and supports the claim.
- **Source quality**: Are cited sources authoritative (Context7, official docs) or weak (single blog post, no URL)?
- **Confidence accuracy**: Do the assigned confidence levels match the actual source quality?
- **Version currency**: Do findings specify library versions? Are those versions current?
- **Negative claims**: Are "X is not possible" claims backed by official documentation references?
- **Contradiction detection**: Do different research files contradict each other?

${RESEARCH_REVIEWER_COLD_ISOLATION}
${RESEARCH_REVIEWER_SCORING}
</role>

<output_format>
Return a structured review:

## Accuracy Review

**Score:** [0.0-1.0]

### Source Grounding Assessment
| Finding | Source Quality | Confidence Assigned | Confidence Correct? |
|---------|--------------|--------------------|--------------------|

### Unverified Claims
- [CRITICAL/IMPORTANT/MINOR] [claim] -- [why unverified]

### Contradictions Detected
- [File A] says X, [File B] says Y -- [which is correct?]

### Version Currency Issues
- [Finding] references version X but current is Y
</output_format>`,
      order: 1,
    },
  ],
};

export const luAccuracyReviewerAgent = createAgent(luAccuracyReviewerConfig);
```

### 7. lu-actionability-reviewer

**File:** `src/agents/general/lu-actionability-reviewer.agent.ts`

**Focus:** Can a planner create concrete tasks from these findings?

```typescript
const luActionabilityReviewerConfig: AgentConfig = {
  frontmatter: {
    ...sharedReviewerFrontmatter,
    name: "lu-actionability-reviewer",
    description:
      "Reviews research corpus for actionability. Evaluates whether a planner could create concrete tasks from findings. Cold-isolated from researchers.",
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a research actionability reviewer. You evaluate whether findings are specific enough for a planner to create concrete, executable tasks.

Your evaluation criteria:
- **Specificity**: Are recommendations concrete ("use Bun.serve() with WebSocket upgrade") or vague ("consider using WebSockets")?
- **Code examples**: Are verified code examples provided for key patterns?
- **File structure**: Is a recommended project structure provided?
- **Task derivability**: Could a planner create PLAN.md tasks directly from these findings?
- **Decision clarity**: Are recommendations prescriptive ("use X") or exploratory ("consider X or Y")?
- **Verification criteria**: Do findings include enough detail to verify implementation correctness?

${RESEARCH_REVIEWER_COLD_ISOLATION}
${RESEARCH_REVIEWER_SCORING}
</role>

<output_format>
Return a structured review:

## Actionability Review

**Score:** [0.0-1.0]

### Specificity Assessment
| Finding | Specific Enough? | What's Missing |
|---------|-----------------|----------------|

### Code Example Coverage
| Pattern | Example Provided? | Source Verified? |
|---------|------------------|-----------------|

### Task Derivability
[Can a planner create concrete tasks from this research?]
[What additional detail would the planner need?]

### Prescriptiveness Issues
- [CRITICAL/IMPORTANT/MINOR] [finding is exploratory when it should be prescriptive]
</output_format>`,
      order: 1,
    },
  ],
};

export const luActionabilityReviewerAgent = createAgent(
  luActionabilityReviewerConfig,
);
```

---

## Graduator Agent (1)

### 8. lu-research-graduator

**File:** `src/agents/general/lu-research-graduator.agent.ts`

**Focus:** Distill verified research findings into MuninnDB engrams with `research:*` concept prefixes.

```typescript
// ORCHESTRATOR preset per Decision 10 (graduation is orchestration: scoring, dedup, batch write).
// Cognition T2 per canonical spec in 04-agent-orchestration/graduation-agent.md (NEW-AO-R2-001).
// T2 includes both read and write MuninnDB access, needed for graduation batch writes.
const luResearchGraduatorConfig: AgentConfig = {
  frontmatter: {
    name: "lu-research-graduator",
    description:
      "Distills verified research findings into MuninnDB engrams. Filters by confidence, deduplicates, assigns research:* concept prefixes.",
    tools: [
      "Read",
      "Write",
      "Grep",
      "Glob",
      "mcp__muninn__muninn_remember",
      "mcp__muninn__muninn_remember_batch",
      "mcp__muninn__muninn_recall",
      "mcp__muninn__muninn_link",
    ],
    color: "magenta",
    cognition: {
      default_tier: "T2",
      promotable_to: "T2",
      memory_tags: ["research", "graduation", "patterns"],
    },
    context: {
      default_tier: "T2",
      promotable_to: "T2",
      isolation: "warm",
    },
    background_spawnable: false,
    purpose: "synthesizer",
    allowed_contexts: ["graduation", "research", "memory"],
  },
  sections: [
    {
      title: "role",
      content: `<role>
You are a Luca research graduator. You distill verified research findings into MuninnDB engrams that executors can recall per-task.

Your job:
1. Read all research files from the research directory
2. Extract key findings (only HIGH and MEDIUM confidence)
3. Assign \`research:{type}-{topic}\` concept prefixes
4. Write engrams to MuninnDB via muninn_remember_batch
5. Produce a GRADUATION-REPORT.md mapping files to engrams
6. Link related engrams together

## Concept Prefix Convention

All graduated research uses the \`research:\` prefix with a type-topic structure:

| Type | Usage | Example |
|------|-------|---------|
| \`research:approach-*\` | Recommended approaches/strategies | \`research:approach-ws-reconnect\` |
| \`research:pattern-*\` | Design patterns specific to this task | \`research:pattern-state-machine\` |
| \`research:api-*\` | API references and usage | \`research:api-bun-websocket\` |
| \`research:pitfall-*\` | Specific pitfalls from research | \`research:pitfall-ws-memory-leak\` |
| \`research:config-*\` | Configuration details | \`research:config-ws-timeout-values\` |
| \`research:decision-*\` | Decisions locked during research | \`research:decision-native-ws-over-library\` |

## Vault Routing

All \`research:*\` engrams go to the **repo vault** (not default vault).
Research findings are project-scoped -- they would NOT be useful in a different repo.

## Filtering Rules

- **HIGH confidence**: Always graduate. Full detail.
- **MEDIUM confidence**: Graduate with "MEDIUM confidence" annotation.
- **LOW confidence**: Do NOT graduate. Document in GRADUATION-REPORT.md as filtered out.
- **UNVERIFIED**: Do NOT graduate. Document as filtered out.

## Engram Format

Each engram should be 3-5 sentences:
1. What the finding is (key detail)
2. Why it matters (actionable implication)
3. Source attribution (URL or Context7 reference)

Example:
\`\`\`
Concept: research:approach-ws-reconnect
Content: "Bun's WebSocket implementation supports automatic reconnection via the 'close' event handler. The recommended pattern is exponential backoff with jitter (base 1s, cap 30s, jitter +/- 20%). This prevents thundering herd when a server restarts and multiple clients reconnect simultaneously. Source: Context7 Bun WebSocket docs."
\`\`\`

## Deduplication

If multiple research files contain the same finding:
- Keep the version with the highest confidence level
- Keep the version with the most specific detail
- Note the duplication in GRADUATION-REPORT.md

## Linking

After writing engrams, link related ones:
- \`research:approach-*\` -> \`research:pattern-*\` (approach implements pattern)
- \`research:pitfall-*\` -> \`research:approach-*\` (pitfall relates to approach)
- \`research:api-*\` -> \`research:approach-*\` (API used by approach)
</role>`,
      order: 1,
    },
  ],
};

export const luResearchGraduatorAgent = createAgent(luResearchGraduatorConfig);
```

---

## Agent Registry Updates

All new agents must be registered in `src/agents/__helpers/build-agent-registry.ts`:

```typescript
// New v2 researcher agents
import { luArchitectureResearcherAgent } from "../general/lu-architecture-researcher.agent";
import { luImplementationResearcherAgent } from "../general/lu-implementation-researcher.agent";
import { luEcosystemResearcherAgent } from "../general/lu-ecosystem-researcher.agent";
import { luRiskResearcherAgent } from "../general/lu-risk-researcher.agent";

// New v2 research reviewer agents
import { luCompletenessReviewerAgent } from "../general/lu-completeness-reviewer.agent";
import { luAccuracyReviewerAgent } from "../general/lu-accuracy-reviewer.agent";
import { luActionabilityReviewerAgent } from "../general/lu-actionability-reviewer.agent";

// New v2 graduator agent
import { luResearchGraduatorAgent } from "../general/lu-research-graduator.agent";

// Add to agentRegistry:
export const agentRegistry: Record<string, () => BaseAgent> = {
  // ... existing entries ...

  // v2 researchers
  "lu-architecture-researcher": () => luArchitectureResearcherAgent,
  "lu-implementation-researcher": () => luImplementationResearcherAgent,
  "lu-ecosystem-researcher": () => luEcosystemResearcherAgent,
  "lu-risk-researcher": () => luRiskResearcherAgent,

  // v2 research reviewers
  "lu-completeness-reviewer": () => luCompletenessReviewerAgent,
  "lu-accuracy-reviewer": () => luAccuracyReviewerAgent,
  "lu-actionability-reviewer": () => luActionabilityReviewerAgent,

  // v2 graduator
  "lu-research-graduator": () => luResearchGraduatorAgent,
};
```

---

## Model Routing Table Updates

Add entries to `MODEL_ROUTING_TABLE` in `src/complexity/__helpers/model-routing.ts`:

```typescript
// v2 researcher agents — use ROUTER preset (Decision 10)
// Research is discovery, not deep execution; cost savings justified.
// ROUTER = fast for TRIVIAL/SIMPLE, balanced for MODERATE+
"lu-architecture-researcher": ROUTER,
"lu-implementation-researcher": ROUTER,
"lu-ecosystem-researcher": ROUTER,
"lu-risk-researcher": ROUTER,

// v2 research reviewer agents — use DEEP_ANALYSIS preset (Decision 10)
// Review requires careful evaluation of research quality.
"lu-completeness-reviewer": DEEP_ANALYSIS,
"lu-accuracy-reviewer": DEEP_ANALYSIS,
"lu-actionability-reviewer": DEEP_ANALYSIS,

// v2 graduator agent — use ORCHESTRATOR preset (Decision 10)
// Graduation is orchestration (scoring, dedup, batch write), not deep analysis.
"lu-research-graduator": ORCHESTRATOR,
```

---

## New Helper Files

| File                                                        | Purpose                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/agents/__helpers/researcher-shared-sections.ts`        | Shared prompt constants for researcher agents (tool strategy, source hierarchy, etc.)         |
| `src/agents/__helpers/research-reviewer-shared-sections.ts` | Shared prompt constants for research reviewer agents (cold isolation block, scoring protocol) |

---

## Summary

| Agent                        | File                                                       | Purpose                            | Routing Preset | Isolation |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------- | -------------- | --------- |
| lu-architecture-researcher   | `src/agents/general/lu-architecture-researcher.agent.ts`   | System design, patterns, structure | ROUTER         | Cold      |
| lu-implementation-researcher | `src/agents/general/lu-implementation-researcher.agent.ts` | APIs, code patterns, configuration | ROUTER         | Cold      |
| lu-ecosystem-researcher      | `src/agents/general/lu-ecosystem-researcher.agent.ts`      | Libraries, community, state of art | ROUTER         | Cold      |
| lu-risk-researcher           | `src/agents/general/lu-risk-researcher.agent.ts`           | Pitfalls, failures, security, perf | ROUTER         | Cold      |
| lu-completeness-reviewer     | `src/agents/general/lu-completeness-reviewer.agent.ts`     | Coverage gaps in research          | DEEP_ANALYSIS  | Cold      |
| lu-accuracy-reviewer         | `src/agents/general/lu-accuracy-reviewer.agent.ts`         | Source grounding verification      | DEEP_ANALYSIS  | Cold      |
| lu-actionability-reviewer    | `src/agents/general/lu-actionability-reviewer.agent.ts`    | Planner usability of findings      | DEEP_ANALYSIS  | Cold      |
| lu-research-graduator        | `src/agents/general/lu-research-graduator.agent.ts`        | Distill research to MuninnDB       | ORCHESTRATOR   | Warm      |

---

## Related Documentation

- [new-skills-needed.md](new-skills-needed.md) -- Skills that orchestrate these agents
- [config-changes.md](config-changes.md) -- Config that controls agent behavior
- [phased-rollout.md](phased-rollout.md) -- When each agent is implemented
- [../02-research-system/](../02-research-system/) -- Research system architecture
- [../04-agent-orchestration/](../04-agent-orchestration/) -- Agent spawning patterns
