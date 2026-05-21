# Phase 6 — Adapter Architecture: Context

## Phase Scope

Build the adapter domain (`src/adapters/`, T3 Build): schemas, registry, Claude adapter (agent/skill/rule emitters), API adapter (Claude Agent SDK executor), DAG-adapter bridge, and domain registration. 9 plan items (B01–B07, B09, B10). B08 (compiler refactoring) is isolated in Phase 7.

## Decisions

### 1. Adapter Type Naming [researched — codebase verified]

Phase A defined a minimal `Adapter` type via `AdapterSchema` in `src/workflow/__schemas/workflow.schemas.ts` (line 380–402) with `{ name, executeStep }`. Phase B creates a full-featured `Adapter` type in `src/adapters/__schemas/adapter.schemas.ts` with `{ config, compileAgent, compileSkill, compileRule?, executeStep?, emit, detect }`.

**Decision:** Both types coexist. The T1 `Adapter` is the DAG executor's contract. The T3 `Adapter` is the full adapter interface. `bridgeAdapterForExecutor` (B09) maps T3 → T1. No T1-imports-T3 violation needed.

### 2. Claude Agent SDK Integration [researched — dependency pending]

`@anthropic-ai/claude-agent-sdk` is NOT yet installed. B06 requires `bun add @anthropic-ai/claude-agent-sdk` before implementation. The todo uses runtime type narrowing for SDK message handling to safely handle any SDK API shape. If the SDK's `query()` function signature differs from the todo spec, the implementing agent must adjust.

**Decision:** Install SDK during B06 execution. Use defensive runtime narrowing for message types. Accept token tracking returning zeros if SDK doesn't emit usage messages.

### 3. Boundary Script Already Updated [researched — codebase verified]

`scripts/check-domain-boundaries.ts` already contains `adapters: 3` at line 38 (done during Phase 1 X02). B10 does NOT need to add this line — only verify it exists.

### 4. Side-Effect Registration Pattern [researched — design decision]

Built-in adapter registration uses `src/adapters/__helpers/register-builtins.ts` as a side-effect import. The barrel (`index.ts`) does NOT import this file — consumers must explicitly `import "~/adapters/__helpers/register-builtins"`.

**Decision:** Follows existing pattern from plugin registry. Keeps barrel pure (no side effects).

### 5. `existsSync` Usage in Detection [researched — codebase verified]

B02's `detectAdapter` and B05's Claude adapter `detect` use `existsSync` from `node:fs` for synchronous directory detection. This is an acceptable exception to the Bun API preference — `Bun.file().exists()` is async and detection must be synchronous.

**Decision:** Use `node:fs` `existsSync` + `node:path` `join` for detection functions.

## Verified Dependencies

| Dependency                       | Location                                         | Status                               |
| -------------------------------- | ------------------------------------------------ | ------------------------------------ |
| `formatFrontmatter`              | `src/shared/__helpers/utils.ts:6`                | Exists                               |
| `WorkflowStep` type              | `src/workflow/__schemas/workflow.schemas.ts:160` | Exists                               |
| `StepResult` type                | `src/workflow/__schemas/workflow.schemas.ts:239` | Exists                               |
| `AdapterSchema` (T1 minimal)     | `src/workflow/__schemas/workflow.schemas.ts:380` | Exists                               |
| `BaseAgent` type                 | `src/agents/__schemas/agent.schemas.ts:113`      | Exists                               |
| `BaseSkill` type                 | `src/skills/__schemas/skill.schemas.ts:45`       | Exists                               |
| `BaseRule` type                  | `src/rules/__schemas/rule.schemas.ts:31`         | Exists                               |
| `adapters: 3` in boundary script | `scripts/check-domain-boundaries.ts:38`          | Exists                               |
| `src/adapters/` directory        | N/A                                              | Does NOT exist (create from scratch) |
| `@anthropic-ai/claude-agent-sdk` | `package.json`                                   | NOT installed (add in B06)           |

## Wave Suggestions

- **Wave 1:** B01 (schemas) + B02 (registry) — foundation, no cross-deps
- **Wave 2:** B03 (agent emitter) + B04 (skill emitter) + B06 (API executor) — parallel, all depend only on B01
- **Wave 3:** B05 (Claude adapter main) + B07 (API adapter main) — depend on Wave 2
- **Wave 4:** B09 (DAG-adapter bridge) + B10 (barrel + registration) — final wiring

## Deferred Ideas

None — all work is within roadmap scope.
