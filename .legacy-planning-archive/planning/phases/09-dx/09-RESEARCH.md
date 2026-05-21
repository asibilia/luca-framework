# Phase 09: Developer Experience — Research Findings

**Researcher:** lu-phase-researcher
**Date:** 2026-02-10
**Status:** Complete
**Scope:** CLI UX, error messages, documentation accuracy, onboarding flow, config validation, build scripts

---

## Summary

| Metric | Count |
|--------|-------|
| **Total findings** | 28 |
| HIGH severity | 8 |
| MEDIUM severity | 12 |
| LOW severity | 8 |

### By Domain

| Domain | HIGH | MEDIUM | LOW | Total |
|--------|------|--------|-----|-------|
| Error Messages | 2 | 4 | 2 | 8 |
| Config Validation | 2 | 1 | 0 | 3 |
| Init Wizard Edge Cases | 1 | 2 | 1 | 4 |
| Help Text / CLI Metadata | 1 | 1 | 1 | 3 |
| Documentation | 1 | 3 | 2 | 6 |
| Build Scripts | 1 | 1 | 2 | 4 |

---

## Domain 1: Error Messages

### DX-001: `init` — Non-actionable "Installation failed" error
- **Location:** `packages/luca-framework/src/commands/init.ts:91`
- **Severity:** HIGH
- **Description:** When `generateFiles()` returns `success: false`, the user sees only `"Installation failed"` with no context on what went wrong or how to fix it. The error string from `generateFiles()` is available in the result but is not logged.
- **Code:**
  ```typescript
  if (!result.success) {
    logger.error('Installation failed');
    process.exit(1);
  }
  ```
- **Suggested Fix:** Log the actual error from the result: `logger.error('Installation failed: ' + result.error)`. Add an actionable suggestion like "Check file permissions, disk space, or run with --verbose for details."

### DX-002: `init` — Config file error is raw exception, not user-friendly
- **Location:** `packages/luca-framework/src/commands/init.ts:66`
- **Severity:** MEDIUM
- **Description:** When `loadConfigFromFile()` fails, the raw error object is interpolated into a string: `"Failed to read config file: ${error}"`. This may produce `[object Object]` or stack traces in the output. It should extract `.message` from Error instances and provide guidance on expected format.
- **Code:**
  ```typescript
  logger.error(`Failed to read config file: ${error}`);
  ```
- **Suggested Fix:** Use `error instanceof Error ? error.message : String(error)` and add a hint about expected JSON format, e.g., "See docs for config file format."

### DX-003: `init` — Existing Luca project error suggests `npx luca update` but that may not be the intent
- **Location:** `packages/luca-framework/src/commands/init.ts:52-54`
- **Severity:** LOW
- **Description:** When Luca is already installed, the error message says "Run `npx luca update`" but does not mention `--force` or re-initialization. Users who want to reinitialize have no guidance.
- **Suggested Fix:** Add a `--force` flag to init command that bypasses this check, and mention it in the error message: "To reinitialize, run `npx luca init --force`."

### DX-004: `update` — Conflicting flags error is not actionable
- **Location:** `packages/luca-framework/src/commands/update.ts:355`
- **Severity:** MEDIUM
- **Description:** `"Cannot use both --accept-theirs and --accept-mine"` tells the user what's wrong but doesn't say what to do. Should suggest choosing one strategy.
- **Suggested Fix:** Add: "Use --accept-theirs to overwrite your changes, or --accept-mine to keep them."

### DX-005: `update` — Failure error shows raw error, no recovery guidance
- **Location:** `packages/luca-framework/src/commands/update.ts:481-485`
- **Severity:** MEDIUM
- **Description:** On update failure, the user sees `"Update failed, restoring backup..."` followed by `"Error: <message>"` but no guidance on what to try next (re-run, check logs, file an issue).
- **Suggested Fix:** Add recovery guidance: "Backup has been restored. Try running `luca doctor` to diagnose the issue, or file a bug report."

### DX-006: `doctor` — `--verbose` flag is accepted but never read
- **Location:** `packages/luca-framework/src/commands/doctor.ts:11-15` and `packages/luca-framework/src/utils/doctor/index.ts:67`
- **Severity:** HIGH
- **Description:** The doctor command declares a `--verbose` arg in its citty definition, but `run()` does not destructure or use `args`. The `executeDoctor()` function takes no parameters and does not receive the verbose flag. Yet the error message at line 67 says "Run with --verbose for more details" — this feature is completely non-functional.
- **Code:**
  ```typescript
  // doctor.ts — args.verbose is never passed
  async run() {
    const exitCode = await executeDoctor();
    process.exit(exitCode);
  }
  // index.ts — suggests --verbose but it does nothing
  logger.error('Some checks failed. Run with --verbose for more details.');
  ```
- **Suggested Fix:** Either implement verbose mode (pass flag to executeDoctor, show additional details per check) or remove the --verbose flag and the message referencing it.

### DX-007: `doctor` — References non-existent `--force` and `--repair` flags
- **Location:** `packages/luca-framework/src/utils/doctor/checks/config-validation.ts:38,49,66`
- **Severity:** MEDIUM
- **Description:** Fix commands suggest `npx luca init --force` (line 38, 66) and `npx luca update --repair` (line 49), but neither `--force` on init nor `--repair` on update exist as implemented flags. Users following these suggestions will get no benefit.
- **Suggested Fix:** Either implement the `--force` flag on init and `--repair` flag on update, or change the fix suggestions to commands that actually work (e.g., "Delete .planning/ directory and run `npx luca init`").

### DX-008: `version-check` — Update notification message references wrong command
- **Location:** `packages/luca-framework/src/utils/version-check.ts:55`
- **Severity:** LOW
- **Description:** The update notification message says `"Run: npx luca update"` but `luca update` updates the framework files in a project, not the luca-framework npm package itself. To update the CLI, users should run `npx luca-framework@latest` or update their package.json.
- **Suggested Fix:** Change message to clarify: "Run: npm install luca-framework@latest" or "Run: bunx luca-framework@latest init".

---

## Domain 2: Config Validation

### DX-009: Regex escaping bug in config.json template (Known from Phase 8)
- **Location:** `packages/luca-framework/templates/base/.planning/config.json:8`
- **Severity:** HIGH
- **Description:** The config.json template uses EJS to inject `branding.ticketPattern` directly into a JSON string value: `"ticketPattern": "<%= branding.ticketPattern %>"`. The default ticketPattern is `[A-Z]+-\d+` (from `branding.ts:12`). After EJS processing, this becomes `"ticketPattern": "[A-Z]+-\d+"` in the output JSON. When `luca doctor` later reads this file with `JSON.parse()`, the `\d` is an invalid JSON escape sequence, causing `"Bad escaped character in JSON at position 183"`.
- **Root Cause Chain:**
  1. `defaultBranding.ticketPattern` = `'[A-Z]+-\\d+'` (TypeScript string, single backslash when evaluated)
  2. EJS template outputs the raw string value into JSON: `"ticketPattern": "[A-Z]+-\d+"`
  3. JSON spec only allows `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`, `\uXXXX` — `\d` is invalid
  4. `JSON.parse()` in config-validation.ts:27 throws SyntaxError
- **Suggested Fix:** Before writing config.json, escape backslashes in regex-containing fields so the JSON output is `"ticketPattern": "[A-Z]+-\\d+"`. This can be done either:
  - (a) In the EJS context by providing a JSON-safe version of the pattern, or
  - (b) By writing config.json with `JSON.stringify()` instead of EJS template, or
  - (c) By post-processing the EJS output to fix JSON string escaping.

### DX-010: Config validation does not validate branding field values
- **Location:** `packages/luca-framework/src/utils/doctor/checks/config-validation.ts:29-31`
- **Severity:** HIGH
- **Description:** The config-validation doctor check only verifies that top-level keys (`branding`, `stack`, `workTracker`) exist. It does not validate the branding sub-fields (`frameworkName`, `commandPrefix`, `ticketPattern`, `placeholderTicket`) or their formats. Invalid branding values (empty strings, special characters) pass doctor checks silently and may cause failures during update or template processing.
- **Suggested Fix:** Reuse the `validateBranding()` function from `branding.ts` to validate all branding fields. Also validate that `stack` is a known value and `workTracker` is one of `'jira' | 'github' | 'none'`.

### DX-011: Config validation error messages don't identify the specific JSON parse issue
- **Location:** `packages/luca-framework/src/utils/doctor/checks/config-validation.ts:61-68`
- **Severity:** MEDIUM
- **Description:** When config.json fails to parse (the catch block), the error message is `"config.json unreadable"` with the raw error. For the regex escaping bug (DX-009), this produces `"Bad escaped character in JSON at position 183"` which does not help the user understand the root cause (regex backslash in JSON) or how to fix it.
- **Suggested Fix:** Add pattern matching for common JSON parse errors. For "Bad escaped character", suggest "Check for unescaped backslashes in regex patterns (ticketPattern). Use double backslashes (\\\\d instead of \\d) in JSON."

---

## Domain 3: Init Wizard Edge Cases

### DX-012: Wizard `onCancel` handler in `p.group` returns null but does not exit
- **Location:** `packages/luca-framework/src/utils/wizard.ts:83-86`
- **Severity:** HIGH
- **Description:** The `onCancel` callback in `p.group()` calls `p.cancel('Setup cancelled.')` and returns `null`, but `@clack/prompts` `p.group()` `onCancel` is expected to either throw or the caller must check. The current code returns `null` from the callback, but `p.group()` may still return a partial result object rather than `null`. The null check on line 90 (`if (!branding) return null`) may not catch all cancel scenarios correctly, depending on `@clack/prompts` behavior.
- **Suggested Fix:** Use `process.exit(0)` in the onCancel handler instead of returning null, consistent with how cancel is handled for `p.select()` calls on lines 110-112 and 125-127. Or throw a cancel sentinel and catch it.

### DX-013: Wizard does not validate that `stack` arg matches available templates
- **Location:** `packages/luca-framework/src/utils/wizard.ts:193`
- **Severity:** MEDIUM
- **Description:** In `createConfigFromArgs()`, `args.stack` is passed through without validation: `stack: args.stack || 'custom'`. If a user passes `--stack=vue-ts` (not a supported template), it silently proceeds and `generateFiles()` just skips the stack template. The user gets no feedback that their stack choice was invalid.
- **Suggested Fix:** Validate `args.stack` against known stack templates (`['react-ts', 'custom']`) and throw a descriptive error for unknown values.

### DX-014: Wizard does not validate that `tracker` arg is a known value
- **Location:** `packages/luca-framework/src/utils/wizard.ts:194`
- **Severity:** MEDIUM
- **Description:** `args.tracker` is cast to the union type with `as 'jira' | 'github' | 'none'` but no runtime validation occurs. Passing `--tracker=linear` silently accepts the invalid value.
- **Suggested Fix:** Validate against the known set `['jira', 'github', 'none']` and provide a clear error listing valid options.

### DX-015: `create-luca` does not support directory name argument
- **Location:** `packages/create-luca/src/index.ts:2` and `packages/create-luca/bin/create-luca.js:2`
- **Severity:** LOW
- **Description:** The README suggests `npx create-luca my-agent-project` to scaffold into a new directory, but `create-luca` simply re-exports `runInit()` from luca-framework which runs `init` in the current directory. The directory argument is not supported, making the documented quickstart flow incorrect.
- **Suggested Fix:** Either update `create-luca` to accept a directory argument (create dir, cd into it, then run init), or update docs to show the correct flow (`mkdir my-project && cd my-project && npx create-luca`).

---

## Domain 4: Help Text / CLI Metadata

### DX-016: CLI `description` does not match actual capability
- **Location:** `packages/luca-framework/src/index.ts:8`
- **Severity:** MEDIUM
- **Description:** The CLI meta description is "Luca - Agentic development framework for Cursor IDE" but the CLI currently only supports `init`, `update`, and `doctor` commands. It does not provide agentic development capabilities directly — those come from the Cursor IDE integration. The description is aspirational rather than accurate.
- **Suggested Fix:** Change to something like "Luca - CLI for managing the Luca development framework" or "Luca - Scaffold and manage AI-powered development workflows."

### DX-017: No `execute` subcommand exists despite documentation references
- **Location:** `packages/luca-framework/src/index.ts:9-13` (subCommands only has init, update, doctor)
- **Severity:** HIGH
- **Description:** Multiple documentation files reference `luca execute <path>` as a command:
  - `README.md:47` — `npx luca execute .planning/phases/01-foundation/01-01-PLAN.md`
  - `docs/getting-started.md:52,60` — `luca execute <path>`
  - `docs/troubleshooting.md:18` — `luca execute`
  - `packages/luca-framework/README.md:26` — `luca execute <plan-path>`

  This command does not exist. The actual CLI only has `init`, `update`, and `doctor`. Users following documentation will get a citty "Unknown command" error.
- **Suggested Fix:** Either implement the `execute` subcommand or remove all references to it from documentation. Since execution is handled by Cursor IDE agents (not CLI), the documentation should be updated to explain the correct workflow.

### DX-018: Help output does not show version
- **Location:** `packages/luca-framework/src/index.ts:6`
- **Severity:** LOW
- **Description:** While `version: '0.0.1'` is set in meta, this is hardcoded and does not match `package.json` version. In production, the version should be dynamically read from package.json to stay in sync.
- **Suggested Fix:** Import version from package.json or use a build-time replacement to keep the version in sync.

---

## Domain 5: Documentation

### DX-019: README references non-existent docs paths
- **Location:** `README.md:53-55`
- **Severity:** MEDIUM
- **Description:** README links to:
  - `docs/getting-started.md` — exists
  - `docs/agent-framework/luca/architecture-plan.md` — exists
  - `docs/troubleshooting.md` — exists
  - `docs/style-guide/coding-standards.md` — exists BUT is for "joes-book" project, not Luca

  The coding standards doc is specific to a different project (Next.js + Supabase + Jotai app called "joes-book") and contains project-specific standards that don't apply to Luca.
- **Suggested Fix:** Either create Luca-specific coding standards or remove the link from the README.

### DX-020: `docs/getting-started.md` references Node.js v20+ but code requires v18+
- **Location:** `docs/getting-started.md:8` vs `packages/luca-framework/src/utils/doctor/checks/node-version.ts:10`
- **Severity:** MEDIUM
- **Description:** Getting-started docs say "Node.js: v20 or higher" but the doctor check only requires Node 18+. This inconsistency may confuse users with Node 18 or 19 who are told they need v20.
- **Suggested Fix:** Align both to the same minimum version. If v18 is genuinely supported, update the docs. If v20 is preferred, update the doctor check.

### DX-021: `docs/troubleshooting.md` references `GITHUB_TOKEN` env var
- **Location:** `docs/troubleshooting.md:41`
- **Severity:** MEDIUM
- **Description:** Troubleshooting docs mention `GITHUB_TOKEN` as an environment variable for the GitHub adapter. However, the actual GitHub adapter (`github-adapter.ts`) uses the `gh` CLI for authentication, not a `GITHUB_TOKEN` env var. The env var is never read anywhere in the codebase.
- **Suggested Fix:** Update troubleshooting docs to explain that GitHub integration requires `gh auth login` instead of a `GITHUB_TOKEN` env var.

### DX-022: `docs/getting-started.md` references `STATE.md` and `PROJECT.md` but templates don't create them
- **Location:** `docs/getting-started.md:26-28`
- **Severity:** LOW
- **Description:** The docs describe `.planning/STATE.md` and `.planning/PROJECT.md` as core files, but the `init` command creates `BRAIN.md`, `MEMORY.md`, `WORKING.md`, and `config.json` — not `STATE.md` or `PROJECT.md`. These files are part of the Cursor IDE agent workflow, not the CLI scaffolding.
- **Suggested Fix:** Update docs to reflect the actual files created by `luca init`, and explain that STATE.md and PROJECT.md are created by agents during workflow execution.

### DX-023: SECURITY.md references `.planning/SECURITY_QUESTIONNAIRE.md` which may not exist
- **Location:** `SECURITY.md:57`
- **Severity:** LOW
- **Description:** SECURITY.md links to `.planning/SECURITY_QUESTIONNAIRE.md` for enterprise procurement teams. This file is not created by `luca init` — it's only present if the user or an agent creates it. The link will be a dead reference in newly initialized projects.
- **Suggested Fix:** Either create the security questionnaire as part of the base templates, or note that it's created during enterprise setup / available on request.

### DX-024: `docs/generation-system.md` references `bun run compile:to-cursor` which doesn't exist
- **Location:** `docs/generation-system.md:53-55`
- **Severity:** MEDIUM
- **Description:** The generation system docs show `bun run compile:to-cursor` as a script, but `package.json` does not define this script. Available build scripts are `build:all`, `build:claude`, `build:cursor`. The documentation is stale.
- **Suggested Fix:** Update the docs to reference the actual scripts: `bun run build:cursor`, `bun run build:claude`, `bun run build:all`.

---

## Domain 6: Build Scripts

### DX-025: No documentation header or usage instructions in build scripts
- **Location:** `scripts/build-all.ts:3-6`, `scripts/build-claude.ts:3`, `scripts/build-cursor.ts:3`
- **Severity:** MEDIUM
- **Description:** Build scripts have minimal JSDoc (single line: "Build script for generating X files") but no usage instructions, prerequisites, expected inputs/outputs, or when to run them. REQ-106 requires "Build scripts documented with usage instructions."
- **Suggested Fix:** Add comprehensive header comments to each script explaining:
  - What it does
  - When to run it (after modifying agents/skills/rules)
  - Prerequisites (compiled TypeScript classes)
  - Output files and their locations
  - How to invoke: `bun run build:all` or `bun run scripts/build-all.ts`

### DX-026: Build scripts use `node:fs` sync APIs instead of Bun APIs
- **Location:** `scripts/build-all.ts`, `scripts/build-claude.ts`, `scripts/build-cursor.ts` (all use `import fs from 'fs'`)
- **Severity:** LOW
- **Description:** Per CLAUDE.md instructions, the project should prefer `Bun.file` over `node:fs`. The build scripts use `fs.writeFileSync`, `fs.existsSync`, `fs.mkdirSync` throughout. While functional, this is inconsistent with project conventions.
- **Suggested Fix:** Convert to Bun APIs (`Bun.write()`, `Bun.file().exists()`) or at minimum use `fs/promises` for consistency with the rest of the codebase.

### DX-027: Generate scripts use `require.main === module` pattern (CJS) in ESM modules
- **Location:** `scripts/generate-agents-from-cursor.ts:145`, `scripts/generate-skills-from-cursor.ts:156`, `scripts/generate-rules-from-cursor.ts:186`
- **Severity:** LOW
- **Description:** The generate scripts use `if (require.main === module)` which is a CommonJS pattern. The project is configured as `"type": "module"` in package.json. While Bun supports this for compatibility, it's inconsistent. The scripts also have `#!/usr/bin/env bun` shebangs suggesting direct execution, making the guard unnecessary.
- **Suggested Fix:** Replace with `if (import.meta.main)` (Bun-native ESM pattern) or remove the guard entirely since these scripts are only run directly.

### DX-028: Build scripts silently succeed even if source imports fail at runtime
- **Location:** `scripts/build-all.ts:6-10`
- **Severity:** HIGH
- **Description:** The build-all script imports agent, skill, and rule classes at the top level. If any import fails (e.g., due to missing compiled files or broken dependencies), the script throws an unhandled error with a raw stack trace. There is no try/catch around the compilation steps and no user-friendly error message explaining what went wrong or how to fix it. The only error handling is per-skill in the loop (lines 143-145), which catches individual skill failures but not systemic issues.
- **Suggested Fix:** Wrap the entire script in a try/catch with a user-friendly error message. Add validation that required source files exist before attempting compilation. Provide a clear error like "Build failed: ensure TypeScript files are compiled first with `bun run build`."

---

## Appendix: Files Reviewed

| File | Purpose |
|------|---------|
| `packages/luca-framework/src/commands/init.ts` | Init CLI command |
| `packages/luca-framework/src/commands/update.ts` | Update CLI command |
| `packages/luca-framework/src/commands/doctor.ts` | Doctor CLI command |
| `packages/luca-framework/src/utils/wizard.ts` | Interactive setup wizard |
| `packages/luca-framework/src/utils/files.ts` | File generation + cleanup |
| `packages/luca-framework/src/utils/doctor/index.ts` | Doctor orchestrator |
| `packages/luca-framework/src/utils/doctor/checks/config-validation.ts` | Config validation check |
| `packages/luca-framework/src/utils/doctor/checks/node-version.ts` | Node version check |
| `packages/luca-framework/src/utils/doctor/checks/cursor-ide.ts` | Cursor IDE detection |
| `packages/luca-framework/src/utils/doctor/types.ts` | Doctor type definitions |
| `packages/luca-framework/src/utils/branding.ts` | Branding validation + defaults |
| `packages/luca-framework/src/utils/sanitize.ts` | JSON sanitization |
| `packages/luca-framework/src/utils/template.ts` | Template processing |
| `packages/luca-framework/src/utils/manifest.ts` | Manifest management |
| `packages/luca-framework/src/utils/version-check.ts` | Update notifier |
| `packages/luca-framework/src/utils/logger.ts` | Consola logger wrapper |
| `packages/luca-framework/src/utils/detect.ts` | Project context detection |
| `packages/luca-framework/src/index.ts` | CLI entry point |
| `packages/luca-framework/src/types.ts` | Type definitions |
| `packages/luca-framework/src/adapters/index.ts` | Adapter factory |
| `packages/luca-framework/src/adapters/jira-adapter.ts` | Jira adapter |
| `packages/luca-framework/src/adapters/github-adapter.ts` | GitHub adapter |
| `packages/luca-framework/src/adapters/placeholder-adapter.ts` | Placeholder adapter |
| `packages/luca-framework/src/contracts/work-tracker.ts` | Work tracker contract |
| `packages/luca-framework/templates/base/.planning/config.json` | Config template |
| `packages/luca-framework/templates/framework/templates/config.json` | Framework config template |
| `packages/create-luca/src/index.ts` | create-luca entry |
| `packages/create-luca/bin/create-luca.js` | create-luca bin |
| `scripts/build-all.ts` | Combined build script |
| `scripts/build-claude.ts` | Claude build script |
| `scripts/build-cursor.ts` | Cursor build script |
| `scripts/generate-agents-from-cursor.ts` | Agent generator |
| `scripts/generate-skills-from-cursor.ts` | Skill generator |
| `scripts/generate-rules-from-cursor.ts` | Rule generator |
| `README.md` | Root readme |
| `SECURITY.md` | Security policy |
| `docs/getting-started.md` | Getting started guide |
| `docs/troubleshooting.md` | Troubleshooting guide |
| `docs/generation-system.md` | Generation system docs |
| `docs/style-guide/coding-standards.md` | Coding standards |
| `docs/agent-framework/luca/architecture-plan.md` | Architecture plan |
| `package.json` | Root package.json |
| `packages/luca-framework/package.json` | Framework package.json |
| `packages/create-luca/package.json` | create-luca package.json |

---

## Priority Implementation Order

### Must Fix (HIGH severity — blocking or misleading)
1. **DX-009** — Regex escaping bug in config.json (blocks `luca doctor`)
2. **DX-006** — `--verbose` flag non-functional but advertised
3. **DX-017** — `luca execute` referenced everywhere but doesn't exist
4. **DX-010** — Config validation incomplete (branding fields not checked)
5. **DX-001** — "Installation failed" with no context
6. **DX-007** — Doctor suggests non-existent `--force` and `--repair` flags
7. **DX-012** — Wizard cancel handling may not work correctly
8. **DX-028** — Build scripts fail with raw stack traces

### Should Fix (MEDIUM severity — degraded UX)
9. **DX-002** — Raw exception in config file error
10. **DX-004** — Conflicting flags error not actionable
11. **DX-005** — Update failure with no recovery guidance
12. **DX-011** — Config parse errors not descriptive enough
13. **DX-013** — No validation of `--stack` arg
14. **DX-014** — No validation of `--tracker` arg
15. **DX-016** — CLI description aspirational vs actual
16. **DX-019** — Coding standards doc is for wrong project
17. **DX-020** — Node version mismatch in docs vs code
18. **DX-021** — GITHUB_TOKEN docs vs gh CLI reality
19. **DX-024** — Stale `compile:to-cursor` script reference
20. **DX-025** — Build scripts lack documentation headers

### Nice to Have (LOW severity — polish)
21. **DX-003** — No `--force` flag for re-initialization
22. **DX-008** — Update notifier message imprecise
23. **DX-015** — create-luca doesn't support directory arg
24. **DX-018** — Hardcoded version in CLI meta
25. **DX-022** — Docs reference STATE.md/PROJECT.md not created by init
26. **DX-023** — SECURITY_QUESTIONNAIRE.md dead link
27. **DX-026** — Build scripts use node:fs instead of Bun APIs
28. **DX-027** — CJS `require.main` pattern in ESM modules
