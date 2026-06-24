# Phase 6: Adapter Architecture - Research

**Researched:** 2026-03-24
**Domain:** Adapter domain scaffolding, Claude/API adapters, DAG integration
**Confidence:** HIGH

## Summary

Phase 6 creates the `src/adapters/` domain (T3 Build tier) from scratch. The research verified all integration points in the existing codebase: the compiler functions to extract, the T1 Adapter type in workflow schemas, the DAG executor's adapter consumption pattern, the plugin-registry pattern to follow for the adapter registry, and the Claude Agent SDK's actual API surface.

The critical finding is that the Claude Agent SDK (v0.2.81) has a peer dependency on `zod ^4.0.0`, which is satisfied by the project's `zod ^4.3.6`. No dependency conflict. The SDK's `query()` function is an async generator returning `SDKMessage` objects, with `SDKResultMessage` providing `total_cost_usd`, `usage`, and `modelUsage` for token tracking.

**Primary recommendation:** Follow the plugin-registry.ts pattern exactly for the adapter registry (Map-based, `register`/`get`/`list` functions). Extract emitter functions from compile.ts by duplicating `buildAgentFrontmatter` into the adapter module (it's file-private in compile.ts and cannot be imported). Verify byte-equality of emitter output against compiler output.

## Standard Stack

### Core

| Library                          | Version    | Purpose                                             | Why Standard                                 |
| -------------------------------- | ---------- | --------------------------------------------------- | -------------------------------------------- |
| `zod`                            | ^4.3.6     | Schema validation for AdapterConfig, AdapterOutput  | Already used project-wide                    |
| `@anthropic-ai/claude-agent-sdk` | 0.2.81     | Headless API execution (B06)                        | Official Anthropic SDK for agentic execution |
| `js-yaml`                        | (existing) | YAML frontmatter generation via `formatFrontmatter` | Already used by shared utils                 |
| `node:fs`                        | built-in   | `existsSync` for synchronous adapter detection      | Established codebase pattern for sync checks |
| `node:path`                      | built-in   | Path joining for detection functions                | Established codebase pattern                 |

### Supporting

| Library                                | Version  | Purpose                                           | When to Use                                    |
| -------------------------------------- | -------- | ------------------------------------------------- | ---------------------------------------------- |
| `~/shared` (T0)                        | internal | `formatFrontmatter` utility                       | Agent/rule emitters that need YAML frontmatter |
| `~/workflow` (T1)                      | internal | `WorkflowStep`, `StepResult`, `Adapter` (T1 type) | DAG-adapter bridge (B09)                       |
| `~/agents`, `~/skills`, `~/rules` (T2) | internal | `BaseAgent`, `BaseSkill`, `BaseRule` types        | Emitter function signatures                    |

### Alternatives Considered

| Instead of                       | Could Use                     | Tradeoff                                                                                            |
| -------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `@anthropic-ai/claude-agent-sdk` | `@anthropic-ai/sdk` (raw API) | SDK provides built-in tools (Read, Edit, Bash, Glob, Grep) natively -- no custom tool bridge needed |
| `existsSync` (node:fs)           | `Bun.file().exists()`         | Bun's API is async; detection must be synchronous per design doc                                    |

**Installation:**

```bash
bun add @anthropic-ai/claude-agent-sdk
```

Note: Install as pre-step before B06 with `bunx --bun tsc --noEmit` gate to catch any module resolution issues.

## Architecture Patterns

### Recommended Project Structure

```
src/adapters/                          # [T3 Build] New domain
├── __schemas/
│   └── adapter.schemas.ts             # B01: AdapterConfig, Adapter type, AdapterOutput
├── __helpers/
│   ├── adapter-registry.ts            # B02: Map-based registry (register/get/list/detect)
│   └── register-builtins.ts           # B10: Side-effect import that registers claude + api
├── claude/
│   ├── agent-emitter.ts               # B03: compileAgentClaude extraction
│   ├── skill-emitter.ts               # B04: compileSkillClaude + compileSkillPlugin extraction
│   └── claude-adapter.ts              # B05: Full Claude adapter (createClaudeAdapter)
├── api/
│   ├── api-executor.ts                # B06: Claude Agent SDK wrapper
│   └── api-adapter.ts                 # B07: Full API adapter (createApiAdapter)
└── index.ts                           # B10: Pure barrel (re-exports only)
```

### Pattern 1: Map-Based Registry (from plugin-registry.ts)

**What:** Module-scoped `Map<string, T>` with `register`/`get`/`list` functions.
**When to use:** All registries in this codebase follow this pattern.
**Source:** `src/compilers/__helpers/plugin-registry.ts`

```typescript
// Pattern extracted from plugin-registry.ts
const registry = new Map<string, FullAdapter>();

export function registerAdapter(adapter: FullAdapter): void {
  registry.set(adapter.config.name, adapter);
}

export function getAdapter(name: string): FullAdapter | undefined {
  return registry.get(name);
}

export function listAdapters(): FullAdapter[] {
  return Array.from(registry.values());
}

export function detectAdapter(cwd?: string): FullAdapter | undefined {
  const dir = cwd ?? process.cwd();
  for (const adapter of registry.values()) {
    if (adapter.detect(dir)) return adapter;
  }
  return undefined;
}

export function resetAdapterRegistry(): void {
  registry.clear();
}
```

### Pattern 2: Side-Effect Registration (from register-builtins.ts)

**What:** Built-in adapters registered via a side-effect module import.
**When to use:** Barrel (`index.ts`) stays pure; consumers explicitly import to trigger registration.
**Source:** Design decision in 06-CONTEXT.md

```typescript
// register-builtins.ts — side-effect import
import { registerAdapter } from "./adapter-registry";
import { createClaudeAdapter } from "../claude/claude-adapter";
import { createApiAdapter } from "../api/api-adapter";

registerAdapter(createClaudeAdapter());
registerAdapter(createApiAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }));
```

### Pattern 3: T1/T3 Adapter Bridge (B09)

**What:** Maps the full T3 `Adapter` to the minimal T1 `Adapter` expected by `executeDAG()`.
**When to use:** When the DAG executor needs to consume a T3 adapter without violating tier boundaries.
**Source:** Design from 06-CONTEXT.md, pre-mortem Risk 1

```typescript
// Import with aliases to prevent name collision
import type { Adapter as WorkflowAdapter } from "~/workflow";
import type { FullAdapter } from "../__schemas/adapter.schemas";

export function bridgeAdapterForExecutor(full: FullAdapter): WorkflowAdapter {
  return {
    name: full.config.name,
    executeStep: full.executeStep!,
  };
}
```

### Anti-Patterns to Avoid

- **T1 importing T3:** Never import from `~/adapters` inside `~/workflow`. The bridge lives IN `src/adapters/` (T3) and imports from `~/workflow` (T1), which is legal downward.
- **Putting logic in index.ts:** The barrel must be pure re-exports only. No registry initialization, no side effects.
- **Importing `buildAgentFrontmatter` from compile.ts:** This function is NOT exported (file-private). Must be duplicated in the emitter.

## Don't Hand-Roll

| Problem                               | Don't Build                 | Use Instead                                    | Why                                                             |
| ------------------------------------- | --------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| YAML frontmatter generation           | Custom YAML serializer      | `formatFrontmatter` from `~/shared`            | Already handles edge cases (empty objects, quoting, sort order) |
| LLM tool execution (Read, Edit, Bash) | Custom tool implementations | Claude Agent SDK `query()` with `allowedTools` | SDK provides all tools natively with permission management      |
| Agent markdown compilation            | Custom string templating    | Existing `BaseAgent.toClaudeFormat()`          | Entity types already implement this method                      |
| Registry pattern                      | Custom data structure       | Map-based pattern from plugin-registry.ts      | Proven pattern, consistent with codebase                        |

**Key insight:** The emitter functions (B03-B04) are extractions, not inventions. They must produce byte-identical output to the existing compiler functions. The only "new" code is the registry, the adapter interfaces, and the API executor.

## Common Pitfalls

### Pitfall 1: buildAgentFrontmatter Is File-Private

**What goes wrong:** Attempting to import `buildAgentFrontmatter` from compile.ts fails because it's not exported.
**Why it happens:** The function is declared without `export` in compile.ts (line 49).
**How to avoid:** Duplicate the function body in `agent-emitter.ts`. It's 26 lines that call `formatFrontmatter` from `~/shared` (legal T0 import for T3).
**Warning signs:** TypeScript import error on build.

### Pitfall 2: Adapter Type Name Collision

**What goes wrong:** Both `~/workflow` and `~/adapters` export a type named `Adapter`. Importing both without aliasing causes ambiguity.
**Why it happens:** The T1 minimal Adapter (`{ name, executeStep }`) and T3 full Adapter have the same name.
**How to avoid:** Use aliased imports: `import type { Adapter as WorkflowAdapter } from "~/workflow"` and `import type { Adapter as FullAdapter } from "~/adapters"`. In B09 bridge module, add a runtime assertion that bridged objects have ONLY `name` + `executeStep`.
**Warning signs:** TypeScript "ambiguous import" error.

### Pitfall 3: Claude Agent SDK Zod Peer Dependency

**What goes wrong:** SDK installation could pull conflicting zod version.
**Why it happens:** The SDK has `peerDependencies: { zod: "^4.0.0" }`.
**How to avoid:** Project already uses `zod ^4.3.6` which satisfies `^4.0.0`. Pin the SDK version explicitly: `bun add @anthropic-ai/claude-agent-sdk@0.2.81`. Run `bunx --bun tsc --noEmit` immediately after install.
**Warning signs:** Module resolution errors, duplicate zod instances.

### Pitfall 4: SDK query() Returns AsyncGenerator, Not Promise

**What goes wrong:** Treating `query()` as returning a simple Promise and missing messages.
**Why it happens:** The SDK's `query()` returns `AsyncGenerator<SDKMessage, void>`, not `Promise<result>`.
**How to avoid:** Use `for await (const message of query(...))` to consume the stream. Collect the `SDKResultMessage` (type `"result"`) for the final outcome including `total_cost_usd` and `usage`.
**Warning signs:** No output or hanging execution.

### Pitfall 5: Emitter Output Byte-Inequality

**What goes wrong:** Extracted emitter produces different markdown than original compiler, breaking backward compatibility.
**Why it happens:** Subtle differences in function implementation (missing trailing newline, different frontmatter formatting).
**How to avoid:** After extraction, compile a known agent through both paths (old compiler and new emitter) and assert string equality. Use the exact same `formatFrontmatter` call.
**Warning signs:** `bun run check:drift` failures after build.

## Code Examples

### T1 Adapter Type (Existing - workflow.schemas.ts lines 380-402)

```typescript
// Source: src/workflow/__schemas/workflow.schemas.ts
export const AdapterSchema = z.object({
  name: z.string().min(1),
  executeStep: z.function({
    input: z.tuple([
      WorkflowStepSchema,
      z.record(z.string(), z.any()),
      z.record(z.string(), z.any()),
    ]),
    output: z.promise(StepResultSchema),
  }),
});
export type Adapter = z.infer<typeof AdapterSchema>;
```

### DAG Executor Adapter Consumption (Existing - dag-executor.ts)

```typescript
// Source: src/workflow/__helpers/dag-executor.ts
// The executor calls adapter.executeStep() with exactly these 3 args:
result = await adapter.executeStep(step, input, context);
// Where:
//   step: WorkflowStep (the step definition)
//   input: Record<string, unknown> (gathered from dependency outputs)
//   context: Record<string, unknown> (accumulated execution context)
```

### Functions Being Extracted from compile.ts (B03-B04)

```typescript
// Source: src/compilers/__helpers/compile.ts

// B03 extracts: compileAgentClaude (lines 92-96) + buildAgentFrontmatter (lines 49-75)
// Signature: (agent: BaseAgent) => string
export function compileAgentClaude(agent: BaseAgent): string {
  const markdown = agent.toClaudeFormat();
  const frontmatter = buildAgentFrontmatter(agent);
  return `${frontmatter}\n\n${markdown}`;
}

// B03 also extracts: compileRuleClaude (lines 119-139)
// Signature: (rule: BaseRule) => string
// Uses: formatFrontmatter from ~/shared, rule.config.frontmatter.{description, globs, alwaysApply}

// B04 extracts: compileSkillClaude (lines 104-106)
// Signature: (skill: BaseSkill) => string
// Body: return skill.toClaudeFormat();

// B04 also extracts: compileSkillPlugin (lines 170-174)
// Signature: (skill: BaseSkill) => string
// Body: formatFrontmatter({ description: skill.description }) + skill.toClaudeFormat()
```

### buildAgentFrontmatter (File-Private, Must Be Duplicated)

```typescript
// Source: src/compilers/__helpers/compile.ts lines 49-75
// NOT exported — must be duplicated in agent-emitter.ts
function buildAgentFrontmatter(agent: BaseAgent): string {
  const cognition = agent.config.frontmatter.cognition;
  const context = agent.config.frontmatter.context;

  const frontmatterData: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };

  if (cognition) {
    frontmatterData.cognition = {
      default_tier: cognition.default_tier,
      promotable_to: cognition.promotable_to,
      memory_tags: cognition.memory_tags,
    };
  }

  if (context) {
    frontmatterData.context = {
      default_tier: context.default_tier,
      promotable_to: context.promotable_to,
      isolation: context.isolation,
    };
  }

  return formatFrontmatter(frontmatterData);
}
```

### Claude Agent SDK Usage Pattern (B06)

```typescript
// Source: Official docs — https://platform.claude.com/docs/en/agent-sdk/typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

// query() returns AsyncGenerator<SDKMessage, void>
const messages = query({
  prompt: "Execute workflow step...",
  options: {
    systemPrompt: agentSystemPrompt,
    allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"],
    permissionMode: "bypassPermissions",
    model: "claude-sonnet-4-20250514",
    maxTurns: 25,
    cwd: process.cwd(),
  },
});

let resultText = "";
let totalCostUsd = 0;
let inputTokens = 0;
let outputTokens = 0;

for await (const message of messages) {
  if (message.type === "result") {
    const result = message as SDKResultMessage;
    if (result.subtype === "success") {
      resultText = result.result;
      totalCostUsd = result.total_cost_usd;
      inputTokens = result.usage.input_tokens;
      outputTokens = result.usage.output_tokens;
    }
  }
}
```

### Plugin Registry Pattern (to follow for Adapter Registry)

```typescript
// Source: src/compilers/__helpers/plugin-registry.ts
// Key pattern elements:
// 1. Module-scoped Map<string, T>
// 2. register() — upserts into map by key
// 3. get() — returns T | undefined
// 4. list() — returns Array.from(registry.values())
// 5. reset() — clears and re-registers built-ins
// 6. Built-in entries pre-registered at module load
```

## State of the Art

| Old Approach                             | Current Approach                         | When Changed         | Impact                                                             |
| ---------------------------------------- | ---------------------------------------- | -------------------- | ------------------------------------------------------------------ |
| `@anthropic-ai/claude-code` SDK          | `@anthropic-ai/claude-agent-sdk`         | 2026 (renamed)       | Import path changed; same underlying capabilities                  |
| Custom tool implementations for headless | SDK provides tools natively              | v0.1.x+              | No custom tool bridge needed; SDK handles Read/Edit/Bash/Glob/Grep |
| `SupportedFormat = "CLAUDE" \| "PLUGIN"` | Adapter registry with pluggable adapters | Phase 6 (this phase) | Extensible beyond two hardcoded formats                            |

**Deprecated/outdated:**

- `@anthropic-ai/claude-code` package name: Renamed to `@anthropic-ai/claude-agent-sdk`. Use the new name.
- Hardcoded `SupportedFormat` type: Being supplemented (not replaced) by the adapter registry. Compilers domain retains backward compat.

## Open Questions

1. **SDK version pinning**
   - What we know: Current version is 0.2.81 (pre-1.0). API surface may change.
   - What's unclear: Whether Anthropic will make breaking changes before 1.0.
   - Recommendation: Pin to exact version `0.2.81` in package.json. Update explicitly.

2. **SDK `usage` field shape**
   - What we know: `SDKResultMessage` has `usage: NonNullableUsage` and `modelUsage: { [modelName: string]: ModelUsage }`.
   - What's unclear: The exact shape of `NonNullableUsage` and `ModelUsage` (not fully documented in reference).
   - Recommendation: Use runtime narrowing with optional chaining. The CONTEXT.md already prescribes this approach.

3. **Adapter detection priority**
   - What we know: `detectAdapter` should check for `.claude/` directory existence.
   - What's unclear: What happens when multiple adapter directories exist (e.g., both `.claude/` and `.cursor/`).
   - Recommendation: First match wins. Claude adapter should be checked first as the default.

## Sources

### Primary (HIGH confidence)

- `src/compilers/__helpers/compile.ts` — All emitter function signatures and bodies verified
- `src/workflow/__schemas/workflow.schemas.ts` — T1 Adapter type shape verified (lines 380-402)
- `src/workflow/__helpers/dag-executor.ts` — Adapter consumption pattern verified (line 394)
- `src/compilers/__helpers/plugin-registry.ts` — Registry pattern verified
- `src/shared/__helpers/utils.ts` — `formatFrontmatter` signature and export verified
- `scripts/check-domain-boundaries.ts` — `adapters: 3` at line 38 verified
- `docs/runtime-architecture/adapter-architecture.md` — Design doc verified
- `docs/runtime-architecture/roadmap.md` — Phase B scope verified
- Claude Agent SDK TypeScript reference (https://platform.claude.com/docs/en/agent-sdk/typescript) — Full API verified
- Claude Agent SDK Quickstart (https://platform.claude.com/docs/en/agent-sdk/quickstart) — Usage patterns verified

### Secondary (MEDIUM confidence)

- npm registry: `@anthropic-ai/claude-agent-sdk` version 0.2.81, peer dep `zod ^4.0.0` — verified via `npm view`

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — All dependencies verified against existing codebase + npm registry
- Architecture: HIGH — Patterns extracted from existing codebase (plugin-registry.ts, compile.ts)
- Pitfalls: HIGH — Pre-mortem risks verified against actual code; SDK peer dep confirmed
- SDK API: HIGH — Official TypeScript reference documentation fetched and verified

**Research date:** 2026-03-24
**Valid until:** 2026-04-07 (SDK is pre-1.0, may change; codebase patterns stable)
