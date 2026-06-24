# Phase 15: Cognition Per-Agent Audit - Research

**Researched:** 2026-02-11
**Domain:** Agent cognition system (BRAIN/MEMORY/WORKING), selective recall, per-agent configuration
**Confidence:** HIGH

## Summary

Phase 15 audits every agent in the Luca framework for cognition system usage and introduces per-agent cognition configuration. The current state is binary: lu-cognition runs full or lite pre-flight for ALL agents identically, with no per-agent tuning. Only 3 of 25 agents (lu-cognition, lu-debugger, lu-learner) have explicit cognition references in their markdown definitions; the remaining 22 agents are cognition-unaware at the definition level, though several participate in cognition workflows indirectly via orchestrator wiring.

This research identifies the exact current cognition posture of each agent, proposes a 4-tier cognition profile system (T0-T3), recommends per-agent default tiers with promotion paths, defines the tag vocabulary for selective MEMORY.md recall, and maps the specific code changes needed in schemas, compilers, complexity types, and agent definitions.

**Primary recommendation:** Extend `AgentFrontmatter` with a `cognition` field containing `defaultTier`, `promotableTo`, and `memoryTags`. Extend the complexity matrix with `cognitionPromotions` to enable dynamic tier escalation. Update lu-cognition's selective recall algorithm to filter by agent-specific `memoryTags`.

## Per-Agent Cognition Audit Matrix (COGN-01)

### Audit Methodology

Each agent was read in full. The following cognition features were checked:

- **BRAIN**: Does the agent reference BRAIN.md loading?
- **MEMORY**: Does the agent reference MEMORY.md recall (patterns, decisions, pitfalls)?
- **WORKING**: Does the agent reference WORKING.md initialization or updates?
- **Pre-flight**: Does the agent invoke or receive output from lu-cognition?
- **Learning**: Does the agent contribute to learning extraction (candidate entries in WORKING.md)?

### Full Audit Results

| #   | Agent                   | File                       | BRAIN | MEMORY   | WORKING | Pre-flight   | Learning     | Current Tier | Lines |
| --- | ----------------------- | -------------------------- | ----- | -------- | ------- | ------------ | ------------ | ------------ | ----- |
| 1   | lu-cognition            | lu-cognition.md            | YES   | YES      | YES     | IS_PREFLIGHT | NO           | T3           | 460   |
| 2   | lu-debugger             | lu-debugger.md             | NO    | YES      | YES     | RECEIVES     | YES          | T3           | 1302  |
| 3   | lu-learner              | lu-learner.md              | NO    | YES      | YES     | NO           | IS_EXTRACTOR | T2           | 548   |
| 4   | lu-router               | lu-router.md               | NO    | INDIRECT | NO      | RECEIVES     | NO           | T1           | 540   |
| 5   | lu-executor             | lu-executor.md             | NO    | NO       | NO      | NO           | NO           | T0           | ~600  |
| 6   | lu-planner              | lu-planner.md              | NO    | NO       | NO      | NO           | NO           | T0           | ~800  |
| 7   | lu-verifier             | lu-verifier.md             | NO    | NO       | NO      | NO           | NO           | T0           | ~700  |
| 8   | lu-phase-researcher     | lu-phase-researcher.md     | NO    | NO       | NO      | NO           | NO           | T0           | 670   |
| 9   | lu-project-researcher   | lu-project-researcher.md   | NO    | NO       | NO      | NO           | NO           | T0           | 900   |
| 10  | lu-research-synthesizer | lu-research-synthesizer.md | NO    | NO       | NO      | NO           | NO           | T0           | 266   |
| 11  | lu-roadmapper           | lu-roadmapper.md           | NO    | NO       | NO      | NO           | NO           | T0           | 635   |
| 12  | lu-plan-checker         | lu-plan-checker.md         | NO    | NO       | NO      | NO           | NO           | T0           | 802   |
| 13  | lu-integration-checker  | lu-integration-checker.md  | NO    | NO       | NO      | NO           | NO           | T0           | 416   |
| 14  | lu-codebase-mapper      | lu-codebase-mapper.md      | NO    | NO       | NO      | NO           | NO           | T0           | 758   |
| 15  | lu-pr-reviewer          | lu-pr-reviewer.md          | NO    | NO       | NO      | NO           | NO           | T0           | 545   |
| 16  | code-architect          | code-architect.md          | NO    | NO       | NO      | NO           | NO           | T0           | 49    |
| 17  | code-developer          | code-developer.md          | NO    | NO       | NO      | NO           | NO           | T0           | 55    |
| 18  | code-simplifier         | code-simplifier.md         | NO    | NO       | NO      | NO           | NO           | T0           | 99    |
| 19  | dx-advocate             | dx-advocate.md             | NO    | NO       | NO      | NO           | NO           | T0           | 51    |
| 20  | performance-auditor     | performance-auditor.md     | NO    | NO       | NO      | NO           | NO           | T0           | 45    |
| 21  | security-auditor        | security-auditor.md        | NO    | NO       | NO      | NO           | NO           | T0           | 43    |
| 22  | product                 | product.md                 | NO    | NO       | NO      | NO           | NO           | T0           | 54    |
| 23  | qa-plan-generator       | qa-plan-generator.md       | NO    | NO       | NO      | NO           | NO           | T0           | 87    |
| 24  | ui                      | ui.md                      | NO    | NO       | NO      | NO           | NO           | T0           | 55    |
| 25  | ux                      | ux.md                      | NO    | NO       | NO      | NO           | NO           | T0           | 55    |

### Key Findings

- **3 agents have explicit cognition features**: lu-cognition (T3), lu-debugger (T3), lu-learner (T2)
- **1 agent has indirect cognition**: lu-router receives cognitive report and uses memory flags for classification
- **21 agents are fully stateless (T0)**: No BRAIN/MEMORY/WORKING references at all
- **lu-executor and lu-planner are the biggest gaps**: Core pipeline agents with zero cognition, despite being the most impactful agents for task execution quality
- **Review agents (code-architect through ux) are short (43-99 lines)**: Minimal agent definitions with no cognition hooks. These are sensible T0 candidates.

## Gap Analysis (COGN-02)

### Critical Gaps (Should Be Higher Tier)

| Agent               | Current | Recommended           | Rationale                                                                                                                                                                                             |
| ------------------- | ------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lu-executor         | T0      | T2 (promotable to T3) | Writes code. Should recall coding patterns, decisions, and pitfalls from MEMORY.md. Should log findings to WORKING.md. Currently the #1 code-writing agent with zero memory awareness.                |
| lu-planner          | T0      | T1 (promotable to T2) | Creates PLAN.md files. Should recall past planning patterns and architectural decisions. Pattern recall prevents repeating known-bad approaches.                                                      |
| lu-verifier         | T0      | T1 (promotable to T2) | Verifies implementation. Should recall past pitfalls and verification failures to inform must-haves derivation. Phase 14 AUDIT-REPORT already identified verification gaps that memory could address. |
| lu-phase-researcher | T0      | T1                    | Researches before planning. Should recall past research findings and technology decisions to avoid re-investigating settled questions.                                                                |

### Moderate Gaps (Would Benefit)

| Agent              | Current | Recommended | Rationale                                                                                                                                  |
| ------------------ | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| lu-plan-checker    | T0      | T1          | Validates plans. Recalling past plan-checker findings (e.g., wave dependency conflicts) would improve plan validation quality.             |
| lu-pr-reviewer     | T0      | T1          | Reviews PR comments. Recalling past review patterns and team conventions would improve response quality.                                   |
| lu-codebase-mapper | T0      | T0 (keep)   | Exploratory agent. Fresh exploration without memory bias is actually desirable. Memory could cause confirmation bias in codebase analysis. |

### Appropriate at T0 (No Change Needed)

| Agent                   | Rationale                                                             |
| ----------------------- | --------------------------------------------------------------------- |
| lu-research-synthesizer | Synthesizes current research outputs. Memory not relevant.            |
| lu-roadmapper           | Creates roadmaps from requirements. Fresh perspective preferred.      |
| lu-integration-checker  | Verifies connections. Deterministic checks don't benefit from memory. |
| code-architect          | Short review agent. Follows rules, not memory.                        |
| code-developer          | Short review agent. Follows rules, not memory.                        |
| code-simplifier         | Short review agent. Follows rules, not memory.                        |
| dx-advocate             | Short review agent. Follows rules, not memory.                        |
| performance-auditor     | Short review agent. Follows rules, not memory.                        |
| security-auditor        | Short review agent. Follows rules, not memory.                        |
| product                 | Analysis agent. Requirements-driven, not memory-driven.               |
| qa-plan-generator       | Generates test plans from diffs. Deterministic.                       |
| ui                      | Short review agent. Design-system driven.                             |
| ux                      | Short review agent. Standards-driven.                                 |

## Cognition Tier System (COGN-03)

### Tier Definitions

| Tier | Name            | BRAIN | MEMORY     | WORKING    | Learning | Description                                                                                                       |
| ---- | --------------- | ----- | ---------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| T0   | Stateless       | No    | No         | No         | No       | Agent operates without cognition. Pure rule/instruction following.                                                |
| T1   | Memory-Reader   | No    | READ       | No         | No       | Agent receives recalled entries from lu-cognition but does not write to WORKING.md or contribute learnings.       |
| T2   | Session-Aware   | No    | READ       | READ+WRITE | No       | Agent reads recalled entries AND maintains session state in WORKING.md. Logs findings and candidates.             |
| T3   | Fully-Cognitive | YES   | READ+WRITE | READ+WRITE | YES      | Agent participates in full cognitive loop: loads BRAIN, recalls MEMORY, maintains WORKING, contributes learnings. |

### Tier Behaviors

**T0 (Stateless):**

- lu-cognition skips this agent entirely (no memory recall)
- Agent prompt has no cognition sections
- Zero context overhead

**T1 (Memory-Reader):**

- lu-cognition includes recalled entries in the agent's prompt context
- Agent receives `### Relevant Context` block with filtered patterns/decisions/pitfalls
- Agent does NOT write to WORKING.md
- ~200-500 tokens of memory context added to prompt

**T2 (Session-Aware):**

- Everything from T1 PLUS:
- Agent writes findings to WORKING.md `## Immediate Findings` section
- Agent writes candidate learnings to `## Pre-Learning Extraction` section
- ~500-1000 tokens of memory context + WORKING.md writes

**T3 (Fully-Cognitive):**

- Everything from T2 PLUS:
- Agent loads BRAIN.md for project identity context
- Agent can trigger learning extraction (via lu-learner invocation)
- Agent has full intuition check support
- ~1000-2000 tokens of cognitive context

### Recommended Default Tiers

| Agent                   | Default Tier | Promotable To | Memory Tags                                         |
| ----------------------- | ------------ | ------------- | --------------------------------------------------- |
| lu-cognition            | T3           | T3 (max)      | `["*"]` (all tags)                                  |
| lu-debugger             | T3           | T3 (max)      | `["debugging", "pitfalls", "testing"]`              |
| lu-learner              | T2           | T3            | `["patterns", "decisions", "pitfalls"]`             |
| lu-router               | T1           | T2            | `["architecture", "complexity"]`                    |
| lu-executor             | T2           | T3            | `["coding", "patterns", "pitfalls", "conventions"]` |
| lu-planner              | T1           | T2            | `["architecture", "planning", "decisions"]`         |
| lu-verifier             | T1           | T2            | `["verification", "pitfalls", "testing"]`           |
| lu-phase-researcher     | T1           | T1 (max)      | `["stack", "architecture"]`                         |
| lu-plan-checker         | T1           | T1 (max)      | `["planning", "pitfalls"]`                          |
| lu-pr-reviewer          | T1           | T1 (max)      | `["conventions", "patterns"]`                       |
| lu-project-researcher   | T0           | T1            | `[]`                                                |
| lu-research-synthesizer | T0           | T0 (max)      | `[]`                                                |
| lu-roadmapper           | T0           | T1            | `[]`                                                |
| lu-integration-checker  | T0           | T0 (max)      | `[]`                                                |
| lu-codebase-mapper      | T0           | T0 (max)      | `[]`                                                |
| code-architect          | T0           | T1            | `[]`                                                |
| code-developer          | T0           | T1            | `[]`                                                |
| code-simplifier         | T0           | T0 (max)      | `[]`                                                |
| dx-advocate             | T0           | T0 (max)      | `[]`                                                |
| performance-auditor     | T0           | T1            | `[]`                                                |
| security-auditor        | T0           | T1            | `[]`                                                |
| product                 | T0           | T0 (max)      | `[]`                                                |
| qa-plan-generator       | T0           | T0 (max)      | `[]`                                                |
| ui                      | T0           | T0 (max)      | `[]`                                                |
| ux                      | T0           | T0 (max)      | `[]`                                                |

## Per-Agent Cognition Config (COGN-04)

### Schema Extension

**File:** `src/agents/types/agent.schemas.ts`

Current `agentFrontmatterSchema`:

```typescript
export const agentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()).optional(),
  color: z.string().optional(),
});
```

**Proposed extension:**

```typescript
export const cognitionTierSchema = z.enum(["T0", "T1", "T2", "T3"]);

export const cognitionConfigSchema = z
  .object({
    default_tier: cognitionTierSchema.default("T0"),
    promotable_to: cognitionTierSchema.default("T0"),
    memory_tags: z.array(z.string()).default([]),
  })
  .optional();

export const agentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()).optional(),
  color: z.string().optional(),
  cognition: cognitionConfigSchema,
});
```

### Type Extension

**File:** `src/agents/types/agent.types.ts`

Add to existing interfaces:

```typescript
export type CognitionTier = "T0" | "T1" | "T2" | "T3";

export interface CognitionConfig {
  default_tier: CognitionTier;
  promotable_to: CognitionTier;
  memory_tags: string[];
}

export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string[];
  color?: string;
  cognition?: CognitionConfig;
  [key: string]: unknown;
}
```

### Complexity Matrix Extension

**File:** `src/complexity/types.ts`

Add `cognitionPromotions` field to `ComplexityGate`:

```typescript
export interface ComplexityGate {
  // ... existing fields ...
  /** Cognition tier promotions: agents at lower tiers get promoted at this complexity */
  cognitionPromotions?: Record<CognitionTier, CognitionTier>;
}
```

**File:** `src/complexity/defaults.ts`

Add promotions to matrix:

```typescript
TRIVIAL: {
  // ... existing fields ...
  cognitionPromotions: undefined, // No promotions at TRIVIAL
},
MODERATE: {
  // ... existing fields ...
  cognitionPromotions: { T0: 'T0', T1: 'T1', T2: 'T2', T3: 'T3' }, // No change
},
COMPLEX: {
  // ... existing fields ...
  cognitionPromotions: { T0: 'T0', T1: 'T2', T2: 'T3', T3: 'T3' }, // T1->T2, T2->T3
},
CRITICAL: {
  // ... existing fields ...
  cognitionPromotions: { T0: 'T1', T1: 'T2', T2: 'T3', T3: 'T3' }, // All promoted
},
```

### Compiler Integration

**File:** `src/compilers/base.compiler.ts` and `src/compilers/claude.compiler.ts`

Current compiler delegates to `agent.toClaudeFormat()`. The compiled .md files need YAML frontmatter with cognition fields for lu-cognition to read at runtime.

**Approach:** Extend the `toClaudeFormat()` / `toCursorFormat()` methods to include cognition metadata as YAML frontmatter at the top of compiled agent files:

```yaml
---
name: lu-executor
cognition:
  default_tier: T2
  promotable_to: T3
  memory_tags:
    - coding
    - patterns
    - pitfalls
    - conventions
---
# lu-executor
...
```

This enables lu-cognition to read the compiled .md file header and determine:

1. Whether to include memory recall for this agent
2. What memory tags to filter by
3. Whether to promote the tier based on current complexity

### lu-cognition Algorithm Update

**File:** `.claude/agents/lu-cognition.md`

The selective recall step (Step: `selective_recall`) currently does keyword-based scoring with agent awareness. It already has the `Agent` and `Relevant to` fields in its scoring algorithm (lines 155-216).

**Required changes:**

1. **Read agent cognition config from compiled .md frontmatter** (new step before selective_recall)
2. **Gate recall by tier**: If agent's effective tier is T0, skip recall entirely
3. **Filter by memoryTags**: Instead of searching ALL of MEMORY.md, only search entries whose content matches the agent's `memory_tags` domain tags
4. **Apply complexity promotion**: Before recall, check current complexity level and promote tier if applicable

**Updated algorithm pseudocode:**

```
# Step: resolve_cognition_tier (NEW)
1. Read target agent's compiled .md file
2. Parse YAML frontmatter for cognition config
3. Get default_tier from config (fallback: T0)
4. Get current complexity from STATE.md or --complexity flag
5. If complexity has cognitionPromotions, apply: effective_tier = promote(default_tier)
6. Cap at promotable_to ceiling

# Step: selective_recall (MODIFIED)
IF effective_tier == T0:
    SKIP recall entirely, output minimal report
ELSE:
    agent_memory_tags = agent.cognition.memory_tags

    # Filter MEMORY.md entries by domain tags FIRST
    candidate_entries = entries.filter(entry =>
        agent_memory_tags.includes("*") OR
        entry_matches_any_tag(entry, agent_memory_tags)
    )

    # Then apply existing keyword + agent scoring on filtered set
    scored = score_entries(candidate_entries, task_keywords, target_agent)

    # Select top entries
    IF effective_tier == T1: limit = 3-5
    IF effective_tier == T2: limit = 5-7
    IF effective_tier == T3: limit = 7-10
```

## Selective Memory Recall with Tags (COGN-05)

### Recommended Tag Vocabulary

Based on analysis of all 182 MEMORY.md entries (36 patterns + 23 decisions + 31 pitfalls + 4 conventions + 5 anti-patterns + 9 preferences):

| Tag            | Domain                                   | Example Entries That Match                                                   |
| -------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | --- | -------------------------------------------------------------- |
| `coding`       | Code patterns, implementation approaches | "Dual-package CLI pattern", "Zod safeParse at API boundaries"                |
| `patterns`     | Validated development patterns           | "Wave-based parallelization", "Registry pattern for diverse toolchains"      |
| `pitfalls`     | Known issues and gotchas                 | "                                                                            |     | true swallows exit codes", "Bun.spawn has no built-in timeout" |
| `conventions`  | Project conventions                      | "No raw JSON.parse on external data", "YAML generation via js-yaml"          |
| `architecture` | System design and structure              | "Template architecture separation", "Layered verification"                   |
| `planning`     | Plan structure and validation            | "Wave restructuring from dependency analysis", "Plan-checker bug prevention" |
| `verification` | Testing and verification                 | "Verification signal taxonomy", "Specification anchoring"                    |
| `testing`      | Test patterns and tooling                | "Parser registry for diverse toolchains", "bun test patterns"                |
| `debugging`    | Bug investigation patterns               | "Memory-aided debugging", pitfall recall                                     |
| `stack`        | Technology choices                       | "UnJS ecosystem for CLI", "Bun.spawn quirks"                                 |
| `security`     | Security patterns and concerns           | "EJS restriction", "Credential sanitization"                                 |
| `performance`  | Performance optimization                 | "Surgical performance optimization", "Lazy loading"                          |
| `decisions`    | Architectural decisions                  | All items in Decisions section                                               |
| `complexity`   | Complexity gating system                 | "N-level to M-tier compression", "Self-gating agents"                        |

### MEMORY.md Entry Tagging Strategy

Current MEMORY.md entries do NOT have tags. The `Agent` and `Relevant to` fields exist in lu-learner's template but are not populated in current entries.

**Migration approach:**

1. Add a `Tags:` field to the lu-learner extraction template
2. For existing entries, infer tags from content keywords during a one-time migration
3. For new entries, lu-learner assigns tags based on the domain vocabulary above

**Example tagged entry:**

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

### Tag-Based Filtering in lu-cognition

The selective recall algorithm adds a pre-filter step:

```
# Before keyword scoring
if agent.memory_tags is empty or agent.memory_tags contains "*":
    candidates = all_entries  # No filtering
else:
    candidates = entries.filter(entry =>
        entry.tags intersects agent.memory_tags OR
        entry has no tags (legacy backward compat)
    )
```

**Backward compatibility:** Entries without `Tags:` field are included in ALL agent recalls (legacy treatment). This ensures existing memory is not lost during migration.

## Architecture Patterns

### Recommended Approach: Metadata-Driven Configuration

Follow the established pattern from Phase 11 (hook metadata registry) and Phase 13 (complexity matrix):

1. **Define cognition config in TypeScript schemas** (source of truth)
2. **Compile into YAML frontmatter** in agent .md files (runtime readable)
3. **lu-cognition reads frontmatter** at pre-flight time (no TypeScript dependency at runtime)
4. **Complexity matrix extends** with `cognitionPromotions` (follows existing pattern)

### Data Flow

```
src/agents/types/agent.schemas.ts
  → defines CognitionConfig schema
  → used by agent registration (.agent.ts files)

src/compilers/claude.compiler.ts
  → reads AgentConfig (with cognition field)
  → outputs .md with YAML frontmatter containing cognition config

.claude/agents/*.md (compiled output)
  → contains YAML frontmatter with cognition config
  → read by lu-cognition at runtime

lu-cognition.md (agent definition)
  → reads target agent's .md frontmatter
  → resolves effective tier (default + complexity promotion)
  → filters MEMORY.md by agent's memory_tags
  → outputs cognitive report sized to effective tier
```

### Anti-Patterns to Avoid

- **Hard-coding tiers in lu-cognition**: Tiers should come from agent metadata, not a switch statement in lu-cognition
- **Over-tagging MEMORY.md entries**: Tags should be broad domain categories, not specific keywords. Keyword matching already handles specificity.
- **Promoting all agents at high complexity**: T0 agents that are genuinely stateless (review agents) should stay T0 even at CRITICAL complexity. Use `promotable_to: T0` to enforce ceiling.

## Don't Hand-Roll

| Problem                  | Don't Build            | Use Instead                               | Why                                          |
| ------------------------ | ---------------------- | ----------------------------------------- | -------------------------------------------- |
| YAML frontmatter parsing | Custom regex parser    | `js-yaml` (already a dependency)          | Established convention from Phase 9 decision |
| Tag matching             | Custom string matching | Set intersection (`new Set()`)            | Standard JS, O(1) lookup                     |
| Tier comparison          | String comparison      | Numeric order map (like COMPLEXITY_ORDER) | Enables `>=` threshold checks                |

## Common Pitfalls

### Pitfall 1: Context Bloat from Aggressive Memory Recall

**What goes wrong:** Promoting too many agents to T2/T3 adds 500-2000 tokens of memory context per agent. In a CRITICAL task spawning 10+ agents, this adds 5000-20000 tokens of overhead.
**Why it happens:** Enthusiasm for "smarter agents" without measuring context cost.
**How to avoid:** Only promote agents where memory demonstrably improves output quality. Keep review agents (code-architect, dx-advocate, etc.) at T0.
**Warning signs:** Context window warnings appearing earlier than expected.

### Pitfall 2: Stale Tags on MEMORY.md Entries

**What goes wrong:** Tags assigned at write time become stale as vocabulary evolves. Entry tagged `[coding]` might be relevant to `[security]` but never recalled for security agents.
**Why it happens:** Tags are static labels on dynamic knowledge.
**How to avoid:** Keep tag vocabulary small and stable (10-15 tags). Use keyword matching as fallback for tag misses. Legacy entries (no tags) always included.
**Warning signs:** Agents missing relevant context that exists in MEMORY.md.

### Pitfall 3: Breaking Backward Compatibility

**What goes wrong:** Agents without cognition config in frontmatter break lu-cognition parsing.
**Why it happens:** Not all agent .md files are compiled from TypeScript. Some are hand-written.
**How to avoid:** Make `cognition` field optional with sensible defaults. If frontmatter missing or has no cognition field, treat as T0 (current behavior).
**Warning signs:** lu-cognition errors when encountering agents without cognition config.

### Pitfall 4: Complexity Promotion Loops

**What goes wrong:** Complexity promotion promotes an agent to T2, which adds more context, which might trigger complexity re-classification.
**Why it happens:** Adding cognitive context increases the effective "weight" of a task.
**How to avoid:** Complexity classification happens ONCE at routing time, before cognition config resolution. No re-classification after promotion.
**Warning signs:** Oscillating complexity levels between sessions.

## Code Examples

### Example: AgentFrontmatter with Cognition

```typescript
// src/agents/types/agent.schemas.ts
import { z } from "zod";

export const cognitionTierSchema = z.enum(["T0", "T1", "T2", "T3"]);

export const cognitionConfigSchema = z.object({
  default_tier: cognitionTierSchema.default("T0"),
  promotable_to: cognitionTierSchema.default("T0"),
  memory_tags: z.array(z.string()).default([]),
});

export const agentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()).optional(),
  color: z.string().optional(),
  cognition: cognitionConfigSchema.optional(),
});
```

### Example: Complexity Matrix with Cognition Promotions

```typescript
// src/complexity/types.ts addition
import type { CognitionTier } from "../agents/types/agent.types";

export interface ComplexityGate {
  // ... existing fields ...
  /** Optional cognition tier promotions at this complexity level */
  cognitionPromotions?: Partial<Record<CognitionTier, CognitionTier>>;
}
```

```typescript
// src/complexity/defaults.ts addition
COMPLEX: {
  // ... existing fields ...
  cognitionPromotions: {
    T1: 'T2',  // Memory-readers become session-aware
    T2: 'T3',  // Session-aware become fully-cognitive
  },
},
CRITICAL: {
  // ... existing fields ...
  cognitionPromotions: {
    T0: 'T1',  // Stateless agents get basic memory (if promotable_to allows)
    T1: 'T2',  // Memory-readers become session-aware
    T2: 'T3',  // Session-aware become fully-cognitive
  },
},
```

### Example: Tier Resolution Function

```typescript
// src/agents/cognition/resolve-tier.ts (new file)
import type { CognitionTier } from "../types/agent.types";
import type { ComplexityLevel } from "../../complexity/types";
import { DEFAULT_COMPLEXITY_MATRIX } from "../../complexity/defaults";

const TIER_ORDER: Record<CognitionTier, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
};

export function resolveEffectiveTier(
  defaultTier: CognitionTier,
  promotableTo: CognitionTier,
  complexityLevel: ComplexityLevel,
): CognitionTier {
  const gate = DEFAULT_COMPLEXITY_MATRIX[complexityLevel];
  const promotions = gate.cognitionPromotions;

  if (!promotions) return defaultTier;

  const promoted = promotions[defaultTier] ?? defaultTier;

  // Cap at promotable_to ceiling
  if (TIER_ORDER[promoted] > TIER_ORDER[promotableTo]) {
    return promotableTo;
  }

  return promoted;
}
```

## State of the Art

| Old Approach                  | Current Approach                                | When Changed               | Impact                                    |
| ----------------------------- | ----------------------------------------------- | -------------------------- | ----------------------------------------- |
| No cognition                  | Binary lite/full pre-flight                     | Phase 5 (cognition system) | All agents treated identically            |
| No agent tags in MEMORY       | Agent/Relevant to fields in lu-learner template | Phase 5                    | Fields exist but not populated in entries |
| No complexity-aware cognition | Lite/full based on TRIVIAL/SIMPLE vs MODERATE+  | Phase 13                   | Binary, not per-agent                     |

**What Phase 15 changes:**

- Per-agent cognition tiers (not binary)
- Tag-based selective memory recall (not keyword-only)
- Complexity-driven tier promotion (not static)
- Cognition config in agent metadata (not in lu-cognition logic)

## Specific File Changes Required

### Schema Files (2 files)

| File                                | Change                                                                              | Lines Affected      |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ------------------- |
| `src/agents/types/agent.schemas.ts` | Add `cognitionTierSchema`, `cognitionConfigSchema`, extend `agentFrontmatterSchema` | Lines 6-11 (extend) |
| `src/agents/types/agent.types.ts`   | Add `CognitionTier`, `CognitionConfig`, extend `AgentFrontmatter`                   | Lines 8-14 (extend) |

### Complexity Files (2 files)

| File                         | Change                                                  | Lines Affected                 |
| ---------------------------- | ------------------------------------------------------- | ------------------------------ |
| `src/complexity/types.ts`    | Add `cognitionPromotions` to `ComplexityGate` interface | Line 53-72 (extend interface)  |
| `src/complexity/defaults.ts` | Add `cognitionPromotions` to COMPLEX and CRITICAL gates | Lines 96-113 (extend defaults) |

### Compiler Files (2 files)

| File                               | Change                                                           | Lines Affected              |
| ---------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| `src/compilers/base.compiler.ts`   | No change needed (abstract methods)                              | None                        |
| `src/compilers/claude.compiler.ts` | Extend `compileAgent` to include YAML frontmatter with cognition | Lines 10-14 (extend method) |

### New Files (1 file)

| File                                   | Purpose                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `src/agents/cognition/resolve-tier.ts` | Tier resolution logic (default + promotion + ceiling) |

### Agent Definition Files (10 files to update)

Agents that need cognition sections added to their `.md` definitions:

| Agent File               | Section to Add              | Content                                                        |
| ------------------------ | --------------------------- | -------------------------------------------------------------- |
| `lu-executor.md`         | `<cognition_integration>`   | Memory recall for coding patterns, WORKING.md session tracking |
| `lu-planner.md`          | `<cognition_integration>`   | Decision recall for plan creation                              |
| `lu-verifier.md`         | `<cognition_integration>`   | Pitfall recall for verification                                |
| `lu-phase-researcher.md` | `<cognition_integration>`   | Stack/architecture recall                                      |
| `lu-plan-checker.md`     | `<cognition_integration>`   | Planning pitfall recall                                        |
| `lu-pr-reviewer.md`      | `<cognition_integration>`   | Convention recall                                              |
| `lu-cognition.md`        | Update `<selective_recall>` | Add tier resolution, tag filtering                             |
| `lu-learner.md`          | Update `<extract_*>` steps  | Add `Tags:` field to extraction template                       |
| `lu-debugger.md`         | No change needed            | Already has `<memory_aided_debugging>`                         |
| `lu-router.md`           | No change needed            | Already receives cognitive report                              |

### MEMORY.md Migration

One-time migration to add `Tags:` field to existing entries:

- **Strategy**: Infer tags from entry content keywords
- **Scope**: ~108 entries (36 patterns + 23 decisions + 31 pitfalls + 4 conventions + 5 anti-patterns + 9 preferences)
- **Risk**: Low (additive change, backward compatible)

## Open Questions

1. **Tag granularity**: Should tags be fine-grained (`bun-testing`, `shell-scripting`) or coarse-grained (`testing`, `coding`)? Recommendation: Start coarse (10-15 tags), refine if recall quality is insufficient.

2. **BRAIN.md loading**: Currently only T3 agents load BRAIN.md. Should T2 agents get a minimal BRAIN.md summary? Recommendation: Not in v1. T2 agents get memory recall but not project identity.

3. **Compiled vs hand-written agents**: Some agent .md files may be hand-written (not compiled from .agent.ts). Should cognition config be readable from both YAML frontmatter AND inline markdown? Recommendation: YAML frontmatter only. Hand-written agents default to T0.

4. **Memory context budget**: What's the maximum token budget for memory recall per tier? Recommendation: T1: 300 tokens, T2: 600 tokens, T3: 1200 tokens. Enforce via entry count limits.

## Sources

### Primary (HIGH confidence)

- All 25 agent files read in full (`/Users/alecsibilia/Github/luca-framework/.claude/agents/`)
- `src/agents/types/agent.schemas.ts` (30 lines) - Current schema structure
- `src/agents/types/agent.types.ts` (34 lines) - Current type definitions
- `src/complexity/types.ts` (93 lines) - Complexity type system
- `src/complexity/defaults.ts` (119 lines) - Default complexity matrix
- `src/compilers/base.compiler.ts` (20 lines) - Compiler base
- `src/compilers/claude.compiler.ts` (25 lines) - Claude compiler
- `.planning/MEMORY.md` (182 lines) - Current memory format and entries
- `.planning/phases/14-execution-verification-audit/AUDIT-REPORT.md` - Phase 14 audit structure

### Secondary (MEDIUM confidence)

- lu-cognition.md selective recall algorithm (lines 154-217) - Current agent-aware filtering
- lu-learner.md extraction template (lines 229-305) - Current entry format
- complexity-gating.md rule - Complexity matrix documentation

## Metadata

**Confidence breakdown:**

- Audit matrix (COGN-01): HIGH - Every agent file read in full
- Gap analysis (COGN-02): HIGH - Based on direct agent file analysis
- Tier system (COGN-03): HIGH - Follows established patterns from Phase 13
- Schema extension (COGN-04): HIGH - Exact file paths and line numbers identified
- Tag vocabulary (COGN-05): MEDIUM - Tag vocabulary derived from MEMORY.md analysis, needs validation

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (30 days - stable domain, internal architecture)
