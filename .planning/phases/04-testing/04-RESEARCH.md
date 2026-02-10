# Phase 4 Research: Testing

*Researched: 2026-02-10*

---

## 1. Adapters

All adapter source files live in `packages/luca-framework/src/adapters/`.

### 1.1 WorkTrackerContract (`packages/luca-framework/src/contracts/work-tracker.ts`)

The contract interface that all adapters must implement:

```typescript
interface WorkTrackerContract {
  readonly name: WorkTrackerType;                                    // 'jira' | 'github' | 'none'
  getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>>;   // REQUIRED
  createBranch?(ticketId: string, branchName: string): Promise<AdapterResult<string>>;  // OPTIONAL
  linkPR?(ticketId: string, prUrl: string): Promise<AdapterResult<void>>;               // OPTIONAL
  validate?(): Promise<AdapterResult<boolean>>;                      // OPTIONAL
}
```

Supporting types:
- `WorkTicket`: `{ id, title, description, type, status, priority, assignee?, url }`
- `AdapterResult<T>`: `{ success: true, data: T } | { success: false, error: string }`
- `WorkTicketType`: `'bug' | 'story' | 'task' | 'epic' | 'subtask'`
- `WorkTicketPriority`: `'highest' | 'high' | 'medium' | 'low' | 'lowest'`

**Contract test suite value**: All three adapters implement the same interface. A shared parameterized contract test can validate uniform behavior.

### 1.2 GitHub Adapter (`packages/luca-framework/src/adapters/github-adapter.ts`)

**Factory**: `createGitHubAdapter(config?: GitHubAdapterConfig): WorkTrackerContract`

**External deps**: `execa` (for `gh` CLI commands)

**Public methods**:
| Method | What it does | External call |
|--------|-------------|---------------|
| `getTicket(ticketId)` | Fetches issue via `gh issue view <num> --json ...` | `execa('gh', ['issue', 'view', ...])` |
| `createBranch(ticketId, branchName)` | Creates linked branch via `gh issue develop`, falls back to `git checkout -b` | `execa('gh', ['issue', 'develop', ...])` then fallback `execa('git', ['checkout', '-b', ...])` |
| `linkPR(_ticketId, _prUrl)` | No-op (GitHub auto-links via "Closes #N") | None |
| `validate()` | Checks `gh auth status` | `execa('gh', ['auth', 'status'])` |

**Internal helper functions** (module-scoped, not exported):
- `inferTypeFromLabels(labels)` -- maps GitHub labels to `WorkTicketType`
- `inferPriorityFromLabels(labels)` -- maps GitHub labels to `WorkTicketPriority`
- `parseGhError(error, issueNumber)` -- parses execa errors into user-friendly messages

**Key edge cases to test**:
- `getTicket('#123')` vs `getTicket('123')` -- `#` prefix stripping
- `getTicket` when `gh` CLI not installed (ENOENT error)
- `getTicket` when not authenticated (auth error message)
- `getTicket` when issue not found (404 pattern)
- `getTicket` success -- verify label-to-type/priority mapping
- `getTicket` with empty labels, no assignees, null body
- `createBranch` -- primary `gh issue develop` success
- `createBranch` -- fallback to `git checkout -b` when `gh issue develop` fails
- `createBranch` -- both methods fail
- `linkPR` -- verify it always returns success (no-op)
- `validate` -- logged in (stdout contains "logged in")
- `validate` -- gh not installed
- `validate` -- not authenticated

**Mocking needed**: `execa` via `mock.module('execa', ...)`

### 1.3 Jira Adapter (`packages/luca-framework/src/adapters/jira-adapter.ts`)

**Factory**: `createJiraAdapter(config?: JiraAdapterConfig): WorkTrackerContract`

**External deps**: `fetch` (global, for Jira REST API v3)

**Public methods**:
| Method | What it does | External call |
|--------|-------------|---------------|
| `getTicket(ticketId)` | Fetches issue via `fetch(baseUrl/rest/api/3/issue/...)` | `fetch()` |
| `validate()` | Tests connectivity via `fetch(baseUrl/rest/api/3/myself)` | `fetch()` |

Note: `createBranch` and `linkPR` are NOT implemented.

**Internal helper functions** (module-scoped):
- `mapJiraType(type)` -- maps Jira issue type name to `WorkTicketType`
- `mapJiraPriority(priority)` -- maps Jira priority name to `WorkTicketPriority`
- `extractAdfText(adf)` -- extracts plain text from Atlassian Document Format
- `checkConfig()` -- validates required env vars / config params
- `buildAuthHeader()` -- builds Basic auth header from email:token

**Key edge cases to test**:
- `getTicket` with missing config (no JIRA_BASE_URL, etc.)
- `getTicket` with 401 response (auth failed)
- `getTicket` with 404 response (ticket not found)
- `getTicket` with non-ok response (other HTTP error)
- `getTicket` success -- full response mapping including ADF extraction
- `getTicket` with network error (fetch throws)
- `getTicket` with null/missing optional fields (no assignee, no priority, no issuetype)
- `extractAdfText` with null, non-object, missing content array, nested text nodes
- `validate` -- missing config
- `validate` -- 401 response
- `validate` -- network error
- `validate` -- success (200)
- Config from explicit params vs. `process.env` fallback

**Mocking needed**: `fetch` (global mock), `process.env` for env var tests

### 1.4 Placeholder Adapter (`packages/luca-framework/src/adapters/placeholder-adapter.ts`)

**Factory**: `createPlaceholderAdapter(config?: PlaceholderAdapterConfig): WorkTrackerContract`

**External deps**: None (no I/O, no network)

**Public methods**:
| Method | What it does | External call |
|--------|-------------|---------------|
| `getTicket(ticketId)` | Returns synthetic WorkTicket with provided or default ID | None |
| `validate()` | Always returns `{ success: true, data: true }` | None |

Note: `createBranch` and `linkPR` are NOT implemented.

**Key edge cases to test**:
- `getTicket('TEST-123')` -- uses provided ticketId
- `getTicket('')` -- falls back to `placeholderTicket` config (default `'PROJ-0000'`)
- Custom `placeholderTicket` config
- `validate()` -- always succeeds
- Verify `name` is `'none'`
- Verify returned ticket shape matches WorkTicket interface

**Mocking needed**: None -- this is pure logic

### 1.5 Adapter Factory (`packages/luca-framework/src/adapters/index.ts`)

**Function**: `createWorkTrackerAdapter(type: WorkTrackerType, config?: WorkTrackerConfig): WorkTrackerContract`

**Key edge cases to test**:
- `createWorkTrackerAdapter('jira', {...})` -- returns Jira adapter
- `createWorkTrackerAdapter('github', {...})` -- returns GitHub adapter
- `createWorkTrackerAdapter('none')` -- returns placeholder adapter
- Default case (unknown type) -- returns placeholder adapter
- Config passthrough to each adapter constructor

### 1.6 Recommended Contract Test Suite

Create `__tests__/packages/luca-framework/src/adapters/work-tracker-contract.test.ts`:
- Parameterized test that validates each adapter returns correct `AdapterResult` shape
- Validates `.name` property matches expected type
- Validates `getTicket()` returns proper `WorkTicket` structure on success
- Validates `validate()` returns proper result on success
- Tests that optional methods are either undefined or functional

---

## 2. Commands

All command source files live in `packages/luca-framework/src/commands/`.

### 2.1 Init Command (`packages/luca-framework/src/commands/init.ts`)

**Entry point**: `initCommand` (citty `defineCommand`)

**Flow**:
1. `setupCleanupHandler()` -- registers SIGINT handler
2. `detectProjectContext()` -- checks package.json, git, existing Luca
3. If `context.hasLuca` is true, exits with error
4. Config resolution (three modes):
   a. `args.config` -- `loadConfigFromFile(args.config)` (file mode)
   b. `args.quick` or explicit args -- `createConfigFromArgs(args)` (quick mode)
   c. Otherwise -- `runWizard(context)` (interactive mode)
5. `generateFiles({ config })` -- generates all framework files
6. Success output via `p.outro()` and `logger.box()`

**Dependencies to mock**:
- `@clack/prompts` (for `p.outro`, `p.cancel`)
- `../utils/detect` (`detectProjectContext`)
- `../utils/wizard` (`runWizard`, `createConfigFromArgs`, `loadConfigFromFile`)
- `../utils/files` (`generateFiles`, `setupCleanupHandler`)
- `../utils/logger` (`logger`)
- `process.exit` (to prevent test process from exiting)

**Key edge cases to test**:
- Init when Luca already installed (`context.hasLuca === true`)
- Config file mode -- valid file
- Config file mode -- file not found / bad JSON
- Quick mode with defaults
- Quick mode with explicit args
- Interactive mode -- wizard returns config
- Interactive mode -- wizard returns null (cancelled)
- File generation success
- File generation failure (`result.success === false`)

### 2.2 Update Command (`packages/luca-framework/src/commands/update.ts`)

**Entry point**: `updateCommand` (citty `defineCommand`)

**Flow**:
1. Read manifest via `readManifest(cwd)`
2. If no manifest, exit with error
3. Validate conflicting options (`--accept-theirs` + `--accept-mine`)
4. Get new framework files via `getNewFrameworkFiles(config, cwd)`
5. Compare files via `compareFiles(manifest, newFiles, cwd)`
6. Show summary
7. Handle `--dry-run`
8. Handle conflicts (interactive prompt or args)
9. Create backup
10. Apply updates via `applyUpdates()`
11. Handle conflict files
12. Update manifest
13. Clean up backup

**Internal functions** (module-scoped):
- `getAllFiles(dir, baseDir)` -- recursive file listing
- `isTemplateFile(filename)` -- checks extension
- `getNewFrameworkFiles(config, cwd)` -- processes all templates
- `showDryRunSummary(comparisons)` -- display-only
- `createBackup(manifest, cwd)` -- copies tracked files
- `restoreBackup(backupDir, cwd)` -- restores on failure
- `handleConflicts(conflicts, newFiles, cwd)` -- writes `.new` files
- `applyUpdates(comparisons, newFiles, cwd, options)` -- writes updated files
- `updateManifestAfterUpdate(manifest, updatedFiles, newFiles, cwd)` -- updates manifest

**Dependencies to mock**:
- `fs/promises` (`readFile`, `writeFile`, `cp`, `rm`, `mkdir`, `readdir`)
- `fs` (`existsSync`)
- `fs-extra` (`ensureDir`)
- `@clack/prompts` (`p.spinner`, `p.select`, `p.isCancel`, `p.outro`, `p.cancel`)
- `../utils/manifest` (`readManifest`, `writeManifest`, `compareFiles`, `hashContent`)
- `../utils/template` (`getTemplatesDir`, `processTemplate`, `processFilename`)
- `../utils/branding` (`createBrandingContext`)
- `../utils/logger` (`logger`)
- `process.cwd`, `process.exit`

**Key edge cases to test**:
- No manifest (Luca not installed)
- Conflicting `--accept-theirs` + `--accept-mine`
- Dry run mode
- Nothing to update (all files up to date)
- Files with conflicts -- interactive prompt
- Files with conflicts -- `--force`
- Files with conflicts -- `--accept-theirs`
- Files with conflicts -- `--accept-mine`
- Backup creation and restoration on failure
- User cancels conflict resolution

**Recommendation**: This is the most complex command. Test `applyUpdates()` and `handleConflicts()` as unit functions using real temp directories. The overall `run()` may be better suited to integration-level tests or heavily mocked.

### 2.3 Doctor Command (`packages/luca-framework/src/commands/doctor.ts`)

**Entry point**: `default export` (citty `defineCommand`)

**Flow**: Simply calls `executeDoctor()` and exits with returned code.

**Dependencies to mock**: `../utils/doctor` (`executeDoctor`)

**Key edge cases**: Minimal -- just verify `process.exit` is called with the right code.

---

## 3. Utils

All utility files live in `packages/luca-framework/src/utils/`.

### 3.1 Logger (`utils/logger.ts`)

**Type**: Wrapper around `consola` -- mostly pass-through.

**Exports**: `logger` object with methods: `start`, `success`, `info`, `warn`, `error`, `debug`, `box`, `step`. Also re-exports `consola`.

**Test value**: Low. This is a thin wrapper. Could verify `step` formats correctly (`[N/M] message`), but mocking consola output is not high value.

**Used by**: Nearly every module.

### 3.2 Detect (`utils/detect.ts`)

**Type**: I/O (filesystem checks, package.json reading)

**Exports**:
- `detectProjectContext(cwd?)` -- async, reads filesystem
- `formatStack(stack)` -- pure function, maps stack enum to display string

**External deps**: `fs` (`existsSync`), `pkg-types` (`readPackageJSON`), `pathe` (`join`)

**Key edge cases to test**:
- No package.json (catch branch)
- package.json with react + typescript deps
- package.json with only typescript
- package.json with neither
- Existing `.git` directory
- Existing `.cursor/luca` directory (hasLuca)
- `tsconfig.json` detection
- `formatStack` -- all 5 enum values

**Used by**: `init.ts`, `wizard.ts`

### 3.3 Wizard (`utils/wizard.ts`)

**Type**: I/O (interactive prompts via @clack/prompts)

**Exports**:
- `runWizard(context)` -- async, interactive prompts (returns `LucaConfig | null`)
- `createConfigFromArgs(args)` -- pure function, merges args with defaults
- `loadConfigFromFile(configPath)` -- async, reads JSON file

**External deps**: `@clack/prompts`, `fs/promises` (`readFile`)

**Key edge cases to test**:
- `runWizard` -- user completes all prompts
- `runWizard` -- user cancels at branding group
- `runWizard` -- user cancels at stack selection
- `runWizard` -- user cancels at work tracker selection
- `runWizard` -- user cancels at confirmation
- `createConfigFromArgs({})` -- all defaults
- `createConfigFromArgs({ name: 'MyBot', prefix: 'mb', stack: 'react-ts', tracker: 'github' })` -- all explicit
- `loadConfigFromFile('valid.json')` -- parses correctly
- `loadConfigFromFile('bad.json')` -- throws on invalid JSON
- `loadConfigFromFile('missing.json')` -- throws on missing file

**Used by**: `init.ts`

### 3.4 Files (`utils/files.ts`)

**Type**: I/O (filesystem creation, template copying)

**Exports**:
- `cleanupFiles()` -- removes tracked paths in reverse order
- `setupCleanupHandler()` -- registers SIGINT handler
- `generateFiles(options)` -- creates all Luca directories and copies templates

**External deps**: `fs/promises` (`rm`), `fs` (`existsSync`), `pathe` (`join`), `fs-extra` (`ensureDir`), `@clack/prompts` (`p.spinner`)

**Side effects**: Module-scoped `createdPaths` array, `process.on('SIGINT', ...)` registration.

**Key edge cases to test**:
- `generateFiles` -- creates all expected directories
- `generateFiles` -- copies base templates
- `generateFiles` -- copies stack-specific templates (non-custom)
- `generateFiles` -- skips stack templates for 'custom'
- `generateFiles` -- creates manifest
- `generateFiles` -- cleanup on error
- `cleanupFiles` -- removes paths in reverse order
- `cleanupFiles` -- handles errors silently

**Recommendation**: Use real temp directories for filesystem tests, not mocked fs.

**Used by**: `init.ts`

### 3.5 Branding (`utils/branding.ts`)

**Type**: Pure logic (no I/O)

**Exports**:
- `defaultBranding` -- constant object
- `validateBrandingField(field, value)` -- validates single field
- `validateBranding(branding)` -- validates all fields
- `createBrandingContext(branding)` -- creates template context with computed helpers
- `mergeBranding(userBranding)` -- merges with defaults

**Key edge cases to test**:
- `validateBrandingField('frameworkName', '')` -- required
- `validateBrandingField('frameworkName', 'a')` -- too short (min 2)
- `validateBrandingField('frameworkName', 'A'.repeat(21))` -- too long (max 20)
- `validateBrandingField('frameworkName', '123')` -- must start with letter
- `validateBrandingField('frameworkName', 'Valid-Name')` -- passes
- `validateBrandingField('commandPrefix', 'LU')` -- must be lowercase
- `validateBrandingField('commandPrefix', 'lu')` -- passes
- `validateBrandingField('ticketPattern', '[invalid')` -- invalid regex
- `validateBrandingField('ticketPattern', '[A-Z]+-\\d+')` -- valid regex
- `validateBrandingField('placeholderTicket', 'bad')` -- must match PROJ-0000 pattern
- `validateBranding` -- aggregated validation, partial configs
- `createBrandingContext` -- verify computed `commandSlash`, `nameUppercase`, `nameLowercase`
- `mergeBranding` -- fills defaults, filters undefined values

**Used by**: `wizard.ts`, `template.ts`, `files.ts`, `update.ts`

### 3.6 Template (`utils/template.ts`)

**Type**: Mixed (pure template processing + I/O for copying)

**Exports**:
- `processTemplate(content, context)` -- async, uses EJS `render()` (pure computation)
- `processFilename(filename, context)` -- pure, replaces `__variable__` patterns
- `copyTemplates(options)` -- async I/O, reads/writes files
- `getTemplatesDir()` -- I/O-adjacent (uses `import.meta.url`)

**External deps**: `ejs` (`render`), `fs/promises` (`readFile`, `writeFile`, `readdir`, `copyFile`), `fs-extra` (`ensureDir`), `url` (`fileURLToPath`)

**Key edge cases to test**:
- `processTemplate` -- simple variable substitution (`<%= var %>`)
- `processTemplate` -- nested variable access
- `processTemplate` -- undefined variable (strict: false, so no error)
- `processFilename` -- single variable (`__commandPrefix__-help.md`)
- `processFilename` -- nested path (`__branding.commandPrefix__-help.md`)
- `processFilename` -- no match (returns original)
- `processFilename` -- nonexistent path in context (returns original `__unknown__`)
- `copyTemplates` -- template files are processed with EJS
- `copyTemplates` -- binary files are copied as-is
- `copyTemplates` -- filenames with `__variable__` patterns are substituted
- `getTemplatesDir` -- resolves correct path from source vs dist context

**Used by**: `files.ts`, `update.ts`

### 3.7 Manifest (`utils/manifest.ts`)

**Type**: Mixed (I/O for file read/write + pure hashing)

**Exports**:
- `hashFile(filePath)` -- async, reads file + SHA-256
- `createManifest(options)` -- async, hashes created files
- `writeManifest(manifest, cwd)` -- async, writes JSON
- `readManifest(cwd)` -- async, reads JSON (returns null on error)
- `hashContent(content)` -- pure, SHA-256 of string
- `compareFiles(manifest, newFiles, cwd)` -- async, three-way comparison

**External deps**: `fs/promises` (`readFile`, `writeFile`), `fs` (`existsSync`), `crypto` (`createHash`)

**Key edge cases to test**:
- `hashContent` -- deterministic output for known input
- `hashFile` -- hashes file content correctly
- `readManifest` -- valid JSON file
- `readManifest` -- missing file (returns null)
- `readManifest` -- invalid JSON (returns null)
- `writeManifest` -- writes formatted JSON to correct path
- `createManifest` -- hashes all created files, skips unhashable (directories)
- `compareFiles` -- unchanged file (original hash === current hash)
- `compareFiles` -- user-modified file (hashes differ)
- `compareFiles` -- deleted file (missing from filesystem)
- `compareFiles` -- new file (not in manifest)
- `compareFiles` -- unreadable file (treated as deleted)

**Used by**: `files.ts`, `update.ts`

### 3.8 Version Check (`utils/version-check.ts`)

**Type**: I/O (reads package.json, spawns background process)

**Exports**: `checkForUpdates()` -- synchronous, uses `update-notifier`

**External deps**: `fs` (`readFileSync`), `update-notifier`, `url` (`fileURLToPath`)

**Side effects**: Background subprocess, file reads at import/call time.

**Key edge cases to test**:
- Package.json found -- notifier initialized
- Package.json not found (all paths fail) -- silently returns
- Error during initialization -- silently caught

**Test value**: Low-medium. Mostly third-party behavior. Verify it doesn't throw.

**Used by**: CLI entry point (startup)

### 3.9 Doctor Subsystem (`utils/doctor/`)

**Types** (`utils/doctor/types.ts`):
- `CheckResult`: `{ name, status: 'pass'|'fail'|'warning', message, fixCommand, details }`
- `DoctorCheck`: `{ name, run(): Promise<CheckResult> }`

**Executor** (`utils/doctor/index.ts`):
- `executeDoctor()` -- runs all checks in parallel, formats output, returns exit code

**Checks** (`utils/doctor/checks/`):

| Check | File | What it does | External deps |
|-------|------|-------------|---------------|
| `nodeVersionCheck` | `node-version.ts` | Checks `process.version >= 18` | `process.version` |
| `cursorIdeCheck` | `cursor-ide.ts` | Checks for Cursor IDE installation | `fs.existsSync`, `process.platform`, `process.env.HOME` |
| `configValidationCheck` | `config-validation.ts` | Validates `.planning/config.json` exists and is valid | `fs.existsSync`, `fs/promises.readFile`, `process.cwd` |

**Key edge cases to test**:
- `nodeVersionCheck` -- Node >= 18 (pass), Node < 18 (fail)
- `cursorIdeCheck` -- macOS with Cursor installed, macOS without, Linux, Windows
- `configValidationCheck` -- config.json missing, invalid JSON, missing required fields, manifest missing (warning), all valid (pass)
- `executeDoctor` -- all pass (exit 0), one fail (exit 1), warnings only (exit 0), mixed results

**Mocking needed**: `process.version`, `process.platform`, `process.env`, `fs.existsSync`, `process.cwd()`

---

## 4. Base Classes and Schemas

All files in `src/` at the monorepo root.

### 4.1 Agent System

**Base class** (`src/agents/base/base-agent.ts`):
- `BaseAgentImpl` (abstract class)
- Constructor: validates config with `agentConfigSchema.parse(config)`, stores as `_config`
- Getters: `config`, `name`, `description`
- `toCursorFormat()`: generates frontmatter + sections sorted by order, wrapped in XML-like tags
- `toClaudeFormat()`: generates `# Name` + `## Section` markdown format

**Schemas** (`src/agents/types/agent.schemas.ts`):
- `agentFrontmatterSchema`: `z.object({ name: z.string(), description: z.string(), tools: z.array(z.string()).optional(), color: z.string().optional() })`
- `agentSectionSchema`: `z.object({ title: z.string(), content: z.string(), order: z.number().optional() })`
- `agentConfigSchema`: `z.object({ frontmatter: agentFrontmatterSchema, sections: z.array(agentSectionSchema) })`

**Types** (`src/agents/types/agent.types.ts`):
- Interfaces: `AgentFrontmatter`, `AgentSection`, `AgentConfig`, `BaseAgent`

**Key test cases**:
- Schema validation: valid config passes, missing required fields fails, extra fields handled
- `BaseAgentImpl` constructor: validates via Zod, throws ZodError on invalid config
- `toCursorFormat()`: produces `---` frontmatter + XML-tagged sections, sorted by order
- `toClaudeFormat()`: produces `# Name` + `## Section` format
- Sections with missing `order` default to 0

### 4.2 Skill System

**Base class** (`src/skills/base/base-skill.ts`):
- `BaseSkillImpl` (abstract class) -- identical structure to `BaseAgentImpl`

**Schemas** (`src/skills/types/skill.schemas.ts`):
- `skillFrontmatterSchema`: `z.object({ name: z.string(), description: z.string(), 'disable-model-invocation': z.boolean().optional() })`
- `skillSectionSchema`: same as agent
- `skillConfigSchema`: `z.object({ frontmatter: skillFrontmatterSchema, sections: z.array(skillSectionSchema) })`

**Key test cases**: Same pattern as agents, plus `disable-model-invocation` optional boolean field.

### 4.3 Rule System

**Base class** (`src/rules/base/base-rule.ts`):
- `BaseRuleImpl` (abstract class)
- Different `name` getter: uses first 30 chars of description, replacing spaces with dashes

**Schemas** (`src/rules/types/rule.schemas.ts`):
- `ruleFrontmatterSchema`: `z.object({ description: z.string(), globs: z.array(z.string()).optional(), alwaysApply: z.boolean().optional() })`
- `ruleSectionSchema`: same as agent/skill
- `ruleConfigSchema`: same structure

**Key test cases**: Same as agents, plus:
- `name` getter truncation and dash replacement
- `globs` and `alwaysApply` optional fields in schema
- `toClaudeFormat()` uses description (not name) as heading

### 4.4 Schema Validation Tests for 104 Agent/Skill/Rule Files

There are approximately:
- 30 agent files in `src/agents/general/` + 2 in `src/agents/luca/`
- 42 skill files in `src/skills/general/` + 1 in `src/skills/luca/`
- 24 rule files in `src/rules/general/` + 1 in `src/rules/`

**Pattern**: Each file exports a class that extends `BaseAgentImpl`/`BaseSkillImpl`/`BaseRuleImpl` and passes a config to `super()`. The constructor call validates via Zod automatically.

**Test approach**: A single parameterized test file that:
1. Dynamically imports each module
2. Instantiates the exported class
3. Asserts no ZodError is thrown
4. Optionally verifies `.name` and `.description` are non-empty strings

**Recommended file**: `__tests__/src/schema-validation.test.ts`

---

## 5. Compilers

All files in `src/compilers/`.

### 5.1 Base Compiler (`src/compilers/base.compiler.ts`)

**Abstract class** with:
- `abstract compileAgent(agent, format)`
- `abstract compileSkill(skill, format)`
- `abstract compileRule(rule, format)`
- `protected validateFormat(format)` -- throws if format is not `'CURSOR'` or `'CLAUDE'`

**Type**: `SupportedFormat = 'CURSOR' | 'CLAUDE'`

### 5.2 Cursor Compiler (`src/compilers/cursor.compiler.ts`)

Extends `BaseCompiler`. Each method:
1. Calls `this.validateFormat(format)`
2. Calls `entity.toCursorFormat()`

### 5.3 Claude Compiler (`src/compilers/claude.compiler.ts`)

Extends `BaseCompiler`. Each method:
1. Calls `this.validateFormat(format)`
2. Calls `entity.toClaudeFormat()`

**Key test cases**:
- `validateFormat('CURSOR')` -- no error
- `validateFormat('CLAUDE')` -- no error
- `validateFormat('INVALID' as any)` -- throws Error
- `CursorCompiler.compileAgent(agent, 'CURSOR')` -- returns `agent.toCursorFormat()` result
- `CursorCompiler.compileAgent(agent, 'INVALID')` -- throws
- `ClaudeCompiler.compileSkill(skill, 'CLAUDE')` -- returns `skill.toClaudeFormat()` result
- Same pattern for all compile methods

**Mocking needed**: None -- use real base class instances with minimal configs.

---

## 6. Shared Utilities

All files in `src/shared/`.

### 6.1 Constants (`src/shared/constants.ts`)

**Exports**: `FRAMEWORK_NAME`, `CURSOR_DIR`, `AGENT_DIR`, `SKILL_DIR`, `RULE_DIR`, `LUCA_SUBDIR`, `SUPPORTED_FORMATS`

**Test value**: None -- these are string constants. No logic to test.

### 6.2 Utils (`src/shared/utils.ts`)

**Exports**:
- `formatFrontmatter(frontmatter)` -- converts object to YAML frontmatter string (`---` delimited)
- `escapeMarkdown(content)` -- currently a no-op (returns content unchanged)
- `generateFileName(name, extension)` -- returns `name.extension`

**Key test cases for `formatFrontmatter`**:
- String values: `key: "value"`
- Boolean values: `key: true`
- Array values: multiline with `  - item` format
- Nested objects: multiline with `  subKey: subValue` format
- Empty object
- Mixed types

**Key test cases for others**:
- `escapeMarkdown` -- returns input unchanged (but document it's a no-op)
- `generateFileName('agent', 'md')` -- returns `'agent.md'`

**Used by**: All three base classes (`BaseAgentImpl`, `BaseSkillImpl`, `BaseRuleImpl`)

### 6.3 Validation Utils (`src/shared/validation-utils.ts`)

**Exports**:
- `validateAgentConfig(config)` -- calls `agentConfigSchema.parse(config)`, throws on invalid
- `validateSkillConfig(config)` -- calls `skillConfigSchema.parse(config)`, throws on invalid
- `validateRuleConfig(config)` -- calls `ruleConfigSchema.parse(config)`, throws on invalid
- `safeValidateAgentConfig(config)` -- returns `{ success, data?, error? }` (no throw)
- `safeValidateSkillConfig(config)` -- same pattern
- `safeValidateRuleConfig(config)` -- same pattern

**Key test cases**:
- Each `validate*` function with valid config -- returns validated data
- Each `validate*` function with invalid config -- throws ZodError
- Each `safeValidate*` function with valid config -- `{ success: true, data }`
- Each `safeValidate*` function with invalid config -- `{ success: false, error }`

### 6.4 Validation Index (`src/shared/validation/index.ts`)

**ISSUE FOUND**: This file re-exports from `./validation-utils`, but `validation-utils.ts` is located at `src/shared/validation-utils.ts`, not `src/shared/validation/validation-utils.ts`. This is a broken import path. The file at `src/shared/validation/index.ts` contains:

```typescript
export * from './validation-utils';
```

But there is no `src/shared/validation/validation-utils.ts` file. This will fail at runtime if imported.

**Recommendation**: Note this as a bug to fix, or skip testing this barrel file.

---

## 7. Build Scripts

All files in `scripts/`.

### 7.1 Script Inventory (9 scripts)

| Script | Purpose |
|--------|---------|
| `build-cursor.ts` | Compiles Luca agents/skills/rules to Cursor format |
| `build-claude.ts` | Compiles to Claude format (includes all skills via registry) |
| `build-all.ts` | Compiles to both Cursor and Claude formats |
| `compile-to-cursor.ts` | Earlier version of cursor compilation |
| `compile-all-to-cursor.ts` | Dynamic module discovery + compilation |
| `prepare-compilation.ts` | Generates manifest + build scripts |
| `generate-agents-from-cursor.ts` | Reverse: parses Cursor .md files to TS agent files |
| `generate-skills-from-cursor.ts` | Reverse: parses Cursor .md files to TS skill files |
| `generate-rules-from-cursor.ts` | Reverse: parses Cursor .md files to TS rule files |

### 7.2 Pattern Analysis

All build scripts follow the same pattern:
1. Import agent/skill/rule classes and compiler
2. Create output directory structure
3. Instantiate each class
4. Call compiler to produce output format
5. Write to filesystem
6. Log results

The generate-from-cursor scripts follow:
1. Read `.cursor/agents/*.md` (or skills/rules)
2. Parse frontmatter from markdown
3. Generate TypeScript class files
4. Write to `src/` directory

### 7.3 What "Smoke Testing" Means

For build scripts, smoke testing means:
- **Run the script**: Execute `bun run scripts/build-cursor.ts` (or each script)
- **Verify exit code**: Process exits with code 0 (no uncaught errors)
- **Verify output exists**: Check that expected output files were created
- **Do NOT verify output content**: That is the compiler's job, already tested separately

**Recommended approach**:
- Run each script in a subprocess using `Bun.spawn` or `execa`
- Use a temp directory for output (override `process.cwd()` or set env var)
- Verify script exits cleanly
- Check that at least one output file was created

**Alternative (simpler)**: Since these scripts import and instantiate the same classes we test elsewhere, the smoke test can just verify the imports work and classes instantiate without error. The fs writes can be skipped if that is too fragile.

---

## 8. Bun Test Configuration

### 8.1 Current State

- **No `bunfig.toml`**: Does not exist in root or any package directory
- **No test scripts**: No `"test"` script in root or `packages/luca-framework/package.json`
- **No existing tests**: Zero `.test.ts` files in the project (excluding `node_modules`)
- **No test infrastructure**: Clean slate

### 8.2 Required `bunfig.toml`

Create at the monorepo root (`/bunfig.toml`):

```toml
[test]
# Run tests matching this glob pattern
root = "."

# Coverage configuration
coverage = true
coverageDir = "coverage"

# Only report coverage for source files
coverageReporter = ["text", "lcov"]

# Threshold is report-only, not enforced
coverageThreshold = { line = 80 }
```

**Note on coverage**: Bun's built-in coverage uses `--coverage` flag at runtime. As of Bun 1.x, coverage configuration in `bunfig.toml` supports `[test]` section with coverage options. The `bun test --coverage` flag generates a coverage report.

### 8.3 Required `package.json` Changes

**Root `package.json`** -- add test scripts:

```json
{
  "scripts": {
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "test:watch": "bun test --watch"
  }
}
```

**`packages/luca-framework/package.json`** -- add test script:

```json
{
  "scripts": {
    "test": "bun test"
  }
}
```

### 8.4 How `bun:test` Coverage Works

- Run `bun test --coverage` to generate a coverage report
- Bun prints a text coverage summary to stdout by default
- For CI integration, use `--coverage-reporter=lcov` to generate `lcov.info`
- Coverage measures lines, branches, and functions
- `bun:test` supports `mock.module()` for module-level mocking -- this is the key feature we need
- `bun:test` supports `describe`, `test`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`
- `bun:test` supports `spyOn` for function spying
- `bun:test` supports snapshot testing via `expect(value).toMatchSnapshot()`
- Temp directories: use `import { tmpdir } from 'os'` + `mkdtemp` or `Bun.write` to temp paths

### 8.5 Module Mocking with `bun:test`

```typescript
import { mock, test, expect } from "bun:test";

// Mock an entire module
mock.module("execa", () => ({
  execa: async () => ({ stdout: '{"number": 1, "title": "Test"}' })
}));

// Then import the module under test AFTER mock setup
const { createGitHubAdapter } = await import("../src/adapters/github-adapter");
```

**Important**: `mock.module()` must be called BEFORE the module under test is imported. This means dynamic imports (`await import(...)`) inside tests, or mock setup in `beforeAll`.

### 8.6 Recommended Directory Structure

```
__tests__/
├── utils/
│   ├── mock-execa.ts          # Shared execa mock factory
│   ├── mock-fetch.ts          # Shared fetch mock factory
│   ├── mock-fs.ts             # Shared filesystem mock helpers
│   ├── mock-clack.ts          # Shared @clack/prompts mock
│   ├── fixtures.ts            # Test fixture data (configs, manifests, etc.)
│   └── temp-dir.ts            # Temp directory helper (create/cleanup)
├── packages/
│   └── luca-framework/
│       └── src/
│           ├── adapters/
│           │   ├── github-adapter.test.ts
│           │   ├── jira-adapter.test.ts
│           │   ├── placeholder-adapter.test.ts
│           │   ├── adapter-factory.test.ts
│           │   └── work-tracker-contract.test.ts
│           ├── commands/
│           │   ├── init.test.ts
│           │   ├── update.test.ts
│           │   └── doctor.test.ts
│           └── utils/
│               ├── branding.test.ts
│               ├── detect.test.ts
│               ├── wizard.test.ts
│               ├── files.test.ts
│               ├── template.test.ts
│               ├── manifest.test.ts
│               ├── version-check.test.ts
│               └── doctor/
│                   ├── executor.test.ts
│                   └── checks/
│                       ├── node-version.test.ts
│                       ├── cursor-ide.test.ts
│                       └── config-validation.test.ts
├── src/
│   ├── agents/
│   │   └── base/
│   │       └── base-agent.test.ts
│   ├── skills/
│   │   └── base/
│   │       └── base-skill.test.ts
│   ├── rules/
│   │   └── base/
│   │       └── base-rule.test.ts
│   ├── compilers/
│   │   ├── cursor-compiler.test.ts
│   │   ├── claude-compiler.test.ts
│   │   └── base-compiler.test.ts
│   ├── shared/
│   │   ├── utils.test.ts
│   │   └── validation-utils.test.ts
│   └── schema-validation.test.ts      # All 104 agent/skill/rule schema tests
└── scripts/
    └── build-smoke.test.ts             # Smoke tests for all 9 build scripts
```

Total estimated test files: ~30

---

## 9. Issues Found During Research

### 9.1 Broken Import Path

`src/shared/validation/index.ts` re-exports from `./validation-utils`, but that file does not exist at `src/shared/validation/validation-utils.ts`. The actual validation utils file is at `src/shared/validation-utils.ts` (one directory up). This barrel file will fail at runtime.

### 9.2 Import Issues in `agent.types.ts` and Similar

`src/agents/types/agent.types.ts` re-exports `BaseAgentSchema` from `./agent.schemas`, but `agent.schemas.ts` does not export any type named `BaseAgentSchema`. Same issue in `skill.types.ts` (exports `BaseSkillSchema`) and `rule.types.ts` (exports `BaseRuleSchema`). These are phantom re-exports that will cause TypeScript compilation errors if consumed.

### 9.3 `src/shared/utils.ts` Import Issue

`src/shared/utils.ts` imports from `'../types/agent.types'` which resolves to `src/types/agent.types.ts` -- a file that doesn't exist. The agent types are at `src/agents/types/agent.types.ts`. However, the import names (`AgentFrontmatter`, `SkillFrontmatter`, `RuleFrontmatter`) are not actually used in the file (the function just takes `Record<string, any>`), so this may be a dead import that Bun tolerates due to `verbatimModuleSyntax`.

### 9.4 Side Effect Concerns

- `version-check.ts` uses `readFileSync` at call time and spawns background processes
- `files.ts` has module-scoped mutable state (`createdPaths` array) that persists across tests
- `logger.ts` creates global `consola` instances

These will need careful test isolation (module re-imports or mock resets between tests).

---

## 10. Prioritized Test Implementation Order

Based on CONTEXT.md decisions (I/O first, pure logic second):

### Tier 1: I/O Layer (Highest value, most likely to contain bugs)

1. **Adapter tests** (3 adapters + factory + contract) -- foundation for git workflow
2. **Command tests** (init, update, doctor) -- user-facing entry points
3. **Template/Files tests** -- file generation correctness
4. **Wizard tests** -- interactive prompt logic
5. **Manifest tests** -- update safety (three-way comparison)
6. **Detect tests** -- project context detection

### Tier 2: Pure Logic (Easy wins, lower risk)

7. **Branding tests** -- validation rules, context generation
8. **Shared utils tests** -- formatFrontmatter
9. **Validation utils tests** -- schema validation wrappers
10. **Base class tests** -- constructor validation, format generation
11. **Compiler tests** -- format delegation

### Tier 3: Bulk Validation

12. **Schema validation sweep** -- all 104 agent/skill/rule files
13. **Build script smoke tests** -- all 9 scripts

### Tier 4: Low Priority

14. **Logger tests** -- thin wrapper, minimal value
15. **Version check tests** -- third-party behavior
16. **Doctor check tests** -- environment-specific, hard to mock reliably

---

## 11. Shared Test Utilities Needed

### `__tests__/utils/mock-execa.ts`
- Factory that returns mock execa with configurable stdout/stderr/exitCode
- Supports per-call configuration (first call succeeds, second fails)
- Used by: GitHub adapter tests, command tests

### `__tests__/utils/mock-fetch.ts`
- Factory that returns mock fetch with configurable response (status, body, headers)
- Supports `Response` object creation
- Used by: Jira adapter tests

### `__tests__/utils/mock-clack.ts`
- Factory that configures `@clack/prompts` mock responses
- Pre-configured "complete wizard" and "cancel at step N" scenarios
- Used by: wizard tests, init command tests, update command tests

### `__tests__/utils/temp-dir.ts`
- `createTempDir()` -- creates temp directory, returns path
- `cleanupTempDir(path)` -- removes temp directory
- `setupTempProject(files)` -- creates a temp dir with specified file structure
- Used by: manifest tests, files tests, template tests, detect tests

### `__tests__/utils/fixtures.ts`
- `validLucaConfig` -- complete valid LucaConfig object
- `validBrandingConfig` -- complete valid BrandingConfig
- `validManifest` -- complete valid LucaManifest
- `validAgentConfig` -- complete valid AgentConfig
- `validSkillConfig` -- complete valid SkillConfig
- `validRuleConfig` -- complete valid RuleConfig
- `validGitHubIssueResponse` -- mock GitHub issue JSON
- `validJiraIssueResponse` -- mock Jira issue JSON (with ADF)
- Used by: nearly all test files

---

*Research complete. Ready for planning phase.*
