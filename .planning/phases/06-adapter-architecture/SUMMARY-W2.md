# Phase 6 Wave 2 Summary — Emitters + API Executor

## Plan

06-PLAN-W2: Create Claude adapter emitters (B03, B04) and API adapter executor (B06).

## Status: COMPLETE

## Tasks Completed

### Task 1: Install Claude Agent SDK

- **Commit:** `c1756880` feat(06-02): install Claude Agent SDK v0.2.81
- Installed `@anthropic-ai/claude-agent-sdk@0.2.81` as runtime dependency
- Type-check passed clean after install

### Task 2: Claude Agent Emitter (B03)

- **Commit:** `d11681f9` feat(06-02): create Claude agent emitter (B03)
- **File:** `src/adapters/claude/agent-emitter.ts`
- Extracted `buildAgentFrontmatter` (private) + `emitAgentMarkdown` (public) from `compile.ts`
- Byte-identical output to original `compileAgentClaude`
- Imports: `BaseAgent` from `~/agents/__schemas/agent.schemas`, `formatFrontmatter` from `~/shared/__helpers/utils`

### Task 3: Claude Skill Emitter (B04)

- **Commit:** `d43a68c9` feat(06-02): create Claude skill emitter (B04)
- **File:** `src/adapters/claude/skill-emitter.ts`
- Extracted `emitSkillMarkdown` (standard) + `emitSkillPluginMarkdown` (plugin with frontmatter)
- Byte-identical output to original `compileSkillClaude` and `compileSkillPlugin`
- Imports: `BaseSkill` from `~/skills/__schemas/skill.schemas`, `formatFrontmatter` from `~/shared/__helpers/utils`

### Task 4: API Executor (B06)

- **Commit:** `dc70fbb3` feat(06-02): create API executor with Claude Agent SDK (B06)
- **File:** `src/adapters/api/api-executor.ts`
- `ApiExecutorConfigSchema` — Zod schema with model, maxTurns, permissionMode, tool lists, MCP servers
- `TokenUsageSchema` — Zod schema for input/output token tracking
- `executeViaSDK` — wraps SDK `query()` async generator, returns `AdapterStepResult`
- Verified against actual SDK types (v0.2.81):
  - Used typed `Options` from SDK (not `Record<string, unknown>`)
  - Token usage extracted from `SDKResultSuccess.usage.input_tokens/output_tokens`
  - Type guards for `SDKSystemMessage`, `SDKResultSuccess`, `SDKResultError`
  - `permissionMode` enum expanded to include all 5 SDK values (default, acceptEdits, bypassPermissions, plan, dontAsk)
  - Session resumption via `options.resume` (matching SDK API)

## Deviations

1. **[Deviation — SDK API alignment]** The todo spec sketched `query()` options as `Record<string, unknown>` and token tracking via separate "usage" stream events. The actual SDK (v0.2.81) exports a typed `Options` interface and reports token usage on the result message's `.usage` field. Implementation was adjusted to use the actual SDK types for type safety and correctness. This is a pure improvement with no behavioral change.

2. **[Deviation — permissionMode enum expansion]** The todo spec listed 3 permissionMode values (default, acceptEdits, bypassPermissions). The actual SDK defines 5 values (adding plan, dontAsk). Schema updated to match the full SDK enum.

3. **[Deviation — disableSessionPersistence config]** Added `disableSessionPersistence` config field (default: true) to control SDK `persistSession` option. Headless/CI execution should not persist sessions to disk by default.

## Verification

- `bunx --bun tsc --noEmit` — clean after every task (4/4 passes)
- All files use kebab-case naming
- No classes used (functional patterns only)
- All Zod schemas follow schema-first parsing (defaults in schema, not destructuring)
- Original `compile.ts` not modified (backward compatibility preserved)

## Files Created

| File                                   | Purpose                             |
| -------------------------------------- | ----------------------------------- |
| `src/adapters/claude/agent-emitter.ts` | Claude adapter agent emitter (B03)  |
| `src/adapters/claude/skill-emitter.ts` | Claude adapter skill emitter (B04)  |
| `src/adapters/api/api-executor.ts`     | API adapter executor with SDK (B06) |

## Files Modified

| File           | Change                                                   |
| -------------- | -------------------------------------------------------- |
| `package.json` | Added `@anthropic-ai/claude-agent-sdk@0.2.81` dependency |
| `bun.lock`     | Updated lockfile                                         |
