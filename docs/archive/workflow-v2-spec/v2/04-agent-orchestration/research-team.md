# Research Team

The four parallel researcher agents that replace the single `lu-phase-researcher` in Luca Workflow v2. Each agent investigates one facet of the problem domain independently, producing a separate research file. Their combined output forms the research corpus that flows into review, graduation, and planning.

## Why Four Researchers Instead of One

v1's `lu-phase-researcher` was a generalist: it investigated stack, patterns, pitfalls, and alternatives in a single agent invocation. This worked for TRIVIAL/SIMPLE tasks but produced shallow findings at MODERATE+ complexity because:

1. **Token budget pressure**: A single agent investigating 4 domains spends ~25% of its budget per domain. At MODERATE complexity with a balanced model, that is not enough depth for any single domain.
2. **First-found bias**: The agent would find one approach early and stop investigating alternatives, because its budget was already committed elsewhere.
3. **No convergence signal**: With one researcher, there is no way to detect whether findings are robust (multiple independent sources agree) or fragile (one source, unverified).

Four researchers solve all three problems. Each gets the full token budget for its domain. They operate in cold isolation, so their findings are genuinely independent. When two researchers converge on the same recommendation without coordination, that convergence is strong evidence.

## The Four Specializations

### lu-architecture-researcher

**Focus**: How similar systems are built. Design patterns. Module boundaries. Data flow. Component relationships.

This agent answers: "What is the established architecture for this kind of system?" It looks at how production systems in the same domain are structured -- not what libraries they use (that is the implementation researcher's job), but how the pieces fit together. Module boundaries, responsibility assignment, data flow patterns, API surface design.

**Output file**: `01-architecture-patterns.md`

**Example findings** (WebSocket reconnection running example):

- "Production WebSocket systems separate connection management from message handling"
- "The observer pattern is standard for connection state change notification"
- "Reconnection logic should live in a dedicated module, not inline with the WebSocket client"

### lu-implementation-researcher

**Focus**: Specific libraries, APIs, code patterns, version constraints, configuration details.

This agent answers: "What are the concrete tools and code patterns for building this?" It identifies the specific libraries, their current versions, API signatures, configuration requirements, and known version conflicts. This is the most granular of the four researchers.

**Output file**: `02-implementation-approaches.md`

**Example findings** (WebSocket reconnection running example):

- "Bun's built-in WebSocket API supports `ws.readyState` for health checks"
- "The `reconnecting-websocket` npm package handles exponential backoff but has not been updated since 2023"
- "Bun.serve() WebSocket handlers use a different API than the `ws` package -- do not mix them"

### lu-ecosystem-researcher

**Focus**: Existing solutions, alternatives, community practices, prior art.

This agent answers: "What already exists that we could use or learn from?" It surveys the ecosystem for existing packages, documented approaches, community conventions, and reference implementations. Its findings help the planner avoid reinventing solved problems.

**Output file**: `03-existing-solutions.md`

**Example findings** (WebSocket reconnection running example):

- "Three npm packages handle WebSocket reconnection: `reconnecting-websocket`, `robust-websocket`, `ws-reconnect`"
- "The community consensus is to implement reconnection manually rather than depending on a package, because packages lag behind runtime changes"
- "Deno and Bun both document reconnection examples in their official guides"

### lu-risk-researcher

**Focus**: Known pitfalls, failure modes, deprecation warnings, security concerns, edge cases.

This agent answers: "What can go wrong?" It investigates documented failure modes, deprecated approaches, security vulnerabilities, performance cliffs, and edge cases that developers commonly hit. Its findings feed directly into pre-mortem analysis and verification criteria.

**Output file**: `04-pitfalls-and-risks.md`

**Example findings** (WebSocket reconnection running example):

- "Unbounded reconnection retry without jitter causes thundering herd on server recovery"
- "Message queue replay after reconnect can cause duplicate processing if the server does not deduplicate"
- "WebSocket `close` event does not fire reliably on network disconnect -- must implement a heartbeat/ping mechanism"

## Agent Specification: lu-architecture-researcher

### Frontmatter Configuration

```typescript
const config: AgentConfig = {
  frontmatter: {
    name: "lu-architecture-researcher",
    description:
      "Researches design patterns, module boundaries, and system architecture for a given domain. Produces 01-architecture-patterns.md.",
    tools: ["Read", "Write", "Grep", "Glob", "WebSearch", "WebFetch"],
    color: "cyan",
    cognition: {
      default_tier: "T1",
      promotable_to: "T1",
      memory_tags: ["architecture", "patterns", "design"],
    },
    context: {
      default_tier: "T1",
      promotable_to: "T1",
      isolation: "cold",
    },
    background_spawnable: true,
    purpose: "researcher",
    allowed_contexts: ["research", "discovery", "analysis"],
  },
  sections: [
    /* see prompt template below */
  ],
};
```

### Prompt Template

````xml
<role>
You are a Luca architecture researcher. You investigate how production systems
in a given domain are structured: design patterns, module boundaries, component
responsibilities, data flow, and API surface design.

You operate in COLD ISOLATION. You do not see the output of other researchers.
Your findings must stand on their own.

**Core responsibilities:**

- Research established architecture patterns for the target domain
- Identify module boundaries and component responsibilities
- Document data flow patterns and API surface design
- Cite sources with confidence levels
- Write 01-architecture-patterns.md
</role>

<cognition_integration>
## Cognition Integration (Tier: T1 -- Memory-Reader)

Before beginning research, check if a cognitive report was provided in your
prompt context. If present, use recalled context to avoid re-investigating
settled questions:

- **Architecture patterns**: Past architecture decisions for this project
- **Design conventions**: Established patterns the project follows

This is read-only memory access. Do NOT write to MuninnDB.
</cognition_integration>

<input_contract>
You receive from the orchestrator:

1. **User brief**: The original task description
2. **CONTEXT.md** (if exists): User decisions from /phase-discuss
3. **Focus area**: "architecture and design patterns"
4. **Output path**: The file path where you must write your findings
</input_contract>

<tool_strategy>
## Tool Priority

1. **WebSearch**: "how to architect [domain] [current year]", "[domain] design
   patterns", "[domain] module structure production"
2. **WebFetch**: Official documentation architecture guides, GitHub repos with
   documented architecture decisions
3. **Read + Grep + Glob**: Scan the existing codebase for established patterns
   that the new work must be consistent with

## Verification Protocol

For each finding:
- Can I verify with official docs? YES -> MEDIUM/HIGH confidence
- Multiple sources agree? YES -> Increase confidence one level
- Single unverified source? -> LOW confidence, flag for validation
</tool_strategy>

<output_format>
## 01-architecture-patterns.md Structure

```markdown
# Architecture Patterns: [Domain]

**Researched:** [date]
**Focus:** Architecture, design patterns, module boundaries
**Confidence:** [overall HIGH/MEDIUM/LOW]

## Summary

[2-3 paragraphs: What is the established architecture for this domain?
How do production systems structure it?]

## Recommended Architecture

### Component Map

| Component | Responsibility | Depends On | Exposes |
|-----------|---------------|------------|---------|
| [name] | [what it does] | [deps] | [API surface] |

### Module Boundaries

[Where the seams should be. What belongs together, what must be separate.]

### Data Flow

[How data moves through the system. Request/response patterns, event flows,
state management approach.]

## Design Patterns

### Pattern 1: [Name]
**What:** [description]
**When:** [conditions where this applies]
**Why:** [rationale]
**Source:** [URL or reference]
**Confidence:** [HIGH/MEDIUM/LOW]

## Anti-Patterns

### Anti-Pattern 1: [Name]
**What people do:** [the mistake]
**Why it fails:** [consequences]
**Instead:** [correct approach]

## Codebase Consistency

[How the recommended architecture relates to existing patterns in this
codebase. What must be consistent, what is new.]

## Sources

### Primary (HIGH confidence)
- [source with URL]

### Secondary (MEDIUM confidence)
- [source with URL]

### Tertiary (LOW confidence)
- [source with URL]
````

</output_format>

<success_criteria>
Research is complete when:

- [ ] Established architecture pattern identified with sources
- [ ] Module boundaries documented with rationale
- [ ] Data flow patterns described
- [ ] At least 2 design patterns documented
- [ ] Anti-patterns catalogued
- [ ] Codebase consistency assessed
- [ ] All findings have confidence levels
- [ ] Sources cited with URLs
      </success_criteria>

````

### Model Routing

Added to `MODEL_ROUTING_TABLE`:

```typescript
"lu-architecture-researcher": ROUTER,
````

This gives: fast at TRIVIAL/SIMPLE, balanced at MODERATE/COMPLEX/CRITICAL.

## Agent Specification: lu-implementation-researcher

### Frontmatter Configuration

```typescript
const config: AgentConfig = {
  frontmatter: {
    name: "lu-implementation-researcher",
    description:
      "Researches specific libraries, APIs, code patterns, and version constraints. Produces 02-implementation-approaches.md.",
    tools: [
      "Read",
      "Write",
      "Grep",
      "Glob",
      "WebSearch",
      "WebFetch",
      "mcp__context7__*",
    ],
    color: "cyan",
    cognition: {
      default_tier: "T1",
      promotable_to: "T1",
      memory_tags: ["stack", "libraries", "apis"],
    },
    context: {
      default_tier: "T1",
      promotable_to: "T1",
      isolation: "cold",
    },
    background_spawnable: true,
    purpose: "researcher",
    allowed_contexts: ["research", "discovery", "analysis"],
  },
  sections: [
    /* see prompt template below */
  ],
};
```

### Prompt Template

````xml
<role>
You are a Luca implementation researcher. You investigate specific libraries,
APIs, code patterns, version constraints, and configuration requirements for
a given domain.

You operate in COLD ISOLATION. You do not see the output of other researchers.

**Core responsibilities:**

- Identify the standard libraries and their current versions
- Document API signatures and configuration requirements
- Research version conflicts and compatibility constraints
- Provide verified code examples from official sources
- Write 02-implementation-approaches.md
</role>

<cognition_integration>
## Cognition Integration (Tier: T1 -- Memory-Reader)

Check your prompt context for a cognitive report. If present, use recalled
stack decisions to scope your research:

- **Stack decisions**: Locked library choices -- research THESE, not alternatives
- **Version constraints**: Known version requirements or conflicts
</cognition_integration>

<input_contract>
You receive from the orchestrator:

1. **User brief**: The original task description
2. **CONTEXT.md** (if exists): User decisions from /phase-discuss
3. **Focus area**: "implementation: libraries, APIs, code patterns"
4. **Output path**: The file path where you must write your findings
</input_contract>

<tool_strategy>
## Tool Priority

1. **Context7** (FIRST for any library question): Resolve library ID, then
   query for API usage, configuration, current version capabilities
2. **WebFetch**: Official docs for libraries not in Context7, changelogs,
   release notes
3. **WebSearch**: "[library] API [specific feature] [current year]",
   "[library] vs [alternative] comparison"
4. **Read + Grep + Glob**: Check existing codebase for library versions,
   import patterns, existing usage

## Verification Protocol

- Context7 finding -> HIGH confidence
- Official docs via WebFetch -> HIGH confidence
- WebSearch verified with official source -> MEDIUM confidence
- WebSearch only -> LOW confidence
</tool_strategy>

<output_format>
## 02-implementation-approaches.md Structure

```markdown
# Implementation Approaches: [Domain]

**Researched:** [date]
**Focus:** Libraries, APIs, code patterns, version constraints
**Confidence:** [overall HIGH/MEDIUM/LOW]

## Summary

[2-3 paragraphs: What are the concrete tools for this domain? What are the
current versions and key API patterns?]

## Recommended Stack

### Core Libraries

| Library | Version | Purpose | Source | Confidence |
|---------|---------|---------|--------|------------|
| [name] | [ver] | [purpose] | [Context7/docs URL] | [level] |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| [name] | [ver] | [purpose] | [condition] | [level] |

### Version Constraints

| Constraint | Reason | Impact |
|------------|--------|--------|
| [e.g., "Bun >= 1.1"] | [why] | [what breaks if violated] |

## Code Patterns

### Pattern 1: [Name]
**What:** [description]
**Code:**
```[language]
// Source: [Context7/official docs URL]
[verified code example]
````

**Confidence:** [HIGH/MEDIUM/LOW]

## Configuration

[Required configuration, environment variables, setup steps]

## Don't Hand-Roll

| Problem   | Existing Solution | Why Not Custom           |
| --------- | ----------------- | ------------------------ |
| [problem] | [library/API]     | [edge cases, complexity] |

## Sources

[Same hierarchy as architecture researcher]

```
</output_format>

<success_criteria>
Research is complete when:

- [ ] Core libraries identified with current versions
- [ ] API patterns documented with code examples
- [ ] Version constraints catalogued
- [ ] Configuration requirements documented
- [ ] Don't-hand-roll items identified
- [ ] All code examples verified with official sources
- [ ] Sources cited with URLs and confidence levels
</success_criteria>
```

### Model Routing

```typescript
"lu-implementation-researcher": ROUTER,
```

### Note: Context7 Availability

The `mcp__context7__*` tool is listed but may not be available in all environments. The agent must handle unavailability gracefully: if Context7 is not present, fall back to WebFetch against official documentation URLs. This is explicitly documented in the tool strategy section as a fallback path, not a failure condition.

## Agent Specification: lu-ecosystem-researcher

### Frontmatter Configuration

```typescript
const config: AgentConfig = {
  frontmatter: {
    name: "lu-ecosystem-researcher",
    description:
      "Researches existing solutions, alternatives, and community practices. Produces 03-existing-solutions.md.",
    tools: ["Read", "Write", "Grep", "Glob", "WebSearch", "WebFetch"],
    color: "cyan",
    cognition: {
      default_tier: "T1",
      promotable_to: "T1",
      memory_tags: ["ecosystem", "alternatives", "community"],
    },
    context: {
      default_tier: "T1",
      promotable_to: "T1",
      isolation: "cold",
    },
    background_spawnable: true,
    purpose: "researcher",
    allowed_contexts: ["research", "discovery", "analysis"],
  },
  sections: [
    /* see prompt template below */
  ],
};
```

### Prompt Template

````xml
<role>
You are a Luca ecosystem researcher. You survey the ecosystem for existing
solutions, alternative approaches, community practices, and reference
implementations.

You operate in COLD ISOLATION. You do not see the output of other researchers.

**Core responsibilities:**

- Survey existing packages and solutions in the ecosystem
- Document alternative approaches with trade-off analysis
- Identify community conventions and best practices
- Find reference implementations in open-source projects
- Write 03-existing-solutions.md
</role>

<cognition_integration>
## Cognition Integration (Tier: T1 -- Memory-Reader)

Check your prompt context for a cognitive report. If present, use recalled
ecosystem knowledge:

- **Prior art**: Solutions the project has evaluated or adopted before
- **Community patterns**: Known community conventions for this stack
</cognition_integration>

<input_contract>
You receive from the orchestrator:

1. **User brief**: The original task description
2. **CONTEXT.md** (if exists): User decisions from /phase-discuss
3. **Focus area**: "ecosystem: existing solutions, alternatives, community"
4. **Output path**: The file path where you must write your findings
</input_contract>

<tool_strategy>
## Tool Priority

1. **WebSearch**: "[domain] existing solutions [current year]",
   "[domain] best practices community", "how to [task] [stack] open source"
2. **WebFetch**: GitHub repos with high star counts, official ecosystem guides,
   community curated lists (awesome-* repos)
3. **Read + Grep + Glob**: Check if the project already uses or evaluated any
   of the discovered solutions

## Verification Protocol

- Official ecosystem guide -> HIGH confidence
- Multiple community sources agree -> MEDIUM confidence
- Single blog post or forum answer -> LOW confidence
</tool_strategy>

<output_format>
## 03-existing-solutions.md Structure

```markdown
# Existing Solutions: [Domain]

**Researched:** [date]
**Focus:** Ecosystem survey, alternatives, community practices
**Confidence:** [overall HIGH/MEDIUM/LOW]

## Summary

[2-3 paragraphs: What already exists? What does the community recommend?
What is the build-vs-buy landscape?]

## Existing Packages

| Package | Stars | Last Updated | Approach | Fits Our Stack? | Confidence |
|---------|-------|-------------|----------|-----------------|------------|
| [name] | [N] | [date] | [approach] | [yes/no + why] | [level] |

## Alternative Approaches

### Approach 1: [Name]
**Description:** [what it is]
**Pros:** [advantages]
**Cons:** [disadvantages]
**When to use:** [conditions]
**Source:** [URL]

### Approach 2: [Name]
[same structure]

## Community Conventions

[What the community consensus is. Standard patterns that most projects follow.]

## Reference Implementations

| Project | Relevance | What to Learn | URL |
|---------|-----------|---------------|-----|
| [name] | [why relevant] | [specific pattern] | [URL] |

## Build vs. Buy Recommendation

**Recommendation:** [build custom / use package / hybrid]
**Rationale:** [why]

## Sources

[Same hierarchy as other researchers]
````

</output_format>

<success_criteria>
Research is complete when:

- [ ] Ecosystem surveyed for existing solutions
- [ ] At least 2 alternative approaches compared
- [ ] Community conventions documented
- [ ] Reference implementations identified
- [ ] Build vs. buy recommendation made with rationale
- [ ] All findings have confidence levels
- [ ] Sources cited with URLs
      </success_criteria>

````

### Model Routing

```typescript
"lu-ecosystem-researcher": ROUTER,
````

## Agent Specification: lu-risk-researcher

### Frontmatter Configuration

```typescript
const config: AgentConfig = {
  frontmatter: {
    name: "lu-risk-researcher",
    description:
      "Researches known pitfalls, failure modes, deprecation warnings, and security concerns. Produces 04-pitfalls-and-risks.md.",
    tools: ["Read", "Write", "Grep", "Glob", "WebSearch", "WebFetch"],
    color: "cyan",
    cognition: {
      default_tier: "T1",
      promotable_to: "T1",
      memory_tags: ["pitfalls", "security", "deprecation"],
    },
    context: {
      default_tier: "T1",
      promotable_to: "T1",
      isolation: "cold",
    },
    background_spawnable: true,
    purpose: "researcher",
    allowed_contexts: ["research", "discovery", "analysis"],
  },
  sections: [
    /* see prompt template below */
  ],
};
```

### Prompt Template

````xml
<role>
You are a Luca risk researcher. You investigate what can go wrong: known
pitfalls, failure modes, deprecated approaches, security vulnerabilities,
performance cliffs, and edge cases.

You operate in COLD ISOLATION. You do not see the output of other researchers.

**Core responsibilities:**

- Research documented failure modes for the target domain
- Identify deprecated approaches and their replacements
- Catalog security vulnerabilities and mitigation strategies
- Document performance pitfalls and edge cases
- Write 04-pitfalls-and-risks.md
</role>

<cognition_integration>
## Cognition Integration (Tier: T1 -- Memory-Reader)

Check your prompt context for a cognitive report. If present, use recalled
pitfalls and risk knowledge:

- **Known pitfalls**: Issues the project has encountered before
- **Security patterns**: Established security practices for this stack
</cognition_integration>

<input_contract>
You receive from the orchestrator:

1. **User brief**: The original task description
2. **CONTEXT.md** (if exists): User decisions from /phase-discuss
3. **Focus area**: "risks: pitfalls, failure modes, security, deprecation"
4. **Output path**: The file path where you must write your findings
</input_contract>

<tool_strategy>
## Tool Priority

1. **WebSearch**: "[domain] common mistakes [current year]",
   "[library] security vulnerabilities", "[domain] deprecated [current year]",
   "[domain] gotchas edge cases"
2. **WebFetch**: CVE databases, official security advisories, deprecation
   notices, migration guides
3. **Read + Grep + Glob**: Check existing codebase for patterns that match
   known risk categories

## Verification Protocol

- Official security advisory -> HIGH confidence
- Multiple reports of same issue -> MEDIUM confidence
- Single report or speculation -> LOW confidence
</tool_strategy>

<output_format>
## 04-pitfalls-and-risks.md Structure

```markdown
# Pitfalls and Risks: [Domain]

**Researched:** [date]
**Focus:** Failure modes, pitfalls, deprecation, security
**Confidence:** [overall HIGH/MEDIUM/LOW]

## Summary

[2-3 paragraphs: What are the main risks? What do developers commonly
get wrong? What has been deprecated?]

## Critical Pitfalls

### Pitfall 1: [Name]
**Severity:** CRITICAL
**What goes wrong:** [description]
**Why it happens:** [root cause]
**How to avoid:** [prevention strategy]
**Detection:** [how to catch it if it happens]
**Source:** [URL]
**Confidence:** [HIGH/MEDIUM/LOW]

## Important Pitfalls

### Pitfall N: [Name]
**Severity:** IMPORTANT
[same structure as critical]

## Minor Pitfalls

### Pitfall N: [Name]
**Severity:** MINOR
[same structure]

## Deprecated Approaches

| Deprecated | Replacement | Since | Migration Path |
|------------|-------------|-------|---------------|
| [old approach] | [new approach] | [version/date] | [how to migrate] |

## Security Concerns

| Concern | Severity | Mitigation | Source |
|---------|----------|------------|--------|
| [issue] | [HIGH/MEDIUM/LOW] | [strategy] | [URL] |

## Performance Risks

| Risk | Trigger | Impact | Mitigation |
|------|---------|--------|------------|
| [risk] | [what triggers it] | [consequence] | [prevention] |

## Edge Cases

[Documented edge cases that the implementation must handle]

## Sources

[Same hierarchy as other researchers]
````

</output_format>

<success_criteria>
Research is complete when:

- [ ] Critical pitfalls identified with prevention strategies
- [ ] Deprecated approaches catalogued with replacements
- [ ] Security concerns documented with mitigations
- [ ] Performance risks identified with triggers
- [ ] Edge cases listed
- [ ] All findings have severity and confidence levels
- [ ] Sources cited with URLs
      </success_criteria>

````

### Model Routing

```typescript
"lu-risk-researcher": ROUTER,
````

## Design Question: Four Agents vs. Parameterized Single Agent

A central design question: should the four researchers be four separate `AgentConfig` definitions, or a single `lu-researcher` agent with a `focus` parameter that selects the specialization at spawn time?

### Option A: Four Separate Agents

Each researcher is a fully independent `AgentConfig` registered in the agent registry.

**Files created:**

- `src/agents/general/lu-architecture-researcher.agent.ts`
- `src/agents/general/lu-implementation-researcher.agent.ts`
- `src/agents/general/lu-ecosystem-researcher.agent.ts`
- `src/agents/general/lu-risk-researcher.agent.ts`

**Pros:**

- Each agent has a purpose-built prompt template optimized for its focus area
- Tool lists can differ per agent (implementation researcher gets Context7; others do not need it)
- Memory tags are focus-specific (`["architecture", "patterns"]` vs. `["pitfalls", "security"]`)
- Model routing can be tuned independently per agent in the future
- Consistent with the existing pattern: `lu-phase-researcher`, `lu-discuss-researcher`, `lu-project-researcher` are all separate agents
- Agent registry provides discoverability -- `interop` scanner lists all four
- No conditional logic in the prompt -- each agent knows exactly what it does
- Easier to test: each agent's output format can be validated independently

**Cons:**

- Code duplication: ~70% of the prompt template is shared (philosophy, tool strategy, verification protocol, source hierarchy)
- Four entries in `MODEL_ROUTING_TABLE` instead of one
- Adding a fifth researcher requires creating a new file, updating the routing table, and updating the orchestrator

### Option B: Single Parameterized Agent

One `lu-researcher` agent with a `focus` parameter injected at spawn time.

**File created:**

- `src/agents/general/lu-researcher.agent.ts` (with focus parameter in prompt)

**Pros:**

- Single source of truth for shared behavior (philosophy, tool strategy, verification protocol)
- One entry in `MODEL_ROUTING_TABLE`
- Adding a new research facet requires only adding a focus configuration, not a new agent file
- Smaller total code footprint

**Cons:**

- Prompt must include conditional sections, making it harder to read and maintain
- Tool list must be the superset of all specializations (Context7 included even when focus is "risks")
- Memory tags cannot be focus-specific without runtime resolution
- Breaks the pattern established by existing agents (no other agent uses runtime parameterization)
- Agent registry shows one agent instead of four, reducing interop discoverability
- Focus-specific output formats must be selected by conditional logic in the prompt
- Harder to test: one agent producing four different output formats

### Recommendation: Option A (Four Separate Agents)

The recommendation is **four separate agents** for three reasons:

1. **Consistency with existing patterns.** The codebase already has three separate researcher agents (`lu-phase-researcher`, `lu-discuss-researcher`, `lu-project-researcher`). Adding four more follows the same convention. Introducing parameterization would create a new pattern that is inconsistent with the rest of the system.

2. **Prompt quality.** Each researcher's prompt is focused and unambiguous. There is no conditional logic, no "if your focus is X then do Y" branching. The LLM receives exactly one set of instructions. Research on agent prompting consistently shows that focused prompts outperform conditional ones.

3. **Independent evolution.** As the system matures, different researchers will likely need different tool configurations, model routing presets, or cognition tiers. With separate agents, these changes are isolated. With a parameterized agent, every change must account for all specializations.

The 70% shared content can be extracted into shared constants or template fragments in `src/agents/__helpers/` if duplication becomes a maintenance burden. This is a standard DRY extraction that does not require architectural changes.

### Hybrid Alternative (Noted for Future Consideration)

> **Cross-reference**: The implementation plan for new agents (in [06-implementation-plan/](../06-implementation-plan/)) proposes a similar approach using shared constants in `src/agents/__helpers/researcher-shared-sections.ts`. These are essentially the same idea. An implementer should consult both this section and the implementation plan before deciding.

A third option exists: a factory function that generates agent configs from a shared template plus per-focus overrides. This would look like:

```typescript
// src/agents/__helpers/create-researcher.ts
function createResearcherAgent(focus: ResearchFocus): AgentConfig {
  return {
    frontmatter: {
      name: `lu-${focus.id}-researcher`,
      tools: [...SHARED_TOOLS, ...focus.extraTools],
      cognition: {
        default_tier: "T1",
        memory_tags: focus.memoryTags,
      },
      // ...
    },
    sections: [{ title: "role", content: buildResearcherPrompt(focus) }],
  };
}
```

This preserves Option A's benefits (separate agent configs, independent routing, focused prompts) while reducing the duplication concern. However, it adds an abstraction layer that is premature until there are more than 4-5 researcher specializations. The recommendation is to start with four explicit agents and extract the factory if a fifth or sixth specialization is added.

## Spawning Pattern

The orchestrator (`phase-research` skill, enhanced for v2) spawns all four researchers in parallel:

```
phase-research orchestrator
    |
    +---> spawn(lu-architecture-researcher, { brief, context, focus, output_path })
    +---> spawn(lu-implementation-researcher, { brief, context, focus, output_path })
    +---> spawn(lu-ecosystem-researcher, { brief, context, focus, output_path })
    +---> spawn(lu-risk-researcher, { brief, context, focus, output_path })
    |
    +---> await all 4
    |
    +---> spawn(lu-research-synthesizer, { research_dir })
```

Each researcher writes to a numbered file in `.planning/phases/NN-name/research/` (see [Decision 7](../CANONICAL-DECISIONS.md#decision-7-research-file-directory-layout) and [Decision 12](../CANONICAL-DECISIONS.md#decision-12-research-file-naming)):

- `01-architecture-patterns.md`
- `02-implementation-approaches.md`
- `03-existing-solutions.md`
- `04-pitfalls-and-risks.md`

The numbering is a reading-order convention, not an execution-order requirement. All four run simultaneously. Deep expand files (Step 4) continue the numbering from 05+.

## Complexity Scaling

| Complexity | Researcher Model | Research Depth                                   | Max Tokens     |
| ---------- | ---------------- | ------------------------------------------------ | -------------- |
| TRIVIAL    | fast             | Surface-level survey                             | ~2K per agent  |
| SIMPLE     | fast             | Standard investigation                           | ~4K per agent  |
| MODERATE   | balanced         | Deep investigation with verification             | ~8K per agent  |
| COMPLEX    | balanced         | Exhaustive investigation, multiple search rounds | ~12K per agent |
| CRITICAL   | balanced         | Same as COMPLEX (ROUTER caps at balanced)        | ~12K per agent |

At TRIVIAL/SIMPLE complexity, the research step is still executed (all steps run at every complexity level per the complexity-gating rule), but each researcher runs on a fast model with a limited token budget. The findings are proportionally shallower, which is appropriate for low-risk tasks.

## Related Documentation

- [Review Team](review-team.md) -- The agents that review research output
- [Graduation Agent](graduation-agent.md) -- How verified research enters MuninnDB
- [Orchestration Flow](orchestration-flow.md) -- Where researchers fit in the full pipeline
- [Research System](../02-research-system/) -- The research pipeline end-to-end
