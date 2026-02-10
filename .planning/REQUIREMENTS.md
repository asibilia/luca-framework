# Requirements — v1.0.1 Code Hardening

## Overview

Comprehensive review and hardening of the v1.0.0 implementation. Each requirement maps to a specialized review domain. Findings are fixed in-place — this milestone produces both audit reports and working fixes.

**Surface area:** 133 TypeScript source files, 70+ templates, 9 build scripts
**Approach:** Specialized agent review per domain, findings + fixes per phase

---

## v1.0.1 Requirements

### REQ-101: Test Infrastructure & Coverage

**Description:** Establish test infrastructure and add meaningful coverage across all packages.

**Acceptance Criteria:**

- Test runner configured (bun test) with project-wide settings
- Unit tests for all utility functions in `packages/luca-framework/src/utils/`
- Unit tests for adapter implementations (Jira, GitHub, Placeholder)
- Unit tests for CLI commands (doctor, init, update)
- Unit tests for base classes (`base-agent.ts`, `base-skill.ts`, `base-rule.ts`)
- Unit tests for compilers (`base.compiler.ts`, `claude.compiler.ts`, `cursor.compiler.ts`)
- Unit tests for shared utilities (`constants.ts`, `utils.ts`, `validation-utils.ts`)
- Unit tests for Zod schemas (`agent.schemas.ts`, `skill.schemas.ts`, `rule.schemas.ts`)
- Integration tests for skill/agent/rule registration and config validation
- Coverage reporting configured

**Technical Notes:**

- Use `bun:test` (no external test framework)
- Co-locate tests next to source files (`*.test.ts`)
- Mock external dependencies (gh CLI, Jira API, filesystem)

---

### REQ-102: Code Quality & Consistency

**Description:** Enforce consistent code quality standards across the entire codebase.

**Acceptance Criteria:**

- All TypeScript strict mode violations resolved
- Dead code identified and removed (unused exports, unreachable branches)
- Consistent error handling patterns across all modules
- Consistent naming conventions (file names, exports, types)
- No `any` types in production code (replace with proper types)
- No `console.log` in production code (use consola logger)
- Import organization standardized
- Duplicate code identified and consolidated

**Technical Notes:**

- Run `tsc --noEmit` with strict flags to surface type issues
- Review each `src/` subdirectory systematically

---

### REQ-103: Security Hardening

**Description:** Audit and fix security vulnerabilities across all input surfaces.

**Acceptance Criteria:**

- All user input validated before use (CLI args, config values, file paths)
- No command injection vectors in shell executions (`execa`, `Bun.$`)
- No path traversal vulnerabilities in template rendering or file operations
- Dependency audit passes with no high/critical vulnerabilities
- Secrets handling reviewed (env vars, API tokens never logged)
- Config file parsing hardened against malformed input
- Zod schemas validate all external data boundaries

**Technical Notes:**

- Focus on `packages/luca-framework/src/commands/` (user-facing CLI)
- Focus on `packages/luca-framework/src/adapters/` (external API boundaries)
- Review `packages/luca-framework/src/utils/template.ts` (EJS rendering)

---

### REQ-104: Architecture Review

**Description:** Review module boundaries, coupling, error handling patterns, and abstraction quality.

**Acceptance Criteria:**

- No circular dependencies between modules
- Clear module boundaries (agents, skills, rules, compilers don't cross-import internals)
- Error handling uses consistent patterns (discriminated unions where established)
- Base classes are minimal and don't over-abstract
- Public API surface (`index.ts` exports) is intentional — no accidental internal exposure
- Adapter contract properly enforced across implementations
- Build scripts follow consistent patterns

**Technical Notes:**

- Check import graphs for circular refs
- Review `src/agents/base/`, `src/skills/base/`, `src/rules/base/` abstraction quality
- Verify `packages/luca-framework/src/contracts/work-tracker.ts` contract completeness

---

### REQ-105: Performance Review

**Description:** Audit startup time, bundle size, memory usage, and template rendering performance.

**Acceptance Criteria:**

- CLI startup time measured and optimized (target: < 500ms for `luca doctor`)
- Bundle sizes documented for both packages
- No unnecessary dependencies in production builds
- Template rendering performance profiled for large projects
- No memory leaks in long-running operations (init wizard, update)
- Lazy loading applied where appropriate (adapters, heavy dependencies)
- Build scripts optimized for incremental compilation

**Technical Notes:**

- Use `bun build` analysis for bundle inspection
- Profile with `--inspect` flag
- Check `package.json` for dev-only deps in production

---

### REQ-106: Developer Experience Review

**Description:** Audit CLI UX, error messages, documentation accuracy, and onboarding flow.

**Acceptance Criteria:**

- All CLI error messages are actionable (tell user what to do, not just what failed)
- Help text accurate for all commands (doctor, init, update)
- Template documentation matches actual framework behavior
- Onboarding flow (init wizard) handles all edge cases gracefully
- Config validation provides clear error messages for invalid values
- Build scripts documented with usage instructions
- README and docs match current implementation (no stale references)

**Technical Notes:**

- Run through full `luca init` flow manually
- Check all `consola.error()` and `consola.warn()` messages
- Verify template file references match actual file structure

---

## Out of Scope

- New features (stack templates, monorepo support, etc.) — deferred to v1.1.0
- Refactoring architecture — fix issues, don't redesign
- Performance rewrites — optimize hot paths, don't rewrite systems
- CI/CD setup — document expectations, don't implement pipeline

---

## Traceability

| REQ | Phase | Priority | Complexity | Status |
|-----|-------|----------|------------|--------|
| REQ-101 | 1 (Testing) | Critical | High | Pending |
| REQ-102 | 2 (Code Quality) | High | Medium | Pending |
| REQ-103 | 3 (Security) | Critical | Medium | Pending |
| REQ-104 | 4 (Architecture) | High | Medium | ✅ Complete |
| REQ-105 | 5 (Performance) | Medium | Medium | ✅ Complete |
| REQ-106 | 6 (DX) | Medium | Low | Pending |

---

*Requirements created: 2026-02-09*
