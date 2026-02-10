---
id: 12-02
title: Integration
phase: 12-verification-harness
wave: 2
delivers: VERI-02, VERI-04, VERI-06
depends_on: 12-01
tasks: 7
---

# Plan 12-02: Integration

## Objective

Wire the harness module (built in Plan 12-01) into the Luca workflow. Update `lu-execute-phase` to call the harness after wave execution, implement the failure-to-fix loop, update `lu-verifier` to consume structured harness output, add the harness config to project and template configs, create a boundary rule documenting when harness runs vs hooks, and validate the full integration with tests.

## Context

- **Harness module:** `src/harness/` (built by Plan 12-01 -- types, parsers, runner, index)
- **lu-execute-phase skill:** `src/skills/general/lu-execute-phase.skill.ts` (insert Step 6.5 and 6.6 between steps 6 and 7)
- **lu-verifier agent:** `src/agents/general/lu-verifier.agent.ts` (add harness results to verification context)
- **Rule pattern:** `src/rules/general/hook-skill-boundary.rule.ts` (follow for new harness-verification rule)
- **Rule registry:** `src/rules/index.ts` (register new rule)
- **Project config:** `.planning/config.json` (add `harness` section)
- **Template config:** `packages/luca-framework/templates/framework/templates/config.json` (add `harness` section)
- **Hook test pattern:** `__tests__/src/hooks/hook-registry.test.ts` (follow test style)
- **Research:** `.planning/phases/12-verification-harness/RESEARCH.md` (Section 2.3: lu-execute-phase integration, Section 5: Integration Points)
- **Build pipeline:** Run `bun run build:all` after updating skill/agent/rule sources to recompile output

## Tasks

### Task 1: Update lu-execute-phase Skill with Harness Steps

**Goal:** Add Step 6.5 (Run Verification Harness) and Step 6.6 (Failure-to-Fix Loop) to the `lu-execute-phase` skill definition, inserting between the existing Step 6 (Commit Orchestrator Corrections) and Step 7 (Verify Phase Goal).
**Files:** `src/skills/general/lu-execute-phase.skill.ts`
**Pattern:** Follow existing step structure in the skill (numbered steps with bash/python code blocks)

**Precise anchoring:** Insert the new content after the `### 6. Commit Orchestrator Corrections` section (around line 346) and before `### 7. Verify Phase Goal` (around line 359). The exact anchor text to insert before is: `### 7. Verify Phase Goal`.

Insert the following immediately before `### 7. Verify Phase Goal`:

**Step 6.5 -- Run Verification Harness:**

```markdown
### 6.5. Run Verification Harness

**Run automated quality checks before agent verification.**

```bash
# Run harness (outputs JSON to stdout)
HARNESS_OUTPUT=$(bun run ./src/harness/runner.ts --project-dir=.)
HARNESS_EXIT=$?
echo "$HARNESS_OUTPUT"
```

Parse the JSON output:

- If `status: "passed"` -- display results and continue to Step 7
- If `status: "failed"` -- enter failure-to-fix loop (Step 6.6)

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► VERIFICATION HARNESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Check     | Status | Errors | Duration |
|-----------|--------|--------|----------|
| {name}    | {pass/fail} | {N} | {Ns}  |

Overall: {PASSED/FAILED}
```
```

**Step 6.6 -- Failure-to-Fix Loop (VERI-04):**

```markdown
### 6.6. Failure-to-Fix Loop

**When harness checks fail, attempt automated repair.**

Read maxFixIterations from harness config (default 3).

For each iteration (up to max):

1. Extract structured errors from harness JSON output
2. Spawn lu-executor sub-agent with fix instructions:

```python
Task(
  prompt="""
<fix_context>
**Harness failures (iteration {N}/{max}):**
{structured_errors_json}

**Instructions:**
- Fix ONLY the errors listed above
- Do NOT refactor or improve unrelated code
- Do NOT modify test expectations to make tests pass
- Commit fixes atomically
</fix_context>

Fix these harness failures.
""",
  subagent_type="lu-executor",
  model="{executor_model}",
  description="Fix harness failures (iteration {N})"
)
```

3. After executor returns, re-run harness:

```bash
HARNESS_OUTPUT=$(bun run ./src/harness/runner.ts --project-dir=.)
```

4. If passed: display success, continue to Step 7
5. If still failing:
   - Compare error count to previous iteration
   - If errors increased or unchanged for 2 consecutive iterations: abort loop early
   - If max iterations exhausted: log remaining failures, continue to Step 7 with harness failures as context for lu-verifier

**Pass harness results to Step 7 verifier context** regardless of outcome. Include:
- `harness_status`: passed | failed_after_fixes
- `harness_checks`: array of check results
- `remaining_errors`: structured errors (if any)
```

Also update the Step 7 (lu-verifier) prompt to include harness results. Add to the `<verification_context>` block:

```markdown
**Harness Results:**
{harness_status}
{harness_checks_summary}
{remaining_errors_if_any}
```

And add a note to the verifier instructions:

```markdown
If harness passed: Note "All automated checks passed" in your report under an "Automated Checks" section.
If harness failed after fix attempts: Include remaining mechanical errors as gaps in your verification. These are mechanical failures (test/type/lint/build) that the automated fix loop could not resolve.
```

**Verification:**
- [ ] Step 6.5 appears in skill between Step 6 and Step 7
- [ ] Step 6.6 failure-to-fix loop has max iteration guard
- [ ] Step 7 verifier prompt includes harness results context
- [ ] Skill compiles without errors

### Task 2: Update lu-verifier Agent to Consume Harness Output

**Goal:** Add an "Automated Checks" section to the lu-verifier agent definition so it incorporates harness results into its verification report.
**Files:** `src/agents/general/lu-verifier.agent.ts`
**Pattern:** Follow existing verification_process structure in the agent

Add the following to the `<verification_process>` section, as a new step between "Step 6: Check Requirements Coverage" and "Step 7: Scan for Anti-Patterns":

> **Note:** This "Step 6.5" is within the lu-verifier agent (distinct from lu-execute-phase's Step 6.5). The naming collision is intentional — both refer to harness-related work but in different components.

```markdown
## Step 6.5: Incorporate Harness Results

If harness results are provided in the verification context:

**If harness status = "passed":**
- Add to report: "All automated checks passed (test, typecheck, lint, build)"
- This is a positive signal -- the codebase is mechanically sound
- Focus your verification on semantic concerns (goal achievement, wiring, stubs)

**If harness status = "failed_after_fixes":**
- The automated fix loop attempted to repair failures but some remain
- Include each remaining error as a mechanical gap:
  - Map harness errors to the truth/artifact they affect
  - Severity: errors are blockers, warnings are informational
- These mechanical failures should be reported in the gaps section

**If no harness results provided:**
- Skip this step (backward-compatible with pre-harness workflow)
```

Also add "Automated Checks" to the VERIFICATION.md template in the `<output>` section, between "Requirements Coverage" and "Anti-Patterns Found":

```markdown
### Automated Checks (Harness)

| Check     | Status | Errors | Duration |
|-----------|--------|--------|----------|
| {name}    | {status} | {N} | {duration} |

**Overall:** {passed/failed}
{If failed: list remaining errors with file, line, message}
```

**Verification:**
- [ ] Agent definition includes harness results handling
- [ ] VERIFICATION.md template includes "Automated Checks" section
- [ ] Agent compiles without errors
- [ ] Backward-compatible: no harness results = step is skipped

### Task 3: Add Harness Config to Project and Template Configs

**Goal:** Add the `harness` section to both the live project config and the template config for `luca init`.
**Files:** `.planning/config.json`, `packages/luca-framework/templates/framework/templates/config.json`
**Pattern:** Follow existing `hooks` section structure in both files

Add to `.planning/config.json` (this project's live config) -- this project has test, typecheck, and build enabled; lint disabled (no eslint configured):

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
        "command": "bunx --bun eslint . --format json",
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

Add the same `harness` section to the template config (`packages/luca-framework/templates/framework/templates/config.json`), matching the template's existing conventions. The template uses conservative defaults:

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
        "command": "bunx --bun eslint . --format json",
        "enabled": false,
        "timeout": 60,
        "parser": "eslint"
      },
      {
        "name": "build",
        "command": "bun run build:all",
        "enabled": false,
        "timeout": 120,
        "parser": "generic"
      }
    ]
  }
}
```

Note: Template has `build.enabled: false` (downstream projects may not have a build script). The live project config has `build.enabled: true` (this project does have `build:all`).

**Verification:**
- [ ] `.planning/config.json` has valid `harness` section with project-appropriate settings
- [ ] Template `config.json` has valid `harness` section with conservative defaults
- [ ] Both configs are valid JSON
- [ ] Harness runner can load config from `.planning/config.json`: `bun run src/harness/runner.ts --project-dir=.`

### Task 4: Create Harness-Verification Boundary Rule

**Goal:** Create a rule that documents when the harness runs vs hooks, following the hook-skill-boundary rule pattern.
**Files:** `src/rules/general/harness-verification.rule.ts`
**Pattern:** Follow `src/rules/general/hook-skill-boundary.rule.ts` exactly (class extends BaseRuleImpl, RuleConfig with frontmatter + sections)

```typescript
/**
 * Harness/Hook verification boundary: when to use the full harness vs lightweight hooks
 */
import { BaseRuleImpl } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

const HarnessVerificationConfig: RuleConfig = {
  frontmatter: {
    description: 'Harness/Hook verification boundary: when full harness runs vs lightweight hooks',
    globs: ['*.ts', '*.sh', '.planning/config.json'],
    alwaysApply: true,
  },
  sections: [
    {
      title: 'rule',
      content: `# Harness/Hook Verification Boundary

## Two-Layer Verification

Luca uses two complementary verification layers:

| Layer | Mechanism | When | Checks | Output |
|-------|-----------|------|--------|--------|
| **Hooks** (lightweight) | Shell scripts via Claude Code/Cursor hooks | Every commit, every file edit | test + typecheck | Raw stderr/stdout, pass/fail |
| **Harness** (comprehensive) | TypeScript module via \`src/harness/runner.ts\` | Phase boundaries (after wave execution) | test + typecheck + lint + build | Structured JSON with parsed errors |

## When Hooks Run

- **post-edit-typecheck**: After every file edit (Edit/Write tool). Checks single file. Async.
- **pre-commit-gate**: Before every commit (git commit/bun run commit). Runs test + typecheck. Blocks on failure.

Hooks are fast (< 30s), deterministic, and fire automatically. They catch issues early.

## When Harness Runs

- **Phase boundary**: After all waves in a phase complete (lu-execute-phase Step 6.5)
- **Before agent verification**: Harness runs before lu-verifier to catch mechanical failures
- **Failure-to-fix loop**: If harness fails, spawns executor to fix, re-runs (max 3 iterations)

The harness is thorough (runs all 4 check types), produces structured output, and feeds the verification pipeline.

## They Are Complementary

- Hooks catch issues **during development** (per-edit, per-commit)
- Harness catches issues **at phase boundaries** (comprehensive, with auto-fix)
- Both run the same underlying commands (bun test, tsc) but differ in scope and output format

## Configuration

- Hooks: Configured in \`hooks\` section of \`.planning/config.json\`
- Harness: Configured in \`harness\` section of \`.planning/config.json\`
- Both follow Bun-first conventions (bun test, bunx --bun tsc)`,
      order: 1,
    },
  ],
};

export class HarnessVerificationRule extends BaseRuleImpl {
  constructor() {
    super(HarnessVerificationConfig);
  }
}
```

**Verification:**
- [ ] Rule file follows hook-skill-boundary pattern exactly
- [ ] Rule exports class extending BaseRuleImpl
- [ ] Rule compiles without errors

### Task 5: Register Rule and Rebuild

**Goal:** Register the new harness-verification rule in the rule registry and run the build pipeline to compile all updated entities.
**Files:** `src/rules/index.ts` (update), then run `bun run build:all`
**Pattern:** Follow existing import/registration pattern in `src/rules/index.ts`

Add to `src/rules/index.ts`:

```typescript
// Import (add near other imports)
import { HarnessVerificationRule } from './general/harness-verification.rule';

// Register (add to ruleRegistry object)
'harness-verification': HarnessVerificationRule,
```

Then run the build:

```bash
bun run build:all
```

This compiles the updated lu-execute-phase skill, lu-verifier agent, and new harness-verification rule to both `.cursor/` and `.claude/` output directories.

**Verification:**
- [ ] Rule registered in `ruleRegistry` (22 entries, up from 21)
- [ ] `bun run build:all` completes without errors
- [ ] `.cursor/rules/harness-verification.mdc` exists
- [ ] `.claude/rules/harness-verification.md` exists
- [ ] Updated skill and agent compiled to both output directories

### Task 6: Write Integration Tests

**Goal:** Write tests that validate config loading, harness-skill integration points, and the rule registration.
**Files:** `__tests__/src/harness/config.test.ts`, `__tests__/src/harness/integration.test.ts`
**Pattern:** Follow `__tests__/src/hooks/hook-registry.test.ts` (test style, import patterns)

**Config tests** (`__tests__/src/harness/config.test.ts`):

```typescript
import { describe, test, expect } from 'bun:test';
import { loadHarnessConfig, DEFAULT_HARNESS_CONFIG } from '../../../src/harness';

describe('harness config loading', () => {
  test('loads config from .planning/config.json', async () => {
    const config = await loadHarnessConfig('.');
    expect(config.enabled).toBe(true);
    expect(config.checks.length).toBeGreaterThanOrEqual(3);
  });

  test('default config has 4 checks', () => {
    expect(DEFAULT_HARNESS_CONFIG.checks.length).toBe(4);
  });

  test('default config enables test and typecheck', () => {
    const test = DEFAULT_HARNESS_CONFIG.checks.find(c => c.name === 'test');
    const tc = DEFAULT_HARNESS_CONFIG.checks.find(c => c.name === 'typecheck');
    expect(test?.enabled).toBe(true);
    expect(tc?.enabled).toBe(true);
  });

  test('default config disables lint', () => {
    const lint = DEFAULT_HARNESS_CONFIG.checks.find(c => c.name === 'lint');
    expect(lint?.enabled).toBe(false);
  });

  test('maxFixIterations defaults to 3', () => {
    expect(DEFAULT_HARNESS_CONFIG.maxFixIterations).toBe(3);
  });
});
```

**Integration tests** (`__tests__/src/harness/integration.test.ts`):

```typescript
import { describe, test, expect } from 'bun:test';
import { ruleRegistry } from '../../../src/rules/index';
import { parserRegistry } from '../../../src/harness/parsers';

describe('harness integration', () => {
  test('harness-verification rule is registered', () => {
    expect(ruleRegistry).toHaveProperty('harness-verification');
  });

  test('parser registry has all 4 parsers', () => {
    expect(Object.keys(parserRegistry).sort()).toEqual(['bun-test', 'eslint', 'generic', 'tsc']);
  });

  test('project config.json has harness section', async () => {
    const file = Bun.file('.planning/config.json');
    const config = await file.json();
    expect(config).toHaveProperty('harness');
    expect(config.harness.enabled).toBe(true);
    expect(config.harness.checks).toBeInstanceOf(Array);
  });

  test('template config.json has harness section', async () => {
    const file = Bun.file('packages/luca-framework/templates/framework/templates/config.json');
    const config = await file.json();
    expect(config).toHaveProperty('harness');
    expect(config.harness.checks).toBeInstanceOf(Array);
  });
});
```

**Verification:**
- [ ] Config tests validate loading behavior and defaults
- [ ] Integration tests validate rule registration, parser registry, and config files
- [ ] All tests pass: `bun test __tests__/src/harness/`

### Task 7: Run Full Test Suite and Final Validation

**Goal:** Confirm all harness tests pass, no regressions, build output is correct, and the harness CLI works end-to-end.
**Files:** No new files. Validation only.

Run the full test suite:

```bash
bun test
```

Expected: All harness tests pass. Pre-existing 6 doctor/config failures remain unchanged. No new failures.

Validate typecheck:

```bash
bunx --bun tsc --noEmit
```

Validate build:

```bash
bun run build:all
```

Validate harness CLI end-to-end:

```bash
bun run src/harness/runner.ts --project-dir=.
```

Should produce valid JSON with check results for the enabled checks in `.planning/config.json`.

Validate rule output exists:

```bash
ls .cursor/rules/harness-verification.mdc
ls .claude/rules/harness-verification.md
```

**Verification:**
- [ ] All `__tests__/src/harness/**/*.test.ts` pass
- [ ] No new test failures beyond pre-existing 6
- [ ] TypeScript compilation clean
- [ ] Build completes without errors
- [ ] Harness CLI produces valid JSON
- [ ] Rule compiled to both output directories
- [ ] lu-execute-phase skill compiled with harness steps
- [ ] lu-verifier agent compiled with harness context handling

## Exit Criteria

- [ ] `lu-execute-phase` skill includes Step 6.5 (harness) and Step 6.6 (failure-to-fix loop)
- [ ] `lu-verifier` agent accepts and reports harness results
- [ ] `.planning/config.json` has `harness` section with project-specific settings
- [ ] Template `config.json` has `harness` section with conservative defaults
- [ ] `harness-verification` rule registered in ruleRegistry and compiled
- [ ] Build pipeline produces updated output for all modified entities
- [ ] Integration tests pass
- [ ] Full test suite has no regressions

## Dependencies

- **Plan 12-01** must be complete (src/harness/ module with types, parsers, runner, index)
- Requires: `bun run build:all` (build pipeline from Phase 10)
- Requires: existing rule/skill/agent patterns from Phases 10-11
