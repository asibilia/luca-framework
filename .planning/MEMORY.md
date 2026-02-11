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
- **Surgical performance optimization**: For small CLI tools already meeting performance targets (23ms startup), apply targeted fixes rather than broad refactoring. Prioritize: lazy command loading (biggest gain) > dependency removal (if already small) > memory safety fixes. Avoid complex optimization unless bottleneck confirmed. Validated in Phase 8 (CLI already at 23ms)
- **Dynamic dependency loading for optional features**: Lazy-load heavy optional dependencies (e.g., update-notifier 1.0MB) only when needed. Use dynamic `import()` for optional commands/features. Enables smaller default bundle without sacrificing functionality. Validated in Phase 8 (reduced startup path)
- **SIGINT handler safety with process.once**: Use `process.once()` instead of `process.on()` to prevent handler accumulation when module re-imported. Reset mutable module state (e.g., `createdPaths`) at function entry. Validated in Phase 8 (fixed handler accumulation)
- **Constant extraction for repeated values**: Extract repeated magic strings/arrays into named constants (e.g., `TEMPLATE_EXTENSIONS`). Enables single-point-of-truth for validation values and reduces duplication. Validated in Phase 8 code review
- **EJS + JSON regex escaping**: When EJS templates output regex patterns into JSON strings, backslashes need double-escaping. Solution: computed `ticketPatternJson` property via `.replace(/\\/g, '\\\\')` to produce valid JSON. Validated in Phase 9 (init wizard fix)
- **Actionable error messages (three-part pattern)**: Every CLI error should include: (1) what failed, (2) why/cause, (3) what to do next. This is a DX multiplier — users never hit a dead end. Validated in Phase 9 (CLI error messages overhaul)
- **Validation parity across config entry points**: If `createConfigFromArgs` validates stack/tracker values, `loadConfigFromFile` must too. All config entry points need identical validation to prevent invalid configs from slipping through file-based paths. Validated in Phase 9 (code review HIGH fix)
- **Documentation as code debt**: Stale docs (non-existent commands, wrong env vars, outdated coding standards) accumulate silently across milestones. Treat docs accuracy as a DX concern and audit during DX phases. Validated in Phase 9 (7 doc accuracy issues caught)
- **Parallel agent execution without conflicts**: File-disjoint plans enable safe parallelism. 5 agents ran in parallel on non-overlapping file sets with zero merge conflicts. Key: ensure plan scope boundaries don't overlap at the file level. Validated in Phase 9 (5 parallel plans)
- **Metadata registry for non-class entities**: When registry entries aren't class constructors (e.g. shell scripts), use metadata objects (`HookDefinition`) with platform-specific fields (`event`/`cursorEvent`, `matcher`/`cursorMatcher`). Config generators transform metadata into platform-specific output formats. Validated in Phase 11 (hookRegistry → settings.json + hooks.json)
- **Dual-format stdin/stdout for cross-platform hooks**: Shell scripts can handle both Claude Code and Cursor stdin JSON by using nullish coalescing fallbacks (`data.tool_input?.file_path ?? data.file_path`). Platform detection via `!!process.env.CLAUDE_PROJECT_DIR` enables dual-format output. Validated in Phase 11 (5 hooks, 2 platforms)
- **Plan-checker bug prevention**: Running lu-plan-checker before execution caught 2 critical bugs (`|| true` swallowing exit codes) and 5 medium issues (echo vs printf, shell interpolation, wrong APIs). The checker pays for itself by preventing non-functional hooks from being deployed. Validated in Phase 11
- **Layered verification (hooks + harness)**: Hooks provide lightweight, per-edit/commit verification (format, typecheck, pre-commit gate). Harness provides comprehensive verification at phase boundaries with structured output parsing and failure-to-fix loops. Two layers enforce quality at different frequencies: hooks catch problems immediately, harness catches integration issues. Validated in Phase 12 (6/6 requirements, 6/6 UAT tests)
- **Parser registry for diverse toolchains**: Structured output parsing across different tools (tsc, bun-test, eslint, generic) requires separate `OutputParser` implementations. Registry pattern (`Record<string, OutputParser>`) follows hookRegistry/ruleRegistry, enabling extensible parser composition. Each parser handles format-specific quirks (JSON flags, field mappings, multiline output). Validated in Phase 12 (4 parsers, 65 tests)
- **CLI entry point pattern with import.meta.main**: For standalone executables, use `if (import.meta.main) { runCLI(); }` guard instead of CJS `require.main === module`. This is the ESM equivalent and works correctly in Bun. Entry point handler receives process args and manages CLI flow independently from module exports. Validated in Phase 12 (harness runner CLI)

### Established Conventions

<!-- Conventions to maintain consistency -->

- **No raw JSON.parse on external data**: Use `sanitizeJsonParse()` for all user/external data to prevent prototype pollution. Internal data (own package.json) can use raw `JSON.parse()`
- **EJS restricted to safe output only**: All EJS templates sanitized before rendering — `<%- %>` auto-converted to `<%= %>`, `<% %>` stripped. Only `<%= %>` (escaped output) is supported
- **YAML generation via js-yaml**: All YAML frontmatter generation uses `js-yaml` `dump()` for proper escaping. No manual string concatenation for YAML
- **Shell script conventions for hooks**: Use `printf '%s'` (not `echo`) for JSON piping, `set +e`/`set -e` (not `|| true`) for exit code capture, env vars (not shell interpolation) for passing values to `bun -e`, `${CLAUDE_PROJECT_DIR:-.}` for project dir fallback

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
| Native mkdir over fs-extra | Dependency minimization | fs-extra was used only for `ensureDir({recursive:true})`. Node.js/Bun native APIs suffice. 99KB saved, reduced distribution size | 2026-02-10 |
| Lazy loading for optional commands | Bundle optimization | Heavy optional features (update-notifier 1.0MB) loaded dynamically. Reduces default startup path without sacrificing features. Tradeoff: adds dynamic import wrapper | 2026-02-10 |
| import.meta.main over require.main | Bun ESM compatibility | Bun ESM files should use `import.meta.main` (boolean) instead of CJS `require.main === module` pattern. Consistent with ESM module system and Bun runtime conventions | 2026-02-10 |
| Hooks on both Claude Code and Cursor | Cross-platform enforcement | Both platforms now support hooks with similar semantics (stdin JSON, exit codes, matchers). Different config formats (settings.json vs hooks.json) and event names (PascalCase vs camelCase) but same shell scripts with dual-format parsing | 2026-02-10 |
| Metadata registry over class registry for hooks | Hook architecture | Hooks are shell scripts, not TypeScript classes. Using HookDefinition metadata objects with platform-specific fields (event/cursorEvent) and separate config generators per platform. Cleaner than forcing class pattern on non-class entities | 2026-02-10 |
| Transcript file size as context proxy | Context monitoring | Claude Code doesn't expose context window usage %. Transcript file size (bytes) is a reasonable proxy with configurable thresholds (100KB/200KB/300KB). Imperfect but functional | 2026-02-10 |
| Two-layer verification (hooks + harness) | Quality enforcement strategy | Lightweight hooks (format, typecheck, pre-commit) run frequently. Comprehensive harness (full test suite, integration checks, structured parsing) runs at phase boundaries. Asymmetric cost model: hooks are fast/cheap, harness is thorough/expensive. Harness failures trigger failure-to-fix loops within phase execution. Validated in Phase 12 | 2026-02-10 |
| Config fallback for optional sections | Framework configuration | Harness config is optional in framework projects. Provide DEFAULT_HARNESS_CONFIG constant and fall back to it when harness section is missing from config.json. Enables progressive adoption without requiring config updates | 2026-02-10 |
| Bun.spawn with manual timeout implementation | Process execution | Bun.spawn has no built-in timeout like Node's child_process. Implement via `setTimeout` + `proc.kill()` + `Promise.race`. Also: (1) pass commands as `["sh", "-c", cmd]` string array (not string), (2) stdout/stderr are ReadableStreams — collect via `new Response(stream).text()`, (3) `.exited` is a Promise<number>, not synchronous | 2026-02-10 |

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
- **Module-level mutable state in CLIs**: Exporting command modules from index creates mutable `createdPaths` at module scope. Reusing the module in tests/scripts causes state to persist across invocations. Always reset mutable state at function entry point, not module load time
- **Code review false-positives on intentional patterns**: Static analysis flagged 3 high-severity issues in optimized CLI code (guard clauses without explicit else, aggressive string joining, conditional imports). These were intentional architectural choices, not defects. Document intent comments for static analysis tools
- **Declared but unwired CLI flags**: citty allows declaring `args` without wiring them to the `run()` function body. The `--verbose` flag existed for months without working because `run({ args })` destructuring was missing. Always verify flag wiring by testing CLI flags end-to-end after declaration
- **Non-existent commands in fix suggestions**: Doctor check suggested `--force` and `--repair` flags that don't exist in the CLI. Fix suggestions must reference actual working commands — never suggest flags or subcommands that haven't been implemented
- **validateBranding skips undefined fields by design**: `validateBranding()` only validates fields that are present (for partial validation support). For installed configs where required branding subfields are mandatory, check field presence separately before calling validateBranding. Validated in Phase 9 (code review HIGH fix)
- **`|| true` swallows exit codes**: `TSC_OUTPUT=$(cmd) || true; TSC_EXIT=$?` always sets `TSC_EXIT=0` because `$?` captures exit code of `true`, not `cmd`. Must use `set +e; TSC_OUTPUT=$(cmd); TSC_EXIT=$?; set -e` instead. Caught by plan checker, would have produced non-functional pre-commit gate
- **`echo` corrupts JSON on some platforms**: `echo "$INPUT"` can interpret backslash sequences differently across shells. Always use `printf '%s' "$INPUT"` for piping JSON data through shell scripts
- **Shell variable interpolation in bun -e strings**: `${FILE_PATH}` inside `bun -e "..."` JS strings breaks if path contains quotes or backslashes. Pass values via env vars: `HOOK_FILE_PATH="$FILE_PATH" bun -e "const fp = process.env.HOOK_FILE_PATH;"`
- **Assuming platform exclusivity for features**: Phase 11 initially assumed hooks were Claude Code-only. Cursor added hooks support with a similar API. Always verify competitor/alternative platform capabilities before declaring features platform-exclusive
- **Bun.spawn command passing quirk**: `Bun.spawn(cmd)` with a string fails silently. Must pass as `["sh", "-c", cmd]` to execute multi-word commands. Single-word commands like `["ls"]` work, but anything requiring shell interpretation needs the `["sh", "-c", ...]` wrapper. Caught by plan checker before deployment
- **Bun.spawn has no built-in timeout**: Unlike Node.js child_process with `{ timeout }` option, Bun.spawn doesn't support timeouts. Implemented via `setTimeout` → `proc.kill()` → `Promise.race` pattern. Must use this pattern for all subprocess execution with timeout requirements
- **Bun.spawn stdout/stderr are ReadableStreams**: In Node, you get buffer/string directly. In Bun, `.stdout` and `.stderr` are ReadableStreams. Must collect with `new Response(proc.stdout).text()` pattern. This is a footgun because it looks like a string property but needs streaming collection
- **Bun.spawn .exited is async Promise**: `proc.exited` returns `Promise<number>`, not synchronous. Code checking `if (proc.exited === 0)` will fail. Must `await proc.exited` or use it in Promise chains
- **ESLint parser requires --format json**: ESLint by default outputs human-readable format. Parser must inject `--format json` flag into the command to get JSON output that can be parsed. Generic parser can't handle ESLint output without this flag
- **Diverse toolchain output formats require multiple parsers**: tsc outputs to stderr with line:col notation, bun-test outputs to stdout with JSON, eslint outputs JSON, generic tools may output anything. No single parser handles all. Registry pattern enables composition — add parsers incrementally for new tools
- **Failure-to-fix loops need iteration limits**: Phase 12 runs harness, detects failures, applies fixes (e.g., format with prettier), re-runs harness. Without `maxIterations` limit (set to 3), infinite loops are possible if fix doesn't resolve failure. Always include escape hatch in retry loops

### Anti-patterns

<!-- What NOT to do — recall when approaching similar areas -->

- **TypeScript `as` casts for external data**: Never use `as TypeName` to cast data from external APIs, user input, or file reads. Use Zod schemas with `.safeParse()` instead
- **Raw JSON.parse for user data**: Never use raw `JSON.parse()` on user-provided or external data without `sanitizeJsonParse()` wrapper
- **Shell string interpolation**: Never interpolate user values into shell commands. Use array-form arguments with `--` end-of-options markers
- **`|| true` for exit code capture**: Never use `cmd || true; EXIT=$?` — it always yields `EXIT=0`. Use `set +e; cmd; EXIT=$?; set -e` instead
- **`echo` for JSON piping**: Never use `echo "$VAR"` to pipe JSON. Use `printf '%s' "$VAR"` to prevent backslash interpretation

## Preferences

### User Preferences

<!-- Learned from feedback — recall for consistency -->

(None yet — will accumulate during development)

### Project Preferences

<!-- Project-specific patterns — recall for consistency -->

- **Enterprise focus**: Prioritize compliance, security, configurability over convenience
- **Notify don't auto-update**: Teams control when they update framework
- **Surgical optimization over broad refactoring**: For performance work, target specific bottlenecks (lazy loading, unused dependencies) rather than redesigning systems. CLI is already performant at 23ms startup — avoid gold-plating
- **Extract repeated values to constants**: Use named constants for validation sets (TEMPLATE_EXTENSIONS), magic strings, and repeated literals. Single point of truth, aids readability and maintenance
- **Toolchain-agnostic harness**: Verification harness must support multiple tools (tsc, bun-test, eslint, generic). Use parser registry + pluggable architecture. Each tool has different output format — don't try to normalize; embrace diversity with separate parsers
- **Layered enforcement cadence**: Hooks run at every edit/commit (fast feedback). Harness runs at phase boundaries (comprehensive validation). This asymmetry enables both speed and thoroughness. Don't run harness on every keystroke; let hooks provide fast feedback
- **Config progressive adoption**: Optional config sections (like harness) should ship with sensible defaults. Projects without explicit config should still work — fallback to DEFAULT_HARNESS_CONFIG. Enables rollout without forcing all projects to update config immediately

---

---

_Memory Statistics_

- Total patterns: 29 (+3 from Phase 12)
- Total decisions: 18 (+3 from Phase 12)
- Total pitfalls: 25 (+8 from Phase 12)
- Total conventions: 4 (no change)
- Total anti-patterns: 5 (no change)
- Total preferences: 7 (+3 from Phase 12)
- Last updated: 2026-02-10

*Entries added by: lu-learner (Phase 12)*
*Last curated: 2026-02-10*
