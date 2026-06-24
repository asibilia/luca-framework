# Phase 16 Research — Context-Modular Sub-Agent Architecture

**Researcher:** lu-phase-researcher
**Date:** 2026-02-11
**Phase:** 16
**Requirements:** CTXM-01 through CTXM-06

---

## 1. Current Architecture — How Sub-Agents Are Defined, Compiled, and Spawned

### Agent Definition Structure

All agents are defined as TypeScript classes in `src/agents/general/*.agent.ts` (25 agents) and `src/agents/luca/*.agent.ts` (2 Luca-specific overrides). Each follows an identical pattern:

1. **Config object** (`AgentConfig` interface) with `frontmatter` + `sections`
2. **Class extending `BaseAgentImpl`** with a zero-arg constructor that passes config to `super()`
3. **Exported class** registered in `src/agents/index.ts` → `agentRegistry`

**Example from `/Users/alecsibilia/Github/luca-framework/src/agents/general/lu-executor.agent.ts` (lines 8-19):**

```typescript
const luexecutorConfig: AgentConfig = {
  frontmatter: {
    name: "lu-executor",
    description: "...",
    color: "yellow",
    cognition: {
      default_tier: "T2",
      promotable_to: "T3",
      memory_tags: ["coding", "patterns", "pitfalls", "conventions"],
    },
  },
  sections: [
    /* ... */
  ],
};
```

### Agent Registry

`/Users/alecsibilia/Github/luca-framework/src/agents/index.ts` exports `agentRegistry` — a flat object mapping kebab-case agent names to their class constructors. This is consumed by `build-claude.ts` for compilation. 23 general agents + 2 Luca-specific agents = 25 total compiled agents.

### Compilation Pipeline

Build scripts in `/Users/alecsibilia/Github/luca-framework/scripts/build-claude.ts`:

1. Instantiates each agent class from registry
2. Calls `compiler.compileAgent(instance, 'CLAUDE')`
3. Writes output to `.claude/agents/{name}.md`

Luca-specific agents (`lu-executor`, `lu-planner`) are compiled separately after registry agents (lines 80-89 of `build-claude.ts`), overwriting the general version.

### Spawning Mechanism

Sub-agents are spawned by the **lu-execute-phase orchestrator skill** (`/Users/alecsibilia/Github/luca-framework/.claude/skills/lu-execute-phase/SKILL.md`). The orchestrator:

1. Reads plan files and state files via `cat` commands
2. Constructs prompt strings with embedded context
3. Spawns agents via `Task()` with `subagent_type="{agent-name}"`

**There is no runtime TypeScript involvement in spawning.** The orchestrator is a compiled skill (.md) that constructs prompts manually and delegates via Claude Code's Task tool.

---

## 2. Type System Analysis — Existing Schemas and Where Context Types Fit

### Core Schemas (`/Users/alecsibilia/Github/luca-framework/src/agents/types/agent.schemas.ts`)

| Schema                   | Purpose                                             | Lines  |
| ------------------------ | --------------------------------------------------- | ------ |
| `cognitionTierSchema`    | `z.enum(["T0", "T1", "T2", "T3"])` — 4 tiers        | L7     |
| `cognitionConfigSchema`  | `{ default_tier, promotable_to, memory_tags }`      | L10-17 |
| `agentFrontmatterSchema` | `{ name, description, tools?, color?, cognition? }` | L19-26 |
| `agentSectionSchema`     | `{ title, content, order? }`                        | L28-32 |
| `agentConfigSchema`      | `{ frontmatter, sections }`                         | L34-37 |

### TypeScript Interfaces (`/Users/alecsibilia/Github/luca-framework/src/agents/types/agent.types.ts`)

Mirror the Zod schemas. Key note: `AgentFrontmatter` has `[key: string]: unknown` (line 32) — an index signature allowing arbitrary additional fields. This means adding `context` config alongside `cognition` is safe without modifying the base type.

### Complexity Types (`/Users/alecsibilia/Github/luca-framework/src/complexity/types.ts`)

| Type/Interface     | Purpose                                                          | Lines  |
| ------------------ | ---------------------------------------------------------------- | ------ |
| `ComplexityLevel`  | `"TRIVIAL" \| "SIMPLE" \| "MODERATE" \| "COMPLEX" \| "CRITICAL"` | L14-21 |
| `ComplexityGate`   | Per-level workflow config including `cognitionPromotions`        | L65-87 |
| `ComplexityMatrix` | Maps each level to its gate                                      | L90    |

**Critical finding:** `ComplexityGate.cognitionPromotions` (line 86) maps `CognitionTier -> CognitionTier`. Phase 16 needs a parallel `contextPromotions` field on `ComplexityGate`.

### Where New Context Types Fit

New types should follow the established pattern:

1. **`src/context/types.ts`** — Define `ContextTier`, `ContextConfig`, `ContextProfile`, `ResultEnvelope`
2. **`src/agents/types/agent.schemas.ts`** — Add `contextConfigSchema` alongside `cognitionConfigSchema`
3. **`src/agents/types/agent.types.ts`** — Add `ContextConfig` interface
4. **`src/complexity/types.ts`** — Add `contextPromotions` to `ComplexityGate`

The `ContextTier` should reuse the same `"T0" | "T1" | "T2" | "T3"` enum values but as an independent dimension, matching the 16-CONTEXT.md Decision 2 (independent promotion tracks).

---

## 3. Compilation Pipeline — How `.agent.ts` -> `.md` Works

### Build Flow

```
src/agents/general/*.agent.ts
     |
     v
agentRegistry (src/agents/index.ts)
     |
     v
build-claude.ts → ClaudeCompiler.compileAgent()
     |
     v
.claude/agents/*.md
```

### ClaudeCompiler (`/Users/alecsibilia/Github/luca-framework/src/compilers/claude.compiler.ts`)

**Lines 18-38 — `compileAgent()` method:**

```typescript
compileAgent(agent: BaseAgent, format: SupportedFormat): string {
  this.validateFormat(format);
  const markdown = agent.toClaudeFormat();

  // If cognition config is present, prepend YAML frontmatter
  const cognition = agent.config.frontmatter.cognition;
  if (cognition) {
    const frontmatterData: Record<string, unknown> = {
      name: agent.name,
      cognition: {
        default_tier: cognition.default_tier,
        promotable_to: cognition.promotable_to,
        memory_tags: cognition.memory_tags,
      },
    };
    const yamlBlock = formatFrontmatter(frontmatterData);
    return `${yamlBlock}\n\n${markdown}`;
  }

  return markdown;
}
```

**Key observations:**

1. YAML frontmatter is only emitted when `cognition` config is present
2. The frontmatter contains `name` + `cognition` fields
3. Frontmatter is used by `lu-cognition` at runtime to discover agent tier configs
4. `formatFrontmatter()` in `src/shared/utils.ts` uses `js-yaml` for YAML serialization

### Where Context Config Gets Added

The ClaudeCompiler's `compileAgent()` method needs to:

1. Also check for `context` in `agent.config.frontmatter`
2. Emit `context` config in the YAML frontmatter alongside `cognition`

**Modified frontmatter would look like:**

```yaml
---
name: lu-executor
cognition:
  default_tier: T2
  promotable_to: T3
  memory_tags:
    - coding
    - patterns
context:
  default_tier: T2
  promotable_to: T3
  isolation: warm
---
```

### Compiled Output Example

Current compiled output (`/Users/alecsibilia/Github/luca-framework/.claude/agents/lu-executor.md`, lines 1-11):

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
```

This is followed by `# lu-executor`, description, and `## {section_title}` sections.

### `toClaudeFormat()` (`/Users/alecsibilia/Github/luca-framework/src/agents/base/base-agent.ts`, line 33)

```typescript
toClaudeFormat(): string {
  return toClaudeFormat(`# ${this.name}\n\n${this.description}`, this._config.sections);
}
```

Calls `toClaudeFormat()` from `src/shared/format.ts` which concatenates heading + `## {section.title}` blocks sorted by order.

### CursorCompiler (`/Users/alecsibilia/Github/luca-framework/src/compilers/cursor.compiler.ts`)

Simpler — just calls `agent.toCursorFormat()` which uses `formatFrontmatter()` for YAML and wraps sections in XML tags. Also needs parallel context config emission.

---

## 4. Context Passing Audit — What Each Agent Type Receives Today

### lu-executor (Plan Execution)

**Source:** lu-execute-phase SKILL.md, lines 262-307 ("Step 4. Execute Waves")

Currently receives in Task prompt:

- `{plan_XX_content}` — Full plan content (cat from file)
- `{state_content}` — Full STATE.md
- `{working_content}` — Full WORKING.md
- Phase number and wave number metadata
- Hardcoded `<execution_rules>` block

**Context tier mapping (per 16-CONTEXT.md Decision 1):**

- T0: Plan content only (remove state, working)
- T1: + BRAIN.md summary / project conventions
- T2: + STATE.md + selective MEMORY + WORKING.md (current behavior ~ T2)
- T3: + Full BRAIN + full MEMORY + summaries from other agents

**Observation:** Current executor spawn is roughly T2-level context. This aligns with its `default_tier: T2` cognition config.

### lu-verifier (Verification)

**Source:** lu-execute-phase SKILL.md, lines 459-527 ("Step 7. Verify Phase Goal")

Currently receives:

- Phase number and directory path
- Phase goal (from ROADMAP.md)
- All execution SUMMARY.md files (concatenated)
- All PLAN.md contents (for specification anchoring)
- STATE.md
- WORKING.md
- Harness results (status, checks, errors)

**Per Decision 6 (Writer/Reviewer Isolation - Warm):**
Should receive: Plan content + SUMMARY.md + harness results + ROADMAP requirements
Should NOT receive: WORKING.md (prevents bias from executor self-assessment)

**Current violation:** Verifier currently gets WORKING.md (line 465: `WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "")`). Phase 16 should remove this.

### Code Reviewers (dx-advocate, code-simplifier, code-architect, security-auditor)

**Source:** lu-execute-phase SKILL.md, lines 594-741 ("Step 7.5 Code Quality Review")

Currently receives:

- `{CHANGED_FILES}` — Git diff file list
- `{claude_content}` — CLAUDE.md project standards
- Focus-specific instructions per reviewer role
- Return format specification

**Per Decision 6 (Writer/Reviewer Isolation - Cold):**
Should receive: Git diff + BRAIN.md conventions
Should NOT receive: Plan content, execution history, WORKING.md, SUMMARY.md

**Current status:** Reviewers currently get CLAUDE.md (project standards), NOT the full execution context. This is already close to "cold" isolation. Phase 16 formalizes this and adds BRAIN.md.

### lu-learner (Learning Capture)

**Source:** lu-execute-phase SKILL.md, lines 76-112 ("Learning Capture")

Currently receives:

- Phase number
- Verification result
- WORKING.md content (full)
- MEMORY.md content (full)
- Extraction targets (patterns, decisions, pitfalls, preferences)

**Context tier:** lu-learner is T1 (default) promotable to T2. At T1, it should receive BRAIN.md summary + selective MEMORY. Currently gets full MEMORY.

### Harness Fix Executor

**Source:** lu-execute-phase SKILL.md, lines 415-435 ("Step 6.6 Failure-to-Fix Loop")

Currently receives:

- Structured errors JSON from harness
- Fix instructions (hardcoded rules)
- Iteration count

**Context tier:** This is a minimal context spawn. Aligns with T0 (plan/task content only — in this case, errors to fix).

---

## 5. Module Structure Reference — Template for `src/context/`

### `src/harness/` Structure (Reference Pattern)

```
src/harness/
  types.ts       — Interfaces + DEFAULT_HARNESS_CONFIG constant
  runner.ts      — Core logic (loadHarnessConfig, runHarness, runCheck)
  index.ts       — Public API (re-exports types, runner, parsers)
  parsers/
    index.ts     — Parser registry (Record<string, OutputParser>)
    tsc.ts       — TypeScript compiler output parser
    bun-test.ts  — Bun test output parser
    eslint.ts    — ESLint JSON output parser
    generic.ts   — Fallback line parser
```

**Pattern:** `types.ts` defines interfaces + defaults. `runner.ts` has runtime logic. `index.ts` is public API. Subdirectories for grouped utilities.

### `src/complexity/` Structure (Reference Pattern)

```
src/complexity/
  types.ts       — Interfaces, const enums, utility functions (meetsThreshold, getTier)
  defaults.ts    — DEFAULT_COMPLEXITY_MATRIX, COMPLEXITY_CLASSIFICATIONS
  index.ts       — Public API (re-exports everything)
```

**Pattern:** Simpler module. `types.ts` + `defaults.ts` + `index.ts`. No runtime functions beyond utilities.

### Proposed `src/context/` Structure

```
src/context/
  types.ts           — ContextTier, ContextConfig, IsolationLevel, ContextProfile, ResultEnvelope schemas
  defaults.ts        — DEFAULT_CONTEXT_PROFILES, DEFAULT_CONTEXT_MATRIX
  context-profiles.ts — Tier definitions and context section mappings (T0-T3)
  context-assembler.ts — Assembly functions per agent role
  result-envelope.ts  — Zod schema + safeParseResultEnvelope() with fallback-to-raw
  resolve-tier.ts     — resolveEffectiveContextTier() (mirrors cognition/resolve-tier.ts)
  index.ts            — Public API
```

This mirrors the complexity module's `types.ts + defaults.ts` pattern and adds domain-specific files per 16-CONTEXT.md Decision 7.

---

## 6. Implementation Recommendations

### File Creation Order

#### Wave 1: Type Foundation (no dependencies on other waves)

| File                             | Purpose                                                                                           | Estimated Lines | Priority |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | --------------- | -------- |
| `src/context/types.ts`           | ContextTier, ContextConfig, IsolationLevel, ContextProfile, ResultEnvelope Zod schemas + TS types | 120-150         | Critical |
| `src/context/defaults.ts`        | DEFAULT_CONTEXT_PROFILES mapping T0-T3 to context sections                                        | 80-100          | Critical |
| `src/context/result-envelope.ts` | ResultEnvelope Zod schema + `safeParseResultEnvelope()` with fallback-to-raw                      | 60-80           | Critical |
| `src/context/resolve-tier.ts`    | `resolveEffectiveContextTier()` mirroring `src/agents/cognition/resolve-tier.ts`                  | 40-50           | Critical |
| `src/context/index.ts`           | Public API re-exports                                                                             | 15-20           | Critical |

#### Wave 2: Schema Integration (depends on Wave 1)

| File                                | Modification                                                                       | Estimated Scope |
| ----------------------------------- | ---------------------------------------------------------------------------------- | --------------- |
| `src/agents/types/agent.schemas.ts` | Add `contextConfigSchema`, add `context` field to `agentFrontmatterSchema`         | +15 lines       |
| `src/agents/types/agent.types.ts`   | Add `ContextConfig` interface, add `context?: ContextConfig` to `AgentFrontmatter` | +10 lines       |
| `src/complexity/types.ts`           | Add `contextPromotions` to `ComplexityGate` interface                              | +3 lines        |
| `src/complexity/defaults.ts`        | Add `contextPromotions` values to `DEFAULT_COMPLEXITY_MATRIX`                      | +8 lines        |

#### Wave 3: Context Assembly Functions (depends on Waves 1-2)

| File                               | Purpose                                                                                     | Estimated Lines |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | --------------- |
| `src/context/context-profiles.ts`  | Profile definitions mapping tiers to context sections                                       | 80-120          |
| `src/context/context-assembler.ts` | `assembleExecutorContext()`, `assembleVerifierContext()`, `assembleReviewerContext()`, etc. | 150-200         |

#### Wave 4: Compilation Integration (depends on Waves 1-3)

| File                               | Modification                                                    | Estimated Scope |
| ---------------------------------- | --------------------------------------------------------------- | --------------- |
| `src/compilers/claude.compiler.ts` | Emit `context` config in YAML frontmatter alongside `cognition` | +10-15 lines    |
| `src/compilers/cursor.compiler.ts` | Parallel changes for Cursor format                              | +5-10 lines     |
| All 27 `*.agent.ts` files          | Add `context` config to frontmatter                             | +5-8 lines each |

#### Wave 5: Orchestrator Update (depends on Waves 1-4)

| File                                     | Modification                                                              | Estimated Scope       |
| ---------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| `src/skills/*/lu-execute-phase.skill.ts` | Update Task() prompts to use context profiles, implement isolation levels | 100-150 lines changed |

#### Wave 6: Testing (parallel with all waves)

| File                                      | Purpose                           | Estimated Lines |
| ----------------------------------------- | --------------------------------- | --------------- |
| `tests/context/types.test.ts`             | Schema validation tests           | 60-80           |
| `tests/context/resolve-tier.test.ts`      | Context tier resolution tests     | 40-60           |
| `tests/context/result-envelope.test.ts`   | Envelope parsing + fallback tests | 40-60           |
| `tests/context/context-assembler.test.ts` | Assembly function output tests    | 80-100          |

### Key Design Details

#### Context Config Schema (for `src/context/types.ts`)

```typescript
// Context tier reuses same T0-T3 values as cognition (per 16-CONTEXT Decision 1)
export const contextTierSchema = z.enum(["T0", "T1", "T2", "T3"]);

// Isolation level for writer/reviewer separation (per Decision 6)
export const isolationLevelSchema = z.enum(["none", "cold", "warm"]);

// Per-agent context configuration
export const contextConfigSchema = z.object({
  default_tier: contextTierSchema.default("T0"),
  promotable_to: contextTierSchema.default("T0"),
  isolation: isolationLevelSchema.default("none"),
});
```

#### Result Envelope Schema (for `src/context/result-envelope.ts`)

Per 16-CONTEXT.md Decision 4:

```typescript
export const resultEnvelopeSchema = z.object({
  status: z.enum(["passed", "failed", "partial", "unknown"]),
  summary: z.string(),
  artifacts: z
    .array(
      z.object({
        path: z.string(),
        action: z.enum(["created", "modified", "deleted"]),
      }),
    )
    .default([]),
  issues: z
    .array(
      z.object({
        severity: z.enum(["critical", "high", "medium", "low"]),
        file: z.string().optional(),
        line: z.number().optional(),
        message: z.string(),
        source_agent: z.string(),
      }),
    )
    .default([]),
  metadata: z.record(z.unknown()).default({}),
});
```

Parsing utility with fallback-to-raw:

```typescript
export function safeParseResultEnvelope(raw: string): ResultEnvelope {
  // Try YAML parse first, then JSON, then fallback to raw
  const result = resultEnvelopeSchema.safeParse(parsed);
  if (result.success) return result.data;
  // Fallback: wrap raw output as summary with status='unknown'
  return {
    status: "unknown",
    summary: raw,
    artifacts: [],
    issues: [],
    metadata: {},
  };
}
```

#### Context Profiles (for `src/context/context-profiles.ts`)

Per 16-CONTEXT.md Decision 1:

```typescript
// T0: Plan content only
// T1: + BRAIN.md summary / project conventions
// T2: + STATE.md + selective MEMORY + WORKING.md
// T3: + Full BRAIN + full MEMORY + summaries from other agents

export type ContextSection =
  | "plan_content"
  | "brain_summary"
  | "state"
  | "selective_memory"
  | "working_memory"
  | "full_brain"
  | "full_memory"
  | "agent_summaries";
```

#### Context Promotions (for `src/complexity/defaults.ts`)

Per 16-CONTEXT.md Decision 2 (context promotes one level earlier):

```typescript
// MODERATE gets context promotions (cognition does not promote until COMPLEX)
MODERATE: {
  // ... existing fields ...
  cognitionPromotions: undefined,  // No change
  contextPromotions: { T0: "T1", T1: "T2" },  // NEW
},
COMPLEX: {
  // ... existing fields ...
  cognitionPromotions: { T1: "T2", T2: "T3" },  // Existing
  contextPromotions: { T1: "T2", T2: "T3" },    // NEW (matches cognition at this level)
},
CRITICAL: {
  // ... existing fields ...
  cognitionPromotions: { T0: "T1", T1: "T2", T2: "T3" },  // Existing
  contextPromotions: { T0: "T1", T1: "T2", T2: "T3" },    // NEW (matches cognition)
},
```

#### Agent Config Mapping

Each of the 27 agent `.ts` files needs a `context` config added to frontmatter. Recommended values based on agent roles:

| Agent                   | Context Default | Context Promotable | Isolation | Rationale                                   |
| ----------------------- | --------------- | ------------------ | --------- | ------------------------------------------- |
| lu-executor             | T2              | T3                 | none      | Needs plan + state + memory for execution   |
| lu-planner              | T1              | T2                 | none      | Needs BRAIN for conventions, not full state |
| lu-verifier             | T1              | T2                 | warm      | Needs plan + summaries, NOT working memory  |
| lu-learner              | T1              | T2                 | none      | Needs working + memory for extraction       |
| lu-cognition            | T3              | T3                 | none      | Full access to all context                  |
| lu-debugger             | T2              | T3                 | none      | Needs full state for debugging              |
| lu-router               | T0              | T1                 | none      | Only needs request context                  |
| dx-advocate             | T0              | T0                 | cold      | Only needs diff + conventions               |
| code-simplifier         | T0              | T0                 | cold      | Only needs diff + conventions               |
| code-architect          | T0              | T1                 | cold      | Only needs diff + conventions               |
| security-auditor        | T0              | T1                 | cold      | Only needs diff + conventions               |
| performance-auditor     | T0              | T1                 | cold      | Only needs diff + conventions               |
| lu-plan-checker         | T1              | T2                 | none      | Needs plan + BRAIN for validation           |
| lu-pr-reviewer          | T0              | T1                 | cold      | Review role                                 |
| lu-roadmapper           | T1              | T1                 | none      | Needs project state                         |
| lu-phase-researcher     | T1              | T2                 | none      | Needs project context for research          |
| lu-research-synthesizer | T1              | T1                 | none      | Needs prior research                        |
| lu-integration-checker  | T1              | T2                 | none      | Needs codebase understanding                |
| lu-codebase-mapper      | T1              | T1                 | none      | Needs project structure                     |
| product                 | T0              | T1                 | none      | Minimal context needed                      |
| qa-plan-generator       | T1              | T2                 | none      | Needs plan context for test generation      |
| ui                      | T0              | T0                 | cold      | Design review only                          |
| ux                      | T0              | T0                 | cold      | Design review only                          |

### Orchestrator Changes Detail

The primary orchestrator that needs updating is `lu-execute-phase` SKILL.md (compiled from a skill `.ts` file). Changes needed:

1. **Step 4 (Execute Waves):** Replace hardcoded context construction with tier-aware assembly
   - Read agent's context tier from compiled frontmatter
   - Apply complexity-based context promotions
   - Assemble context based on effective tier
   - Apply isolation rules (warm/cold) for appropriate agents

2. **Step 7 (Verify Phase Goal):** Apply warm isolation
   - Remove WORKING.md from verifier context
   - Keep plan content and summaries

3. **Step 7.5 (Code Review):** Apply cold isolation
   - Ensure reviewers only get diff + BRAIN.md conventions
   - Remove any plan/execution/working context

4. **Step 6.6 (Fix Loop):** Keep at T0 (minimal context, just errors)

### Risks and Considerations

1. **Backward Compatibility:** All changes to agent schemas use `.optional()` — existing agents without `context` config default to T0/none isolation, preserving current behavior.

2. **Build-Time vs Runtime:** Per 16-CONTEXT.md Decision 7, context assembly functions exist in TypeScript but produce prompt strings consumed at build time (compiled into SKILL.md). No runtime TS execution.

3. **Independent Promotion Tracks:** The `resolveEffectiveContextTier()` function must be fully independent from `resolveEffectiveTier()` (cognition). They share the same TIER_ORDER but have separate promotion matrices.

4. **Output Reservation (Advisory):** Per Decision 3, the 25-50% output reservation is NOT enforced at runtime. It should be documented in context profiles as guidance for context assembly functions (keep total context under ~50% of model context window to leave room for output).

5. **Result Envelope Adoption:** Per Decision 4, the universal result envelope is a Zod schema. Not all agents will immediately return structured results — the fallback-to-raw mechanism handles this gracefully. Adoption can be progressive.

6. **Agent Definition vs Task Context:** Per Decision 8, agent `.md` files remain behavioral instructions only. Context config in frontmatter tells the orchestrator WHAT to load, but the agent prompt itself doesn't contain the data. The orchestrator reads the tier, assembles context, and injects it into the Task() prompt.

---

## Appendix: File Reference Index

### Files to Create

| Path                               | Purpose                               |
| ---------------------------------- | ------------------------------------- |
| `src/context/types.ts`             | Core type definitions and Zod schemas |
| `src/context/defaults.ts`          | Default context profiles and matrices |
| `src/context/context-profiles.ts`  | Tier-to-section mappings              |
| `src/context/context-assembler.ts` | Per-role context assembly functions   |
| `src/context/result-envelope.ts`   | Result envelope schema + parser       |
| `src/context/resolve-tier.ts`      | Context tier resolution               |
| `src/context/index.ts`             | Public API                            |
| `tests/context/*.test.ts`          | Test files                            |

### Files to Modify

| Path                                     | Change                                                     | Scope           |
| ---------------------------------------- | ---------------------------------------------------------- | --------------- |
| `src/agents/types/agent.schemas.ts`      | Add `contextConfigSchema`, update `agentFrontmatterSchema` | ~15 lines       |
| `src/agents/types/agent.types.ts`        | Add `ContextConfig` interface, update `AgentFrontmatter`   | ~10 lines       |
| `src/complexity/types.ts`                | Add `contextPromotions` to `ComplexityGate`                | ~3 lines        |
| `src/complexity/defaults.ts`             | Add `contextPromotions` to MODERATE/COMPLEX/CRITICAL gates | ~8 lines        |
| `src/compilers/claude.compiler.ts`       | Emit `context` in YAML frontmatter                         | ~15 lines       |
| `src/compilers/cursor.compiler.ts`       | Parallel context emission                                  | ~10 lines       |
| 27x `src/agents/*/**.agent.ts`           | Add `context` config to each agent's frontmatter           | ~5-8 lines each |
| `src/skills/*/lu-execute-phase.skill.ts` | Update Task() prompts with tier-aware context assembly     | ~100-150 lines  |

### Files Read During Research

| Path                                                                      | What Was Learned                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/agents/types/agent.schemas.ts`                                       | Zod schemas for cognition tier, agent config                 |
| `src/agents/types/agent.types.ts`                                         | TypeScript interfaces, index signature on AgentFrontmatter   |
| `src/agents/base/base-agent.ts`                                           | BaseAgentImpl class, toCursorFormat/toClaudeFormat methods   |
| `src/agents/index.ts`                                                     | Agent registry structure                                     |
| `src/agents/cognition/resolve-tier.ts`                                    | Tier resolution logic (template for context tier resolution) |
| `src/agents/general/lu-executor.agent.ts`                                 | Executor config with cognition T2/T3                         |
| `src/agents/general/lu-verifier.agent.ts`                                 | Verifier config with cognition T1/T2                         |
| `src/agents/general/code-architect.agent.ts`                              | Reviewer config with cognition T0/T1                         |
| `src/agents/general/dx-advocate.agent.ts`                                 | Reviewer config with cognition T0/T0                         |
| `src/agents/general/code-simplifier.agent.ts`                             | Reviewer config with cognition T0/T0                         |
| `src/agents/general/lu-planner.agent.ts`                                  | Planner config with cognition T1/T2                          |
| `src/agents/general/lu-cognition.agent.ts`                                | Cognition agent config with T3/T3                            |
| `src/agents/luca/lu-executor.agent.ts`                                    | Luca-specific executor override                              |
| `src/complexity/types.ts`                                                 | ComplexityGate with cognitionPromotions                      |
| `src/complexity/defaults.ts`                                              | DEFAULT_COMPLEXITY_MATRIX with COMPLEX/CRITICAL promotions   |
| `src/complexity/index.ts`                                                 | Public API pattern                                           |
| `src/harness/types.ts`                                                    | Interface + DEFAULT constant pattern                         |
| `src/harness/runner.ts`                                                   | Runtime execution pattern                                    |
| `src/harness/index.ts`                                                    | Public API re-export pattern                                 |
| `src/compilers/claude.compiler.ts`                                        | Cognition frontmatter emission logic                         |
| `src/compilers/cursor.compiler.ts`                                        | Cursor format compilation                                    |
| `src/compilers/base.compiler.ts`                                          | Abstract compiler interface                                  |
| `src/shared/format.ts`                                                    | toClaudeFormat/toCursorFormat helpers                        |
| `src/shared/utils.ts`                                                     | formatFrontmatter (YAML serialization)                       |
| `src/shared/types.ts`                                                     | Result<T> discriminated union                                |
| `src/shared/validation-utils.ts`                                          | Schema validation utilities                                  |
| `scripts/build-claude.ts`                                                 | Build pipeline, registry iteration, Luca overrides           |
| `scripts/build-utils.ts`                                                  | Directory management utilities                               |
| `.claude/skills/lu-execute-phase/SKILL.md`                                | Full orchestrator skill with context passing                 |
| `.claude/agents/lu-executor.md`                                           | Compiled agent output format                                 |
| `.planning/phases/16-context-modular-subagent-architecture/16-CONTEXT.md` | All 8 decisions for Phase 16                                 |
| `.planning/REQUIREMENTS.md`                                               | CTXM-01 through CTXM-06 requirement definitions              |
| `.planning/ROADMAP.md`                                                    | Phase 16 goal and dependencies                               |

---

_Research completed: 2026-02-11_
_Files analyzed: 30+_
_Architecture patterns identified: 3 (types+defaults+index, registry+compiler, orchestrator+subagent)_
_Ready for planning phase._
