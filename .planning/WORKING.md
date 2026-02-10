# Working Memory

> Session-specific memory. Initialized at workflow start.

## Session Info

- **Started**: 2026-02-10
- **Workflow**: /lu-plan-phase 7
- **Phase**: 7 (Architecture)

## Memory Recall

### Relevant Patterns

- **Wave-based parallelization**: Execute independent plans in parallel waves (validated in Phase 1)
- **Zod schemas are pure**: Trivially testable — good for adding security validation schemas
- **Schema-first parsing**: Zod schemas for all data parsing (BRAIN.md convention)

### Relevant Decisions

- Zod already in project as dependency — no new deps needed for validation
- Template literal escaping issues discovered in Phase 5 — extra care with template.ts changes
- `unknown` vs `any` already applied in Phase 5 — type safety foundation in place

### Flagged Pitfalls

- Template paths break in bundled context (__dirname vs import.meta.url) — relevant for template.ts
- Undefined values override defaults in mergeBranding() — relevant for validation
- Build scripts had escaping issues — test carefully after modifying

## Intuition Flags

- **RISK**: Build scripts already had template literal escaping issues in Phase 5 — extra care needed when modifying template.ts
- **OPPORTUNITY**: Zod already in project — no new dependency for validation schemas
- **CAUTION**: js-yaml will be a new dependency — need to install it
- **CAUTION**: EJS restriction changes must preserve existing template behavior for valid templates

## Planning Notes

### Phase 6 Discussion Decisions (16 total)

**Area 1 - Input Validation:** Zod at config boundaries, env var format validation, CLI arg validation, prototype pollution guards
**Area 2 - Shell Hardening:** Branch name validation, Bun.spawn migration, -- end-of-options, error sanitization
**Area 3 - HTTP & Credentials:** Ticket ID regex, HTTPS enforcement, credential-stripped errors, Zod response schemas
**Area 4 - Template Rendering:** EJS restricted to <%=%> only, YAML via js-yaml, XML tag sanitization, no content escaping

### Wave Dependencies

Waves 1-4 are largely independent — each touches different files:
- Wave 1: validation-utils.ts, config parsing, CLI commands
- Wave 2: github-adapter.ts, build scripts
- Wave 3: jira-adapter.ts
- Wave 4: template.ts, utils.ts, format.ts

## Execution Summary

### Phase 6 Execution Results

**Wave 1 (06-01)** — Input Validation & Prototype Pollution ✅
- Added `sanitizeJsonParse()` / `safeSanitizeJsonParse()` to strip `__proto__`, `constructor`, `prototype` recursively
- Added Zod schemas for Jira env var validation (HTTPS URL, email format, non-empty token)
- Applied sanitizeJsonParse to wizard.ts, manifest.ts, config-validation.ts
- Fixed CLI arg validation gaps in createConfigFromArgs() and loadConfigFromFile()
- Created self-contained `packages/luca-framework/src/utils/sanitize.ts` for cross-package use
- 20 new tests (security-validation.test.ts, jira-config-validation.test.ts)

**Wave 2 (06-02)** — Shell Command Hardening ✅
- Added validateBranchName(), validateIssueNumber() to github-adapter.ts
- Added `--` end-of-options markers in execa calls
- Migrated build scripts from child_process to Bun.spawnSync
- Added githubIssueResponseSchema Zod schema, replaced TypeScript cast
- Sanitized parseGhError() to redact credential patterns
- 16 new tests (github-security.test.ts)

**Wave 3 (06-03)** — HTTP & Credential Safety ✅
- Added JIRA_TICKET_ID_PATTERN regex validation before URL construction
- Added defense-in-depth HTTPS enforcement in getTicket() and validate()
- Added sanitizeJiraError() stripping Basic auth, Bearer tokens, Base64, token= patterns
- Added jiraIssueResponseSchema Zod schema, replaced TypeScript `as` cast with safeParse
- 21 new tests (jira-security.test.ts)

**Wave 4 (06-04)** — Template Rendering Hardening ✅
- Installed js-yaml dependency for proper YAML escaping
- Added sanitizeTemplate() restricting EJS to `<%= %>` only
- Replaced manual formatFrontmatter() with js-yaml dump()
- Added sanitizeTagName() for XML tag name sanitization in toCursorFormat()
- Added assertWithinDirectory() path traversal prevention in copyTemplates()
- Fixed 4 downstream test assertions for js-yaml string quoting change
- 19 new tests (template-security.test.ts, format-security.test.ts, utils-yaml-security.test.ts)

**Wave 5 (06-05)** — Dependency Audit ✅
- `bun audit` reports "No vulnerabilities found"
- `bun outdated` reports no outdated packages

### Test Results
- **433 pass** / 6 fail (all pre-existing in executeDoctor and configValidationCheck)
- **76 new security tests** added across Phase 6
- Total tests grew from ~393 (end of Wave 2) to 439

### Candidate Learnings
- Cross-package imports (src/shared → packages/luca-framework) don't work; need self-contained modules
- js-yaml quoting changes propagate widely — any string formatting change needs downstream test search
- Wave-parallel execution works well when file ownership is clearly separated
- Zod v4 `.safeParse()` pattern is clean for runtime validation at API boundaries
