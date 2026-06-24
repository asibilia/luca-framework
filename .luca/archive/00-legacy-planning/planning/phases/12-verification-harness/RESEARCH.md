# Phase 12: Verification Harness - Research

## 1. Current Verification Landscape

### 1.1 How Verification Works Today

The Luca workflow currently has **three layers** of quality checking, but they are disconnected and serve different purposes:

| Layer | Mechanism | When it Runs | What it Checks | Structured Output? |
|-------|-----------|-------------|----------------|-------------------|
| **Pre-commit hook** | `pre-commit-gate.sh` (Phase 11) | On every `git commit`/`bun run commit` | Tests (`bun test`) + TypeScript (`tsc --noEmit`) | No -- raw stderr/stdout |
| **Agent verification** | `lu-verifier` agent (spawned by `lu-execute-phase`) | After all waves complete (Step 7) | Goal-backward analysis: artifacts exist, are substantive, are wired | Yes -- VERIFICATION.md with YAML frontmatter |
| **Code review** | 5 reviewer agents (Step 7.5) | After verification passes | DX, DRY, architecture, Tailwind, security | Yes -- YAML issues list |

**Critical gap:** There is no automated quality pipeline that runs **all four standard checks** (test, lint, typecheck, build) as a single orchestrated step between wave execution and agent verification. The pre-commit hook only runs tests + typecheck (no lint, no build), and only fires on individual commits, not at phase boundaries.

### 1.2 lu-execute-phase Flow (Current)

From `src/skills/general/lu-execute-phase.skill.ts`, the execution flow is:

```
0.  Resolve model profile
0.5 Verify GitHub tracking (gate)
1.  Validate phase exists
2.  Discover plans
3.  Group by wave
4.  Execute waves (spawn lu-executor per plan, parallel per wave)
5.  Aggregate results
6.  Commit orchestrator corrections
7.  Verify phase goal (spawn lu-verifier)          <-- AGENT verification
7.5 Code quality review (spawn 5 reviewer agents)  <-- CODE REVIEW
7.6 Handle code review results
8.  Update roadmap and state
9.  Update requirements
10. Commit phase completion
11. UAT (manual user testing)
12. Handle UAT results
```

**The harness should insert between steps 6 and 7** -- after wave execution and orchestrator corrections, but before the lu-verifier agent runs goal-backward analysis. This way:
- The harness catches mechanical failures (tests fail, types broken, build broken)
- The lu-verifier handles semantic verification (goal achieved, artifacts wired correctly)
- The failure-to-fix loop can repair mechanical issues before the expensive agent verification runs

### 1.3 lu-verifier Agent Analysis

From `src/agents/general/lu-verifier.agent.ts`, the verifier:
- Performs goal-backward verification (truths, artifacts, key links)
- Uses `grep`, `find`, `wc -l` to check files programmatically
- Produces `VERIFICATION.md` with YAML frontmatter containing structured gap data
- Returns status: `passed | gaps_found | human_needed`
- Does NOT run tests, lint, typecheck, or build -- it verifies structural/semantic concerns

**Integration point for harness:** The harness output (structured check results) should be provided to the verifier as additional context. If the harness found all checks passing, the verifier knows the codebase is mechanically sound and can focus on semantic verification. If the harness found failures (especially after fix attempts failed), the verifier should report those as gaps.

### 1.4 Pre-commit Gate Analysis

From `src/hooks/scripts/pre-commit-gate.sh`:
- Intercepts all Bash tool calls, fast-exits for non-commit commands
- For commit commands, runs: `bun test` + `bunx --bun tsc --noEmit`
- On failure: outputs JSON `permissionDecision: deny` with error details
- Truncates test output to last 30 lines, tsc output to first 20 lines
- Does NOT run lint or build checks
- Does NOT produce structured/parseable output (just raw error text)

**Relationship to harness:** The pre-commit gate is the **lightweight check layer** (VERI-06). The full harness runs at phase boundaries. They share the same underlying check commands but differ in scope, timing, and output format.

### 1.5 Existing Skills: test-run and code-typecheck

- `test-run` skill: Thin wrapper around `bun test` with filter support. No structured output parsing.
- `code-typecheck` skill: Thin wrapper around `tsc --noEmit`. Mentions parsing errors and grouping by file, but no structured implementation.

Neither skill provides the orchestration, structured output, or failure-to-fix loop that the harness needs.

---

## 2. Implementation Approach

### 2.1 Where Should the Harness Code Live?

**Recommended: `src/harness/`** as a new top-level directory under `src/`, parallel to `src/hooks/`, `src/agents/`, `src/skills/`, `src/rules/`.

Rationale:
- The harness is neither a hook (hooks are deterministic, fast, fire-and-forget) nor a skill (skills are user-invoked interactive workflows) nor an agent (agents are AI sub-agents with reasoning).
- It is a **programmatic pipeline** -- a TypeScript module that orchestrates shell commands, parses their output, and returns structured results.
- It parallels the `src/hooks/` directory: hooks have a registry + shell scripts; the harness has a runner + parsers + config.

```
src/harness/
  index.ts          # Public API: runHarness(), HarnessResult type
  runner.ts         # Orchestrates check execution
  parsers/
    bun-test.ts     # Parse bun test output into structured errors
    tsc.ts          # Parse tsc output into structured errors
    eslint.ts       # Parse eslint output (if configured)
    build.ts        # Parse build output
    index.ts        # Parser registry
  types.ts          # HarnessConfig, CheckResult, HarnessResult, ParsedError
```

### 2.2 What is the Interface?

The harness is a **TypeScript module** with a programmatic API, not a skill or shell script.

```typescript
// src/harness/index.ts

export interface HarnessConfig {
  checks: CheckConfig[];
  maxFixIterations: number;
  failFast: boolean;
  projectDir: string;
}

export interface CheckConfig {
  name: string;           // e.g., "test", "typecheck", "lint", "build"
  command: string;         // e.g., "bun test", "bunx --bun tsc --noEmit"
  enabled: boolean;
  timeout: number;         // seconds
  parser: string;          // parser key from parser registry
}

export interface ParsedError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;           // e.g., TS2345, ESLint rule name
  severity: 'error' | 'warning';
}

export interface CheckResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'timeout';
  exitCode: number;
  errors: ParsedError[];
  rawOutput: string;       // truncated
  duration: number;        // milliseconds
}

export interface HarnessResult {
  status: 'passed' | 'failed';
  checks: CheckResult[];
  totalErrors: number;
  totalWarnings: number;
  duration: number;
  timestamp: string;
}

export async function runHarness(config: HarnessConfig): Promise<HarnessResult>;
```

### 2.3 How Does it Integrate into lu-execute-phase?

The harness is invoked **as inline instructions in the lu-execute-phase skill definition**. Since lu-execute-phase is a skill (prompt text that guides the orchestrator agent), the harness integration is a new step in the process section.

**New Step 6.5: Run Verification Harness** (inserted between steps 6 and 7):

```markdown
### 6.5. Run Verification Harness

**Run automated quality checks before agent verification.**

```bash
# Read harness config from project config
HARNESS_CONFIG=$(cat .planning/config.json 2>/dev/null)
```

Execute the harness:

```bash
# Run all configured checks
bun run ./src/harness/runner.ts --config .planning/config.json --project-dir .
```

**Parse harness output** (JSON written to stdout):

- If `status: "passed"` -- continue to Step 7 (lu-verifier)
- If `status: "failed"` -- enter failure-to-fix loop (Step 6.6)

### 6.6. Failure-to-Fix Loop

**When harness checks fail, attempt automated repair.**

For each iteration (max from config, default 3):

1. Parse structured errors from harness output
2. Spawn lu-executor sub-agent with fix instructions:

```python
Task(
  prompt="""
<fix_context>
**Harness failures (iteration {N}/{max}):**
{structured_errors}

**Instructions:**
- Fix ONLY the errors listed above
- Do NOT refactor or improve unrelated code
- Commit fixes atomically
</fix_context>

Fix these harness failures.
""",
  subagent_type="lu-executor",
  description="Fix harness failures (iteration {N})"
)
```

3. Re-run harness
4. If passed: continue to Step 7
5. If still failing AND iterations exhausted:
   - Log remaining failures
   - Continue to Step 7 with harness failures as context for lu-verifier
   - lu-verifier will include them as gaps
```

### 2.4 Build Pipeline Integration

The harness source files (`src/harness/`) do NOT need to be compiled by the build pipeline. They are:
- Runtime TypeScript modules executed by `bun run`
- Not agents, skills, or rules (which are compiled to markdown)
- Consumed by the orchestrator skill instructions as bash commands

However, the harness should be **exported from `index.ts`** for downstream consumers (projects using `luca-framework` package) and **included in templates** so that `luca init` projects get the harness.

### 2.5 Structured Output Format

The harness runner writes JSON to stdout, which the orchestrator parses. Example:

```json
{
  "status": "failed",
  "checks": [
    {
      "name": "test",
      "status": "passed",
      "exitCode": 0,
      "errors": [],
      "duration": 2340
    },
    {
      "name": "typecheck",
      "status": "failed",
      "exitCode": 1,
      "errors": [
        {
          "file": "src/harness/runner.ts",
          "line": 42,
          "column": 5,
          "message": "Property 'foo' does not exist on type 'Bar'",
          "code": "TS2339",
          "severity": "error"
        }
      ],
      "duration": 4120
    }
  ],
  "totalErrors": 1,
  "totalWarnings": 0,
  "duration": 6460,
  "timestamp": "2026-02-10T14:30:00Z"
}
```

This structured output:
- Feeds the failure-to-fix loop (errors are precise enough for an executor to fix)
- Feeds lu-verifier analysis (harness status included in verification context)
- Can be summarized in VERIFICATION.md

---

## 3. Config Schema Design

### 3.1 Additions to `.planning/config.json`

The existing config already has a `hooks` section (from Phase 11). The harness config should be a new top-level `harness` section:

```json
{
  "harness": {
    "enabled": true,
    "maxFixIterations": 3,
    "failFast": false,
    "checks": [
      {
        "name": "test",
        "command": "bun test",
        "enabled": true,
        "timeout": 120,
        "parser": "bun-test"
      },
      {
        "name": "typecheck",
        "command": "bunx --bun tsc --noEmit",
        "enabled": true,
        "timeout": 60,
        "parser": "tsc"
      },
      {
        "name": "lint",
        "command": "bunx --bun eslint .",
        "enabled": false,
        "timeout": 60,
        "parser": "eslint"
      },
      {
        "name": "build",
        "command": "bun run build:all",
        "enabled": true,
        "timeout": 120,
        "parser": "generic"
      }
    ]
  }
}
```

### 3.2 Config Defaults

When `harness` section is missing from config, use sensible defaults:

| Check | Default Command | Default Enabled | Default Timeout |
|-------|----------------|-----------------|-----------------|
| test | `bun test` | true | 120s |
| typecheck | `bunx --bun tsc --noEmit` | true (if `tsconfig.json` exists) | 60s |
| lint | `bunx --bun eslint .` | false (unless `.eslintrc*` exists) | 60s |
| build | (none) | false | 120s |

The harness auto-detects available checks based on project files:
- `tsconfig.json` present -> enable typecheck
- `.eslintrc*` or `eslint.config.*` present -> enable lint
- `package.json` has `build` script -> enable build

### 3.3 Template Config

The `packages/luca-framework/templates/framework/templates/config.json` template should include the `harness` section with defaults matching the Bun-first convention (CLAUDE.md preference).

---

## 4. Parser Design

### 4.1 bun-test Parser

Bun test output follows a recognizable format:

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
 1 expect() calls
```

Parser strategy:
- Detect `✗` or `✘` lines for failed test names
- Extract file:line from stack traces
- Extract expected/received from assertion messages
- Return `ParsedError[]` with file, line, message

### 4.2 tsc Parser

TypeScript compiler output is highly structured:

```
src/foo.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/bar.ts(10,1): error TS2304: Cannot find name 'Foo'.
```

Parser strategy:
- Regex: `^(.+)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$`
- Extract file, line, column, severity, code, message
- Most reliable parser due to consistent output format

### 4.3 ESLint Parser

ESLint can output JSON directly with `--format json`:

```bash
bunx --bun eslint . --format json
```

Parser strategy:
- Use `--format json` flag in the command (add automatically if not present)
- Parse JSON output directly into `ParsedError[]`
- Fallback to regex parsing of default format if JSON flag fails

### 4.4 Generic Parser (Build / Fallback)

For build output and unrecognized formats:

Parser strategy:
- Look for common error patterns: `Error:`, `error:`, `ERROR`, file:line:col patterns
- Extract what it can, fall back to including raw output as a single error
- Always capture exit code as the primary signal

### 4.5 Parser Registry

```typescript
// src/harness/parsers/index.ts
export const parserRegistry: Record<string, (output: string) => ParsedError[]> = {
  'bun-test': parseBunTestOutput,
  'tsc': parseTscOutput,
  'eslint': parseEslintOutput,
  'generic': parseGenericOutput,
};
```

---

## 5. Integration Points

### 5.1 Integration with lu-execute-phase

**File to modify:** `src/skills/general/lu-execute-phase.skill.ts`

Changes:
1. Add Step 6.5 (Run Verification Harness) after Step 6
2. Add Step 6.6 (Failure-to-Fix Loop) as sub-step
3. Modify Step 7 (lu-verifier) prompt to include harness results as context
4. Add harness status to phase completion display

### 5.2 Integration with lu-verifier

**File to modify:** `src/agents/general/lu-verifier.agent.ts`

Changes:
1. Accept optional `harness_results` in verification context
2. If harness passed: note "All automated checks passed" in report
3. If harness failed after fix attempts: include remaining errors as mechanical gaps
4. Harness results appear in VERIFICATION.md under a new "Automated Checks" section

### 5.3 Integration with Hooks (VERI-06)

**No changes to existing hooks.** The relationship is:

| Timing | Mechanism | Checks | Purpose |
|--------|-----------|--------|---------|
| On every commit | `pre-commit-gate.sh` hook | test + typecheck | Catch issues early, per-commit |
| On every file edit | `post-edit-typecheck.sh` hook | typecheck (single file) | Instant feedback |
| At phase boundaries | Verification harness | test + typecheck + lint + build | Full quality signal |

The hook layer (Phase 11) provides lightweight, frequent checks. The harness layer (Phase 12) provides comprehensive, phase-boundary checks. They are complementary, not competing.

### 5.4 Integration with Config

**File to modify:** `.planning/config.json` (and template)

Add `harness` section as documented in Section 3.1. The harness runner reads this at runtime.

### 5.5 Integration with Build Pipeline

**File to modify:** `scripts/build-all.ts` (if harness needs build-time artifacts -- likely not)

The harness is a runtime module, not a compiled artifact. The build pipeline does not need to change. However:
- The harness module should be exported from `index.ts` for downstream consumers
- Template distribution should include a harness runner script or reference

### 5.6 Integration with Templates

**Files to modify:** `packages/luca-framework/templates/`

Add harness-related templates:
- Updated `config.json` template with `harness` section
- Potentially a thin wrapper script that downstream projects can use

---

## 6. Risk Analysis

### Risk 1: Parsing Diverse Toolchain Output

**Severity:** HIGH
**Impact:** If parsers fail to extract structured errors, the failure-to-fix loop gets garbage input and wastes iterations.

**Mitigation:**
- Start with tsc parser (most structured, most reliable)
- bun test parser uses known patterns from Bun's test runner
- ESLint uses `--format json` for guaranteed structured output
- Generic parser is the fallback -- always captures exit code + raw output
- Each parser should be tested with real output samples
- Parsers should degrade gracefully: if parsing fails, include raw output as a single error block

### Risk 2: Infinite Fix Cycles

**Severity:** HIGH
**Impact:** If the executor introduces new errors while fixing old ones, the loop never converges.

**Mitigation:**
- Hard cap on iterations (default 3, configurable via `maxFixIterations`)
- Track error count per iteration -- if errors increase, abort early
- After max iterations, continue to lu-verifier with remaining failures (don't block the entire workflow)
- Log each iteration's error delta for debugging
- Consider: if the same errors persist across 2 iterations, abort (the executor can't fix them)

### Risk 3: Execution Time

**Severity:** MEDIUM
**Impact:** Running 4 checks + potentially 3 fix iterations could take 5-15 minutes.

**Mitigation:**
- Checks run sequentially (not parallel) by default for clear error attribution
- `failFast` option to stop after first failure (saves time when multiple things are broken)
- Timeouts per check prevent hanging
- Phase boundary timing is already measured -- users expect a verification step here
- The failure-to-fix loop only runs when checks fail (happy path is fast: just run 4 checks)

### Risk 4: Harness Config Drift

**Severity:** LOW
**Impact:** Config specifies commands that don't exist in the project (e.g., eslint not installed).

**Mitigation:**
- Auto-detection of available tools (check for config files before enabling)
- Graceful handling of command-not-found (report as "skipped" not "failed")
- Template defaults are conservative (only test + typecheck enabled by default)

### Risk 5: Error Attribution in Fix Loop

**Severity:** MEDIUM
**Impact:** When feeding errors to the executor, ambiguous errors (e.g., "Cannot find module") may lead to incorrect fixes.

**Mitigation:**
- Structured errors include file, line, and exact error message
- The executor prompt emphasizes "fix ONLY the listed errors"
- Each iteration re-runs the full harness (not just the failed check) to catch regressions
- The executor is the existing lu-executor agent -- it already handles code modification well

---

## 7. Recommended Plan Organization

### Plan Structure: 2 Plans, 2 Waves

**Plan 01 (Wave 1): Core Harness Module + Parsers**

Builds the standalone harness infrastructure that can run independently.

Tasks:
1. Create `src/harness/types.ts` -- HarnessConfig, CheckConfig, CheckResult, HarnessResult, ParsedError types
2. Create `src/harness/parsers/tsc.ts` -- TypeScript compiler output parser with tests
3. Create `src/harness/parsers/bun-test.ts` -- Bun test output parser with tests
4. Create `src/harness/parsers/eslint.ts` -- ESLint JSON output parser with tests
5. Create `src/harness/parsers/generic.ts` -- Generic/fallback parser with tests
6. Create `src/harness/parsers/index.ts` -- Parser registry
7. Create `src/harness/runner.ts` -- Harness runner: reads config, executes checks, invokes parsers, returns structured results
8. Create `src/harness/index.ts` -- Public API export (runHarness, types)
9. Add harness exports to root `index.ts`
10. Write integration test: harness runner with mock commands

Verification:
- All parser tests pass with real output samples
- Runner executes checks and returns structured HarnessResult
- `bun run src/harness/runner.ts` works as standalone CLI

**Plan 02 (Wave 2): Integration + Config + Templates**

Wires the harness into the workflow. Depends on Plan 01.

Tasks:
1. Add `harness` section to `.planning/config.json` (this project's config)
2. Add `harness` section to `packages/luca-framework/templates/framework/templates/config.json` (template)
3. Update `src/skills/general/lu-execute-phase.skill.ts` -- add Step 6.5 (harness) and Step 6.6 (failure-to-fix loop)
4. Update `src/agents/general/lu-verifier.agent.ts` -- accept harness results in context, add "Automated Checks" section to VERIFICATION.md output
5. Create rule `src/rules/general/harness-verification.rule.ts` -- documents when harness runs vs hooks, registered in ruleRegistry
6. Run `bun run build:all` to compile updated skill/agent/rule definitions
7. Write integration test: config loading and default detection

Verification:
- lu-execute-phase skill text includes harness steps
- lu-verifier agent text accepts harness context
- Config template includes harness section
- Build output includes updated compiled artifacts
- Rule registered and compiles to both formats

### Why 2 Plans, Not 1?

- **Separation of concerns:** Plan 01 is pure infrastructure (types, parsers, runner). Plan 02 is integration (skill updates, config, templates).
- **Testability:** Plan 01 can be fully verified independently before integration begins.
- **Risk reduction:** If parser design needs iteration, Plan 02 doesn't need to wait.
- **Context budget:** Each plan is ~8-10 tasks, well within the 50% context target.

### Why 2 Waves, Not 1?

Plan 02 depends on Plan 01 (the harness module must exist before skills can reference it). Sequential waves enforce this dependency.

---

## 8. File Changes Summary

| Action | File | Plan | Description |
|--------|------|------|-------------|
| CREATE | `src/harness/types.ts` | 01 | Type definitions for harness system |
| CREATE | `src/harness/parsers/tsc.ts` | 01 | TypeScript compiler output parser |
| CREATE | `src/harness/parsers/bun-test.ts` | 01 | Bun test output parser |
| CREATE | `src/harness/parsers/eslint.ts` | 01 | ESLint JSON output parser |
| CREATE | `src/harness/parsers/generic.ts` | 01 | Generic/fallback output parser |
| CREATE | `src/harness/parsers/index.ts` | 01 | Parser registry |
| CREATE | `src/harness/runner.ts` | 01 | Harness orchestrator/runner |
| CREATE | `src/harness/index.ts` | 01 | Public API exports |
| UPDATE | `index.ts` | 01 | Add harness exports |
| CREATE | `__tests__/src/harness/parsers/tsc.test.ts` | 01 | Parser tests |
| CREATE | `__tests__/src/harness/parsers/bun-test.test.ts` | 01 | Parser tests |
| CREATE | `__tests__/src/harness/parsers/eslint.test.ts` | 01 | Parser tests |
| CREATE | `__tests__/src/harness/parsers/generic.test.ts` | 01 | Parser tests |
| CREATE | `__tests__/src/harness/runner.test.ts` | 01 | Runner integration test |
| UPDATE | `.planning/config.json` | 02 | Add harness section |
| UPDATE | `packages/luca-framework/templates/framework/templates/config.json` | 02 | Add harness section to template |
| UPDATE | `src/skills/general/lu-execute-phase.skill.ts` | 02 | Add Steps 6.5 and 6.6 |
| UPDATE | `src/agents/general/lu-verifier.agent.ts` | 02 | Accept harness results context |
| CREATE | `src/rules/general/harness-verification.rule.ts` | 02 | Harness vs hooks boundary rule |
| UPDATE | `src/rules/index.ts` | 02 | Register new rule |
| CREATE | `__tests__/src/harness/config.test.ts` | 02 | Config loading tests |

---

## 9. Design Decisions

### Decision 1: TypeScript Module vs Shell Script

**Choice:** TypeScript module (run via `bun run`).
**Rationale:** Shell scripts are limited for structured JSON output, error parsing, and config handling. TypeScript gives type safety, JSON handling, and can import project types. Aligns with the Bun-first convention (CLAUDE.md). The pre-commit hook is shell because hooks MUST be shell scripts (Claude Code/Cursor requirement). The harness has no such constraint.

### Decision 2: Sequential vs Parallel Check Execution

**Choice:** Sequential by default, with configuration option.
**Rationale:** Sequential execution provides clear error attribution and avoids resource contention (bun test + tsc both use significant CPU). `failFast` option provides an optimization when users want speed over completeness.

### Decision 3: Harness as Module vs CLI

**Choice:** Both -- module API for programmatic use, CLI wrapper for orchestrator invocation.
**Rationale:** The lu-execute-phase orchestrator invokes it via `bun run ./src/harness/runner.ts` (CLI). Future integrations (CI/CD, editor extensions) can import `runHarness()` directly.

### Decision 4: Fix Loop Agent

**Choice:** Reuse `lu-executor` for fix iterations.
**Rationale:** The executor already handles code modification, deviation rules, and atomic commits. No need for a specialized "fixer" agent. The prompt context is narrower (just the structured errors), keeping the executor focused.

### Decision 5: Harness Output Location

**Choice:** Stdout (JSON) for orchestrator consumption, no file written by default.
**Rationale:** The orchestrator parses stdout and includes results in the lu-verifier context. The lu-verifier includes harness status in VERIFICATION.md. No need for a separate harness output file. If file persistence is needed later, add a `--output` flag.

### Decision 6: No New Agent or Skill for Harness

**Choice:** The harness is a module, not an agent or skill.
**Rationale:** It does not need LLM reasoning (agents) or user invocation routing (skills). It is a deterministic pipeline: run commands, parse output, return structured results. Following the hook/skill boundary principle from Phase 11: deterministic operations should not be agents.
