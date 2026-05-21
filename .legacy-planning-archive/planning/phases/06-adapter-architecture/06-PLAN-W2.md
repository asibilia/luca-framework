---
phase: 6
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 6 Plan 2: Emitters + API Executor (Claude Emitters, SDK Install, API Executor)

## Objective

Create the Claude adapter's agent and skill emitters (B03, B04) and the API adapter's SDK-based executor (B06). These three tasks depend only on B01 (schemas from W1) and can run in parallel. The SDK installation is a gated pre-step before B06 implementation.

> PREMORTEM constraint: B03/B04 must produce byte-identical output to the original compiler functions. B06's SDK install must be isolated with a type-check gate.

## Context

- @.planning/todos/pending/runtime-b03-claude-agent-emitter.md (exact implementation spec for B03)
- @.planning/todos/pending/runtime-b04-claude-skill-emitter.md (exact implementation spec for B04)
- @.planning/todos/pending/runtime-b06-api-executor.md (exact implementation spec for B06)
- @.planning/phases/06-adapter-architecture/06-CONTEXT.md (SDK install decision, existsSync decision)
- @.planning/phases/06-adapter-architecture/06-RESEARCH.md (SDK API patterns, buildAgentFrontmatter extraction)
- @.planning/phases/06-adapter-architecture/PREMORTEM.md (emitter byte-equality, SDK destabilization risks)
- @src/compilers/\_\_helpers/compile.ts (source functions being extracted -- buildAgentFrontmatter is file-private)
- @src/shared/\_\_helpers/utils.ts (formatFrontmatter utility -- T0, legal for T3)
- @src/adapters/\_\_schemas/adapter.schemas.ts (AdapterStepResult type from W1)

## Tasks

### 1. Install Claude Agent SDK (pre-step for B06)

**Type:** auto
**TDD:** false
**Depends on:** none

Install the SDK as a runtime dependency with version pinning:

```bash
bun add @anthropic-ai/claude-agent-sdk@0.2.81
```

Immediately run type-check to verify no module resolution failures or dependency conflicts:

```bash
bunx --bun tsc --noEmit
```

The SDK has `peerDependencies: { zod: "^4.0.0" }` which is satisfied by the project's `zod ^4.3.6` (verified in RESEARCH.md).

If type-check fails after install, investigate before proceeding to B06. Do NOT proceed with B06 code if the SDK install breaks the type-check.

**Files to edit:**

- `package.json` (via `bun add`)

**Verification:**

- `@anthropic-ai/claude-agent-sdk` appears in `package.json` dependencies
- `bunx --bun tsc --noEmit` passes after install
- No duplicate zod instances in `bun.lock`

### 2. Create Claude agent emitter (B03)

**Type:** auto
**TDD:** false
**Depends on:** none (only depends on W1/B01)

Create `src/adapters/claude/agent-emitter.ts` by extracting the `compileAgentClaude` and `buildAgentFrontmatter` functions from `src/compilers/__helpers/compile.ts`.

Key implementation details:

- `buildAgentFrontmatter` is file-private in compile.ts (NOT exported) -- must be duplicated verbatim in agent-emitter.ts as a private helper
- `emitAgentMarkdown(agent)` is the public function, named to match adapter "emitter" convention
- Uses `formatFrontmatter` from `~/shared/__helpers/utils` (T0, legal for T3)
- Imports `BaseAgent` type from `~/agents/__schemas/agent.schemas`
- Output must be byte-identical to `compileAgentClaude(agent)` for any agent

The original `compileAgentClaude` in compile.ts is NOT modified. Compiler refactoring to delegate to the emitter happens in B08 (Phase 7).

**Files to create:**

- `src/adapters/claude/agent-emitter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Exports only `emitAgentMarkdown` (buildAgentFrontmatter is private)
- Signature: `(agent: BaseAgent) => string`
- Uses `formatFrontmatter` from `~/shared/__helpers/utils`

### 3. Create Claude skill emitter (B04)

**Type:** auto
**TDD:** false
**Depends on:** none (only depends on W1/B01)

Create `src/adapters/claude/skill-emitter.ts` by extracting `compileSkillClaude` and `compileSkillPlugin` from `src/compilers/__helpers/compile.ts`.

Two functions:

- `emitSkillMarkdown(skill)` -- trivial one-liner calling `skill.toClaudeFormat()`. Extracted as named function for consistency with emitter pattern.
- `emitSkillPluginMarkdown(skill)` -- adds description frontmatter via `formatFrontmatter({ description: skill.description })` before the markdown body.

Both use `formatFrontmatter` from `~/shared/__helpers/utils` and `BaseSkill` type from `~/skills/__schemas/skill.schemas`.

The originals in compile.ts are NOT modified. Compiler refactoring happens in B08.

**Files to create:**

- `src/adapters/claude/skill-emitter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Exports `emitSkillMarkdown` with signature `(skill: BaseSkill) => string`
- Exports `emitSkillPluginMarkdown` with signature `(skill: BaseSkill) => string`
- Uses `formatFrontmatter` from `~/shared/__helpers/utils`

### 4. Create API executor (B06)

**Type:** auto
**TDD:** false
**Depends on:** 1 (SDK must be installed first)

Create `src/adapters/api/api-executor.ts` with the SDK execution wrapper.

Schemas to define:

- `ApiExecutorConfigSchema` -- model, maxTokens, permissionMode, disallowedTools, allowedTools, mcpServers, useProjectSettings (all with Zod defaults)
- `TokenUsageSchema` -- inputTokens, outputTokens (defaulted to 0)

Main function:

- `executeViaSDK(prompt, systemPrompt, config, sessionId?)` -- wraps SDK `query()` async generator
- Uses `for await (const message of query(...))` pattern (SDK returns AsyncGenerator, NOT Promise)
- Tracks token usage from SDK messages via runtime type narrowing
- Captures session ID from init messages for state continuity
- Returns `AdapterStepResult` with success/failure, output, and tokenUsage
- Uses `disallowedTools` for security restriction (NOT `allowedTools` which only auto-approves)

IMPORTANT: The SDK's `query()` return type and message shapes may differ from the todo spec. The implementing agent must verify actual SDK types after install and adjust message handling accordingly. The runtime type narrowing pattern (`typeof message === "object" && "type" in message`) handles this safely.

**Files to create:**

- `src/adapters/api/api-executor.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Exports `ApiExecutorConfigSchema`, `TokenUsageSchema`, `executeViaSDK`
- Exports types `ApiExecutorConfig`, `TokenUsage`
- `executeViaSDK` signature: `(prompt, systemPrompt, config, sessionId?) => Promise<AdapterStepResult>`

## Verification

```bash
bunx --bun tsc --noEmit
```

- All three new files exist in correct directory structure
- SDK is installed and type-checks pass
- No TypeScript errors across the full project
- No classes used
- All files use kebab-case naming
- All Zod schema defaults defined in schemas (not destructuring)

## Success Criteria

- Claude agent emitter produces byte-identical output to `compileAgentClaude`
- Claude skill emitter produces byte-identical output to `compileSkillClaude` and `compileSkillPlugin`
- API executor compiles and has correct function signatures
- SDK installation does not destabilize the dependency tree
- Wave 3 can proceed with B05 (Claude adapter main) and B07 (API adapter main)

## Output Specification

- `src/adapters/claude/agent-emitter.ts` (new file)
- `src/adapters/claude/skill-emitter.ts` (new file)
- `src/adapters/api/api-executor.ts` (new file)
- `package.json` updated with `@anthropic-ai/claude-agent-sdk` dependency
