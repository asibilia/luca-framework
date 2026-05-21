---
phase: 6
plan: 3
type: feature
autonomous: true
wave: 3
depends_on: [2]
---

# Phase 6 Plan 3: Adapter Mains (Claude Adapter + API Adapter)

## Objective

Wire the emitters and executor from Wave 2 into complete `Adapter` interface implementations. The Claude adapter (`createClaudeAdapter`) delegates compilation to the emitters from B03/B04 and stubs `executeStep`/`emit`. The API adapter (`createApiAdapter`) delegates execution to the SDK executor from B06 and stubs compilation (not supported for headless). Each adapter also gets a subdirectory barrel.

## Context

- @.planning/todos/pending/runtime-b05-claude-adapter-main.md (exact implementation spec for B05)
- @.planning/todos/pending/runtime-b07-api-adapter-main.md (exact implementation spec for B07)
- @.planning/phases/06-adapter-architecture/06-CONTEXT.md (T1/T3 coexistence, detection decisions)
- @.planning/phases/06-adapter-architecture/PREMORTEM.md (type collision risk)
- @src/adapters/\_\_schemas/adapter.schemas.ts (Adapter type from W1/B01)
- @src/adapters/claude/agent-emitter.ts (emitAgentMarkdown from W2/B03)
- @src/adapters/claude/skill-emitter.ts (emitSkillMarkdown, emitSkillPluginMarkdown from W2/B04)
- @src/adapters/api/api-executor.ts (executeViaSDK, ApiExecutorConfigSchema from W2/B06)
- @src/shared/\_\_helpers/utils.ts (formatFrontmatter for rule compilation)
- @src/compilers/\_\_helpers/compile.ts (compileRuleClaude logic at lines 119-139 for extraction into B05)

## Tasks

### 1. Create Claude adapter main (B05)

**Type:** auto
**TDD:** false
**Depends on:** none (depends on W2/B03 and W2/B04)

Create two files for the Claude adapter.

**File 1: `src/adapters/claude/claude-adapter.ts`**

Factory function `createClaudeAdapter()` returning an `Adapter`:

- `config.name`: "claude"
- `config.description`: "Claude Code (.claude/ directory artifacts)"
- `config.supportedFeatures`: agents=true, skills=true, rules=true, hooks=true, workflows=true, headless=false
- `compileAgent`: delegates to `emitAgentMarkdown` from B03
- `compileSkill`: delegates to `emitSkillMarkdown` from B04
- `compileRule`: inline `emitRuleMarkdown` helper (extracted from `compileRuleClaude` in compile.ts lines 119-139). Uses `formatFrontmatter` from `~/shared`. Handles scoping logic: if rule has globs or alwaysApply, prepend YAML frontmatter with description + scoping fields; otherwise, return markdown only.
- `executeStep`: stub returning `{ success: false, error: "..." }` -- DAG-to-prose compilation is future work
- `emit`: stub returning `{ filesWritten: 0, filesPaths: [], warnings: [] }` -- build pipeline handles this
- `detect`: checks for `.claude` directory via `existsSync(join(projectRoot, ".claude"))`

The `emitRuleMarkdown` function is private (NOT exported). External consumers use `adapter.compileRule(rule)`.

Use top-level static imports for `existsSync` and `join` per import-standards rule.

**File 2: `src/adapters/claude/index.ts`**

Barrel file re-exporting:

- `createClaudeAdapter` from `./claude-adapter`
- `emitAgentMarkdown` from `./agent-emitter`
- `emitSkillMarkdown`, `emitSkillPluginMarkdown` from `./skill-emitter`

**Files to create:**

- `src/adapters/claude/claude-adapter.ts`
- `src/adapters/claude/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `createClaudeAdapter()` returns object satisfying `Adapter` type
- `compileAgent` delegates to `emitAgentMarkdown`
- `compileSkill` delegates to `emitSkillMarkdown`
- `compileRule` contains extracted `compileRuleClaude` logic
- `executeStep` returns failure stub
- `emit` returns empty result stub
- `detect` checks `.claude` directory existence
- Barrel re-exports all public API

### 2. Create API adapter main (B07)

**Type:** auto
**TDD:** false
**Depends on:** none (depends on W2/B06)

Create two files for the API adapter.

**File 1: `src/adapters/api/api-adapter.ts`**

Schema: `ApiAdapterOptionsSchema` wrapping `ApiExecutorConfigSchema` with `.default({})`.

Factory function `createApiAdapter(rawOptions?)` returning an `Adapter`:

- Parses options via `ApiAdapterOptionsSchema.parse(rawOptions ?? {})`
- `config.name`: "api"
- `config.description`: "Direct LLM API execution via Claude Agent SDK (headless)"
- `config.supportedFeatures`: agents=true, skills=false, rules=false, hooks=false, workflows=true, headless=true
- `compileAgent`: returns structured object `{ name, description, instructions, tools }` (NOT markdown string -- API adapter uses agent defs as SDK system prompts)
- `compileSkill`: returns error object (skills are IDE-specific, not supported)
- `compileRule`: returns error object (rules folded into agent system prompts)
- `executeStep`: extracts prompt/systemPrompt/sessionId from step+context, delegates to `executeViaSDK`. Step parameter is `unknown` (narrowed to `WorkflowStep` in W4/B09). Uses runtime type narrowing with `step as Record<string, unknown>`.
- `emit`: returns empty result (API adapter does not emit files)
- `detect`: returns `false` (API adapter is never auto-detected -- selected via CLI flag or config)

**File 2: `src/adapters/api/index.ts`**

Barrel file re-exporting:

- `createApiAdapter`, `ApiAdapterOptionsSchema` from `./api-adapter`
- Type: `ApiAdapterOptions` from `./api-adapter`
- `ApiExecutorConfigSchema`, `TokenUsageSchema`, `executeViaSDK` from `./api-executor`
- Types: `ApiExecutorConfig`, `TokenUsage` from `./api-executor`

**Files to create:**

- `src/adapters/api/api-adapter.ts`
- `src/adapters/api/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `createApiAdapter()` returns object satisfying `Adapter` type
- Accepts optional `Partial<ApiAdapterOptions>` parameter
- `compileAgent` returns `Record<string, unknown>` (structured object)
- `compileSkill` and `compileRule` return error objects
- `executeStep` delegates to `executeViaSDK`
- `detect` returns `false`
- Barrel re-exports all public API

## Verification

```bash
bunx --bun tsc --noEmit
```

- All four new files exist in correct directory structure
- No TypeScript errors across the full project
- Both adapters satisfy the `Adapter` type from B01
- Claude adapter delegates to emitters correctly
- API adapter delegates to executor correctly
- No classes used
- All files use kebab-case naming
- Barrels contain ONLY re-export statements

## Success Criteria

- `createClaudeAdapter()` produces a fully-configured Claude Code adapter
- `createApiAdapter()` produces a fully-configured headless API adapter
- Both adapters are structurally compatible with the `Adapter` type
- Wave 4 can proceed with B09 (DAG-adapter bridge) and B10 (barrel + registration)

## Output Specification

- `src/adapters/claude/claude-adapter.ts` (new file)
- `src/adapters/claude/index.ts` (new file)
- `src/adapters/api/api-adapter.ts` (new file)
- `src/adapters/api/index.ts` (new file)
