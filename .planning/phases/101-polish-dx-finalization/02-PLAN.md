---
id: "101-02"
title: "Post-init interactive tour with @clack/prompts"
phase: 101
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "101-02-1"
    title: "Create tour utility module"
    goal: "Build packages/luca-framework/src/utils/tour.ts with an interactive post-init tour using @clack/prompts that walks users through BRAIN.md, generated files, startup commands, and first /lu command"
    verify: "tour.ts exported from packages/luca-framework/src/utils/; uses @clack/prompts for interactive steps; handles user cancellation gracefully"
  - id: "101-02-2"
    title: "Integrate tour into init command"
    goal: "Call the tour after successful init in packages/luca-framework/src/commands/init.ts, skippable via --no-tour or --quick flags"
    verify: "bun run luca init triggers tour prompt after success; --quick and --no-tour skip the tour; tour errors do not crash init"
  - id: "101-02-3"
    title: "Add enhanced context detection for tour step 4"
    goal: "Extend detectProjectContext in packages/luca-framework/src/utils/detect.ts with harness-aware fields so the tour can suggest the right startup command per harness"
    verify: "detectProjectContext returns harness array and suggested first command; handles all 3 platforms (claude, cursor, pi)"
  - id: "101-02-4"
    title: "Write tests for tour utility"
    goal: "Create tests for the tour module covering the happy path, user cancellation, and --no-tour flag behavior"
    verify: "bun test passes for tour tests; covers happy path, cancellation, and skip scenarios; uses mock-clack test helper"
---

# 101-02: Post-Init Interactive Tour with @clack/prompts

## Goal

After `bun run luca init` completes successfully, users face a directory full of generated files with no guidance on what to do first. This plan adds an optional interactive tour that walks users through 4 steps: understanding BRAIN.md, seeing what was generated, knowing the startup command, and receiving a suggested first `/lu` command. The tour uses `@clack/prompts` (already a dependency) and is skippable via `--no-tour` or `--quick`.

## Context

@packages/luca-framework/src/commands/init.ts -- Init command where tour integrates after success
@packages/luca-framework/src/utils/wizard.ts -- Existing wizard using @clack/prompts (pattern reference)
@packages/luca-framework/src/utils/detect.ts -- Project context detection (needs enhancement)
@packages/luca-framework/src/utils/logger.ts -- Logger utility
@packages/luca-framework/package.json -- @clack/prompts already a dependency
@**tests**/utils/mock-clack.ts -- Existing mock for @clack/prompts in tests
@.planning/todos/pending/20-post-init-interactive-tour.md -- Original todo with requirements

**Design principles:**

- Tour must not interfere with init success -- errors in tour are caught and logged, never crash
- Tour is opt-out: shown by default unless `--quick` or `--no-tour` is passed
- Uses @clack/prompts for consistent DX with the init wizard
- Each step is self-contained: user can cancel at any point
- Tour adapts to the detected project context (harness, stack, project name)
- Functional patterns only (no classes)

**Tour steps (from todo #20):**

1. Open and explain `.planning/BRAIN.md` -- what to customize
2. Explain generated harness files ("N agents, N rules, N skills installed into .claude/")
3. Show exact startup command per harness
4. Suggest first `/lu` command based on context

## Tasks

### Task 101-02-1: Create tour utility module

Create `packages/luca-framework/src/utils/tour.ts`.

An interactive post-init tour using @clack/prompts. The tour is a sequence of 4 informational steps, each using `p.note()` for display and `p.confirm()` or `p.select()` for user interaction.

**Key features:**

- `runTour(config: LucaConfig, context: ProjectContext)` as the main entry point
- Each step shows relevant information based on the config and context
- User can press Ctrl+C or decline to exit at any point
- Errors are caught internally -- the tour never throws

**Step 1: BRAIN.md Orientation**

```typescript
p.note(
  `Your project identity file is at .planning/BRAIN.md\n\n` +
    `This file defines your project's personality for AI agents:\n` +
    `  - Project name and domain\n` +
    `  - Tech stack and frameworks\n` +
    `  - Architecture patterns\n` +
    `  - Code conventions\n\n` +
    `Customize it now or later -- agents will use it for context.`,
  "Step 1: Project Identity",
);
```

**Step 2: Generated Files Summary**

```typescript
// Count agents, skills, rules from config
p.note(
  `Installed into ${harnessNames}:\n\n` +
    `  ${agentCount} agents (orchestration, code review, verification)\n` +
    `  ${skillCount} skills (git, planning, testing workflows)\n` +
    `  ${ruleCount} rules (code conventions, architecture patterns)\n` +
    `  ${hookCount} hooks (pre-commit gate, type checking, formatting)\n\n` +
    `These are generated from src/ -- edit sources, then bun run build:all.`,
  "Step 2: What Was Generated",
);
```

**Step 3: Startup Command**

```typescript
// Show per-harness startup instructions
p.note(
  `To start using ${config.branding.frameworkName}:\n\n` + startupInstructions,
  "Step 3: Getting Started",
);
```

**Step 4: Suggested First Command**

```typescript
p.note(
  `Try this first:\n\n` +
    `  /${config.branding.commandPrefix}\n\n` +
    `This invokes the intelligent router which will:\n` +
    `  1. Load your BRAIN.md context\n` +
    `  2. Recall relevant patterns from MEMORY.md\n` +
    `  3. Route your request to the right agent`,
  "Step 4: Your First Command",
);
```

**Verify:**

- [ ] File exists at `packages/luca-framework/src/utils/tour.ts`
- [ ] `runTour` function exported
- [ ] Uses @clack/prompts for all user interaction
- [ ] 4 steps covering BRAIN.md, generated files, startup, first command
- [ ] Handles user cancellation gracefully (no throw)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-02-2: Integrate tour into init command

Update `packages/luca-framework/src/commands/init.ts` to call the tour after successful file generation.

**Changes:**

1. Add `--no-tour` arg to initCommand args definition:

```typescript
"no-tour": {
  type: "boolean",
  description: "Skip the post-init interactive tour",
  default: false,
},
```

2. After the success `p.outro()` and `logger.box()`, add tour call:

```typescript
// Offer interactive tour (unless --quick or --no-tour)
if (!args.quick && !args["no-tour"] && !args.config) {
  try {
    const { runTour } = await import("../utils/tour");
    await runTour(config, context);
  } catch {
    // Tour errors are non-fatal
  }
}
```

**Key constraints:**

- Tour only runs in interactive mode (not --quick, not --config, not --no-tour)
- Tour import is dynamic to avoid loading tour code in non-interactive paths
- Tour errors are silently caught -- init success must not be affected
- Tour runs AFTER the success output so the user knows init succeeded first

**Verify:**

- [ ] `--no-tour` flag added to init command args
- [ ] Tour called after success output in interactive mode
- [ ] Tour skipped when `--quick`, `--no-tour`, or `--config` is set
- [ ] Tour errors do not crash init
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-02-3: Add enhanced context detection for tour step 4

Extend `packages/luca-framework/src/utils/detect.ts` to return harness-specific information needed by the tour.

**Add to ProjectContext type (in `packages/luca-framework/src/types.ts`):**

```typescript
// Add to existing ProjectContext interface:
detectedHarnesses?: string[];
suggestedFirstCommand?: string;
```

**Add to detectProjectContext:**

```typescript
// Detect installed harnesses
const harnesses: string[] = [];
if (existsSync(join(cwd, ".claude"))) harnesses.push("claude");
if (existsSync(join(cwd, ".cursor"))) harnesses.push("cursor");
if (existsSync(join(cwd, ".pi"))) harnesses.push("pi");
context.detectedHarnesses = harnesses;

// Suggest first command based on harness
if (harnesses.includes("claude")) {
  context.suggestedFirstCommand = "/lu";
} else if (harnesses.includes("cursor")) {
  context.suggestedFirstCommand = "/lu";
} else if (harnesses.includes("pi")) {
  context.suggestedFirstCommand = "/lu";
} else {
  context.suggestedFirstCommand = "/lu";
}
```

**Verify:**

- [ ] `detectedHarnesses` and `suggestedFirstCommand` added to ProjectContext
- [ ] detectProjectContext populates the new fields
- [ ] Handles case where no harnesses are installed
- [ ] `bunx --bun tsc --noEmit` passes

### Task 101-02-4: Write tests for tour utility

Create `__tests__/packages/luca-framework/src/utils/tour.test.ts`.

**Test scenarios:**

1. **Happy path**: Tour runs through all 4 steps and completes
2. **User cancellation**: User presses Ctrl+C at step 2 -- tour exits cleanly, no throw
3. **Skip via flag**: Verify the init command does not call tour when --no-tour is set
4. **Config-driven content**: Tour shows correct harness names and file counts based on config

**Use existing mock-clack.ts pattern:**

```typescript
import { test, expect, describe, mock } from "bun:test";

// Mock @clack/prompts
mock.module("@clack/prompts", () => ({
  note: mock(() => {}),
  confirm: mock(() => true),
  select: mock(() => "continue"),
  outro: mock(() => {}),
  isCancel: (value: unknown) => value === Symbol.for("cancel")),
}));
```

**Verify:**

- [ ] Test file exists at `__tests__/packages/luca-framework/src/utils/tour.test.ts`
- [ ] Tests cover happy path, cancellation, and skip scenarios
- [ ] Tests mock @clack/prompts (not real interactive prompts)
- [ ] `bun test __tests__/packages/luca-framework/src/utils/tour.test.ts` passes
- [ ] No flaky tests

## Success Criteria

- [ ] Post-init tour runs after successful `bun run luca init`
- [ ] Tour walks through 4 steps: BRAIN.md, generated files, startup command, first /lu command
- [ ] Tour uses @clack/prompts for consistent DX
- [ ] Tour is skippable via `--quick` or `--no-tour`
- [ ] Tour adapts to project context (harness names, file counts)
- [ ] Tour errors are non-fatal (init success is always preserved)
- [ ] Enhanced project context detection with harness-aware fields
- [ ] Tests cover tour behavior including cancellation
- [ ] `bunx --bun tsc --noEmit` passes
