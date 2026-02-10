# Long-Term Memory

> Persistent learnings across sessions. Selectively recalled based on task context.

## Patterns

### Validated Approaches

<!-- Patterns that worked well — recall when similar tasks arise -->

- **Codebase mapping with parallel agents**: Spawn 4 lu-codebase-mapper agents in parallel (tech, arch, quality, concerns) — produces comprehensive analysis in ~1 minute
- **Questioning before planning**: Deep questioning surfaces hidden requirements and constraints before committing to implementation
- **Wave-based parallelization**: Execute independent plans in parallel waves to reduce total execution time. Wave 2 (01-02 + 01-03) executed concurrently without conflicts, validated in Phase 1
- **Dual-package CLI pattern**: Thin `create-*` scaffolder package delegates to main `*-framework` package. Enables separate versioning and smaller initial download. Pattern: `create-luca` → `luca-framework`
- **Branding context pattern**: `createBrandingContext()` adds computed helpers like `commandSlash: "/${prefix}"` for template convenience. Centralizes branding logic with computed properties
- **Manifest-based tracking**: SHA-256 hashes enable update conflict detection. `source: 'framework' | 'user'` distinguishes file origins for safe merging
- **Template architecture separation**: Three-tier structure: `base/` (minimal scaffold) + `stacks/` (stack-specific) + `framework/` (full Luca framework). EJS for content substitution (`<%= branding.frameworkName %>`), `__variable__` pattern for filename substitution
- **Discriminated union for adapter results**: Use `{ success: true, data: T } | { success: false, error: string }` for consistent error handling across different work tracker implementations. Validated in Phase 2
- **Optional method checking**: Check for optional adapter methods with `if (adapter.method)` before invocation to support heterogeneous feature sets across work trackers. Validated in Phase 2
- **Infrastructure-first doctor pattern**: Implement `doctor` command with a registry of independent checks. Enables easy extension and comprehensive system validation. Validated in Phase 3

- **Zod safeParse at API boundaries**: Replace `as TypeName` casts with `zodSchema.safeParse()` for runtime validation of external API responses. Returns discriminated union matching AdapterResult pattern. Validated in Phase 6 (GitHub + Jira adapters)
- **Self-contained cross-package modules**: When root `src/shared/` utilities need to be used in `packages/*/`, create a self-contained copy in the package rather than cross-package imports. Validated in Phase 6 (sanitize.ts)
- **Defense-in-depth validation**: Apply validation at both config ingestion (checkConfig) AND usage site (inline checks). Prevents regressions from future refactoring that might bypass config validation. Validated in Phase 6 (HTTPS enforcement)
- **Credential sanitization pattern**: Use regex chain to strip `Basic`, `Bearer`, long Base64 (40+ chars), and `token=` patterns from error messages before returning to callers. Prevents credential leakage in error paths

### Established Conventions

<!-- Conventions to maintain consistency -->

- **No raw JSON.parse on external data**: Use `sanitizeJsonParse()` for all user/external data to prevent prototype pollution. Internal data (own package.json) can use raw `JSON.parse()`
- **EJS restricted to safe output only**: All EJS templates sanitized before rendering — `<%- %>` auto-converted to `<%= %>`, `<% %>` stripped. Only `<%= %>` (escaped output) is supported
- **YAML generation via js-yaml**: All YAML frontmatter generation uses `js-yaml` `dump()` for proper escaping. No manual string concatenation for YAML

## Decisions

### Architectural Choices

<!-- Past decisions with rationale — recall to avoid re-debating -->

| Decision | Context | Rationale | Date |
|----------|---------|-----------|------|
| CLI installer over npm | Distribution model | Better UX for setup wizard, can prompt for config | 2026-02-04 |
| Branded skin over rebrand | Customization approach | Cursor file name limitations, enables upgradability | 2026-02-04 |
| React+TS template only v1 | Stack templates | Ship one excellent template, prove pattern | 2026-02-04 |
| UnJS ecosystem for CLI | Tooling stack | citty, consola, unbuild, pathe, @clack/prompts all worked seamlessly. Validated in Phase 1 execution | 2026-02-04 |
| Adapter factory pattern | Multi-tracker support | Type-based switch returns appropriate implementation, decoupling CLI from specific tracker logic | 2026-02-04 |
| Security-first documentation | Enterprise readiness | Created SECURITY.md and SECURITY_QUESTIONNAIRE.md early to establish compliance baseline | 2026-02-05 |
| js-yaml over manual YAML | Template safety | Manual string concatenation breaks on special chars (quotes, colons, newlines). js-yaml handles all edge cases | 2026-02-10 |
| Zod for API response validation | Runtime safety | TypeScript `as` casts provide zero runtime protection. Zod safeParse catches malformed responses before they propagate | 2026-02-10 |
| EJS restriction (escaped only) | Template safety | Unescaped output (`<%-`) enables XSS; code blocks (`<%`) enable arbitrary code execution. Restrict to `<%=` only | 2026-02-10 |

### Trade-offs Made

<!-- Explicit trade-offs — recall when similar decisions arise -->

(None yet — will accumulate during development)

## Pitfalls

### Known Issues

<!-- Problems encountered — recall to prevent repetition -->

- **Hardcoded paths break packageability**: Found 10+ locations with hardcoded PT-/ENG- prefixes, company references, absolute paths — all need abstraction
- **Package version mismatches**: Always verify package versions exist before committing. citty ^0.2.1 doesn't exist (use ^0.2.0), @clack/prompts ^0.10.0 doesn't exist (use ^1.0.0). Check npm registry before specifying versions
- **Undefined values override defaults**: In `mergeBranding()`, undefined values can override schema defaults. Filter out undefined values before merging to preserve defaults
- **Template paths break in bundled context**: `__dirname` doesn't work in bundled executables. Use `import.meta.url` with `fileURLToPath()` and `dirname()` to resolve template directories correctly
- **Missing leading dots on directory names**: Template directories like `.planning` and `.cursor` must include leading dots in their names. Rename template directories to match expected hidden directory pattern

- **js-yaml quoting change propagation**: Switching from manual YAML (always quotes strings) to js-yaml (only quotes when needed) affects ALL downstream tests that assert on frontmatter output. Search for `": "` patterns in test assertions when changing YAML generation
- **Cross-package import failures**: TypeScript resolves `src/shared/` imports from `packages/luca-framework/` at compile time but module resolution fails at runtime. Always use self-contained modules or npm package imports
- **Pre-existing test failures mask new ones**: The 6 pre-existing failures in executeDoctor/configValidationCheck are caused by process.cwd() mocking issues in concurrent test runs. Track these separately to avoid masking new regressions

### Anti-patterns

<!-- What NOT to do — recall when approaching similar areas -->

- **TypeScript `as` casts for external data**: Never use `as TypeName` to cast data from external APIs, user input, or file reads. Use Zod schemas with `.safeParse()` instead
- **Raw JSON.parse for user data**: Never use raw `JSON.parse()` on user-provided or external data without `sanitizeJsonParse()` wrapper
- **Shell string interpolation**: Never interpolate user values into shell commands. Use array-form arguments with `--` end-of-options markers

## Preferences

### User Preferences

<!-- Learned from feedback — recall for consistency -->

(None yet — will accumulate during development)

### Project Preferences

<!-- Project-specific patterns — recall for consistency -->

- **Enterprise focus**: Prioritize compliance, security, configurability over convenience
- **Notify don't auto-update**: Teams control when they update framework

---

---

_Memory Statistics_

- Total patterns: 14
- Total decisions: 9
- Total pitfalls: 8
- Total conventions: 3
- Total anti-patterns: 3
- Last updated: 2026-02-10

*Entries added by: lu-learner*
*Last curated: 2026-02-04*
