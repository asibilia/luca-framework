---
phase: 1
plan: 1
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 1 Plan 1: Critical Fixes + Bug + Import Violations

## Objective

Fix 4 audit findings from the v6.0.0 milestone audit: compile.ts barrel bypass (CRITICAL), dag-serializer require() violations (HIGH), composite-grader customFns bug (HIGH), and adapter deep \_\_schemas/ imports (HIGH x3). All 4 fixes touch independent files and can be executed in a single wave.

## Context

@.planning/v6.0.0-MILESTONE-AUDIT.md
@.planning/phases/01-critical-fixes-bug-imports/CONTEXT.md
@src/compilers/**helpers/compile.ts
@src/workflow/**helpers/dag-serializer.ts
@src/eval/**helpers/composite-grader.ts
@src/eval/**helpers/eval-runner.ts
@src/adapters/\_\_schemas/adapter.schemas.ts
@src/adapters/claude/claude-adapter.ts
@src/adapters/api/api-adapter.ts
@src/agents/index.ts
@src/skills/index.ts
@src/rules/index.ts
@src/adapters/claude/index.ts
@src/workflow/index.ts

## Tasks

### 1. Fix compile.ts barrel bypass (Audit #1 -- CRITICAL)

**Type:** auto
**TDD:** false
**Depends on:** none

The file `src/compilers/__helpers/compile.ts` imports directly from adapter implementation files instead of using the `~/adapters/claude` sub-barrel. This violates the module-boundary rule (Rule 4: \_\_helpers/ encapsulation).

The `~/adapters/claude/index.ts` sub-barrel already re-exports all needed symbols: `createClaudeAdapter`, `emitAgentMarkdown`, `emitSkillMarkdown`, `emitSkillPluginMarkdown`.

The entity type imports (`BaseAgent`, `BaseSkill`, `BaseRule`) also bypass entity barrels. All three are already exported from their respective barrel files (`~/agents`, `~/skills`, `~/rules`).

**Changes to `src/compilers/__helpers/compile.ts`:**

Replace lines 11-19 (the 6 import statements) with:

```typescript
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import { emitAgentMarkdown } from "~/adapters/claude";
import { emitSkillMarkdown, emitSkillPluginMarkdown } from "~/adapters/claude";
import { createClaudeAdapter } from "~/adapters/claude";
```

Note: The three `~/adapters/claude` imports can be consolidated into a single import statement if preferred:

```typescript
import {
  emitAgentMarkdown,
  emitSkillMarkdown,
  emitSkillPluginMarkdown,
  createClaudeAdapter,
} from "~/adapters/claude";
```

**Files to edit:**

- `src/compilers/__helpers/compile.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No direct `~/adapters/claude/agent-emitter`, `~/adapters/claude/skill-emitter`, or `~/adapters/claude/claude-adapter` imports remain
- No direct `~/{agents,skills,rules}/__schemas/` imports remain in this file

### 2. Fix dag-serializer require() violations (Audit #2 -- HIGH)

**Type:** auto
**TDD:** false
**Depends on:** none

The file `src/workflow/__helpers/dag-serializer.ts` has 3 inline `require('node:fs')` calls (lines 62, 106, 169), violating the import-standards rule (all imports at top of file) and the bun-preference rule (`Bun.file` over `node:fs` where applicable). It also has dead code: line 102 creates a `Bun.file()` handle that is never used (line 112 reads via `fs.readFileSync` instead).

**Changes to `src/workflow/__helpers/dag-serializer.ts`:**

1. Add a single top-level import after line 18 (after existing imports):

   ```typescript
   import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
   ```

2. In `saveCheckpoint` (lines 62-65): Remove `const fs = require("node:fs");` and its usage. Replace the directory-existence check with the top-level imports:

   ```typescript
   if (!existsSync(dir)) {
     mkdirSync(dir, { recursive: true });
   }
   ```

3. In `loadCheckpoint` (lines 102-115): Remove the dead `const file = Bun.file(filePath);` line (102). Remove `const fs = require("node:fs");` (line 106). Remove the dead `const text = file.text();` line (112). Update to use top-level imports:

   ```typescript
   if (!existsSync(filePath)) {
     return null;
   }
   // ... inside try block:
   const content = readFileSync(filePath, "utf-8");
   ```

4. In `clearCheckpoint` (lines 169-176): Remove `const fs = require("node:fs");` (line 169). Update to use top-level imports:

   ```typescript
   if (existsSync(filePath)) {
     unlinkSync(filePath);
   }
   ```

5. Update the module-level JSDoc comment (line 9) to remove the stale claim "Uses Bun.file() and Bun.write() per bun-preference rule" since `Bun.write()` is the only Bun API still used (for the write path in `saveCheckpoint`).

**Files to edit:**

- `src/workflow/__helpers/dag-serializer.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Zero `require(` calls remain in the file
- Zero unused `Bun.file()` handles remain
- The single top-level `import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs"` is present

### 3. Fix composite-grader customFns bug (Audit #4 -- HIGH)

**Type:** auto
**TDD:** false
**Depends on:** none

The `gradeWithComposite` function in `src/eval/__helpers/composite-grader.ts` always picks the first function from the `customFns` map (line 143: `customFns?.values().next().value`) regardless of which eval case is being graded. This means when multiple eval cases have custom grader functions, only the first-registered function is ever used.

**Changes to `src/eval/__helpers/composite-grader.ts`:**

1. Add a `caseId: string` parameter to the `gradeWithComposite` function signature, inserting it after `adapter` and before `customFns`:

   ```typescript
   export async function gradeWithComposite(
     output: unknown,
     expected: Record<string, unknown> | undefined,
     config: CompositeGraderConfig,
     defaultJudgeModel: string,
     adapter: LlmAdapter | null,
     caseId: string,
     customFns?: Map<string, CustomGraderFn>,
   ): Promise<GraderResult> {
   ```

2. Replace line 143 (the broken lookup) with correct key-based lookup:

   ```typescript
   const customFn = customFns?.get(caseId);
   ```

3. Update the JSDoc `@param` list to document the new `caseId` parameter:
   ```
   * @param caseId - Eval case ID used to look up the correct custom grader function
   ```

**Changes to `src/eval/__helpers/eval-runner.ts`:**

Update the `gradeWithComposite` callsite (lines 117-125) to pass `evalCase.id` as the new `caseId` argument:

```typescript
return gradeWithComposite(
  evalCase.input,
  evalCase.expected,
  evalCase.composite_grader_config,
  judgeModel,
  adapter,
  evalCase.id,
  customGraders,
);
```

**Files to edit:**

- `src/eval/__helpers/composite-grader.ts`
- `src/eval/__helpers/eval-runner.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The `gradeWithComposite` signature includes `caseId: string` parameter
- The callsite in `eval-runner.ts` passes `evalCase.id`
- No `.values().next().value` pattern remains in composite-grader.ts

### 4. Fix adapter deep \_\_schemas/ imports (Audit #5-7 -- HIGH)

**Type:** auto
**TDD:** false
**Depends on:** none

Three adapter files bypass entity barrels by importing directly from `__schemas/` directories. All needed types are already exported from their respective barrel files.

**Verified barrel exports (no barrel changes needed):**

- `~/agents` exports `BaseAgent` (type, line 27 of index.ts)
- `~/skills` exports `BaseSkill` (type, line 18 of index.ts)
- `~/rules` exports `BaseRule` (type, line 14 of index.ts)
- `~/workflow` exports `WorkflowStep` (type, line 39 of index.ts)

**Changes to `src/adapters/__schemas/adapter.schemas.ts`:**

Replace lines 14-17 (the 4 deep imports):

```typescript
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import type { WorkflowStep } from "~/workflow/__schemas/workflow.schemas";
```

With barrel imports:

```typescript
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import type { WorkflowStep } from "~/workflow";
```

**Changes to `src/adapters/claude/claude-adapter.ts`:**

Replace lines 18-21 (the 4 deep imports):

```typescript
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import type { WorkflowStep } from "~/workflow/__schemas/workflow.schemas";
```

With barrel imports:

```typescript
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import type { WorkflowStep } from "~/workflow";
```

**Changes to `src/adapters/api/api-adapter.ts`:**

Replace lines 15-18 (the 4 deep imports):

```typescript
import type { BaseAgent } from "~/agents/__schemas/agent.schemas";
import type { BaseSkill } from "~/skills/__schemas/skill.schemas";
import type { BaseRule } from "~/rules/__schemas/rule.schemas";
import type { WorkflowStep } from "~/workflow/__schemas/workflow.schemas";
```

With barrel imports:

```typescript
import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import type { WorkflowStep } from "~/workflow";
```

**Files to edit:**

- `src/adapters/__schemas/adapter.schemas.ts`
- `src/adapters/claude/claude-adapter.ts`
- `src/adapters/api/api-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Zero `__schemas/agent.schemas`, `__schemas/skill.schemas`, `__schemas/rule.schemas`, or `__schemas/workflow.schemas` imports remain in any adapter file
- All imports use barrel paths: `~/agents`, `~/skills`, `~/rules`, `~/workflow`

## Verification

After all 4 tasks are complete, run the following:

1. **Type check:** `bunx --bun tsc --noEmit` -- must pass with zero errors
2. **Import audit:** Search the 7 edited files for any remaining direct `__schemas/` cross-domain imports or `require()` calls -- must find none
3. **Barrel compliance:** Confirm no file in `src/adapters/` imports from `~/agents/__schemas/`, `~/skills/__schemas/`, `~/rules/__schemas/`, or `~/workflow/__schemas/`
4. **No require() calls:** Confirm `src/workflow/__helpers/dag-serializer.ts` has zero `require(` calls
5. **Bug fix validation:** Confirm `gradeWithComposite` accepts a `caseId` parameter and uses `customFns?.get(caseId)` instead of `.values().next().value`

## Success Criteria

- All 4 audit findings (#1, #2, #4, #5-7) are resolved
- `bunx --bun tsc --noEmit` passes cleanly
- Zero cross-domain `__schemas/` imports remain in the edited files
- Zero `require()` calls remain in dag-serializer.ts
- The composite-grader correctly looks up custom functions by case ID
- No functional behavior changes (all edits are import path corrections or bug fixes)

## Output Specification

- 7 files modified (compile.ts, dag-serializer.ts, composite-grader.ts, eval-runner.ts, adapter.schemas.ts, claude-adapter.ts, api-adapter.ts)
- 0 files created
- 0 files deleted
