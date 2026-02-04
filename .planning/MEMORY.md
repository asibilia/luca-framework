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

### Established Conventions

<!-- Conventions to maintain consistency -->

(None yet — will accumulate during development)

## Decisions

### Architectural Choices

<!-- Past decisions with rationale — recall to avoid re-debating -->

| Decision | Context | Rationale | Date |
|----------|---------|-----------|------|
| CLI installer over npm | Distribution model | Better UX for setup wizard, can prompt for config | 2026-02-04 |
| Branded skin over rebrand | Customization approach | Cursor file name limitations, enables upgradability | 2026-02-04 |
| React+TS template only v1 | Stack templates | Ship one excellent template, prove pattern | 2026-02-04 |
| UnJS ecosystem for CLI | Tooling stack | citty, consola, unbuild, pathe, @clack/prompts all worked seamlessly. Validated in Phase 1 execution | 2026-02-04 |

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

### Anti-patterns

<!-- What NOT to do — recall when approaching similar areas -->

(None yet — will accumulate during development)

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

- Total patterns: 7
- Total decisions: 4
- Total pitfalls: 5
- Last updated: 2026-02-04

*Entries added by: lu-learner*
*Last curated: 2026-02-04*
