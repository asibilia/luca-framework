# Phase 6 — Adapter Architecture: Pre-Mortem Risk Brief

**Complexity:** COMPLEX
**Scenarios:** 3

## Risk 1: T1/T3 Adapter Type Collision Breaks DAG Executor

Both `src/workflow/` and `src/adapters/` export a type named `Adapter`. Any consumer importing from both barrels gets an ambiguous type. The `bridgeAdapterForExecutor` (B09) mapper could silently pass the wrong shape to `executeDAG()` because both satisfy `{ name, executeStep }` structurally.

**Mitigation:** B09 must use explicit qualified imports (`import type { Adapter as WorkflowAdapter } from "~/workflow"` vs `import type { Adapter as FullAdapter } from "~/adapters"`) and include a runtime assertion that the bridged object has ONLY `name` + `executeStep` (no extra T3 fields leaking into T1 context).

## Risk 2: Claude Agent SDK Installation Destabilizes Dependency Tree Mid-Phase

B06 requires `bun add @anthropic-ai/claude-agent-sdk` which is not in `package.json` yet. If the SDK pulls in a conflicting `zod` version or ships CommonJS-only entry points incompatible with the ESM workspace, Wave 2 (B03+B04+B06 parallel) fails partway through.

**Mitigation:** Install the SDK as a standalone pre-step before Wave 2, run `bunx --bun tsc --noEmit` immediately after install to catch module resolution failures, and pin the SDK version explicitly.

## Risk 3: Emitter Extraction Produces Non-Identical Output

B03 must extract `compileAgentClaude` from `compile.ts`. That function calls the file-private `buildAgentFrontmatter` helper, which imports `formatFrontmatter` from `~/shared`. If the extraction reimplements or omits the helper, compiled agent markdown will differ from compiler output.

**Mitigation:** The adapter emitter must import `formatFrontmatter` from `~/shared` (T0, legal for T3) and duplicate `buildAgentFrontmatter` exactly. Verification: compile a known agent through both old and new paths, assert string equality.

## Plan Constraints

- B09: Use aliased type imports to prevent `Adapter` name collision
- SDK install: Isolate as pre-wave step with type-check gate before B06 code
- B03/B04: Include byte-equality verification against existing compiler output
