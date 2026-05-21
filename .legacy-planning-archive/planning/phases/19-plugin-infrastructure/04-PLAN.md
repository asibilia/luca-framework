---
id: 19-04
title: build:all Integration & Drift Detection
phase: 19-plugin-infrastructure
wave: 2
delivers: PLUG-04 (partial), PLUG-05 (partial)
depends_on: 19-01, 19-02, 19-03
tasks: 2
---

# Plan 19-04: build:all Integration & Drift Detection

## Objective

Integrate plugin compilation into the unified `build:all` pipeline so that `bun run build:all` generates Cursor + Claude + Plugin output in a single invocation. This ensures the plugin stays in sync with .claude/ and .cursor/ outputs and benefits from the same drift detection infrastructure.

## Context

- **build-all.ts:** `scripts/build-all.ts` currently compiles to .cursor/ and .claude/ using CursorCompiler and ClaudeCompiler
- **build-plugin.ts from 19-03:** Standalone plugin build script
- **Drift detection:** `scripts/check-drift.ts` and `scripts/check-drift.test.ts` verify src/ ↔ output parity
- **Plugin output is in dist/plugin/** — separate from .claude/ and .cursor/

## Design Decision

Rather than duplicating the plugin compilation logic in build-all.ts, import and call the plugin build function from build-plugin.ts. This keeps build-plugin.ts usable standalone while also integrating into the unified pipeline. build-all.ts will call it as a final step after Cursor + Claude compilation.

## Files

### Modify

- `scripts/build-all.ts` — Import and call plugin build after existing compilation
- `scripts/build-plugin.ts` — Export the main build function for import by build-all.ts

## Tasks

### Task 1: Export plugin build function from build-plugin.ts

**Goal:** Make the plugin build function importable.

**File:** `scripts/build-plugin.ts` (modify)

Refactor the script to:

1. Extract the build logic into an exported `buildPlugin()` async function
2. Keep the `import.meta.main` guard for standalone execution
3. `buildPlugin()` returns a summary object: `{ agents: number, skills: number, hooks: number, failures: string[] }`

```typescript
export async function buildPlugin(): Promise<{
  agents: number;
  skills: number;
  hooks: number;
  failures: string[];
}> {
  // ... existing build logic ...
  return { agents: agentCount, skills: skillCount, hooks: hookCount, failures };
}

// Standalone execution
if (import.meta.main) {
  buildPlugin()
    .then((summary) => {
      console.log(`\n=== Plugin Build Summary ===`);
      console.log(`Agents: ${summary.agents}`);
      console.log(`Skills: ${summary.skills}`);
      console.log(`Hooks: ${summary.hooks}`);
      if (summary.failures.length > 0) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("Plugin build failed:", error);
      process.exit(1);
    });
}
```

### Task 2: Add plugin build step to build-all.ts

**Goal:** Call `buildPlugin()` at the end of the unified build pipeline.

**File:** `scripts/build-all.ts` (modify)

Add after the existing hooks section (before the summary):

```typescript
import { buildPlugin } from "./build-plugin";

// ... existing code ...

// --- Plugin ---
console.log("\n--- Plugin ---");
const pluginSummary = await buildPlugin();
console.log(
  `Plugin: ${pluginSummary.agents} agents, ${pluginSummary.skills} skills, ${pluginSummary.hooks} hooks`,
);

if (pluginSummary.failures.length > 0) {
  for (const f of pluginSummary.failures) {
    failures.push({ type: "plugin", name: f, error: new Error(f) });
  }
}
```

Update the summary section to include plugin output:

```typescript
console.log(
  `Plugin: ${pluginSummary.agents} agents, ${pluginSummary.skills} skills, ${pluginSummary.hooks} hooks`,
);
```

## Verification

- [ ] `bun run build:all` generates plugin output in `dist/plugin/` alongside .cursor/ and .claude/
- [ ] Plugin output is consistent with .claude/ output (same agents, same skills)
- [ ] build-plugin.ts still works standalone: `bun run build:plugin`
- [ ] Build summary includes plugin stats
- [ ] Failures in plugin build are surfaced in build:all failure report
- [ ] No existing tests broken
