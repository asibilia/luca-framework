# Phase 3: Deferred/Lazy Recall - Research

**Researched:** 2026-03-09
**Domain:** Cognitive memory loading optimization (lu-cognition, shared memory utilities)
**Confidence:** HIGH

## Summary

This research investigates the current memory loading architecture in Luca to determine precisely what changes are needed for deferred/lazy recall. The codebase has a clear separation: lu-cognition is a prompt-based agent (not executable TypeScript) that instructs LLMs how to load memory, while `buildMemoryContextBlock()` in `src/shared/__helpers/memory-context-builder.ts` is the TypeScript utility that formats recalled content for sub-agent injection. Skills like `phase-execute` and `phase-plan` perform their own MuninnDB recall calls and pass results through `buildMemoryContextBlock()`.

The key insight is that "deferred recall" operates at two layers: (1) the lu-cognition agent prompt that instructs what to load at session start, and (2) the skill-level memory loading where orchestrators call MuninnDB and format context for sub-agents. The new `requestMemoryContext()` function and session-scoped recall cache will live in `src/shared/__helpers/` alongside the existing `memory-context-builder.ts`, following the established pattern of module-scoped `Map` caches.

**Primary recommendation:** Add `eager_recall` boolean to `CognitionConfigSchema`, create a new `recall-cache.ts` module with a session-scoped `Map` cache, create `requestMemoryContext()` as a wrapper that performs recall-once-then-cache, update lu-cognition's prompt to default to brain-tree-only loading, and update skill memory-loading sections to reference the new deferred API.

## Standard Stack

No new external libraries are needed. This phase works entirely within existing infrastructure.

### Core

| Library      | Version  | Purpose                                                     | Why Standard                                   |
| ------------ | -------- | ----------------------------------------------------------- | ---------------------------------------------- |
| zod          | existing | Schema definition for `eager_recall` field and cache config | Already used across all schemas in the project |
| MuninnDB MCP | existing | Memory storage/recall (unchanged)                           | Project's canonical memory system              |

### Supporting

| Library | Version  | Purpose                                   | When to Use                             |
| ------- | -------- | ----------------------------------------- | --------------------------------------- |
| lodash  | existing | Utility functions if needed for filtering | Already used per lodash-preference rule |

### Alternatives Considered

| Instead of                      | Could Use                        | Tradeoff                                                                                                                                               |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Module-scoped Map cache         | WeakMap / external cache         | Map is simpler, matches existing `formatCache` pattern in memory-context-builder.ts; session lifetime is short enough that cleanup is manual `clear()` |
| Single `requestMemoryContext()` | Separate cache + query functions | Single function is simpler API surface for skills to consume                                                                                           |

## Architecture Patterns

### Current Memory Loading Architecture

The current memory flow has three layers:

```
Layer 1: lu-cognition (prompt/agent)
  - Session start: loads brain tree + full semantic recall + session init
  - Produces cognitive report for downstream agents
  - Gated by cognition tier (T0-T3) and complexity (lite vs full mode)

Layer 2: Skills (phase-execute, phase-plan)
  - Step 0/4: Call mcp__muninn__muninn_recall() directly
  - Format via buildMemoryContextBlock()
  - Inject {working_content} into Task() prompts for sub-agents

Layer 3: Sub-agents (lu-executor, lu-planner, etc.)
  - Receive pre-formatted <memory_context> blocks
  - Do NOT call MuninnDB directly for recall
```

### Proposed Architecture (Deferred)

```
Layer 1: lu-cognition (prompt/agent) -- CHANGED
  - Session start: loads ONLY brain tree (~1K tokens)
  - Skips selective_recall, load_global_memory steps by default
  - Agents with eager_recall: true still get full recall

Layer 2: Skills (phase-execute, phase-plan) -- CHANGED
  - Replace direct mcp__muninn__muninn_recall() with requestMemoryContext()
  - requestMemoryContext() checks session cache first
  - First call triggers actual MuninnDB recall and caches result
  - Subsequent calls return cached result, filtered by agent tags

Layer 3: Sub-agents -- UNCHANGED
  - Still receive pre-formatted <memory_context> blocks
  - No behavioral change
```

### Recommended File Structure

```
src/shared/__helpers/
  recall-cache.ts            # NEW: Session-scoped recall cache
  memory-context-builder.ts  # MODIFIED: Add requestMemoryContext() or keep separate

src/agents/__schemas/
  agent.schemas.ts           # MODIFIED: Add eager_recall to CognitionConfigSchema

src/agents/general/
  lu-cognition.agent.ts      # MODIFIED: Update prompt for deferred default

src/skills/general/
  phase-execute.skill.ts     # MODIFIED: Update memory loading to use deferred API
  phase-plan.skill.ts        # MODIFIED: Update memory loading to use deferred API

src/shared/
  index.ts                   # MODIFIED: Barrel export new functions
```

### Pattern 1: Module-Scoped Map Cache (Existing Pattern)

**What:** In-memory cache using module-scoped `Map` with explicit `clear()` function.
**When to use:** Session-scoped caching where the module lifecycle matches the session.
**Source:** `src/shared/__helpers/memory-context-builder.ts` lines 38, 219-221

```typescript
// Existing pattern in memory-context-builder.ts
const formatCache = new Map<string, string>();

export function clearMemoryContextCache(): void {
  formatCache.clear();
}
```

This is the pattern to follow for the recall cache. The recall cache will store raw MuninnDB recall results keyed by session ID.

### Pattern 2: Zod Schema Extension with Default (Existing Pattern)

**What:** Adding optional boolean fields to existing Zod schemas with defaults.
**When to use:** Extending configuration schemas without breaking existing consumers.
**Source:** `src/agents/__schemas/agent.schemas.ts` line 28-35

```typescript
// Existing CognitionConfigSchema
export const CognitionConfigSchema = z.object({
  default_tier: CognitionTierSchema.default("T0"),
  promotable_to: CognitionTierSchema.default("T0"),
  memory_tags: z.array(z.string()).default([]),
  // NEW: Add here
  // eager_recall: z.boolean().default(false),
});
```

Adding `eager_recall` with `.default(false)` ensures all 37 existing agent definitions continue to work without modification (they'll default to `false` = deferred).

### Pattern 3: Skill Prompt Instructions (Existing Pattern)

**What:** Skills contain TypeScript code examples in their prompt text that instruct LLMs how to use utilities.
**When to use:** When skills need to reference internal TypeScript APIs in their instructional prompts.
**Source:** `src/skills/general/phase-execute.skill.ts` lines 341-352

````typescript
// In skill prompt text (this is instructional, not executed):
// ```typescript
// import { buildMemoryContextBlock } from "~/shared";
// const workingContent = buildMemoryContextBlock({...});
// ```
````

The same pattern will be used to instruct skills to call `requestMemoryContext()`.

### Anti-Patterns to Avoid

- **Do NOT create a separate recall service/singleton**: Follow the existing pattern of module-scoped state with explicit clear(). No classes, no service locators.
- **Do NOT modify the MuninnDB MCP interface**: This phase changes WHEN recall happens, not HOW. The actual `mcp__muninn__muninn_recall()` call stays the same.
- **Do NOT touch sub-agent memory injection**: Sub-agents still receive `<memory_context>` blocks. The change is in the orchestrator layer (skills), not the consumer layer (sub-agents).

## Don't Hand-Roll

| Problem                   | Don't Build                           | Use Instead                                                       | Why                                                                                 |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Memory context formatting | Custom formatter for recalled content | `buildMemoryContextBlock()` (existing)                            | Already handles prioritization, truncation, caching, token budgets                  |
| Cache invalidation        | TTL-based cache expiry, LRU eviction  | Simple `Map.clear()` on session boundary                          | Sessions are short-lived (minutes to hours); no stale data concern within a session |
| MuninnDB recall parsing   | Custom parsing of recall results      | Accept MuninnDB output as-is, pass to `buildMemoryContextBlock()` | The recall results are already structured text from MuninnDB                        |
| Agent tag filtering       | Complex tag intersection logic        | Simple `Set` intersection or `Array.filter`                       | Agent memory_tags are small arrays (1-4 items typically)                            |

**Key insight:** The recall cache is deliberately simple. It stores the raw recall result once per session, and `buildMemoryContextBlock()` handles all the downstream formatting. Don't conflate the two concerns.

## Common Pitfalls

### Pitfall 1: Breaking Existing Agent Definitions

**What goes wrong:** Adding a required field to `CognitionConfigSchema` would break all 37 existing agent files that don't specify it.
**Why it happens:** Forgetting to add `.default(false)` or `.optional()` to the new field.
**How to avoid:** Use `z.boolean().default(false)` so existing agents that don't specify `eager_recall` automatically get the deferred behavior.
**Warning signs:** TypeScript compilation errors in agent files, or `parse()` failures at runtime.

### Pitfall 2: lu-cognition Is a Prompt, Not Executable Code

**What goes wrong:** Attempting to write TypeScript logic inside `lu-cognition.agent.ts` that "calls" the recall cache.
**Why it happens:** Confusion between the agent definition (which is a prompt template compiled to markdown) and executable TypeScript modules.
**How to avoid:** lu-cognition's changes are purely prompt text modifications -- changing the instructional steps. The actual `requestMemoryContext()` function lives in `src/shared/__helpers/` and is referenced in skill prompts, not agent prompts. lu-cognition instructs the LLM what MuninnDB MCP calls to make; it doesn't execute TypeScript.
**Warning signs:** Import statements inside agent section content strings.

### Pitfall 3: Cache Shared Across Concurrent Sessions

**What goes wrong:** If the cache key doesn't include session ID, two concurrent sessions could pollute each other's cache.
**Why it happens:** Using a simple boolean "has been loaded" flag instead of session-keyed cache.
**How to avoid:** Key the cache by session ID (already tracked in STATE.md and MuninnDB session engrams). The CONTEXT.md decision specifies "Cache key: session ID."
**Warning signs:** Stale or wrong recall results appearing in sub-agent prompts.

### Pitfall 4: Forgetting to Update Both Skills

**What goes wrong:** Updating `phase-execute.skill.ts` but not `phase-plan.skill.ts` (or vice versa), leaving inconsistent memory loading behavior.
**Why it happens:** The two skills have similar but not identical memory loading sections.
**How to avoid:** Update both files. They both have a `buildMemoryContextBlock()` call in their Step 4 / Step 0 sections that should reference `requestMemoryContext()`.
**Warning signs:** One skill still doing eager recall while the other uses deferred.

### Pitfall 5: Circular Import Between shared and agents

**What goes wrong:** If `requestMemoryContext()` needs to read agent frontmatter to check `eager_recall`, importing from `~/agents` in `~/shared` would violate tier rules (T0 cannot import T2).
**Why it happens:** Wanting the cache module to automatically determine eager vs deferred based on agent config.
**How to avoid:** `requestMemoryContext()` should accept the `eager_recall` flag as a parameter, not look it up from the agent registry. The calling skill/orchestrator reads the agent config and passes the boolean. This keeps shared at T0.
**Warning signs:** `bun run scripts/check-domain-boundaries.ts` fails with tier violation.

### Pitfall 6: build:all Crashes Claude Code

**What goes wrong:** Running `bun run build:all` during a session crashes the Claude Code process.
**Why it happens:** Known issue documented in MEMORY.md. The build pipeline is too resource-intensive.
**How to avoid:** After modifying source files in `src/`, ask the user to stop the session, run `bun run build:all` manually, and restart. Do NOT attempt to rebuild during a session.
**Warning signs:** Session hangs or crashes after build command.

## Code Examples

### Example 1: Adding eager_recall to CognitionConfigSchema

```typescript
// Source: src/agents/__schemas/agent.schemas.ts
// Add eager_recall to existing CognitionConfigSchema

export const CognitionConfigSchema = z.object({
  /** Default cognition tier for this agent */
  default_tier: CognitionTierSchema.default("T0"),
  /** Maximum tier this agent can be promoted to by complexity gating */
  promotable_to: CognitionTierSchema.default("T0"),
  /** Domain tags for selective MuninnDB recall context */
  memory_tags: z.array(z.string()).default([]),
  /** Whether this agent needs memory loaded eagerly at session start (true) or deferred to first use (false) */
  eager_recall: z.boolean().default(false),
});
```

### Example 2: Recall Cache Module (New File)

```typescript
// Source: src/shared/__helpers/recall-cache.ts (NEW)
// Session-scoped recall cache following existing formatCache pattern

import { z } from "zod";

/**
 * Raw recall result from MuninnDB, stored once per session.
 * Contains the unfiltered recall output that gets filtered per-agent.
 */
export const RecallCacheEntrySchema = z.object({
  sessionId: z.string(),
  patterns: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  pitfalls: z.array(z.string()).default([]),
  findings: z.array(z.string()).default([]),
  recalledAt: z.string(), // ISO 8601 timestamp
});

export type RecallCacheEntry = z.infer<typeof RecallCacheEntrySchema>;

/**
 * Module-scoped session recall cache.
 * Keyed by session ID. Stores raw MuninnDB recall results.
 * Cleared explicitly at session boundaries.
 */
const recallCache = new Map<string, RecallCacheEntry>();

/**
 * Get cached recall result for a session, if available.
 */
export function getCachedRecall(
  sessionId: string,
): RecallCacheEntry | undefined {
  return recallCache.get(sessionId);
}

/**
 * Store recall result in the session cache.
 */
export function setCachedRecall(
  sessionId: string,
  entry: RecallCacheEntry,
): void {
  recallCache.set(sessionId, entry);
}

/**
 * Check if a session has cached recall results.
 */
export function hasRecallCache(sessionId: string): boolean {
  return recallCache.has(sessionId);
}

/**
 * Clear the recall cache. Called at session boundaries.
 */
export function clearRecallCache(): void {
  recallCache.clear();
}
```

### Example 3: requestMemoryContext() Function

```typescript
// Source: src/shared/__helpers/memory-context-builder.ts (or new file)
// Wrapper that checks cache before performing recall

import {
  getCachedRecall,
  setCachedRecall,
  hasRecallCache,
} from "./recall-cache";
import type { RecallCacheEntry } from "./recall-cache";

export interface RequestMemoryContextConfig {
  agentName: string;
  sessionId: string;
  memoryTags: string[];
  maxTokens?: number;
}

/**
 * Request memory context for a sub-agent, using deferred recall with session caching.
 *
 * First call per session triggers actual MuninnDB recall and caches the result.
 * Subsequent calls return cached result filtered by the agent's memory_tags.
 *
 * NOTE: This function formats the final <memory_context> block. The actual
 * MuninnDB MCP call must be performed by the orchestrator (skill) and the
 * raw results passed to setCachedRecall() before calling this function.
 * This is because MCP calls are made by the LLM, not by TypeScript code.
 *
 * @param config - Agent name, session ID, memory tags for filtering
 * @returns Formatted memory context block or empty string
 */
export function requestMemoryContext(
  config: RequestMemoryContextConfig,
): string {
  const cached = getCachedRecall(config.sessionId);

  if (!cached) {
    // No cached recall available -- return empty (orchestrator hasn't called recall yet)
    console.warn(
      `[MEMORY] No cached recall for session ${config.sessionId}. ` +
        `Proceeding without memory context.`,
    );
    return "";
  }

  // Filter by agent's memory_tags (if specified and not wildcard)
  // For now, pass all cached content -- tag filtering happens at recall time
  return buildMemoryContextBlock({
    agentName: config.agentName,
    sessionFindings: cached.findings,
    recalledPatterns: cached.patterns,
    recalledPitfalls: cached.pitfalls,
    recalledDecisions: cached.decisions,
    maxTokens: config.maxTokens ?? 500,
  });
}
```

### Example 4: lu-cognition Prompt Changes (Brain-Tree-Only Default)

The key change to lu-cognition is in the `selective_recall` step. Currently it always performs recall for T1+. After this phase, the default behavior changes:

```markdown
<!-- BEFORE (current): Always recalls for T1+ agents -->
<step name="selective_recall">
If effective_tier is T1 or higher, proceed with recall:
...MuninnDB semantic recall...

<!-- AFTER (deferred): Check eager_recall flag -->
<step name="selective_recall">
**Check eager_recall flag first:**

IF agent.cognition.eager_recall == true:
Proceed with full recall (current behavior)
ELSE (eager_recall == false, the default):
SKIP detailed semantic recall
Log: "Agent {name} uses deferred recall — memory will be loaded on first request"
Output report WITHOUT Memory Recall section
RETURN
```

## State of the Art

| Old Approach                                     | Current Approach                                | When Changed                         | Impact                                                           |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Load all memory at session start for every agent | Load all memory at session start for T1+ agents | Phase 15 (cognition per-agent audit) | Saved ~2K tokens for T0 agents                                   |
| N/A (this is new)                                | Defer recall to first agent that needs it       | Phase 3 (this phase)                 | Saves 6-8K tokens on sessions that don't reach COMPLEX execution |

**Current token costs for memory loading:**

- Brain tree recall: ~1K tokens (always loaded at session start)
- Selective recall (patterns/decisions/pitfalls): ~6-8K tokens (loaded at session start for T1+)
- Session context init: ~2K tokens (always initialized)
- Total current: ~9-11K tokens at session start

**Projected token costs after this phase:**

- Brain tree recall: ~1K tokens (still loaded at session start)
- Session context init: ~2K tokens (still initialized)
- Selective recall: 0K at start, ~6-8K on first demand (only if needed)
- Total at start: ~3K tokens (66-72% reduction)

## Open Questions

1. **Session ID source at cache key time**
   - What we know: Session ID is tracked in STATE.md and MuninnDB session engrams. Skills read it from `mcp__muninn__muninn_session()` or STATE.md.
   - What's unclear: The exact mechanism for passing session ID from the skill prompt context to the TypeScript `requestMemoryContext()` function. Since skills are prompts that instruct LLMs, the session ID would need to be extracted by the LLM and passed explicitly.
   - Recommendation: Use a simple string parameter. The skill prompt instructs the LLM to extract session ID from STATE.md and pass it. Alternatively, use a simpler cache key like a module-scoped boolean "has been loaded this session" since there's typically only one session per process.

2. **Interaction between `requestMemoryContext()` (TypeScript) and MuninnDB MCP (LLM tool call)**
   - What we know: MuninnDB recall is performed via MCP tool calls by the LLM, not via TypeScript HTTP calls. The skill prompt instructs the LLM to call `mcp__muninn__muninn_recall()`.
   - What's unclear: Since the recall cache is a TypeScript module but MCP calls are made by the LLM, the "cache check -> recall -> cache store" flow can't be a single TypeScript function call. The skill prompt must orchestrate: (1) check if recall was done, (2) if not, call MuninnDB MCP, (3) store results, (4) format via `buildMemoryContextBlock()`.
   - Recommendation: The `requestMemoryContext()` function may be better described as a "format cached recall" function. The skill prompt instructions should describe the full flow: "Call MuninnDB recall if not yet done this session, then format with `buildMemoryContextBlock()`". The cache is conceptual (tracked by the LLM's session state), or implemented as a prompt-level check ("If you've already recalled memory in this session, skip the MCP call and reuse the results").

3. **Which agents should be `eager_recall: true`?**
   - What we know: CONTEXT.md says lu-planner and lu-cognition itself.
   - What's unclear: Whether lu-debugger (T3) should also be eager, since it's always invoked for a specific purpose where memory is valuable.
   - Recommendation: Start with only lu-cognition as eager (it's the session-start agent). lu-planner gets its memory from the skill orchestrator (phase-plan Step 0), not from lu-cognition directly, so it doesn't need eager_recall in the cognition sense.

## Sources

### Primary (HIGH confidence)

- `src/agents/__schemas/agent.schemas.ts` - CognitionConfigSchema structure, all 37 agent cognition configs
- `src/shared/__helpers/memory-context-builder.ts` - Existing cache pattern, buildMemoryContextBlock() API
- `src/agents/general/lu-cognition.agent.ts` - Full pre-flight prompt with all 8 steps
- `src/skills/general/phase-execute.skill.ts` - Step 4 memory loading, buildMemoryContextBlock() usage
- `src/skills/general/phase-plan.skill.ts` - Step 0 cognitive context loading
- `.planning/config.json` - Complexity matrix with recallDepth configuration

### Secondary (MEDIUM confidence)

- `.planning/phases/03-deferred-lazy-recall/3-CONTEXT.md` - User decisions constraining this research

### Tertiary (LOW confidence)

- None. All findings are from direct codebase analysis.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - No new libraries needed, all existing infrastructure
- Architecture: HIGH - Direct codebase analysis of all affected files
- Pitfalls: HIGH - Tier violation rules, build:all crash, and schema extension patterns are well-documented in project rules

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable internal architecture, no external dependencies)
