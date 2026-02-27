---
id: 67-B
title: "Refactor all 11 Pi extensions to use shared helpers"
phase: 67
wave: 2
depends_on: ["67-A"]
---

# Plan 67-B: Refactor All 11 Pi Extensions to Use Shared Helpers

## Objective

Replace duplicated patterns in all 11 Pi extension files with calls to the shared helpers created in Plan 67-A. This is a mechanical refactoring -- no behavioral changes. Every extension must produce identical tool responses before and after.

## Approach

For each extension:

1. Add imports from `__helpers` (response, frontmatter, exec, registry as needed)
2. Replace inline response wrappers with `createTextResponse()` / `createJsonResponse()`
3. Replace frontmatter parsers with `parseFrontmatter()` / `extractFrontmatterField()`
4. Replace exec patterns with `runShellCommand()`
5. Replace `new Map()` with `createRegistry()`
6. Remove dead code (inline functions that are now replaced)
7. Verify each file individually with typecheck before moving to the next

## Important Constraints

- **No behavioral changes**: tool responses must be byte-identical
- **Preserve security annotations**: keep all `@security` JSDoc comments
- **Preserve event handlers**: `pi.on(...)` handlers remain unchanged
- **Import path**: all imports use `./__helpers/response` etc. (relative from extension files)

---

## Task 1: Refactor `luca-chain.ts` (11 response wrappers, 1 frontmatter, 1 registry)

**File**: `src/hooks/pi-extensions/luca-chain.ts`

**Changes**:

1. **Add imports** (top of file, after existing imports):

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   import { extractFrontmatterField } from "./__helpers/frontmatter";
   import { createRegistry } from "./__helpers/registry";
   ```

2. **Replace registry** (line 40):
   - Before: `const chains: Map<string, Chain> = new Map();`
   - After: `const chains = createRegistry<Chain>("chains");`
   - Update all `chains.get()`, `chains.set()`, `Array.from(chains.values())` to use registry methods

3. **Replace frontmatter parsing** (lines 45-56, `getAgentSummary`):
   - Before: inline regex `content.match(/^---\n([\s\S]*?)\n---/)` then `fm.match(/^description:.../)`
   - After: `extractFrontmatterField(content, "description")`
   - Simplify `getAgentSummary` to:
     ```typescript
     function getAgentSummary(agentName: string): string {
       const filePath = join(agentsDir, `${agentName}.md`);
       if (!existsSync(filePath)) return `Agent "${agentName}" not found`;
       const content = readFileSync(filePath, "utf-8");
       return (
         extractFrontmatterField(content, "description") ??
         content.slice(0, 500)
       );
     }
     ```

4. **Replace response wrappers** (11 occurrences):
   - Lines 93-100: `return createTextResponse(\`Invalid chain name...\`)`
   - Lines 113-120: `return createTextResponse(\`Invalid step format...\`)`
   - Lines 128-134: `return createTextResponse(\`Invalid agent name...\`)`
   - Lines 139-146: `return createTextResponse(\`Agent "${agent}" not found...\`)`
   - Lines 166-185: `return createJsonResponse({ chain: chain.name, steps: ... })`
   - Lines 216-223: `return createTextResponse(\`Chain "${params.chain}" not found...\`)`
   - Lines 235-256: `return createJsonResponse({ chain: chain.name, status: "completed", ... })`
   - Lines 273-293: `return createJsonResponse({ chain: chain.name, step_number: ... })`
   - Lines 315-323: `return createTextResponse(\`Chain "${params.chain}" not found\`)`
   - Lines 325-347: `return createJsonResponse({ name: chain.name, status: ... })`
   - Lines 357-363: `return createJsonResponse(allChains)` (for the list-all case; use `createJsonResponse(Array.from(chains.values()).map(...))`

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-chain.ts`

---

## Task 2: Refactor `luca-complexity.ts` (8 response wrappers)

**File**: `src/hooks/pi-extensions/luca-complexity.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   ```

2. **Replace response wrappers** (8 occurrences):
   - Line 143-151: `return createJsonResponse({ level, tier })`
   - Lines 174-181: `return createTextResponse(\`Invalid level...\`)`
   - Lines 185-188: `return createTextResponse("STATE.md not found")`
   - Lines 202-209: `return createTextResponse("Task Complexity field not found...")`
   - Lines 217-224: `return createTextResponse(\`Complexity set to ${level}...\`)`
   - Lines 250-257: `return createTextResponse(\`Unknown step...\`)`
   - Lines 259-275: `return createJsonResponse({ level, step: params.step, decision, tier })`
   - Lines 279-290: `return createJsonResponse({ level, tier: COMPLEXITY_TIER[level], gates: gate })`

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-complexity.ts`

---

## Task 3: Refactor `luca-harness.ts` (2 response wrappers, 1 exec)

**File**: `src/hooks/pi-extensions/luca-harness.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   import { runShellCommand } from "./__helpers/exec";
   ```

2. **Remove `execSync` import** (line 16): no longer needed directly

3. **Replace `runCheck` function** (lines 92-134):
   - Before: 42-line custom function using execSync
   - After: Thin wrapper around `runShellCommand`:
     ```typescript
     function runCheck(name: string, command: string, timeout: number) {
       const result = runShellCommand(command, {
         cwd,
         timeout,
         maxOutput: 2000,
       });
       return { name, ...result };
     }
     ```
   - Note: harness adds a `name` field that `runShellCommand` doesn't return, so keep a thin adapter

4. **Replace response wrappers** (2 occurrences):
   - Lines 156-158: `return createTextResponse("Harness is disabled in config")`
   - Lines 179-181: `return createJsonResponse(summary)`

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-harness.ts`

---

## Task 4: Refactor `luca-memory.ts` (9 response wrappers)

**File**: `src/hooks/pi-extensions/luca-memory.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import { createTextResponse } from "./__helpers/response";
   ```

2. **Replace response wrappers** (9 occurrences):
   - Line 48: `return createTextResponse(content)` (read brain)
   - Lines 72, 95-102, 104-106, 109: Various text responses in memory reader
   - Lines 165-172: `return createTextResponse(\`Unknown section...\`)`
   - Lines 177-184: `return createTextResponse(\`Write path escapes...\`)`
   - Lines 221-226: `return createTextResponse(\`Appended to...\`)`

   Note: luca-memory mostly uses plain text responses (not JSON), so primarily `createTextResponse`.

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-memory.ts`

---

## Task 5: Refactor `luca-purpose-gating.ts` (11 response wrappers, 2 registries)

**File**: `src/hooks/pi-extensions/luca-purpose-gating.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   import { createRegistry } from "./__helpers/registry";
   ```

2. **Replace registries** (lines 52, 55):
   - Before: `const purposes: Map<string, AgentPurpose> = new Map();`
   - After: `const purposes = createRegistry<AgentPurpose>("purposes");`
   - Before: `const deferredTasks: Map<string, DeferredTask> = new Map();`
   - After: `const deferredTasks = createRegistry<DeferredTask>("deferred-tasks");`
   - Update all `.get()`, `.set()`, `.values()`, `Array.from(purposes.values())`, `purposes.size` to use registry methods
   - `purposes.size === 0` becomes `purposes.size() === 0`
   - `Array.from(purposes.values())` becomes `purposes.values()`
   - `Array.from(deferredTasks.values())` becomes `deferredTasks.values()`

3. **Replace response wrappers** (11 occurrences):
   - Lines 170-178: `return createTextResponse(\`Invalid purpose...\`)`
   - Lines 194-201: `return createTextResponse(\`Agent "${params.agent}" registered...\`)`
   - Lines 233-249: `return createJsonResponse({ agent: params.agent, compatible: false, reason: ... })`
   - Lines 258-273: `return createJsonResponse({ agent: params.agent, compatible: false, reason: ... })`
   - Lines 290-309: `return createJsonResponse({ agent: params.agent, context: ..., compatible, ... })`
   - Lines 343-359: `return createJsonResponse({ context: params.context, error: ..., total_eligible: 0 })`
   - Lines 382-398: `return createJsonResponse({ context: ..., background_only: ..., total_eligible: ... })`
   - Lines 437-443: `return createTextResponse(\`Agent "${params.agent}" is not marked...\`)`
   - Lines 458-475: `return createJsonResponse({ task_id: taskId, agent: ..., trigger: ... })`
   - Lines 506-529: `return createJsonResponse({ trigger: params.trigger, triggered_count: ... })`
   - Lines 541-567: `return createJsonResponse({ total: tasks.length, pending: ..., ... })`

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-purpose-gating.ts`

---

## Task 6: Refactor `luca-query-experts.ts` (16 response wrappers, 1 registry)

**File**: `src/hooks/pi-extensions/luca-query-experts.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   import { createRegistry } from "./__helpers/registry";
   ```

2. **Replace registry** (line 47):
   - Before: `const sessions: Map<string, ResearchSession> = new Map();`
   - After: `const sessions = createRegistry<ResearchSession>("research-sessions");`
   - Update: `sessions.get()`, `sessions.set()`, `Array.from(sessions.values())`

3. **Replace response wrappers** (16 occurrences): All response returns in the 4 tool execute functions and error paths.

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-query-experts.ts`

---

## Task 7: Refactor `luca-roles.ts` (6 response wrappers, 1 frontmatter)

**File**: `src/hooks/pi-extensions/luca-roles.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   import { parseFrontmatter } from "./__helpers/frontmatter";
   import type { AgentFrontmatter } from "./__helpers/frontmatter";
   ```

2. **Remove inline `parseFrontmatter`** (lines 35-59): Delete the entire function
   - Replace `AgentRole` interface with imported `AgentFrontmatter` type (same shape: name, description, tools, model?)
   - If `AgentRole` has the exact same fields as `AgentFrontmatter`, use `AgentFrontmatter` directly
   - If there's a difference, keep `AgentRole` as a type alias: `type AgentRole = AgentFrontmatter;`

3. **Replace response wrappers** (6 occurrences):
   - Line 95: `return createJsonResponse(summary)` (list roles)
   - Lines 127-133: `return createTextResponse(\`Role "${params.role}" not found...\`)`
   - Lines 138-144: `return createTextResponse(\`Activated role...\`)`
   - Lines 159-165: `return createTextResponse(\`Deactivated role...\`)`
   - Lines 180-185: `return createJsonResponse({ active: false, role: null })`
   - Lines 191-203: `return createJsonResponse({ active: true, role: activeRole.name, ... })`

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-roles.ts`

---

## Task 8: Refactor `luca-safety-rules.ts` (7 response wrappers, 1 registry)

**File**: `src/hooks/pi-extensions/luca-safety-rules.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   import { createRegistry } from "./__helpers/registry";
   ```

2. **Replace registry** (line 56):
   - Before: `const rules: Map<string, SafetyRule> = new Map();`
   - After: `const rules = createRegistry<SafetyRule>("safety-rules");`
   - Update: `rules.set()`, `rules.values()`, `Array.from(rules.values())`
   - The `for (const rule of rules.values())` iteration pattern becomes `for (const rule of rules.values())`
   - Pre-registration loop (lines 124-126) uses `rules.set(rule.id, rule)` -- works identically

3. **Keep `normalizeForMatch`** (lines 45-47): This function is specific to safety pattern matching and does NOT belong in sanitize.ts. It normalizes differently (removes `_` and `-`) than sanitize's `normalizeContext` (collapses whitespace).

4. **Replace response wrappers** (7 occurrences):
   - Lines 144-160: `return createJsonResponse({ gate_mode: gateMode, rules: ruleList, total: ruleList.length })`
   - Lines 213-220: `return createTextResponse(\`Invalid severity...\`)`
   - Lines 234-241: `return createTextResponse(\`Safety rule "${params.id}" registered...\`)`
   - Lines 333-353: `return createJsonResponse({ safe: violations.length === 0, ... })`
   - Lines 376-383: `return createTextResponse(\`Invalid mode...\`)`
   - Lines 390-396: `return createTextResponse(\`Safety mode changed: ${previous} → ${gateMode}\`)`
   - Lines 419-434: `return createJsonResponse({ total_entries: auditLog.length, showing: entries.length, entries })`

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-safety-rules.ts`

---

## Task 9: Refactor `luca-state.ts` (6 response wrappers)

**File**: `src/hooks/pi-extensions/luca-state.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   ```

2. **Replace response wrappers** (6 occurrences):
   - Lines 58-65: `return createJsonResponse(state)` (read state)
   - Lines 89-91: `return createTextResponse(value)` (read field)
   - Lines 121-123: `return createTextResponse("Error: STATE.md not found")`
   - Lines 128-135: `return createTextResponse("Error: field name exceeds maximum...")`
   - Lines 153-159: `return createTextResponse(\`Field "${params.field}" not found...\`)`
   - Lines 164-170: `return createTextResponse(\`Updated "${params.field}" to "${params.value}"\`)`

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-state.ts`

---

## Task 10: Refactor `luca-teams.ts` (5 response wrappers, 1 frontmatter, 1 registry)

**File**: `src/hooks/pi-extensions/luca-teams.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   import { parseFrontmatter } from "./__helpers/frontmatter";
   import { createRegistry } from "./__helpers/registry";
   ```

2. **Replace registry** (line 37):
   - Before: `const teams: Map<string, TeamDef> = new Map();`
   - After: `const teams = createRegistry<TeamDef>("teams");`
   - The pre-defined teams (lines 40-71) use `teams.set(...)` -- works identically

3. **Replace frontmatter parser** (lines 76-101, `parseAgentFile`):
   - Before: 25-line inline parser duplicating roles' parseFrontmatter
   - After:
     ```typescript
     function parseAgentFile(filePath: string): AgentInfo | null {
       if (!existsSync(filePath)) return null;
       const content = readFileSync(filePath, "utf-8");
       const fm = parseFrontmatter(content);
       if (!fm) return null;
       return {
         name: fm.name,
         description: fm.description,
         tools: fm.tools,
         model: fm.model,
       };
     }
     ```
   - Note: `AgentInfo` and `AgentFrontmatter` have the same shape. If keeping `AgentInfo`, map from `AgentFrontmatter`. Alternatively, use `AgentFrontmatter` directly and remove `AgentInfo`.

4. **Replace response wrappers** (5 occurrences):
   - Lines 122-135: `return createJsonResponse(teamList)` (list teams)
   - Lines 181-188: `return createTextResponse(\`Agent(s) not found: ${missing.join(", ")}\`)`
   - Lines 198-204: `return createTextResponse(\`Team "${params.name}" defined...\`)`
   - Lines 232-238: `return createTextResponse(\`Team "${params.team}" not found...\`)`
   - Lines 275-278: `return createJsonResponse(result)` (dispatch)

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-teams.ts`

---

## Task 11: Refactor `luca-tilldone.ts` (7 response wrappers, 1 exec, 1 registry)

**File**: `src/hooks/pi-extensions/luca-tilldone.ts`

**Changes**:

1. **Add imports**:

   ```typescript
   import {
     createTextResponse,
     createJsonResponse,
   } from "./__helpers/response";
   import { runShellCommand } from "./__helpers/exec";
   import { createRegistry } from "./__helpers/registry";
   ```

2. **Remove `execSync` import** (line 16)

3. **Replace registry** (line 40):
   - Before: `const loops: Map<string, LoopState> = new Map();`
   - After: `const loops = createRegistry<LoopState>("loops");`

4. **Replace `runCommand` function** (lines 57-87):
   - Before: 30-line custom execSync wrapper
   - After: Thin wrapper:
     ```typescript
     function runCommand(command: string, timeout: number) {
       return runShellCommand(command, {
         cwd,
         timeout,
         maxOutput: MAX_OUTPUT_LENGTH,
       });
     }
     ```
   - `runShellCommand` returns `{ passed, status, output, duration }` which is a superset of what tilldone needs

5. **Replace response wrappers** (7 occurrences):
   - Lines 137-152: `return createJsonResponse({ name: params.name, status: "failed", message: ... })`
   - Lines 183-206: `return createJsonResponse({ name: params.name, iteration, ... })`
   - Lines 228-235: `return createTextResponse(\`Loop "${params.name}" not found\`)`
   - Lines 239-261: `return createJsonResponse({ name: loop.name, command: ..., status: ... })`
   - Lines 264-278: `return createJsonResponse(allLoops)` (list all loops)
   - Lines 300-307: `return createTextResponse(\`Loop "${params.name}" not found\`)`
   - Lines 312-320: `return createTextResponse(\`Loop "${params.name}" reset...\`)`

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-tilldone.ts`

---

## Refactoring Execution Order

Process extensions in this order (smallest change count first to build confidence):

1. **luca-state.ts** (6 response only -- simplest, good validation of response helper)
2. **luca-complexity.ts** (8 response only)
3. **luca-memory.ts** (9 response only)
4. **luca-roles.ts** (6 response + 1 frontmatter -- tests frontmatter helper)
5. **luca-teams.ts** (5 response + 1 frontmatter + 1 registry)
6. **luca-harness.ts** (2 response + 1 exec -- tests exec helper)
7. **luca-tilldone.ts** (7 response + 1 exec + 1 registry)
8. **luca-safety-rules.ts** (7 response + 1 registry)
9. **luca-chain.ts** (11 response + 1 frontmatter + 1 registry)
10. **luca-purpose-gating.ts** (11 response + 2 registries)
11. **luca-query-experts.ts** (16 response + 1 registry -- most changes, do last)

---

## Files Modified (Summary)

| File                     | Response | Frontmatter  | Exec         | Registry |
| ------------------------ | -------- | ------------ | ------------ | -------- |
| `luca-state.ts`          | 6        | -            | -            | -        |
| `luca-complexity.ts`     | 8        | -            | -            | -        |
| `luca-memory.ts`         | 9        | -            | -            | -        |
| `luca-roles.ts`          | 6        | 1 (remove)   | -            | -        |
| `luca-teams.ts`          | 5        | 1 (remove)   | -            | 1        |
| `luca-harness.ts`        | 2        | -            | 1 (simplify) | -        |
| `luca-tilldone.ts`       | 7        | -            | 1 (remove)   | 1        |
| `luca-safety-rules.ts`   | 7        | -            | -            | 1        |
| `luca-chain.ts`          | 11       | 1 (simplify) | -            | 1        |
| `luca-purpose-gating.ts` | 11       | -            | -            | 2        |
| `luca-query-experts.ts`  | 16       | -            | -            | 1        |
| **TOTAL**                | **88**   | **3**        | **2**        | **7**    |

## Verification Criteria

1. `bunx --bun tsc --noEmit` -- no type errors in any extension
2. `bun test` -- all existing tests pass (no regressions)
3. `bun run build:all --force` -- build succeeds and all extensions are written to `.pi/extensions/`
4. Spot-check: verify luca-chain (most complex, 3 helper types), luca-harness (exec helper), and luca-roles (frontmatter helper) produce identical JSON output by comparing tool response structures before/after
5. No new imports of `child_process` in extensions that use `exec.ts`
6. No inline `{ content: [{ type: "text", text: ... }] }` patterns remaining: `grep -rn 'type: "text"' src/hooks/pi-extensions/luca-*.ts` returns 0 matches
7. No inline frontmatter regex parsing remaining in any extension file (except comments)
8. All `@security` annotations preserved in harness and tilldone
