# Phase 6 Context: Security

## Objective
Audit and fix security vulnerabilities across all input surfaces. Harden shell command execution, HTTP requests, credential handling, template rendering, and input validation.

## Scope
- `packages/luca-framework/src/adapters/` (Jira adapter, GitHub adapter)
- `packages/luca-framework/src/utils/template.ts` (EJS rendering)
- `src/shared/utils.ts` (YAML frontmatter generation)
- `src/shared/format.ts` (Cursor/Claude format output)
- `src/shared/validation-utils.ts` (existing validation)
- `scripts/` (build scripts using child_process)

## Attack Surfaces Identified

| Surface | Location | Risk | Status |
|---------|----------|------|--------|
| Shell command execution | github-adapter.ts, build scripts | High | Uses execa array form (safe), but build scripts use exec/execSync |
| HTTP requests | jira-adapter.ts | Medium | No URL validation, no HTTPS enforcement, no response validation |
| Template rendering | template.ts | High | EJS allows `<%` code execution and `<%-` unescaped output |
| YAML generation | utils.ts | Medium | No escaping on interpolated values |
| XML tag generation | format.ts | Medium | Section titles used as raw tag names |
| Credential handling | jira-adapter.ts | Medium | No credential sanitization in error paths |

## Decisions from Discussion

### Area 1: Input Validation Strategy

| Decision | Detail |
|----------|--------|
| JSON config parsing | Add Zod validation — parse + validate with Zod schemas at every config/manifest read point |
| Environment variables | Validate format — JIRA_BASE_URL must be valid HTTPS URL, token non-empty, email is email-shaped |
| CLI arguments | Same validation — run `validateBrandingField()` on CLI args |
| Prototype pollution | Add guard — strip `__proto__`/`constructor` keys after JSON parsing |

### Area 2: Shell Command Hardening

| Decision | Detail |
|----------|--------|
| Branch name validation | Add `validateBranchName()` — reject names starting with `-`, containing `..`, whitespace, NUL, `~`, `^`, `:`, `\`, or other git-problematic characters |
| Build script migration | Migrate from `child_process.exec/execSync` to `Bun.spawn()` — eliminates shell layer, aligns with CLAUDE.md Bun preference |
| Flag injection prevention | Add `--` end-of-options markers before user-provided arguments in execa calls |
| Error output sanitization | Wrap subprocess errors — sanitize before propagating, log full details at debug level only |

### Area 3: HTTP Request & Credential Safety

| Decision | Detail |
|----------|--------|
| URL construction | Validate ticketId matches Jira pattern `/^[A-Z][A-Z0-9]+-\d+$/` before URL construction |
| HTTPS enforcement | Reject non-HTTPS for `JIRA_BASE_URL` — strict enforcement, no exceptions |
| Credential leakage | Sanitize Jira adapter errors — strip Authorization header values, base64 credentials, and API tokens from error messages |
| Response validation | Add Zod schemas for Jira API response shapes — parse responses through schemas, catch malformed data early |

### Area 4: Template Rendering Surface

| Decision | Detail |
|----------|--------|
| EJS safety | Restrict to `<%= %>` only — reject/strip `<%-` (unescaped) and `<%` (code execution) tags from templates |
| YAML frontmatter | Replace manual YAML generation with proper YAML serializer library (js-yaml or similar) |
| XML tag names | Sanitize section titles — allow only `[a-z0-9_-]` characters in XML tag names |
| Content body escaping | No escaping — trust content authors. Output targets AI tools, not browsers |

## Wave Structure

### Wave 1 (06-01): Input Validation & Prototype Pollution
- Add Zod schemas for config/manifest parsing
- Validate environment variables (JIRA_BASE_URL format, token non-empty, email shape)
- Apply `validateBrandingField()` to CLI args
- Add `__proto__`/`constructor` key stripping after JSON.parse

### Wave 2 (06-02): Shell Command Hardening
- Add `validateBranchName()` utility
- Migrate build scripts from `child_process.exec` to `Bun.spawn()`
- Add `--` end-of-options markers in execa calls
- Wrap subprocess error messages with sanitization

### Wave 3 (06-03): HTTP & Credential Safety
- Validate ticketId format before URL construction
- Enforce HTTPS on JIRA_BASE_URL
- Sanitize error messages in Jira adapter (strip credentials)
- Add Zod response schemas for Jira API responses

### Wave 4 (06-04): Template Rendering Hardening
- Restrict EJS to `<%= %>` only (strip/reject `<%-` and `<%` tags)
- Replace `formatFrontmatter()` YAML generation with js-yaml library
- Sanitize section titles to valid XML tag names in `toCursorFormat()`

## Dependencies
- Phase 4 tests provide safety net for security fixes
- Phase 5 type safety (`unknown` vs `any`) reduces attack surface
- Zod already in the project as a dependency

## Success Criteria
- All user input validated before use (Zod schemas at boundaries)
- No command injection or path traversal vectors
- No shell layer in build scripts (Bun.spawn only)
- HTTPS enforced for external API calls
- Credentials never leaked in error messages
- EJS restricted to safe output mode only
- YAML generation uses proper serializer
- XML tag names sanitized
- `bun test` passes after all changes
