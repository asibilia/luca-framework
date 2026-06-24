---
id: PLAN-66-B
title: "HIGH-severity Input Sanitization"
phase: 66
wave: 1
depends_on: []
---

# PLAN-66-B: HIGH-severity Input Sanitization

## Objective

Fix five HIGH-severity input validation issues identified in the v2.1.0 milestone audit. These are not accepted risks like the CRITICAL execSync findings — they are missing sanitization that should be added. Each fix prevents a specific injection or validation bypass vector.

## Context

@file src/hooks/pi-extensions/luca-state.ts — `luca_set_field` tool (L114-157) constructs RegExp from `params.field` (user input) without escaping special regex characters. A crafted field name like `.*` could match unintended content in STATE.md.

@file src/hooks/\_\_helpers/config-generators.ts — `generatePiExtension()` (L84-135) interpolates hook names and script paths into generated TypeScript source via template literals. A crafted hook name containing backticks or `${...}` could inject code into the generated extension. Additionally, `def.script` file paths are interpolated without validation — a path like `../../etc/passwd` would be written into the generated output.

@file src/hooks/pi-extensions/luca-query-experts.ts — The `luca_define_experts` tool (L137-219) accepts custom expert domain names via `custom:domain:focus1|focus2` syntax. The `domain` value is stored and used in synthesis output file names (L394: `${session.name}-synthesis.md`). While there is no execSync with domain in this file (the audit note may reference a future pattern), the domain and session names flow into file paths and should be sanitized.

@file src/hooks/pi-extensions/luca-chain.ts — `luca_define_chain` tool (L81-161) parses step definitions from `agent:task` format. The `agent` name is used to construct file paths (L112: `join(agentsDir, \`${agent}.md\`)`) and is stored as chain step identifiers. A crafted agent name with path traversal characters (e.g., `../../../etc/passwd`) could read arbitrary files via `getAgentSummary()`.

@file .planning/v2.1.0-MILESTONE-AUDIT.md — Audit source for all five findings.

## Tasks

### Task 1: Create shared sanitization utilities

**Goal:** Create a shared sanitization module first so that all subsequent tasks can import from it directly, avoiding inline helpers and double-editing files.

**Files:** Create `src/hooks/pi-extensions/__helpers/sanitize.ts`

**Changes:**

- Create `src/hooks/pi-extensions/__helpers/` directory
- Create `sanitize.ts` with the following exported functions:
  - `escapeRegExp(str: string): string` — escape regex special characters
  - `sanitizeName(name: string, maxLength?: number): string` — alphanumeric + hyphens + underscores only
  - `sanitizeForTemplate(str: string): string` — strip template injection characters
  - `validateScriptPath(scriptPath: string): boolean` — validate paths for hook script references
  - `isValidIdentifier(str: string): boolean` — check if string matches `/^[a-zA-Z0-9_-]+$/`
- Export all functions from the module

**Verification:**

- Test: all sanitization functions have unit tests with edge cases
- `bun test` passes
- `bunx --bun tsc --noEmit` passes

### Task 2: Escape regex special characters in luca-state.ts

**Goal:** Prevent unsafe RegExp construction from user-provided field names in the `luca_set_field` tool.

**Files:** `src/hooks/pi-extensions/luca-state.ts`

**Changes:**

- Import `escapeRegExp` from `__helpers/sanitize`
- Apply `escapeRegExp()` to `params.field` before constructing the `boldPattern` (L125) and `simplePattern` (L133) RegExp objects
- The escaped field name should be used in: `new RegExp(\`(\\_\\_${escapedField}:\\_\\_)\\s\*.+\`, "i")`
- Add input length validation: reject field names longer than 100 characters

**Verification:**

- Test: field name containing regex special chars (e.g., `Task.*Complexity`) does NOT match unintended lines
- Test: normal field names (e.g., `Task Complexity`) still work correctly
- Test: field names longer than 100 chars are rejected

### Task 3: Sanitize template interpolation in config-generators.ts

**Goal:** Prevent code injection in generated Pi extension TypeScript source through crafted hook names or script paths.

**Files:** `src/hooks/__helpers/config-generators.ts`

**Changes:**

- Import `sanitizeForTemplate` and `validateScriptPath` from `../pi-extensions/__helpers/sanitize`
- Apply `sanitizeForTemplate()` to:
  - `hookName` before interpolation into the comment on L104
  - `def.statusMessage` before interpolation on L104
  - `def.script` before interpolation into the `execSync` command on L107
- Apply `validateScriptPath()` to `def.script` before generating the handler block; skip the hook (with a console.warn) if validation fails

**Verification:**

- Test: hook name containing backticks does not inject code into generated output
- Test: script path with `../` is rejected
- Test: normal hook definitions still generate correct output
- All existing tests pass

### Task 4: Sanitize domain and session names in luca-query-experts.ts

**Goal:** Validate expert domain names and session names to prevent path traversal when used in file names.

**Files:** `src/hooks/pi-extensions/luca-query-experts.ts`

**Changes:**

- Import `sanitizeName` from `__helpers/sanitize`
- Apply `sanitizeName()` to:
  - `params.name` (session name) in `luca_define_experts` before storing (affects synthesis file name on L394)
  - `parts[0]` (custom expert domain) in the custom expert parser
- Add input length validation: reject session names longer than 128 characters, domain names longer than 64 characters

**Verification:**

- Test: session name with path traversal chars (e.g., `../../etc/passwd`) is sanitized to a safe file name
- Test: custom domain with special chars is sanitized
- Test: normal names pass through with minimal modification
- Synthesis output file uses the sanitized name

### Task 5: Sanitize agent names (step names) in luca-chain.ts

**Goal:** Prevent path traversal and injection via crafted agent names in chain step definitions.

**Files:** `src/hooks/pi-extensions/luca-chain.ts`

**Changes:**

- Import `isValidIdentifier` and `sanitizeName` from `__helpers/sanitize`
- Apply validation to the `agent` value parsed from step definitions (L108) before:
  - Using it to construct the file path (L112: `join(agentsDir, \`${agent}.md\`)`)
  - Storing it in the chain step
- Also validate the chain `name` parameter with the same function (it flows into Map keys and JSON output)
- Add validation: if sanitized agent name differs from input, return an error explaining which characters were invalid rather than silently sanitizing

**Verification:**

- Test: agent name `../../../etc/passwd` is rejected with a clear error message
- Test: agent name `lu-executor` passes validation unchanged
- Test: chain name with special characters is rejected
- All existing chain functionality still works

## Success Criteria

- [ ] `luca-state.ts` escapes regex special chars in field names before RegExp construction
- [ ] `config-generators.ts` sanitizes interpolated values and validates script paths
- [ ] `luca-query-experts.ts` sanitizes session names and domain names
- [ ] `luca-chain.ts` validates agent names against `/^[a-zA-Z0-9_-]+$/` pattern
- [ ] Shared sanitization module exists at `src/hooks/pi-extensions/__helpers/sanitize.ts`
- [ ] Each fix has at least one corresponding test case
- [ ] All existing tests still pass: `bun test`
- [ ] Type checking passes: `bunx --bun tsc --noEmit`

## Verification

```bash
# Run all tests
bun test

# Type check
bunx --bun tsc --noEmit

# Verify sanitization module exists
test -f src/hooks/pi-extensions/__helpers/sanitize.ts && echo "PASS"

# Verify regex escaping is applied (grep for escapeRegExp usage)
grep -c "escapeRegExp" src/hooks/pi-extensions/luca-state.ts  # Expect >= 1

# Verify agent name validation (grep for sanitizeAgentName or isValidIdentifier usage)
grep -c "sanitize\|isValid" src/hooks/pi-extensions/luca-chain.ts  # Expect >= 1

# Verify template sanitization
grep -c "sanitizeForTemplate\|validateScriptPath" src/hooks/__helpers/config-generators.ts  # Expect >= 1

# Regenerate .pi/ outputs from source changes
bun run build:all --force
```
