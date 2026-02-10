---
id: 12-01
title: Core Harness Module
phase: 12-verification-harness
wave: 1
delivers: VERI-01, VERI-03, VERI-05
depends_on: null
tasks: 8
---

# Plan 12-01: Core Harness Module

## Objective

Build the standalone verification harness infrastructure: types, parsers, runner, and config loading. This module orchestrates running test/lint/typecheck/build as a single command, parses toolchain output into structured errors, and returns typed results. No integration with skills or agents yet -- this plan produces a self-contained, testable module.

## Context

- **Research:** `.planning/phases/12-verification-harness/RESEARCH.md` (Section 2: Implementation Approach, Section 4: Parser Design)
- **Hook registry pattern:** `src/hooks/index.ts` (follow TypeScript conventions: interfaces, exports from index.ts)
- **Hook test pattern:** `__tests__/src/hooks/hook-registry.test.ts` (test structure, assertion style)
- **Config template:** `packages/luca-framework/templates/framework/templates/config.json` (existing `hooks` section as reference for `harness` section)
- **Project config:** `.planning/config.json` (this project's live config, does not yet have `harness` section)
- **Root exports:** `index.ts` (add harness exports following hook export pattern)
- **Bun preference:** Use `Bun.spawn` for running checks, `Bun.file` for reading config. No `child_process`.
- **Pre-existing test failures:** 6 tests fail in doctor/config. Do not fix these. Harness should handle gracefully.

## Tasks

### Task 1: Create Harness Type Definitions

**Goal:** Define all TypeScript interfaces for the harness system.
**Files:** `src/harness/types.ts`
**Pattern:** Follow the same interface-first pattern used in `src/hooks/index.ts` (`HookDefinition`), `src/agents/types/agent.types.ts`, etc.

Create `src/harness/types.ts` with the following types:

```typescript
/** Configuration for a single check in the harness */
export interface CheckConfig {
  name: string;           // e.g., "test", "typecheck", "lint", "build"
  command: string;         // e.g., "bun test", "bunx --bun tsc --noEmit"
  enabled: boolean;
  timeout: number;         // seconds
  parser: string;          // parser key from parser registry: "bun-test", "tsc", "eslint", "generic"
}

/** Top-level harness configuration (maps to config.json "harness" section) */
export interface HarnessConfig {
  enabled: boolean;
  checks: CheckConfig[];
  maxFixIterations: number;
  failFast: boolean;
}

/** A single parsed error from toolchain output */
export interface ParsedError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;           // e.g., TS2345, ESLint rule name
  severity: 'error' | 'warning';
}

/** Result of running a single check */
export interface CheckResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'timeout';
  exitCode: number;
  errors: ParsedError[];
  warnings: ParsedError[];
  rawOutput: string;       // truncated to last N lines
  duration: number;        // milliseconds
}

/** Aggregate result of running all checks */
export interface HarnessResult {
  status: 'passed' | 'failed';
  checks: CheckResult[];
  totalErrors: number;
  totalWarnings: number;
  duration: number;        // milliseconds
  timestamp: string;       // ISO 8601
}

/** Parser function signature */
export type OutputParser = (output: string) => ParsedError[];

/** Default harness config used when no config.json harness section exists */
export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  enabled: true,
  maxFixIterations: 3,
  failFast: false,
  checks: [
    { name: 'test', command: 'bun test', enabled: true, timeout: 120, parser: 'bun-test' },
    { name: 'typecheck', command: 'bunx --bun tsc --noEmit', enabled: true, timeout: 60, parser: 'tsc' },
    { name: 'lint', command: 'bunx --bun eslint . --format json', enabled: false, timeout: 60, parser: 'eslint' },
    { name: 'build', command: 'bun run build:all', enabled: false, timeout: 120, parser: 'generic' },
  ],
};
```

**Verification:**
- [ ] All interfaces exported and importable
- [ ] `DEFAULT_HARNESS_CONFIG` has sensible defaults matching Bun-first convention
- [ ] Types compile with `bunx --bun tsc --noEmit`

### Task 2: Create TypeScript Compiler Output Parser

**Goal:** Parse `tsc` output into structured `ParsedError[]`.
**Files:** `src/harness/parsers/tsc.ts`, `__tests__/src/harness/parsers/tsc.test.ts`
**Pattern:** Research Section 4.2 (tsc parser)

The tsc output format is highly structured and reliable:

```
src/foo.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

Implementation:

```typescript
import type { ParsedError, OutputParser } from '../types';

const TSC_ERROR_REGEX = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

export const parseTscOutput: OutputParser = (output: string): ParsedError[] => {
  const errors: ParsedError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(TSC_ERROR_REGEX);
    if (match) {
      errors.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        severity: match[4] as 'error' | 'warning',
        code: match[5],
        message: match[6].trim(),
      });
    }
  }

  return errors;
};
```

Test with real tsc output samples including:
- Single error
- Multiple errors across files
- Warnings (if applicable)
- Clean output (no errors)
- Output with "Found N errors" summary line (should not be parsed as an error)

**Verification:**
- [ ] Parser extracts file, line, column, code, severity, message
- [ ] Parser handles clean output (returns empty array)
- [ ] Parser ignores non-error lines (summary lines, blank lines)
- [ ] All tests pass: `bun test __tests__/src/harness/parsers/tsc.test.ts`

### Task 3: Create Bun Test Output Parser

**Goal:** Parse `bun test` output into structured `ParsedError[]`.
**Files:** `src/harness/parsers/bun-test.ts`, `__tests__/src/harness/parsers/bun-test.test.ts`
**Pattern:** Research Section 4.1 (bun-test parser)

Bun test failure output patterns:

```
bun test v1.x.x

src/foo.test.ts:
✓ test name [1.23ms]
✗ failing test [2.34ms]
  error: expect(received).toBe(expected)
    Expected: "foo"
    Received: "bar"
    at src/foo.test.ts:15:3

 2 pass
 1 fail
```

Parser strategy:
- Detect `✗` or `✘` lines for failed test names
- Look for `at <file>:<line>:<col>` in stack traces following a failure
- Extract expected/received if present
- Handle multiple failures across files

```typescript
import type { ParsedError, OutputParser } from '../types';

// Match failed test name: "✗ test name [timing]" or "✘ test name [timing]"
const FAIL_MARKER_REGEX = /^\s*[✗✘]\s+(.+?)(?:\s+\[[\d.]+(?:ms|s)\])?\s*$/;

// Match stack trace location: "at /path/file.ts:line:col" or "at file.ts:line:col"
const STACK_LOCATION_REGEX = /^\s+at\s+(.+?):(\d+):(\d+)\s*$/;

// Match compile/parse error: "error: <message>" at start of line or "SyntaxError: ..."
const COMPILE_ERROR_REGEX = /^(?:error|SyntaxError|TypeError|ReferenceError):\s+(.+)$/;

// Match file header line: "path/to/file.test.ts:" (indicates which test file)
const FILE_HEADER_REGEX = /^(\S+\.(?:test|spec)\.\w+):$/;

export const parseBunTestOutput: OutputParser = (output: string): ParsedError[] => {
  const errors: ParsedError[] = [];
  const lines = output.split('\n');

  let currentTestName = '';
  let currentFile = '';
  let assertionDetails: string[] = [];
  let foundLocation = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current test file from header line
    const fileMatch = line.match(FILE_HEADER_REGEX);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    // Detect failed test
    const failMatch = line.match(FAIL_MARKER_REGEX);
    if (failMatch) {
      // If we had a previous failure without a location, emit it
      if (currentTestName && !foundLocation) {
        errors.push({
          file: currentFile || 'unknown',
          message: currentTestName + (assertionDetails.length ? ': ' + assertionDetails.join(' ') : ''),
          severity: 'error',
        });
      }

      currentTestName = failMatch[1];
      assertionDetails = [];
      foundLocation = false;
      continue;
    }

    // If inside a failure block, collect assertion details
    if (currentTestName && !foundLocation) {
      // Collect Expected/Received lines
      const trimmed = line.trim();
      if (trimmed.startsWith('Expected:') || trimmed.startsWith('Received:') ||
          trimmed.startsWith('error:') || trimmed.startsWith('expect(')) {
        assertionDetails.push(trimmed);
      }

      // Look for stack trace location
      const locMatch = line.match(STACK_LOCATION_REGEX);
      if (locMatch) {
        foundLocation = true;
        errors.push({
          file: locMatch[1],
          line: parseInt(locMatch[2], 10),
          column: parseInt(locMatch[3], 10),
          message: currentTestName + (assertionDetails.length ? ': ' + assertionDetails.join(' ') : ''),
          severity: 'error',
        });
        currentTestName = '';
        assertionDetails = [];
      }
    }

    // Detect compile errors (file fails to parse)
    const compileMatch = line.match(COMPILE_ERROR_REGEX);
    if (compileMatch && !currentTestName) {
      // Look ahead for file location
      const nextLine = lines[i + 1] || '';
      const locMatch = nextLine.match(STACK_LOCATION_REGEX);
      errors.push({
        file: locMatch ? locMatch[1] : currentFile || 'unknown',
        line: locMatch ? parseInt(locMatch[2], 10) : undefined,
        column: locMatch ? parseInt(locMatch[3], 10) : undefined,
        message: compileMatch[1],
        severity: 'error',
      });
    }
  }

  // Flush any remaining failure without location
  if (currentTestName && !foundLocation) {
    errors.push({
      file: currentFile || 'unknown',
      message: currentTestName + (assertionDetails.length ? ': ' + assertionDetails.join(' ') : ''),
      severity: 'error',
    });
  }

  return errors;
};
```

Test with real bun test output samples including:
- All tests pass (empty result)
- Single test failure with stack trace
- Multiple failures across different files
- Test file that fails to parse/compile (syntax error)
- Timeout failure

**Verification:**
- [ ] Parser extracts file, line, and test name from failures
- [ ] Parser handles all-pass output (returns empty array)
- [ ] Parser handles compile errors in test files
- [ ] All tests pass: `bun test __tests__/src/harness/parsers/bun-test.test.ts`

### Task 4: Create ESLint and Generic Parsers

**Goal:** Parse ESLint JSON output and provide a generic fallback parser.
**Files:** `src/harness/parsers/eslint.ts`, `src/harness/parsers/generic.ts`, `__tests__/src/harness/parsers/eslint.test.ts`, `__tests__/src/harness/parsers/generic.test.ts`
**Pattern:** Research Section 4.3 (ESLint), Section 4.4 (Generic)

**ESLint parser:** Expects JSON output from `eslint --format json`. The default check command in `DEFAULT_HARNESS_CONFIG` should be updated to include `--format json` so the parser gets structured input: `"bunx --bun eslint . --format json"`. The parser also includes a regex fallback for default ESLint output format.

**IMPORTANT:** Update the `DEFAULT_HARNESS_CONFIG` lint command in Task 1's `types.ts` to:
```typescript
{ name: 'lint', command: 'bunx --bun eslint . --format json', enabled: false, timeout: 60, parser: 'eslint' },
```

Parse implementation:

```typescript
import type { ParsedError, OutputParser } from '../types';

// Fallback regex for default ESLint output: "/path/file.ts\n  line:col  error  message  rule-name"
const ESLINT_DEFAULT_REGEX = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/;
const ESLINT_FILE_REGEX = /^(\/\S+|\S+\.\w+)$/;

interface EslintJsonMessage {
  line: number;
  column: number;
  message: string;
  ruleId: string | null;
  severity: 1 | 2; // 1 = warning, 2 = error
}

interface EslintJsonResult {
  filePath: string;
  messages: EslintJsonMessage[];
}

export const parseEslintOutput: OutputParser = (output: string): ParsedError[] => {
  const errors: ParsedError[] = [];
  const trimmed = output.trim();

  // Try JSON parse first (eslint --format json output)
  if (trimmed.startsWith('[')) {
    try {
      const results: EslintJsonResult[] = JSON.parse(trimmed);
      for (const result of results) {
        for (const msg of result.messages) {
          errors.push({
            file: result.filePath,
            line: msg.line,
            column: msg.column,
            message: msg.message,
            code: msg.ruleId ?? undefined,
            severity: msg.severity === 2 ? 'error' : 'warning',
          });
        }
      }
      return errors;
    } catch {
      // Not valid JSON — fall through to regex
    }
  }

  // Fallback: regex parse of default eslint format
  const lines = output.split('\n');
  let currentFile = '';

  for (const line of lines) {
    const fileMatch = line.match(ESLINT_FILE_REGEX);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    const msgMatch = line.match(ESLINT_DEFAULT_REGEX);
    if (msgMatch && currentFile) {
      errors.push({
        file: currentFile,
        line: parseInt(msgMatch[1], 10),
        column: parseInt(msgMatch[2], 10),
        severity: msgMatch[3] as 'error' | 'warning',
        message: msgMatch[4].trim(),
        code: msgMatch[5],
      });
    }
  }

  return errors;
};
```

**Generic parser:** Fallback for build output and unrecognized formats:

```typescript
import type { ParsedError, OutputParser } from '../types';

// Common patterns: "file:line:col: error message" or "file:line: error message"
const GENERIC_ERROR_REGEX = /^(.+?):(\d+)(?::(\d+))?:\s*(?:error|Error|ERROR)[:\s]+(.+)$/;

// Also match "Error: message" without file location
const BARE_ERROR_REGEX = /^(?:error|Error|ERROR)[:\s]+(.+)$/;

export const parseGenericOutput: OutputParser = (output: string): ParsedError[] => {
  const errors: ParsedError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Try structured file:line:col pattern first
    const structuredMatch = line.match(GENERIC_ERROR_REGEX);
    if (structuredMatch) {
      errors.push({
        file: structuredMatch[1].trim(),
        line: parseInt(structuredMatch[2], 10),
        column: structuredMatch[3] ? parseInt(structuredMatch[3], 10) : undefined,
        message: structuredMatch[4].trim(),
        severity: 'error',
      });
      continue;
    }

    // Try bare "Error: message" pattern
    const bareMatch = line.match(BARE_ERROR_REGEX);
    if (bareMatch) {
      errors.push({
        file: 'unknown',
        message: bareMatch[1].trim(),
        severity: 'error',
      });
    }
  }

  return errors;
};
```

Test both parsers with sample output.

**Verification:**
- [ ] ESLint parser handles JSON array output
- [ ] ESLint parser gracefully handles non-JSON output (falls back to regex)
- [ ] Generic parser extracts file:line:message patterns
- [ ] Generic parser returns empty array for clean output
- [ ] All tests pass: `bun test __tests__/src/harness/parsers/`

### Task 5: Create Parser Registry

**Goal:** Export a registry mapping parser names to parser functions.
**Files:** `src/harness/parsers/index.ts`
**Pattern:** Follow `src/hooks/index.ts` registry pattern (named exports in a `Record`)

```typescript
import type { OutputParser } from '../types';
import { parseTscOutput } from './tsc';
import { parseBunTestOutput } from './bun-test';
import { parseEslintOutput } from './eslint';
import { parseGenericOutput } from './generic';

export const parserRegistry: Record<string, OutputParser> = {
  'tsc': parseTscOutput,
  'bun-test': parseBunTestOutput,
  'eslint': parseEslintOutput,
  'generic': parseGenericOutput,
};

// Re-export individual parsers for direct use
export { parseTscOutput } from './tsc';
export { parseBunTestOutput } from './bun-test';
export { parseEslintOutput } from './eslint';
export { parseGenericOutput } from './generic';
```

**Verification:**
- [ ] Registry has 4 entries: tsc, bun-test, eslint, generic
- [ ] All parsers accessible via registry lookup
- [ ] Individual parsers also available as named exports

### Task 6: Create Harness Runner

**Goal:** Build the main harness runner that reads config, executes checks via `Bun.spawn`, invokes parsers, and returns a structured `HarnessResult`.
**Files:** `src/harness/runner.ts`, `__tests__/src/harness/runner.test.ts`
**Pattern:** Use `Bun.spawn` (not `child_process`). Follow Bun API preference from CLAUDE.md.

The runner:
1. Loads harness config from `.planning/config.json` (or uses defaults)
2. Filters to enabled checks
3. Executes each check sequentially using `Bun.spawn`
4. Applies timeout per check
5. Parses output through the appropriate parser
6. Aggregates into `HarnessResult`
7. Supports `failFast` mode (stop after first failure)
8. Handles command-not-found gracefully (mark as "skipped")

```typescript
import type { HarnessConfig, HarnessResult, CheckResult, CheckConfig } from './types';
import { DEFAULT_HARNESS_CONFIG } from './types';
import { parserRegistry } from './parsers';
import { join } from 'path';

const RAW_OUTPUT_MAX_LINES = 50;

/** Load harness config from project config.json, falling back to defaults */
export async function loadHarnessConfig(projectDir: string): Promise<HarnessConfig> {
  const configPath = join(projectDir, '.planning', 'config.json');
  const configFile = Bun.file(configPath);

  if (await configFile.exists()) {
    try {
      const raw = await configFile.json();
      if (raw.harness) {
        return raw.harness as HarnessConfig;
      }
    } catch {
      // Invalid JSON — fall through to defaults
    }
  }

  return { ...DEFAULT_HARNESS_CONFIG };
}

/** Run a single check and return structured result */
async function runCheck(check: CheckConfig, projectDir: string): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    // IMPORTANT: Bun.spawn requires an array of args, not a string.
    // Use ["sh", "-c", command] to handle multi-word commands like "bun test" or "bunx --bun tsc --noEmit".
    const proc = Bun.spawn(["sh", "-c", check.command], {
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    // IMPORTANT: Bun.spawn has NO built-in timeout. Implement manually with AbortController / setTimeout.
    // Race the process against a timeout promise. Kill the process if it exceeds the limit.
    const timeoutMs = check.timeout * 1000;
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new Error('timeout'));
      }, timeoutMs);
    });

    // IMPORTANT: stdout/stderr are ReadableStreams in Bun.spawn.
    // Collect them using: await new Response(proc.stdout).text()
    // Collect stdout and stderr in parallel, racing against timeout.
    let stdout = '';
    let stderr = '';
    let exitCode = 1;

    try {
      const [stdoutText, stderrText] = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]),
        timeoutPromise,
      ]);
      stdout = stdoutText;
      stderr = stderrText;
      exitCode = await proc.exited;  // .exited is a Promise<number> in Bun
    } catch (e) {
      if (timedOut) {
        return {
          name: check.name,
          status: 'timeout',
          exitCode: -1,
          errors: [],
          warnings: [],
          rawOutput: `Command timed out after ${check.timeout}s`,
          duration: Date.now() - startTime,
        };
      }
      throw e;
    }

    // Combine stdout + stderr for parsing (stderr often has the actual error output)
    const combinedOutput = stdout + (stderr ? '\n' + stderr : '');

    // Truncate raw output to last N lines
    const outputLines = combinedOutput.split('\n');
    const truncatedOutput = outputLines.slice(-RAW_OUTPUT_MAX_LINES).join('\n');

    // Parse through the appropriate parser
    const parser = parserRegistry[check.parser] ?? parserRegistry['generic'];
    const allParsed = parser(combinedOutput);
    const errors = allParsed.filter(e => e.severity === 'error');
    const warnings = allParsed.filter(e => e.severity === 'warning');

    return {
      name: check.name,
      status: exitCode === 0 ? 'passed' : 'failed',
      exitCode,
      errors,
      warnings,
      rawOutput: truncatedOutput,
      duration: Date.now() - startTime,
    };
  } catch (e) {
    // Command not found or spawn failure — mark as skipped
    return {
      name: check.name,
      status: 'skipped',
      exitCode: -1,
      errors: [],
      warnings: [],
      rawOutput: `Failed to execute: ${(e as Error).message}`,
      duration: Date.now() - startTime,
    };
  }
}

/** Run all harness checks and return aggregate result */
export async function runHarness(config: HarnessConfig, projectDir: string): Promise<HarnessResult> {
  const startTime = Date.now();
  const enabledChecks = config.checks.filter(c => c.enabled);
  const results: CheckResult[] = [];

  for (const check of enabledChecks) {
    const result = await runCheck(check, projectDir);
    results.push(result);

    // failFast: stop after first failure
    if (config.failFast && result.status === 'failed') {
      break;
    }
  }

  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const overallStatus = results.every(r => r.status === 'passed' || r.status === 'skipped') ? 'passed' : 'failed';

  return {
    status: overallStatus,
    checks: results,
    totalErrors,
    totalWarnings,
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}
```

**CLI mode:** When run directly (`bun run src/harness/runner.ts`), read config and project dir from args, run harness, print JSON to stdout:

```typescript
// CLI entry point (only runs when executed directly)
if (import.meta.main) {
  const projectDir = process.argv.find(a => a.startsWith('--project-dir='))?.split('=')[1] ?? '.';
  const config = await loadHarnessConfig(projectDir);
  const result = await runHarness(config, projectDir);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'passed' ? 0 : 1);
}
```

Test the runner with:
- Mock commands that succeed (echo/true)
- Mock commands that fail with known output
- Timeout handling
- Missing command handling (command not found = skipped)
- Config loading from file vs defaults

**Verification:**
- [ ] Runner loads config from `.planning/config.json` or uses defaults
- [ ] Runner executes checks via `Bun.spawn` with timeout
- [ ] Runner parses output through correct parser per check
- [ ] Runner returns structured `HarnessResult` with correct aggregation
- [ ] CLI mode prints JSON to stdout and exits with correct code
- [ ] All tests pass: `bun test __tests__/src/harness/runner.test.ts`

### Task 7: Create Public API and Root Exports

**Goal:** Export the harness public API from `src/harness/index.ts` and add harness exports to the root `index.ts`.
**Files:** `src/harness/index.ts`, `index.ts` (update)
**Pattern:** Follow `src/hooks/index.ts` (exports types + functions) and root `index.ts` (hook export block)

`src/harness/index.ts`:

```typescript
// Public API
export { runHarness, loadHarnessConfig } from './runner';
export { parserRegistry } from './parsers';

// Types
export type {
  HarnessConfig,
  CheckConfig,
  ParsedError,
  CheckResult,
  HarnessResult,
  OutputParser,
} from './types';

export { DEFAULT_HARNESS_CONFIG } from './types';
```

Add to root `index.ts` (after the hook exports block):

```typescript
// Harness API and types (for build scripts and consumers)
export { runHarness, loadHarnessConfig, parserRegistry, DEFAULT_HARNESS_CONFIG } from './src/harness/index';
export type { HarnessConfig, CheckConfig, ParsedError, CheckResult, HarnessResult, OutputParser } from './src/harness/index';
```

**Verification:**
- [ ] `import { runHarness, HarnessResult } from './src/harness'` works
- [ ] Root `index.ts` exports all harness symbols
- [ ] `bunx --bun tsc --noEmit` passes on updated files

### Task 8: Run Full Test Suite and Validate

**Goal:** Confirm all new tests pass and no regressions in existing tests (ignoring pre-existing doctor/config failures).
**Files:** No new files. Run `bun test`.

Run the full test suite:

```bash
bun test
```

Expected: All new harness tests pass. Pre-existing 6 doctor/config failures remain unchanged. No new failures.

Also validate typecheck:

```bash
bunx --bun tsc --noEmit
```

Also validate the CLI entry point works:

```bash
bun run src/harness/runner.ts --project-dir=.
```

Should output JSON `HarnessResult` to stdout.

**Verification:**
- [ ] All `__tests__/src/harness/**/*.test.ts` tests pass
- [ ] No new test failures beyond pre-existing 6
- [ ] TypeScript compilation clean (`tsc --noEmit`)
- [ ] CLI entry point produces valid JSON output

## Exit Criteria

- [ ] `src/harness/` directory exists with types.ts, runner.ts, parsers/, index.ts
- [ ] 4 parsers implemented (tsc, bun-test, eslint, generic) with tests
- [ ] Runner orchestrates check execution and returns structured HarnessResult
- [ ] Config loading supports both explicit config and auto-detection defaults
- [ ] CLI mode works: `bun run src/harness/runner.ts --project-dir=.` outputs JSON
- [ ] All new tests pass
- [ ] Root `index.ts` exports harness API
- [ ] No regressions in existing tests

## Dependencies

- None (this is Wave 1, no prior plans needed)
- Requires: `bun` runtime, `tsc` available, existing project structure
