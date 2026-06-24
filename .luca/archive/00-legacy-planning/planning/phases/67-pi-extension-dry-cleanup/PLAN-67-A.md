---
id: 67-A
title: "Extract shared helpers from Pi extensions"
phase: 67
wave: 1
depends_on: []
---

# Plan 67-A: Extract Shared Helpers from Pi Extensions

## Objective

Create four new helper modules in `src/hooks/pi-extensions/__helpers/` to eliminate the most critical duplication across all 11 Pi extensions. The existing `sanitize.ts` (8 functions, 70 tests) is already in this directory and serves as the pattern to follow.

## Context

The v2.1.0 milestone audit identified 3 CRITICAL and 3 HIGH DRY violations:

| Severity | Pattern                                                                            | Count                                                   | Target Helper                    |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| CRITICAL | JSON response wrapper `{ content: [{ type: "text", text: JSON.stringify(...) }] }` | 88 occurrences across 11 files (35 with JSON.stringify) | `response.ts`                    |
| CRITICAL | YAML frontmatter parsing (regex + field extraction)                                | 3 files (roles L36, teams L79, chain L50)               | `frontmatter.ts`                 |
| CRITICAL | Shell command execution with timeout/stdio/cwd                                     | 2 files (harness L92-134, tilldone L57-87)              | `exec.ts`                        |
| HIGH     | Map-based registry pattern (new Map + CRUD)                                        | 7 Maps across 6 files                                   | `registry.ts`                    |
| HIGH     | Tool parameter schema boilerplate                                                  | 39 tool registrations                                   | `response.ts` (createToolSchema) |
| HIGH     | Error handling in catch blocks                                                     | 3 catch blocks (harness x2, tilldone x1)                | `exec.ts`                        |

## Build Consideration

**IMPORTANT**: The `__helpers/` directory is NOT currently copied to `.pi/extensions/` during build. The `generatePiOutputs()` function in `scripts/build-shared.ts` (lines 568-605) only copies individual extension `.ts` files. This means:

1. New helper files will work in the source tree (src/hooks/pi-extensions/) where extensions import from `./__helpers/`
2. The build step in Plan 67-C must be updated to also copy `__helpers/*.ts` to `.pi/extensions/__helpers/`
3. Until 67-C completes, the deployed `.pi/` extensions will have broken imports -- this is the existing status quo (sanitize.ts imports already broken in `.pi/`)

---

## Task 1: Create `response.ts` -- Tool Response Helpers

**Goal**: Eliminate the 88 occurrences of `{ content: [{ type: "text", text: ... }] }` wrapper boilerplate.

**File**: `src/hooks/pi-extensions/__helpers/response.ts`

**Functions to implement**:

```typescript
/**
 * Create a Pi tool response wrapping a plain-text message.
 *
 * Replaces the ubiquitous pattern:
 *   return { content: [{ type: "text", text: message }] }
 *
 * @param message - The text content to return
 * @returns Pi-compatible tool response object
 */
export function createTextResponse(message: string): ToolResponse;

/**
 * Create a Pi tool response wrapping a JSON-serializable object.
 *
 * Replaces the pattern:
 *   return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
 *
 * @param data - JSON-serializable object to return
 * @returns Pi-compatible tool response object
 */
export function createJsonResponse(data: unknown): ToolResponse;

/**
 * Pi tool response type. Shared across all extensions.
 */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}
```

**Verification**:

- `bun test src/hooks/pi-extensions/__helpers/__tests__/response.test.ts`
- Tests: createTextResponse wraps plain text, createJsonResponse serializes with 2-space indent, ToolResponse type matches Pi SDK expectations
- Edge cases: empty string, null data, deeply nested objects, circular reference handling (should throw or truncate)

---

## Task 2: Create `frontmatter.ts` -- YAML Frontmatter Parser

**Goal**: Replace the 3 duplicated frontmatter parsers in roles (L36-59), teams (L76-101), and chain (L45-56).

**File**: `src/hooks/pi-extensions/__helpers/frontmatter.ts`

**Current patterns to consolidate**:

1. **luca-roles.ts L36-59**: Full parser -- extracts name, description, model, tools (YAML list)
2. **luca-teams.ts L76-101**: Full parser -- extracts name, description, model, tools (YAML list); identical to roles
3. **luca-chain.ts L45-56**: Partial parser -- only extracts description from frontmatter

**Functions to implement**:

```typescript
/**
 * Parsed frontmatter fields from a .pi/agents/*.md file.
 */
export interface AgentFrontmatter {
  name: string;
  description: string;
  tools: string[];
  model?: string;
}

/**
 * Parse YAML frontmatter from a Pi agent markdown file.
 *
 * Extracts the `---` fenced YAML block at the start of the file and
 * returns structured fields: name, description, model, and tools array.
 *
 * @param content - Full file content of a .pi/agents/*.md file
 * @returns Parsed frontmatter, or null if no valid frontmatter found
 */
export function parseFrontmatter(content: string): AgentFrontmatter | null;

/**
 * Extract a single field from YAML frontmatter.
 *
 * Lighter-weight alternative for extensions that only need one field
 * (e.g., chain only needs description).
 *
 * @param content - Full file content
 * @param field - Field name to extract (e.g., "description", "name")
 * @returns The field value, or null if not found
 */
export function extractFrontmatterField(
  content: string,
  field: string,
): string | null;
```

**Verification**:

- `bun test src/hooks/pi-extensions/__helpers/__tests__/frontmatter.test.ts`
- Tests: valid frontmatter with all fields, missing optional fields (model), YAML list parsing for tools, no frontmatter returns null, malformed frontmatter returns null, extractFrontmatterField for single fields
- Regression: parseFrontmatter output must match the current behavior of luca-roles parseFrontmatter (line 35-59) exactly

---

## Task 3: Create `exec.ts` -- Shell Command Execution Helper

**Goal**: Replace the 2 duplicated `execSync` wrappers in harness (L92-134) and tilldone (L57-87).

**File**: `src/hooks/pi-extensions/__helpers/exec.ts`

**Current patterns to consolidate**:

1. **luca-harness.ts L92-134** (`runCheck`): Returns `{ name, status: "passed"|"failed"|"timeout", output, duration }`
2. **luca-tilldone.ts L57-87** (`runCommand`): Returns `{ passed, output, duration }`

Both share:

- `execSync` with `cwd`, `timeout * 1000`, `stdio: ["pipe", "pipe", "pipe"]`, `encoding: "utf-8"`
- Output truncation (harness: 2000 chars, tilldone: 1500 chars)
- Error handling: stdout + stderr concatenation on failure
- Timeout detection via duration comparison

**Functions to implement**:

```typescript
/**
 * Result of a shell command execution.
 */
export interface ExecResult {
  /** Whether the command succeeded (exit code 0) */
  passed: boolean;
  /** "passed", "failed", or "timeout" */
  status: "passed" | "failed" | "timeout";
  /** Truncated stdout+stderr output */
  output: string;
  /** Execution time in milliseconds */
  duration: number;
}

/**
 * Options for shell command execution.
 */
export interface ExecOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Timeout in seconds (default: 120) */
  timeout?: number;
  /** Maximum output characters to retain (default: 2000) */
  maxOutput?: number;
}

/**
 * Execute a shell command with timeout, output truncation, and structured result.
 *
 * @security CRITICAL (accepted) -- execSync command injection vector.
 *   Commands originate from developer-controlled config or LLM-provided input
 *   (Pi's permission layer requires user approval). See .pi/SECURITY-MODEL.md.
 *
 * @param command - Shell command string to execute
 * @param options - Execution options (cwd, timeout, maxOutput)
 * @returns Structured execution result
 */
export function runShellCommand(
  command: string,
  options?: ExecOptions,
): ExecResult;
```

**Verification**:

- `bun test src/hooks/pi-extensions/__helpers/__tests__/exec.test.ts`
- Tests: successful command, failing command, timeout detection, output truncation at maxOutput, default options, custom cwd
- Security: preserve the `@security` JSDoc annotation explaining the accepted risk

---

## Task 4: Create `registry.ts` -- Generic Map Registry Factory

**Goal**: Replace the 7 duplicated `new Map()` + get/set/delete/list patterns across 6 extensions.

**File**: `src/hooks/pi-extensions/__helpers/registry.ts`

**Current Map instances**:

| Extension              | Variable        | Type                           | Line |
| ---------------------- | --------------- | ------------------------------ | ---- |
| luca-chain.ts          | `chains`        | `Map<string, Chain>`           | 40   |
| luca-tilldone.ts       | `loops`         | `Map<string, LoopState>`       | 40   |
| luca-query-experts.ts  | `sessions`      | `Map<string, ResearchSession>` | 47   |
| luca-safety-rules.ts   | `rules`         | `Map<string, SafetyRule>`      | 56   |
| luca-teams.ts          | `teams`         | `Map<string, TeamDef>`         | 37   |
| luca-purpose-gating.ts | `purposes`      | `Map<string, AgentPurpose>`    | 52   |
| luca-purpose-gating.ts | `deferredTasks` | `Map<string, DeferredTask>`    | 55   |

**Function to implement**:

```typescript
/**
 * A typed in-memory registry backed by a Map.
 *
 * Provides get, set, delete, has, list, values, clear, and size
 * operations with consistent typing. Used by extensions that maintain
 * named entity collections (chains, loops, sessions, teams, etc.).
 *
 * @param name - Human-readable registry name (for error messages)
 * @returns Registry object with CRUD operations
 */
export function createRegistry<T>(name: string): {
  /** Get an entry by key, or undefined */
  get: (key: string) => T | undefined;
  /** Set an entry by key */
  set: (key: string, value: T) => void;
  /** Delete an entry by key. Returns true if it existed. */
  delete: (key: string) => boolean;
  /** Check if a key exists */
  has: (key: string) => boolean;
  /** Get all entries as [key, value] pairs */
  entries: () => Array<[string, T]>;
  /** Get all values */
  values: () => T[];
  /** Get all keys */
  keys: () => string[];
  /** Clear all entries */
  clear: () => void;
  /** Number of entries */
  size: () => number;
  /** Registry name (for error messages) */
  name: string;
};
```

**Verification**:

- `bun test src/hooks/pi-extensions/__helpers/__tests__/registry.test.ts`
- Tests: basic CRUD, entries/values/keys, clear, size, name property, type safety with generic parameter

---

## Task 5: Update `__helpers/index.ts` barrel

**Goal**: Create or update the barrel file so all helpers are importable from `__helpers`.

**File**: `src/hooks/pi-extensions/__helpers/index.ts`

**Content**:

```typescript
export { createTextResponse, createJsonResponse } from "./response";
export type { ToolResponse } from "./response";
export { parseFrontmatter, extractFrontmatterField } from "./frontmatter";
export type { AgentFrontmatter } from "./frontmatter";
export { runShellCommand } from "./exec";
export type { ExecResult, ExecOptions } from "./exec";
export { createRegistry } from "./registry";
export {
  escapeRegExp,
  sanitizeName,
  sanitizeForTemplate,
  validateScriptPath,
  isValidIdentifier,
  normalizeToolName,
  isWithinDirectory,
  normalizeContext,
} from "./sanitize";
```

**Verification**:

- All exports resolve without errors: `bunx --bun tsc --noEmit`

---

## Task 6: Write tests for all new helpers

**Goal**: Comprehensive test coverage for response.ts, frontmatter.ts, exec.ts, and registry.ts.

**Files**:

- `src/hooks/pi-extensions/__helpers/__tests__/response.test.ts`
- `src/hooks/pi-extensions/__helpers/__tests__/frontmatter.test.ts`
- `src/hooks/pi-extensions/__helpers/__tests__/exec.test.ts`
- `src/hooks/pi-extensions/__helpers/__tests__/registry.test.ts`

**Test strategy**:

For **response.test.ts**:

- createTextResponse returns correct structure
- createJsonResponse serializes with 2-space indent
- Empty string and empty object cases
- Nested object serialization

For **frontmatter.test.ts**:

- Full agent frontmatter (name, description, model, tools list)
- Missing optional fields (no model, no tools)
- No frontmatter returns null
- Malformed frontmatter returns null
- extractFrontmatterField extracts single field
- Tools list with various indentation styles
- Regression: match exact output of luca-roles parseFrontmatter

For **exec.test.ts**:

- Successful command (`echo hello`) returns passed=true
- Failing command (`exit 1`) returns passed=false, status="failed"
- Output truncation respects maxOutput
- Default options work correctly
- stdout + stderr concatenation on failure

For **registry.test.ts**:

- get/set/has/delete CRUD cycle
- entries/values/keys return correct data
- clear empties the registry
- size reflects current count
- name property matches constructor arg
- Generic type parameter preserves type safety

**Verification**:

- `bun test src/hooks/pi-extensions/__helpers/__tests__/` -- all tests pass
- `bunx --bun tsc --noEmit` -- no type errors

---

## Files Created (Summary)

| File                                                              | Purpose                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/hooks/pi-extensions/__helpers/response.ts`                   | createTextResponse, createJsonResponse, ToolResponse type        |
| `src/hooks/pi-extensions/__helpers/frontmatter.ts`                | parseFrontmatter, extractFrontmatterField, AgentFrontmatter type |
| `src/hooks/pi-extensions/__helpers/exec.ts`                       | runShellCommand, ExecResult/ExecOptions types                    |
| `src/hooks/pi-extensions/__helpers/registry.ts`                   | createRegistry factory                                           |
| `src/hooks/pi-extensions/__helpers/index.ts`                      | Barrel re-exports                                                |
| `src/hooks/pi-extensions/__helpers/__tests__/response.test.ts`    | Response helper tests                                            |
| `src/hooks/pi-extensions/__helpers/__tests__/frontmatter.test.ts` | Frontmatter parser tests                                         |
| `src/hooks/pi-extensions/__helpers/__tests__/exec.test.ts`        | Exec helper tests                                                |
| `src/hooks/pi-extensions/__helpers/__tests__/registry.test.ts`    | Registry factory tests                                           |

## Verification Criteria

1. `bun test src/hooks/pi-extensions/__helpers/__tests__/` -- all tests pass
2. `bunx --bun tsc --noEmit` -- no type errors
3. Each helper function has JSDoc with @param, @returns, and @example
4. No new dependencies added (only uses node:child_process and built-in types)
5. `bun run build:all --force` still succeeds (existing extensions unchanged at this point)
