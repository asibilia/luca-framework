# Phase 6: Security — Research Findings

## Table of Contents
1. [File-by-File Analysis](#file-by-file-analysis)
2. [Existing Patterns to Follow](#existing-patterns-to-follow)
3. [Downstream Consumers & Breaking Change Risk](#downstream-consumers--breaking-change-risk)
4. [Test Coverage Map](#test-coverage-map)
5. [External API Reference](#external-api-reference)
6. [Wave-by-Wave Implementation Notes](#wave-by-wave-implementation-notes)
7. [Key Recommendations](#key-recommendations)

---

## File-by-File Analysis

### 1. `packages/luca-framework/src/adapters/jira-adapter.ts`

**Current state:**
- Uses `fetch()` for HTTP calls (no execa/shell)
- Config from `JiraAdapterConfig` object or env vars (`JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`)
- `checkConfig()` only checks for presence (non-empty), not format
- `buildAuthHeader()` creates Base64 Basic auth from email:token
- `getTicket()` builds API URL by string interpolation: `` `${baseUrl}/rest/api/3/issue/${ticketId}?fields=...` ``
- No validation on `ticketId` — any string is interpolated directly into URL
- No validation on `baseUrl` — no HTTPS enforcement
- No validation on `userEmail` — no email format check
- Error catch block exposes raw `error.message` which could contain credentials
- Response is cast as `JiraIssueResponse` TypeScript interface — no runtime validation
- `extractAdfText()` does safe type narrowing but uses `as` cast

**Security issues to fix:**
1. **URL injection via ticketId** — No regex validation before URL construction
2. **No HTTPS enforcement** — `baseUrl` could be `http://` leaking credentials in cleartext
3. **No email validation** — `userEmail` not validated for email format
4. **Credential leakage in errors** — Error messages propagate raw `error.message` which may contain auth headers, tokens, or Base64 credentials
5. **No Zod response validation** — API response cast via TypeScript `as`, no runtime shape check
6. **No Zod config validation** — `JiraAdapterConfig` has no runtime schema

**Specific changes needed:**
- Add `jiraTicketIdSchema` = `z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/)` for ticketId validation
- Add `jiraBaseUrlSchema` = `z.string().url().startsWith('https://')` for HTTPS enforcement
- Add email shape validation for `userEmail`
- Add `jiraIssueResponseSchema` Zod schema to parse API response
- Wrap error catch to strip auth headers, base64 strings, and tokens from error messages
- Add `sanitizeJiraError(error)` helper function

### 2. `packages/luca-framework/src/adapters/github-adapter.ts`

**Current state:**
- Uses `execa` for all shell operations (array form — inherently safer than string form)
- `getTicket()` strips `#` prefix then passes `issueNumber` to execa as argument
- `createBranch()` passes `branchName` directly to `execa('gh', ['issue', 'develop', issueNumber, '--name', branchName])` and fallback `execa('git', ['checkout', '-b', branchName])`
- `validate()` calls `execa('gh', ['auth', 'status'])`
- `parseGhError()` exposes raw `error.message` in generic error path

**Security issues to fix:**
1. **No branch name validation** — `branchName` passed directly to git/gh commands. Malicious branch names starting with `-` could be interpreted as flags. Names with `..`, whitespace, NUL, `~`, `^`, `:`, `\` are dangerous for git
2. **No `--` end-of-options marker** — User-provided values (`issueNumber`, `branchName`) passed without `--` separator
3. **No issueNumber validation** — Should be numeric only after `#` stripping
4. **Error messages not sanitized** — `parseGhError()` passes raw error messages in its fallback path

**Specific changes needed:**
- Add `validateBranchName(name: string)` utility function rejecting dangerous patterns
- Add `--` before user-provided arguments in execa calls
- Validate `issueNumber` is numeric (`/^\d+$/`)
- Sanitize error output in `parseGhError()` generic path
- Add branch name validation call before `createBranch()` operations

### 3. `packages/luca-framework/src/utils/template.ts`

**Current state:**
- Uses `ejs.render()` with `strict: false`
- `processTemplate()` accepts arbitrary template content with all EJS tag types:
  - `<%= %>` — escaped output (safe)
  - `<%- %>` — unescaped output (XSS risk)
  - `<% %>` — code execution (RCE risk)
- Templates come from framework template files (trusted) and user-provided content (via branding)
- `processFilename()` uses regex replacement with `__variable__` pattern — no injection risk
- `copyTemplates()` reads files from disk and processes them

**Security issues to fix:**
1. **EJS code execution** — `<% %>` tags allow arbitrary code execution. While templates are framework-authored, a compromised template could execute arbitrary code
2. **EJS unescaped output** — `<%- %>` allows raw HTML injection

**Specific changes needed:**
- Add template content validation that rejects/strips `<%-` and `<%` (non-output) tags
- Only allow `<%= %>` tags (escaped output)
- Implement `sanitizeTemplate(content: string): string` that strips dangerous tags
- Call sanitization before `ejs.render()`

**Important caveat:** The existing test `template.test.ts` has tests for `<%- %>` (unescaped) and `<% %>` (code blocks). These tests will need to be updated to expect rejection/stripping of those tag types.

### 4. `src/shared/utils.ts`

**Current state:**
- Single function: `formatFrontmatter(frontmatter: Record<string, unknown>): string`
- Generates YAML by manual string concatenation
- String values quoted with double quotes: `${key}: "${value}"`
- No escaping of special YAML characters within values (e.g., `"`, `\n`, `:`, `#`)
- Arrays rendered as `  - ${item}` — no escaping
- Nested objects rendered as `  ${subKey}: ${subValue}` — no quoting, no escaping
- Boolean values rendered without quotes (correct)

**Security issues to fix:**
1. **YAML injection** — Values containing `"`, `\n`, `:`, `#`, or YAML special chars will produce malformed/injectable YAML
2. **No proper escaping** — Manual serialization doesn't handle edge cases

**Specific changes needed:**
- Replace manual YAML generation with `js-yaml` library's `dump()` function
- `js-yaml` is NOT currently installed — needs to be added as dependency
- The `dump()` function handles all escaping automatically
- Need to wrap output in `---\n...\n---` delimiters (js-yaml doesn't add frontmatter delimiters)

**API for replacement:**
```typescript
import yaml from 'js-yaml';

export function formatFrontmatter(frontmatter: Record<string, unknown>): string {
  const yamlContent = yaml.dump(frontmatter, {
    lineWidth: -1,      // no line wrapping
    quotingType: '"',    // use double quotes
    forceQuotes: false,  // only quote when necessary
  });
  return `---\n${yamlContent.trimEnd()}\n---`;
}
```

**Breaking change risk:** The output format will change slightly (js-yaml uses different quoting rules than the manual implementation). The test `formatFrontmatter` has 7 test cases that assert specific output format — these will need updating.

### 5. `src/shared/format.ts`

**Current state:**
- Imports `formatFrontmatter` from `./utils`
- `toCursorFormat()` generates XML-tagged sections: `` `<${section.title.toLowerCase()}>` ``
- Section titles are used directly as XML tag names with only `.toLowerCase()` applied
- No sanitization of tag name characters — if title contains spaces, special chars, they become invalid XML

**Security issues to fix:**
1. **Invalid XML tag names** — Section titles used as raw tag names. Characters outside `[a-z0-9_-]` would create invalid XML
2. **Potential injection** — If a title contained `>` or `<`, it could break the XML structure

**Specific changes needed:**
- Add `sanitizeTagName(name: string): string` that strips/replaces characters outside `[a-z0-9_-]`
- Apply sanitization in `toCursorFormat()` before using titles as tag names
- Handle edge cases (empty string after sanitization, leading digits/hyphens)

### 6. `src/shared/validation-utils.ts`

**Current state:**
- Imports Zod schemas from `agent.schemas.ts`, `skill.schemas.ts`, `rule.schemas.ts`
- Provides `validate*Config()` (strict, throws) and `safeValidate*Config()` (safe, returns result)
- Uses `schema.parse()` pattern for strict validation
- Uses try/catch for safe validation

**Security issues to fix:**
- No direct security issues in this file
- This is the pattern file — new security validators should follow this same pattern

**Changes needed:**
- Add new security-specific validation functions (e.g., `validateTicketId()`, `validateBranchName()`, `validateBaseUrl()`, `sanitizeJsonParse()`)
- These may go here or in a new dedicated security utils module

### 7. `scripts/compile-all-to-cursor.ts`

**Current state:**
- Uses `import { exec } from 'child_process'` and `promisify(exec)` — creates `execAsync`
- However, `execAsync` is never actually called in the main flow
- `createBuildSystem()` generates a build script string containing `execSync('npx tsc ...')` as inline JS
- The generated script uses `require()` and `execSync` — classic Node.js patterns
- The main function `compileAllToCursor()` only uses `fs.readdir()` — no shell execution

**Security issues to fix:**
1. **`child_process.exec` import** — Even though not called directly in the main flow, the generated build script uses `execSync` with string argument (shell interpretation)
2. **Generated script uses `execSync` with shell** — The inline JS string written to `build-and-compile-cursor.js` has `execSync('npx tsc --outDir dist ...')` which goes through a shell

**Specific changes needed:**
- Remove `child_process` import
- Replace generated script's `execSync` usage with `Bun.spawnSync()` or `Bun.$` tagged template
- Since this script is a build tool, use `Bun.spawnSync()` (blocking is fine for CLI tools)

### 8. `scripts/prepare-compilation.ts`

**Current state:**
- Uses `import { exec } from 'child_process'` and `promisify(exec)` — creates `execAsync`
- `compileAndRun()` calls `await execAsync('bun run build', { cwd: process.cwd() })` — shell execution with fixed string
- Also generates a bash script (`build-for-compilation.sh`) containing `npx tsc ...`

**Security issues to fix:**
1. **`child_process.exec` with shell** — `execAsync('bun run build')` interprets through shell
2. **Generated bash script** — Creates executable script with shell commands

**Specific changes needed:**
- Replace `execAsync('bun run build')` with `Bun.spawnSync(['bun', 'run', 'build'], { cwd: process.cwd() })`
- Remove `child_process` import entirely
- Replace generated bash script with Bun.spawn equivalent or remove if unnecessary

---

## Existing Patterns to Follow

### Zod Schema Pattern

The project uses Zod v4.3.6 (workspace root dependency). Three existing schema files demonstrate the pattern:

**File:** `src/agents/types/agent.schemas.ts`
```typescript
import { z } from 'zod';

export const agentFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()).optional(),
  color: z.string().optional(),
});

export const agentConfigSchema = z.object({
  frontmatter: agentFrontmatterSchema,
  sections: z.array(agentSectionSchema),
});

// Type inference from Zod schemas
export type AgentConfigSchema = z.infer<typeof agentConfigSchema>;
```

**Validation utility pattern** from `src/shared/validation-utils.ts`:
```typescript
// Strict (throws on failure)
export function validateAgentConfig(config: AgentConfig): AgentConfig {
  return agentConfigSchema.parse(config);
}

// Safe (returns result object)
export function safeValidateAgentConfig(config: AgentConfig): { success: boolean; data?: AgentConfig; error?: string } {
  try {
    const data = agentConfigSchema.parse(config);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Validation failed' };
  }
}
```

### Branding Validation Pattern

From `packages/luca-framework/src/utils/branding.ts`:
```typescript
const validationRules = {
  frameworkName: {
    pattern: /^[a-zA-Z][a-zA-Z0-9-]*$/,
    message: 'Name must start with letter, contain only letters, numbers, dashes',
    minLength: 2,
    maxLength: 20,
  },
  // ...
};

export function validateBrandingField(
  field: keyof BrandingConfig,
  value: string
): { valid: boolean; error?: string } { ... }
```

### Error Result Pattern

From `packages/luca-framework/src/contracts/work-tracker.ts`:
```typescript
export type AdapterResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

All adapter methods return `AdapterResult<T>` — security validations should return errors through this same pattern, not throw.

---

## Downstream Consumers & Breaking Change Risk

### `jira-adapter.ts` consumers
| Consumer | Import | Breaking Change Risk |
|----------|--------|---------------------|
| `packages/luca-framework/src/adapters/index.ts` | `createJiraAdapter`, `JiraAdapterConfig` | LOW — factory passes config through, no API change |
| `__tests__/.../jira-adapter.test.ts` | `createJiraAdapter`, `JiraAdapterConfig` | MEDIUM — tests with invalid ticketIds may now get validation errors instead of HTTP errors |

### `github-adapter.ts` consumers
| Consumer | Import | Breaking Change Risk |
|----------|--------|---------------------|
| `packages/luca-framework/src/adapters/index.ts` | `createGitHubAdapter` | LOW — factory passes config through |
| `__tests__/.../github-adapter.test.ts` | `createGitHubAdapter` (dynamic import) | MEDIUM — tests need branch name validation tests; execa mock args may change with `--` markers |

### `template.ts` consumers
| Consumer | Import | Breaking Change Risk |
|----------|--------|---------------------|
| `packages/luca-framework/src/utils/files.ts` | `copyTemplates`, `getTemplatesDir` | LOW — no API change, just stricter template validation |
| `packages/luca-framework/src/commands/update.ts` | `getTemplatesDir`, `processTemplate`, `processFilename` | LOW — same API, stricter validation |
| `__tests__/.../template.test.ts` | All exports | HIGH — tests for `<%- %>` and `<% %>` must be updated |

### `utils.ts` (`formatFrontmatter`) consumers
| Consumer | Import | Breaking Change Risk |
|----------|--------|---------------------|
| `src/shared/format.ts` | `formatFrontmatter` | MEDIUM — output format changes with js-yaml |
| `__tests__/src/shared/utils.test.ts` | `formatFrontmatter` | HIGH — 7 tests assert specific output format |

### `format.ts` (`toCursorFormat`, `toClaudeFormat`) consumers
| Consumer | Import | Breaking Change Risk |
|----------|--------|---------------------|
| `src/agents/base/base-agent.ts` | `toCursorFormat`, `toClaudeFormat` | LOW — tag sanitization is additive |
| `src/skills/base/base-skill.ts` | `toCursorFormat`, `toClaudeFormat` | LOW — same |
| `src/rules/base/base-rule.ts` | `toCursorFormat`, `toClaudeFormat` | LOW — same |
| `__tests__/src/compilers/cursor-compiler.test.ts` | indirect via base classes | LOW — output may change slightly for titles with special chars |
| `__tests__/src/agents/base/base-agent.test.ts` | indirect | LOW |
| `__tests__/src/skills/base/base-skill.test.ts` | indirect | LOW |
| `__tests__/src/rules/base/base-rule.test.ts` | indirect | LOW |

### `validation-utils.ts` consumers
| Consumer | Import | Breaking Change Risk |
|----------|--------|---------------------|
| `__tests__/src/shared/validation-utils.test.ts` | All exports | LOW — adding new exports doesn't break existing |

### Build scripts (`compile-all-to-cursor.ts`, `prepare-compilation.ts`)
| Consumer | Import | Breaking Change Risk |
|----------|--------|---------------------|
| `package.json` scripts | `compile:to-cursor` | LOW — behavior unchanged, just different subprocess API |

---

## Test Coverage Map

### Existing test files covering scoped modules

| Scoped File | Test File | Test Count | Coverage Notes |
|-------------|-----------|------------|---------------|
| `jira-adapter.ts` | `__tests__/packages/luca-framework/src/adapters/jira-adapter.test.ts` | ~25 tests | Covers getTicket, validate, config, ADF, type/priority mapping, HTTP errors |
| `github-adapter.ts` | `__tests__/packages/luca-framework/src/adapters/github-adapter.test.ts` | ~25 tests | Covers getTicket, createBranch, linkPR, validate, label mapping, error parsing |
| `template.ts` | `__tests__/packages/luca-framework/src/utils/template.test.ts` | ~15 tests | Covers processTemplate (EJS), processFilename, copyTemplates, getTemplatesDir |
| `utils.ts` | `__tests__/src/shared/utils.test.ts` | 7 tests | Covers formatFrontmatter with all value types |
| `format.ts` | (indirect via compiler/base tests) | ~8 tests | Tested indirectly through `toCursorFormat()`/`toClaudeFormat()` in base class and compiler tests |
| `validation-utils.ts` | `__tests__/src/shared/validation-utils.test.ts` | 12 tests | Covers strict and safe validation for all three types |
| Build scripts | None | 0 | No tests for build scripts |

### Tests that need updating per wave

**Wave 1 (Input Validation):**
- No existing tests need modification
- New tests needed for: JSON prototype pollution guard, env var validation, config Zod schemas

**Wave 2 (Shell Command Hardening):**
- `github-adapter.test.ts` — Tests calling `createBranch` with branch names need to account for validation
- Execa mock calls may need `--` in expected arg arrays
- New tests needed for: `validateBranchName()`, error sanitization
- No tests for build scripts currently; build script migration does not require test updates

**Wave 3 (HTTP & Credential Safety):**
- `jira-adapter.test.ts` — Tests may need to use valid ticketId format (`/^[A-Z][A-Z0-9]+-\d+$/`)
- Tests with non-HTTPS baseUrl need to expect config validation errors
- New tests needed for: ticketId validation, HTTPS enforcement, error sanitization, Zod response schema

**Wave 4 (Template Rendering):**
- `template.test.ts` — Tests for `<%- %>` (unescaped) and `<% %>` (code blocks) need to be updated to expect rejection/stripping
- `utils.test.ts` — All 7 `formatFrontmatter` tests need updating for js-yaml output format differences
- New tests needed for: template sanitization, XML tag name sanitization

---

## External API Reference

### Bun.spawn() / Bun.spawnSync()

For replacing `child_process.exec` and `child_process.execSync` in build scripts.

**Async (for servers/apps):**
```typescript
const proc = Bun.spawn(['command', 'arg1', 'arg2'], {
  cwd: '/path/to/dir',
  env: { ...process.env },
  stdout: 'pipe',   // or 'inherit'
  stderr: 'pipe',   // or 'inherit'
});
const output = await new Response(proc.stdout).text();
const exitCode = await proc.exited;
```

**Sync (for CLI tools/build scripts):**
```typescript
const result = Bun.spawnSync(['bun', 'run', 'build'], {
  cwd: process.cwd(),
  stdout: 'inherit',
  stderr: 'inherit',
});
if (!result.success) {
  console.error('Build failed with exit code:', result.exitCode);
  process.exit(1);
}
```

Key differences from `child_process.exec`:
- **No shell layer** — arguments are passed directly to the process, no shell interpretation
- **Array form only** — forces proper argument separation, prevents injection
- **Faster** — 60% faster process spawning than Node.js child_process
- **`success` property** on sync result for easy exit code checking

### js-yaml dump()

For replacing manual YAML generation in `formatFrontmatter()`.

**Installation:** `bun add js-yaml` (+ `bun add -d @types/js-yaml`)

**Usage:**
```typescript
import yaml from 'js-yaml';

const output = yaml.dump(object, {
  indent: 2,            // indentation width (default: 2)
  lineWidth: -1,        // disable line wrapping
  quotingType: '"',     // use double quotes when quoting
  forceQuotes: false,   // only quote when necessary
  sortKeys: false,      // preserve key order
  noArrayIndent: false,  // indent array items
});
```

**Key behaviors:**
- Automatically handles escaping of special YAML characters (`"`, `\n`, `:`, `#`, etc.)
- Strings containing special chars are automatically quoted
- Booleans, numbers, nulls are rendered without quotes
- Arrays use `- item` format
- Nested objects use indented `key: value` format
- Returns string with trailing newline

**Frontmatter wrapper:**
```typescript
export function formatFrontmatter(frontmatter: Record<string, unknown>): string {
  const yamlContent = yaml.dump(frontmatter, { lineWidth: -1 });
  return `---\n${yamlContent.trimEnd()}\n---`;
}
```

---

## Wave-by-Wave Implementation Notes

### Wave 1: Input Validation & Prototype Pollution (06-01)

**Files to modify:**
- `src/shared/validation-utils.ts` — Add `sanitizeJsonParse()` helper
- `packages/luca-framework/src/adapters/jira-adapter.ts` — Add env var format validation to `checkConfig()`
- New file or extend `validation-utils.ts` — Security validation utilities

**New utility: `sanitizeJsonParse()`**
```typescript
function stripPrototypeKeys(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(stripPrototypeKeys);
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = stripPrototypeKeys(value);
  }
  return clean;
}
```

**Env var validation in jira-adapter.ts `checkConfig()`:**
- `JIRA_BASE_URL`: Must match `z.string().url()` and start with `https://`
- `JIRA_API_TOKEN`: Must be non-empty string
- `JIRA_USER_EMAIL`: Must match basic email pattern

**Scope of JSON parsing to guard:** All `JSON.parse()` calls in the project that handle external/user data.

### Wave 2: Shell Command Hardening (06-02)

**Files to modify:**
- `packages/luca-framework/src/adapters/github-adapter.ts` — Add `--` markers, validate branchName/issueNumber
- `scripts/compile-all-to-cursor.ts` — Replace child_process with Bun.spawn
- `scripts/prepare-compilation.ts` — Replace child_process with Bun.spawn

**New utility: `validateBranchName()`**
```typescript
export function validateBranchName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim() === '') return { valid: false, error: 'Branch name is required' };
  if (name.startsWith('-')) return { valid: false, error: 'Branch name cannot start with -' };
  if (name.includes('..')) return { valid: false, error: 'Branch name cannot contain ..' };
  if (/[\s\0~^:\\]/.test(name)) return { valid: false, error: 'Branch name contains invalid characters' };
  if (name.endsWith('.lock')) return { valid: false, error: 'Branch name cannot end with .lock' };
  if (name.endsWith('.')) return { valid: false, error: 'Branch name cannot end with .' };
  if (name.includes('//')) return { valid: false, error: 'Branch name cannot contain //' };
  return { valid: true };
}
```

**`--` end-of-options markers:**
```typescript
// Before (current):
await execa('gh', ['issue', 'view', issueNumber, '--json', '...'])
// After:
await execa('gh', ['issue', 'view', '--', issueNumber, '--json', '...'])
// Note: --json is a gh flag, not user input, so it goes before --
// Actually for gh CLI, -- may not be needed since issueNumber is positional
// The critical one is git checkout:
await execa('git', ['checkout', '-b', '--', branchName])
```

**Build script migration pattern:**
```typescript
// Before:
import { exec } from 'child_process';
const execAsync = promisify(exec);
await execAsync('bun run build', { cwd: process.cwd() });

// After:
const result = Bun.spawnSync(['bun', 'run', 'build'], {
  cwd: process.cwd(),
  stdout: 'inherit',
  stderr: 'inherit',
});
if (!result.success) {
  console.log('Build failed, proceeding with direct compilation...');
}
```

### Wave 3: HTTP & Credential Safety (06-03)

**Files to modify:**
- `packages/luca-framework/src/adapters/jira-adapter.ts` — ticketId validation, HTTPS enforcement, error sanitization, response schemas

**New Zod schemas for Jira:**
```typescript
const jiraTicketIdSchema = z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/, 'Invalid Jira ticket ID format');

const jiraBaseUrlSchema = z.string().url().refine(
  (url) => url.startsWith('https://'),
  'JIRA_BASE_URL must use HTTPS'
);

const jiraIssueResponseSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    description: z.unknown(),
    issuetype: z.object({ name: z.string() }).optional(),
    priority: z.object({ name: z.string() }).optional(),
    status: z.object({ name: z.string() }).optional(),
    assignee: z.object({ displayName: z.string() }).optional(),
  }),
});
```

**Error sanitization helper:**
```typescript
function sanitizeJiraError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Strip potential credential patterns
  return message
    .replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic [REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/[A-Za-z0-9+/]{20,}={0,2}/g, '[REDACTED]')  // base64 patterns
    .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]');
}
```

### Wave 4: Template Rendering Hardening (06-04)

**Files to modify:**
- `packages/luca-framework/src/utils/template.ts` — EJS tag restriction
- `src/shared/utils.ts` — Replace with js-yaml
- `src/shared/format.ts` — XML tag name sanitization

**EJS restriction:**
```typescript
function sanitizeTemplate(content: string): string {
  // Strip <%- (unescaped output) → replace with <%= (escaped)
  let sanitized = content.replace(/<%-([\s\S]*?)%>/g, '<%=$1%>');
  // Strip <% (code execution) tags that are NOT <%= output tags
  // Match <% ... %> but NOT <%= ... %>
  sanitized = sanitized.replace(/<%(?!=)([\s\S]*?)%>/g, '');
  return sanitized;
}
```

**js-yaml migration:** See API reference section above. Key concern is matching the existing output format closely enough that downstream consumers (format.ts, base classes) produce reasonable output.

**XML tag name sanitization:**
```typescript
function sanitizeTagName(name: string): string {
  // Lowercase, replace invalid chars with hyphens, collapse multiple hyphens
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // Ensure non-empty and starts with letter
  if (!sanitized || /^[0-9]/.test(sanitized)) {
    return `section-${sanitized || 'unknown'}`;
  }
  return sanitized;
}
```

---

## Key Recommendations

### Dependencies to Add
1. **`js-yaml`** — YAML serialization library (replaces manual formatFrontmatter)
2. **`@types/js-yaml`** — TypeScript types (devDependency)
3. **No other new dependencies required** — Zod is already installed, Bun.spawn is built-in

### Implementation Order
The 4-wave structure from 06-CONTEXT.md is well-designed. Each wave is independent:
- Wave 1 (Input Validation) and Wave 2 (Shell Hardening) can be done in parallel
- Wave 3 (HTTP Safety) builds slightly on Wave 1 patterns
- Wave 4 (Template Hardening) is fully independent

### Test Strategy
- **Update existing tests first** before modifying source, to understand what assertions will change
- **Add security-specific test cases** for each new validation (invalid inputs, injection attempts)
- **Run full test suite** (`bun test`) after each wave to catch regressions
- **No tests exist for build scripts** — consider if any are needed or if the Bun.spawn migration is straightforward enough

### Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| js-yaml output format change | MEDIUM | Update 7 formatFrontmatter tests + downstream format assertions |
| EJS tag restriction | MEDIUM | Audit all template files to ensure none use `<%-` or `<%` legitimately |
| Jira ticketId validation | LOW | Jira ticket IDs are well-defined format |
| Branch name validation | LOW | additive validation, fails early |
| Build script Bun.spawn migration | LOW | Same behavior, different API |
| Error sanitization | LOW | Only changes error message strings |
| `--` end-of-options in execa | LOW | May change mock expectations in tests |

### Files Not in Scope but Worth Noting
- `packages/luca-framework/src/utils/branding.ts` — Already has `validateBrandingField()` with regex patterns. This is the model for CLI arg validation referenced in decisions.
- `packages/luca-framework/src/utils/wizard.ts` — Uses `validateBrandingField()` for user input. No changes needed here.
- `packages/luca-framework/src/utils/manifest.ts` — Reads/writes JSON manifests. Candidate for prototype pollution guard if not already covered.
