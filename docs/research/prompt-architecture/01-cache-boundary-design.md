# Cache Boundary Design for AI Coding Agents

**Research Date:** 2026-04-13
**Status:** Complete
**Scope:** Prompt caching mechanics, Claude Code's cache boundary implementation, micro-compaction, and recommendations for luca-mastracode

---

## 1. How Prompt Caching Works at the API Level

### Prefix-Based Matching

Anthropic's prompt caching stores computed input tensors from the prefill stage. On subsequent requests sharing the same prefix, the model skips prefill for the cached portion and processes only the new tokens. Matching is **100% exact** on the byte level -- even a single character change in the prefix invalidates the cache from that point forward.

The cache evaluates content in a strict hierarchy:

```
tools -> system -> messages
```

Changes at any level invalidate that level **and all subsequent levels**. Modifying a tool definition invalidates the system prompt cache and the message cache. Modifying the system prompt invalidates the message cache but not the tool cache.

### Cache Breakpoints

You can place up to **4 explicit cache breakpoints** per request using the `cache_control` parameter. Each breakpoint marks a position where the system should attempt to match against existing cache entries. The system also performs automatic prefix checking by looking back approximately 20 content blocks.

```typescript
// Explicit breakpoint on the last tool definition
{
  tools: [
    { name: "search", description: "...", input_schema: {...} },
    {
      name: "edit_file",
      description: "...",
      input_schema: {...},
      cache_control: { type: "ephemeral" }  // Breakpoint here
    }
  ],
  system: [
    {
      type: "text",
      text: "Static behavioral instructions...",
      cache_control: { type: "ephemeral" }  // Breakpoint here
    },
    {
      type: "text",
      text: "Dynamic per-session context..."
      // No breakpoint -- changes every turn
    }
  ]
}
```

Cache writes happen **only** at breakpoints. If the breakpoint sits on content that changes every request (timestamps, per-request IDs), the prefix hash never matches on subsequent requests and you pay the write premium with zero benefit.

### TTL Tiers

| TTL | Write Cost | Read Cost | Use Case |
|-----|-----------|-----------|----------|
| 5-minute (default) | 1.25x base input | 0.1x base input | Multi-turn conversations, per-session state |
| 1-hour (extended) | 2.0x base input | 0.1x base input | Shared system prompts, tool definitions, global instructions |

The 5-minute TTL is specified as `{ type: "ephemeral" }`. The 1-hour TTL is specified as `{ type: "ephemeral", ttl: "1h" }`. Cache is refreshed at no additional cost each time cached content is reused within the TTL window.

**Mixing TTLs**: You can use both in the same request, but longer TTL entries must appear before shorter TTL entries in the prompt sequence. The API bills across three positions: the highest cache hit, the highest 1-hour block after it, and the last breakpoint.

### Minimum Token Requirements

Caching only activates when the content before a breakpoint exceeds a model-specific minimum:

| Model | Minimum Tokens |
|-------|---------------|
| Claude Opus 4.6 / Opus 4.5 | 4,096 |
| Claude Sonnet 4.6 | 2,048 |
| Claude Sonnet 4.5 / 4 / 3.7, Opus 4.1 / 4 | 1,024 |
| Claude Haiku 4.5 | 4,096 |
| Claude Haiku 3.5 | 2,048 |

Prompts shorter than the minimum are processed normally without caching and without error. Check the response `usage` fields: if both `cache_creation_input_tokens` and `cache_read_input_tokens` are 0, caching did not occur.

### Cache Scope

As of February 2026, cache isolation is **workspace-level** on the Claude API and Azure AI Foundry. Different workspaces never share caches. Amazon Bedrock and Google Vertex AI maintain organization-level isolation.

### Cost and Latency Numbers

| Metric | Value | Source |
|--------|-------|--------|
| Cache read cost vs base input | 0.1x (90% reduction) | Anthropic API docs |
| Cache write cost (5-min TTL) | 1.25x base input | Anthropic API docs |
| Cache write cost (1-hour TTL) | 2.0x base input | Anthropic API docs |
| Latency reduction on long prompts | Up to 85% | Anthropic announcement |
| 100K-token book example | 11.5s -> 2.4s (79% reduction) | Anthropic benchmark |
| Break-even point | Turn 2 of a session | prompt-caching.ai benchmarks |

For Opus 4.6: base input is $5/M tokens, cache reads are $0.50/M tokens. A 20K-token system prompt read from cache costs $0.01 per request instead of $0.10 -- a 10x reduction that compounds across every turn of every session.

---

## 2. Claude Code's Cache Boundary Implementation

### The SYSTEM_PROMPT_DYNAMIC_BOUNDARY

Claude Code splits its system prompt at a marker called `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`. Everything before the boundary is cached globally; everything after is per-session.

```
Static Prefix (1-hour TTL, scope: 'global')
+-- Identity & Introduction
+-- System Rules & Permissions
+-- Executing Actions with Care (reversibility/blast radius)
+-- Doing Tasks (coding philosophy)
+-- Using Your Tools (dedicated tool preference)
+-- Tone and Style
+-- Tool Definitions (36+ tools, ~73K characters)
+-- __SYSTEM_PROMPT_DYNAMIC_BOUNDARY__
Dynamic Suffix (5-minute TTL, session-scoped)
+-- Environment Info (cwd, platform, shell, model, date)
+-- Language Preference
+-- CLAUDE.md / Project Rules
+-- Memory Prompt (MEMORY.md index)
+-- MCP Server Instructions (recomputed each turn)
+-- Git Status Snapshot
+-- Scratchpad Instructions
```

The static prefix is assembled from approximately 15 composable section functions (`getSimpleIntroSection`, `getUsingYourToolsSection`, etc.). This modular approach keeps each section independently testable while the concatenated result remains byte-identical across all users running the same Claude Code version.

The static half is cached via Blake2b prefix hashing with a 1-hour TTL and `scope: 'global'`, meaning **millions of Claude Code users share the same cached prefix**. The dynamic half is injected per-session after the boundary marker.

### Why Tool Definitions Live in the Static Prefix

Tool definitions (36+ tools, ~73K characters of descriptions) reside in the static prefix specifically to benefit from the global cache. This is a deliberate architectural choice: subagents inherit the parent's full tool set even when they only need a subset, because different tools would mean a different prefix hash, which means a cache miss and reprocessing the entire system prompt from scratch.

Claude Code accepts a measured 2.79% tool-call failure rate on certain model versions rather than lose caching benefits. The compaction sub-agent retains all 42 tools despite only needing text output. When the model attempts tool use instead of summarization, a blunt preamble handles it: *"CRITICAL: Respond with TEXT ONLY. Do NOT call any tools."*

### DANGEROUS_uncachedSystemPromptSection()

Any section that must bypass caching is explicitly marked with this function name. The naming convention is a performance contract -- it signals to developers that placing content here has a direct cost impact, discouraging casual additions to the uncached section.

### The Fork Model for Subagents

When Claude Code spawns subagents, each fork inherits the parent context as a byte-identical copy. This means the cached static prefix is reused without additional cost. Spawning 5 sub-agents costs barely more than 1, because they all share the same cached prefix. This is what makes parallel code review (5+ reviewers simultaneously) economically viable.

---

## 3. Micro-Compaction and Cache Preservation

### The 5-Level Compression Pipeline

Claude Code's context management lives in `src/services/compact/` (~3,960 lines of TypeScript) and implements progressive compression, triggering cheaper approaches before expensive ones:

| Level | Name | Cost | Mechanism |
|-------|------|------|-----------|
| 1 | Tool Result Budget | Zero | Results exceeding 50K chars persist to disk; 2KB preview retained in context |
| 2 | History Snip | Zero | Garbage collection removes stale scaffolding and redundant bookkeeping |
| 3 | Microcompact | Low | Dual-path: cache-cold modifies messages directly; cache-hot uses `cache_edits` API |
| 4 | Context Collapse | Medium | Non-destructive overlay; original messages intact; summaries in separate store |
| 5 | Autocompact | High (irreversible) | Forks child agent for two-phase Chain-of-Thought summarization |

### Level 3: Microcompact Dual-Path Design

Microcompact is the critical layer for cache preservation. It has two mutually exclusive code paths:

**Cache Cold Path** (prompt cache expired): Directly modifies messages in the conversation history, replacing old tool results with `[Old tool result cleared]` placeholders. This is cheaper but invalidates any existing cache.

**Cache Hot Path** (prompt cache warm): Uses `cache_edits` blocks that ride alongside the API request, telling the server to delete specific tool result blocks by their `tool_use_id`. The server performs the deletion server-side, preserving cache warmth without client re-upload:

```typescript
// Conceptual: cache_edits alongside the API request
{
  messages: [...],  // Unchanged locally -- preserves cache prefix
  cache_edits: [
    { action: "delete", tool_use_id: "toolu_abc123" },
    { action: "delete", tool_use_id: "toolu_def456" }
  ]
}
```

The system tags tool result blocks with `cache_reference: tool_use_id` to enable this surgical editing. Messages stay locally unchanged, the cached prefix stays warm, and the server applies the edits before the prompt reaches Claude.

### Context Editing API (Official)

Anthropic's official Context Editing API (`context-management-2025-06-27` beta) provides server-side strategies for managing growing conversations:

**Tool Result Clearing** (`clear_tool_uses_20250919`): Automatically clears the oldest tool results in chronological order when context exceeds a threshold. Configurable parameters include:

- `trigger`: Token threshold that activates clearing (e.g., 30,000 input tokens)
- `keep`: Number of recent tool uses to preserve (e.g., last 3)
- `clear_at_least`: Minimum tokens to clear per activation (e.g., 5,000)
- `exclude_tools`: Tool names exempt from clearing

```typescript
const response = await anthropic.beta.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  messages: conversation,
  tools: toolDefinitions,
  betas: ["context-management-2025-06-27"],
  context_management: {
    edits: [{
      type: "clear_tool_uses_20250919",
      trigger: { type: "input_tokens", value: 30000 },
      keep: { type: "tool_uses", value: 3 },
      clear_at_least: { type: "input_tokens", value: 5000 },
    }]
  }
});
```

**Thinking Block Clearing** (`clear_thinking_20251015`): Manages thinking blocks when extended thinking is enabled. Default behavior keeps only the last turn's thinking; configurable to keep all (maximizes cache hits) or clear aggressively (saves context space).

**Cache interaction**: Tool result clearing invalidates cached prefixes at the clearing point but creates a new cacheable prefix for subsequent requests. Thinking block clearing preserves cache when blocks are kept and invalidates when cleared.

### Production Bug: Cache Invalidation from Microcompact

A production incident (BQ 2026-03-01) revealed that microcompact was responsible for 20% of prompt cache breaks because it modifies the system prompt without properly invalidating the cache flag. The fix required explicit cache invalidation checks when microcompact runs, ensuring the system correctly transitions between hot and cold paths.

### Circuit Breaker

After observing 1,279 sessions with up to 3,272 consecutive autocompact failures, Claude Code added `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`. This prevented 250,000+ wasted API calls per day from runaway compaction loops.

---

## 4. How Other AI Agents Handle Caching

### Aider

Aider organizes its chat history explicitly for caching with `--cache-prompts`:

1. System prompt (cached)
2. Read-only files added with `--read` (cached)
3. Repository map (cached)
4. Editable files in the chat (cached, but changes per edit)

**Keepalive mechanism**: `--cache-keepalive-pings N` sends pings every 5 minutes (matching Anthropic's default TTL) up to N times, keeping the cache warm between user messages. This prevents cache expiration during think-time.

**Limitation**: Caching statistics and costs are not available when streaming responses. Users must disable streaming with `--no-stream` to access detailed cache analytics.

### Cline

Cline's current architecture (as of the discussion in early 2026) **fundamentally breaks caching**. It spawns a new Claude Code CLI process for every message exchange using `execa()` with `--max-turns 1`. Each process has independent metadata, and dynamic version headers (`cc_version=...;cch=...;`) change per invocation, guaranteeing cache misses.

Two proposed fixes:
- **Session Resume**: Use `--resume <session_id>` to maintain conversation state across invocations
- **Persistent Process**: Keep a long-lived process with `--input-format stream-json`

### Cursor

Cursor integrates prompt caching with Anthropic's API. Real-world telemetry shows over 90% of tokens as cache reads in typical sessions, confirming effective caching. However, most cost comes from repeatedly reloading context rather than generating code, indicating that context size dominates even with caching.

### prompt-caching MCP Plugin

An open-source MCP plugin provides automatic cache breakpoint injection across Claude Code, Cursor, Windsurf, and other MCP-compatible clients. It operates through four modes:

| Mode | Mechanism | Token Reduction |
|------|-----------|-----------------|
| BugFix | Caches stack traces + error context on first detection | 85% |
| Refactor | Caches code patterns, style guides, type definitions | 80% |
| File Tracking | Monitors read frequency; injects breakpoint on second access | 90% |
| Conversation Freeze | Freezes pre-conversation messages after N turns; keeps last 3 fresh | 92% |

---

## 5. Implementation Recommendations for luca-mastracode

### 5.1 Introduce a Cache Boundary in Instruction Assembly

Split the system prompt into two content blocks with different TTLs:

```typescript
import Anthropic from "@anthropic-ai/sdk";

function buildSystemPrompt(mode: string, sessionContext: SessionContext) {
  // Static prefix: behavioral rules, tool guidance, hard constraints
  // Identical across all sessions for the same mode + version
  const staticPrefix = [
    loadModeInstructions(mode),
    HARD_CONSTRAINTS,
    ALWAYS_APPLY_RULES,
  ].join("\n\n");

  // Dynamic suffix: per-session state, environment, git status
  const dynamicSuffix = [
    buildEnvironmentInfo(sessionContext),
    buildGitStatus(sessionContext),
    buildWorkflowState(sessionContext),
    buildMcpInstructions(sessionContext),
  ].join("\n\n");

  return { staticPrefix, dynamicSuffix };
}

function buildApiRequest(
  mode: string,
  sessionContext: SessionContext,
  messages: Message[],
  tools: Tool[]
) {
  const { staticPrefix, dynamicSuffix } = buildSystemPrompt(mode, sessionContext);

  return {
    model: "claude-opus-4-6",
    max_tokens: 16384,
    tools: tools.map((tool, i, arr) =>
      i === arr.length - 1
        ? { ...tool, cache_control: { type: "ephemeral", ttl: "1h" } }
        : tool
    ),
    system: [
      {
        type: "text",
        text: staticPrefix,
        cache_control: { type: "ephemeral", ttl: "1h" }
      },
      {
        type: "text",
        text: dynamicSuffix,
        cache_control: { type: "ephemeral" }  // 5-minute TTL
      }
    ],
    messages
  };
}
```

### 5.2 Keep Tool Definitions Stable and First

Place tool definitions in the `tools` array (which is evaluated before `system` in the cache hierarchy) and add a breakpoint on the last tool. Since luca-mastracode's tool sets are mode-specific but stable within a mode, this is a natural cache boundary:

```typescript
// Tool definitions are stable per mode -- cache them with 1-hour TTL
const tools = buildModeTools(mode).map((tool, i, arr) =>
  i === arr.length - 1
    ? { ...tool, cache_control: { type: "ephemeral", ttl: "1h" } }
    : tool
);
```

### 5.3 Adopt Context Editing for Tool Result Management

Use the `context_management.edits` API instead of client-side tool result truncation:

```typescript
const response = await client.beta.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 16384,
  tools,
  system: systemBlocks,
  messages: conversation,
  betas: ["context-management-2025-06-27"],
  context_management: {
    edits: [{
      type: "clear_tool_uses_20250919",
      trigger: { type: "input_tokens", value: 50000 },
      keep: { type: "tool_uses", value: 5 },
      clear_at_least: { type: "input_tokens", value: 10000 },
    }]
  }
});
```

### 5.4 Use Mid-Conversation Injection Instead of System Prompt Mutation

When injecting dynamic context (behavioral refreshes, mode transitions, context rot remediation), use the message layer via `<luca-reminder>` tags rather than modifying the system prompt. This preserves system prompt cache validity:

```typescript
// BAD: Modifying system prompt invalidates cache
system[1].text = updatedDynamicContext;

// GOOD: Inject as a user message -- system prompt cache stays warm
messages.push({
  role: "user",
  content: [{
    type: "text",
    text: `<luca-reminder>
${criticalConstraintRefresh}
${updatedWorkflowState}
</luca-reminder>

${actualUserMessage}`
  }]
});
```

### 5.5 Monitor Cache Performance

Track cache hit rates using the `usage` fields in every API response:

```typescript
function logCacheMetrics(usage: ApiUsage) {
  const total = usage.cache_read_input_tokens
    + usage.cache_creation_input_tokens
    + usage.input_tokens;

  const hitRate = total > 0
    ? usage.cache_read_input_tokens / total
    : 0;

  // Alert if hit rate drops below expected threshold
  if (hitRate < 0.6 && total > 5000) {
    console.warn(`Cache hit rate degraded: ${(hitRate * 100).toFixed(1)}%`);
  }
}
```

### 5.6 Subagent Cache Sharing

When spawning subagents, ensure they use the same tool set and static system prefix as the parent to maximize cache reuse. If a subagent needs fewer tools, prefer giving it the full set (with behavioral constraints limiting usage) over a reduced set that would cause a cache miss:

```typescript
// Prefer: Full tool set with behavioral constraint
const subagentSystem = `${staticPrefix}
You are a read-only research agent. Do NOT use Write, Edit, or Bash tools.`;

// Avoid: Different tool set that breaks cache
const reducedTools = tools.filter(t => ["Read", "Grep", "Glob"].includes(t.name));
// This causes a cache miss on the tools layer
```

---

## 6. Key Architectural Principles

1. **Stability dominates cost**: The most important optimization is keeping the prompt prefix stable across turns. A 20K-token prefix cached at 0.1x costs $0.001 per read; uncached it costs $0.01. Over 100 turns, that is $0.10 vs $1.00 for the prefix alone.

2. **Cache hierarchy is strict**: tools -> system -> messages. Changes early in the hierarchy cascade. Put the most stable content first.

3. **The 4-breakpoint budget is scarce**: Use them strategically: one on the last tool, one on the static system prefix, one on the dynamic system suffix, and one on the last assistant message in multi-turn conversations.

4. **Minimum token thresholds matter**: For Opus 4.6 and Haiku 4.5, you need 4,096 tokens before caching activates. Ensure your static prefix exceeds this threshold.

5. **Server-side editing preserves warmth**: Use context editing APIs and cache_edits over client-side message mutation whenever the cache is warm.

6. **Mid-conversation injection over system prompt mutation**: Dynamic context that changes per-turn belongs in messages, not the system prompt. The system prompt is your most valuable cache asset.

7. **Monitor, do not assume**: Track `cache_read_input_tokens` and `cache_creation_input_tokens` on every response. Unexpected cache writes indicate prefix instability.

---

## Sources

### Anthropic Official Documentation
- [Prompt Caching - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) -- Comprehensive API reference for cache_control, TTLs, pricing, breakpoints, and code examples
- [Context Editing - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/context-editing) -- Server-side tool result clearing and thinking block clearing APIs
- [Compaction - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/compaction) -- Server-side compaction strategies
- [Tool Use with Prompt Caching - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching) -- Caching tool definitions and deferred tool references
- [Prompt Caching Announcement](https://www.anthropic.com/news/prompt-caching?s=09) -- Original announcement with 85% latency reduction benchmark
- [Token-Saving Updates](https://www.anthropic.com/news/token-saving-updates) -- Extended 1-hour TTL announcement

### Claude Code Source Analysis
- [Inside Claude Code - Victor Dibia](https://newsletter.victordibia.com/p/inside-claude-code) -- Analysis of cache boundary design, fork model, and tool set inheritance
- [Claude Code's Compaction Engine - Barazany](https://barazany.dev/blog/claude-codes-compaction-engine) -- Source code analysis of the compression pipeline
- [Claude Code's 5-Level Compression Pipeline - HarrisonSec](https://harrisonsec.com/blog/claude-code-context-engineering-compression-pipeline/) -- Detailed breakdown of all 5 compression levels, microcompact dual-path, circuit breaker
- [Inside the Claude Code Source - Haseeb Qureshi](https://gist.github.com/Haseeb-Qureshi/d0dc36844c19d26303ce09b42e7188c1) -- SYSTEM_PROMPT_DYNAMIC_BOUNDARY, Blake2b hashing, global scope
- [System Prompt & Query Loop - DeepWiki](https://deepwiki.com/ghboke/claude-code-reverse/2.1-system-prompt-and-query-loop) -- Static vs dynamic sections, tool definition caching, query loop
- [Inside Claude Code's Compaction System - Decode Claude](https://decodeclaude.com/compaction-deep-dive/) -- Three-layer compaction architecture, post-compaction recovery
- [System Prompt - Claude Code Internals](https://claude-code-explain.helmcode.com/system-prompt/) -- Prompt assembly components

### Other Agent Implementations
- [Aider Prompt Caching](https://aider.chat/docs/usage/caching.html) -- Keepalive pings, chat history organization for caching
- [Cline Prompt Caching Discussion](https://github.com/cline/cline/discussions/9892) -- Process-per-message architecture breaking caching, proposed fixes
- [Cursor Prompt Caching Forum](https://forum.cursor.com/t/prompt-caching-with-claude/7551) -- Community discussion on Cursor's caching integration
- [prompt-caching MCP Plugin](https://prompt-caching.ai/) -- Automatic breakpoint injection across multiple AI tools

### Additional References
- [Prompt Caching 201 - OpenAI](https://developers.openai.com/cookbook/examples/prompt_caching_201) -- Cross-provider comparison of caching approaches
- [Session Memory Compaction - Anthropic Cookbook](https://platform.claude.com/cookbook/misc-session-memory-compaction) -- Official cookbook for compaction patterns
- [Prompt Caching Infrastructure - Introl](https://introl.com/blog/prompt-caching-infrastructure-llm-cost-latency-reduction-guide-2025) -- Infrastructure-level guide to caching
