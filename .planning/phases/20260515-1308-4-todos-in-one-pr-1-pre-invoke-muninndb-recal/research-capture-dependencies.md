# Research Capture — Dependencies

**Subagent**: researcher
**Perspective**: dependencies
**Timestamp**: 2026-05-15T17:10:00Z

## Findings

**Mastra harness API (`@mastra/core@1.34.0` exact-pinned per PR #251):**
- `HarnessSubagent` fields: `id`, `name`, `description`, `maxSteps`, `allowedWorkspaceTools`, `instructions`, `tools`
- **No `timeoutMs`, `signal`, `AbortController` field**
- No `harness.abortSubagent()` API visible

**Existing timeout pattern (NOT applicable to subagents):**
- timeoutMs used for subprocess spawning in ensure-feature-branch.ts, check-runner.ts, claim-verifier.ts
- Wraps `spawnSync`/`execSync` — NOT Mastra subagent invocation

**Anthropic SDK:**
- No `@anthropic-ai/sdk` direct dep in luca-mastracode
- Model registry entirely mediated through `mastracode@0.19.0` → `@mastra/core@1.34.0`
- Mastracode-internal aliases: `anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-7`
- Dot-form IDs (`claude.opus.4.5`) DO NOT EXIST in codebase — invalid per Anthropic convention

**MCP tools relevant to pre-invoke recall (via createMcpToolsProxy):**
- muninn_recall (PRIMARY target)
- muninn_find_by_entity
- muninn_where_left_off
- muninn_remember / muninn_remember_batch (post-work, not pre-invoke)
- muninn_evolve, muninn_trust (post-work)

**MCP-capable subagents (SUBAGENT_INHERITS_MCP at launch.ts:137-145):**
- researcher, discussion, planner, executor, verifier, reviewer, learner (7)
- **EXCLUDED**: plan-reviewer, shadow-scanner (2) — no MCP tools at all

**Canonical pre-invoke recall signature (from executor.ts:34-41):**
```ts
mcp__muninn__muninn_recall(
  vault: "<repo_vault>",
  context: ["<task context>"],
  mode: "semantic",
  limit: 5,
)
```

**Package version pins (PR #251 alpha.5 baseline):**
- mastracode@0.19.0 (exact)
- @mastra/core@1.34.0 (exact)
- @mastra/libsql@1.10.1 (exact)
- @mastra/memory@1.18.1 (exact)
