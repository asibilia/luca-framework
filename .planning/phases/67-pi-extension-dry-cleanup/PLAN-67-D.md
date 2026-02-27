---
id: 67-D
title: "Add JSDoc documentation to Pi extension helpers and functions"
phase: 67
wave: 3
depends_on: ["67-A", "67-B"]
---

# Plan 67-D: Add JSDoc Documentation to Pi Extension Functions

## Objective

Address the 16 LOW/MEDIUM documentation gaps identified in the v2.1.0 milestone audit. After Plans 67-A and 67-B, the codebase will have new shared helpers (already documented in 67-A) and refactored extensions. This plan ensures all remaining undocumented functions in the Pi extensions have proper JSDoc with `@param`, `@returns`, and `@example` tags.

## Scope

**Already documented** (no work needed):

- All functions in `__helpers/sanitize.ts` (8 functions, full JSDoc)
- All new helpers from 67-A (`response.ts`, `frontmatter.ts`, `exec.ts`, `registry.ts`) -- documented as part of 67-A
- File-level module JSDoc on all 11 extensions (the `/** ... */` block at top of each file)
- Internal helper functions that already have JSDoc: `loadConfig` (harness L25-28), `readComplexity` (complexity L106-108), `runCheck` (harness L79-91), `runCommand` (tilldone L42-56), `parseFrontmatter` (roles L32-34), `readStateMd` (state L21-24), `readPlanningFile` (memory L23-27), `parseAgentFile` (teams L73-75), `readAgentPersona` (teams L103-105), `getAgentSummary` (chain L42-44), `inferPurpose` (purpose-gating L60-62), `autoDiscoverAgents` (purpose-gating L82-84), `normalizeForMatch` (safety-rules L39-47)

**Needs JSDoc** (functions missing documentation):

| File                   | Function            | Line | Type                                              |
| ---------------------- | ------------------- | ---- | ------------------------------------------------- |
| luca-chain.ts          | `lucaChain`         | 34   | export default                                    |
| luca-complexity.ts     | `lucaComplexity`    | 101  | export default                                    |
| luca-harness.ts        | `lucaHarness`       | 20   | export default                                    |
| luca-memory.ts         | `lucaMemory`        | 16   | export default                                    |
| luca-purpose-gating.ts | `lucaPurposeGating` | 47   | export default                                    |
| luca-query-experts.ts  | `lucaQueryExperts`  | 42   | export default                                    |
| luca-roles.ts          | `lucaRoles`         | 24   | export default                                    |
| luca-safety-rules.ts   | `lucaSafetyRules`   | 49   | export default                                    |
| luca-state.ts          | `lucaState`         | 16   | export default                                    |
| luca-teams.ts          | `lucaTeams`         | 32   | export default                                    |
| luca-tilldone.ts       | `lucaTilldone`      | 36   | export default                                    |
| luca-roles.ts          | `loadRoles`         | 64   | internal                                          |
| luca-teams.ts          | `readAgentPersona`  | 106  | internal (has JSDoc, but verify completeness)     |
| luca-safety-rules.ts   | `normalizeForMatch` | 45   | module-level (has JSDoc, but verify completeness) |

Note: The `export default function` declarations at the top of each extension file already have a module-level JSDoc block (the `/** ... */` comment at lines 1-11 of each file), but the function declaration itself (e.g., `export default function lucaChain(pi: any)`) does not have its own JSDoc. The convention in this codebase is that the module-level JSDoc serves as the function JSDoc since each file exports a single function. **These do NOT need separate JSDoc** -- the file-level block is sufficient.

**Actual documentation gaps after re-assessment**:

The real gaps are functions that lack JSDoc entirely:

| File          | Function           | Line | Status                                                                                                     |
| ------------- | ------------------ | ---- | ---------------------------------------------------------------------------------------------------------- |
| luca-roles.ts | `loadRoles`        | 64   | Has `/** Load all available agent roles from .pi/agents/. */` -- single line, needs @returns               |
| luca-teams.ts | `readAgentPersona` | 106  | Has `/** Read the full content of an agent persona file (after frontmatter). */` -- needs @param, @returns |

After 67-B refactoring, some functions may be removed (e.g., inline `parseFrontmatter` in roles, `parseAgentFile` simplification in teams, `runCommand` in tilldone). Documentation should be added to whatever remains.

---

## Task 1: Audit documentation gaps post-refactoring

**Goal**: After 67-B completes, re-audit all 11 extension files to identify which functions still lack complete JSDoc.

**Steps**:

1. List every function definition in each extension file
2. Check each for JSDoc presence (any `/** ... */` block above it)
3. Check JSDoc completeness: `@param` for every parameter, `@returns` for non-void returns, at least one sentence description
4. Produce a checklist of functions needing work

**Expected gaps** (based on current analysis):

- `loadRoles` in luca-roles.ts: needs `@returns` tag
- `readAgentPersona` in luca-teams.ts: needs `@param` and `@returns` tags
- Any new thin wrapper functions created during 67-B refactoring

---

## Task 2: Add/complete JSDoc for `luca-roles.ts` functions

**File**: `src/hooks/pi-extensions/luca-roles.ts`

**Changes**:

1. **`loadRoles`** (line ~64 post-refactoring):
   ```typescript
   /**
    * Load all available agent roles from .pi/agents/.
    *
    * Reads every .md file in the agents directory, parses its YAML
    * frontmatter, and returns an array of structured agent roles.
    *
    * @returns Array of parsed agent roles, empty if agents directory missing
    */
   function loadRoles(): AgentFrontmatter[] {
   ```

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-roles.ts`

---

## Task 3: Add/complete JSDoc for `luca-teams.ts` functions

**File**: `src/hooks/pi-extensions/luca-teams.ts`

**Changes**:

1. **`readAgentPersona`** (line ~106):

   ```typescript
   /**
    * Read the full content of an agent persona file (after frontmatter).
    *
    * Returns the markdown body of the agent file, stripping the YAML
    * frontmatter block. Used by team dispatch to inject role-specific
    * context into the LLM prompt.
    *
    * @param agentName - Agent identifier (matches filename in .pi/agents/)
    * @returns Persona markdown content, or null if file not found
    */
   function readAgentPersona(agentName: string): string | null {
   ```

2. **`parseAgentFile`** (will be simplified post-67-B, ensure JSDoc carries over):
   ```typescript
   /**
    * Parse agent info from a .pi/agents/*.md file.
    *
    * Reads the file, extracts YAML frontmatter using the shared parser,
    * and returns structured agent information.
    *
    * @param filePath - Absolute path to the agent .md file
    * @returns Parsed agent info, or null if file missing or has no frontmatter
    */
   function parseAgentFile(filePath: string): AgentInfo | null {
   ```

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-teams.ts`

---

## Task 4: Add JSDoc for new wrapper functions from 67-B

**Goal**: Any thin wrapper functions created during 67-B (e.g., harness `runCheck` adapter, tilldone `runCommand` adapter) must have JSDoc.

**File**: `src/hooks/pi-extensions/luca-harness.ts`

**Expected wrapper**:

```typescript
/**
 * Run a named verification check using the shared shell command executor.
 *
 * Adapts the generic runShellCommand result to include the check name
 * for structured harness reporting.
 *
 * @param name - Check name (e.g., "test", "typecheck")
 * @param command - Shell command to execute
 * @param timeout - Timeout in seconds
 * @returns Named execution result with status, output, and duration
 */
function runCheck(name: string, command: string, timeout: number) {
```

**File**: `src/hooks/pi-extensions/luca-tilldone.ts`

**Expected wrapper**:

```typescript
/**
 * Run a shell command with the extension's working directory and output limits.
 *
 * Thin wrapper around runShellCommand that applies the extension-scoped
 * cwd and MAX_OUTPUT_LENGTH settings.
 *
 * @param command - Shell command to execute
 * @param timeout - Timeout in seconds
 * @returns Execution result with passed, status, output, and duration
 */
function runCommand(command: string, timeout: number) {
```

**Verification**: `bunx --bun tsc --noEmit` on both files

---

## Task 5: Add JSDoc for `luca-chain.ts` `getAgentSummary`

**File**: `src/hooks/pi-extensions/luca-chain.ts`

The function already has a single-line JSDoc. Enhance it:

```typescript
/**
 * Read agent persona summary for chain context injection.
 *
 * Loads the agent's markdown file from .pi/agents/ and extracts the
 * description from its YAML frontmatter. Falls back to the first 500
 * characters of the file content if no frontmatter is present.
 *
 * @param agentName - Agent identifier (matches filename in .pi/agents/)
 * @returns Description string, or a "not found" message if file missing
 */
function getAgentSummary(agentName: string): string {
```

**Verification**: `bunx --bun tsc --noEmit src/hooks/pi-extensions/luca-chain.ts`

---

## Task 6: Verify `normalizeForMatch` JSDoc in `luca-safety-rules.ts`

**File**: `src/hooks/pi-extensions/luca-safety-rules.ts`

This function (line 45) already has a JSDoc block with description. Verify it has:

- `@param str` -- yes (check)
- `@returns` -- verify
- `@example` -- verify

If missing, add:

````typescript
/**
 * Normalize a string for safety pattern matching.
 * Removes underscores/hyphens and lowercases so that camelCase, snake_case,
 * PascalCase, and UPPER_CASE variants all match the same pattern.
 *
 * @param str - The string to normalize for comparison
 * @returns Lowercased string with underscores and hyphens removed
 *
 * @example
 * ```typescript
 * normalizeForMatch("api_key")  // "apikey"
 * normalizeForMatch("API_KEY")  // "apikey"
 * normalizeForMatch("apiKey")   // "apikey"
 * ```
 */
function normalizeForMatch(str: string): string {
````

**Verification**: visual inspection + `bunx --bun tsc --noEmit`

---

## Task 7: Verify all shared helper JSDoc from 67-A

**Goal**: Quick audit of the 4 new helper files from 67-A to confirm complete documentation.

**Files to verify**:

- `src/hooks/pi-extensions/__helpers/response.ts`
- `src/hooks/pi-extensions/__helpers/frontmatter.ts`
- `src/hooks/pi-extensions/__helpers/exec.ts`
- `src/hooks/pi-extensions/__helpers/registry.ts`

**Check for each exported function**:

- [ ] Has `/** ... */` JSDoc block
- [ ] Has description (at least one sentence)
- [ ] Has `@param` for every parameter
- [ ] Has `@returns` for non-void returns
- [ ] Has at least one `@example`

If any are missing, add them. Plan 67-A specifies these should all be present, but verification catches anything missed during implementation.

---

## Files Modified (Summary)

| File                                           | Change                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| `src/hooks/pi-extensions/luca-roles.ts`        | Enhance `loadRoles` JSDoc                             |
| `src/hooks/pi-extensions/luca-teams.ts`        | Enhance `readAgentPersona` and `parseAgentFile` JSDoc |
| `src/hooks/pi-extensions/luca-harness.ts`      | Add JSDoc to `runCheck` wrapper                       |
| `src/hooks/pi-extensions/luca-tilldone.ts`     | Add JSDoc to `runCommand` wrapper                     |
| `src/hooks/pi-extensions/luca-chain.ts`        | Enhance `getAgentSummary` JSDoc                       |
| `src/hooks/pi-extensions/luca-safety-rules.ts` | Verify/enhance `normalizeForMatch` JSDoc              |
| `src/hooks/pi-extensions/__helpers/*.ts`       | Verify completeness (4 files)                         |

## Verification Criteria

1. Every exported function across all `__helpers/*.ts` files has JSDoc with `@param`, `@returns`, and `@example`
2. Every internal helper function in the 11 extension files has JSDoc with at least a description and `@param`/`@returns` where applicable
3. `bunx --bun tsc --noEmit` passes on all files
4. No functions are missing JSDoc entirely (grep for `function ` preceded by a non-comment line)
5. `bun run build:all --force` succeeds
