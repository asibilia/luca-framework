# Phase 7: Architecture - Research

**Researched:** 2026-02-10
**Domain:** Module architecture, coupling, error handling
**Confidence:** HIGH (based on direct codebase analysis)

## Summary

The luca-framework codebase has a well-structured modular architecture with two clearly separated domains: `src/` (the compiler/definition system for agents, skills, and rules) and `packages/` (the CLI tooling and work-tracker adapter system). The core type system follows a consistent pattern of interface types, Zod schemas, base class implementations, and concrete specializations. The adapter contract in `packages/luca-framework/src/contracts/work-tracker.ts` is well-designed with proper discriminated union result types.

However, the analysis uncovered several architecture issues that need attention. The most significant finding is **broken import paths in all 19 rule files under `src/rules/general/`** -- they import from `./base/base-rule` and `./types/rule.types` instead of the correct `../base/base-rule` and `../types/rule.types`. This is a systematic bug originating from the `generate-rules-from-cursor.ts` script which generates incorrect relative paths. Additionally, the build scripts show significant duplication and inconsistency, with some scripts referencing non-existent exports (e.g., `compile-to-cursor.ts` importing `LuRule` instead of the actual export name `LuWorkflowRule`). The `src/shared/validation-utils.ts` module contains duplicated code that also exists in `packages/luca-framework/src/utils/sanitize.ts`.

No circular dependencies were found. Module boundaries are generally well-maintained, with the notable exception of `src/shared/validation-utils.ts` which reaches into all three module type systems (agents, skills, rules), creating a hub dependency. Error handling is consistent within the adapter layer (discriminated unions) but uses different patterns (thrown errors via Zod `.parse()`) in the base class layer. Base classes are appropriately minimal and follow a clean template pattern.

## Import Graph Analysis

### Circular Dependencies Found

**None found.** The import graph flows in a clean directed acyclic pattern:

```
External libs (zod, js-yaml)
    |
Types/Schemas (agent.types, agent.schemas, etc.)
    |
Shared (utils.ts, format.ts)
    |
Base Classes (base-agent, base-skill, base-rule)
    |
Concrete Implementations (general/*, luca/*)
    |
Compilers (base.compiler, cursor.compiler, claude.compiler)
    |
Index files & Build scripts
```

Within `packages/luca-framework/`:
```
contracts/work-tracker.ts
    |
adapters/ (github-adapter, jira-adapter, placeholder-adapter)
    |
adapters/index.ts (factory)
```

### Cross-Boundary Imports

**1. `src/shared/validation-utils.ts` -- Hub dependency (MEDIUM severity)**

This file imports from ALL three module type systems:
- `../agents/types/agent.schemas` and `../agents/types/agent.types`
- `../skills/types/skill.schemas` and `../skills/types/skill.types`
- `../rules/types/rule.schemas` and `../rules/types/rule.types`

This creates a cross-cutting dependency where `shared/` depends on all modules rather than modules depending on shared. This inverts the expected dependency direction.

**2. `src/compilers/` -- Intentional cross-module access (OK)**

Compilers legitimately import type interfaces from all three modules (agents, skills, rules) since their purpose is to compile output from any module type. These are all `import type` statements, which is correct.

**3. No `src/` to `packages/` cross-imports (GOOD)**

The two top-level domains (`src/` and `packages/`) are completely isolated from each other. No imports cross this boundary, validating the self-contained cross-package module design noted in MEMORY.md.

**4. `packages/create-luca/` to `packages/luca-framework/` (OK)**

`create-luca/src/index.ts` imports `{ runInit } from 'luca-framework'` -- this is a proper package dependency, not a path-based cross-import.

## Module Boundary Analysis

### Module: agents (`src/agents/`)
- **Internal imports:** `base/base-agent` imports from `types/agent.types`, `types/agent.schemas`, and `../../shared/format`
- **External imports:** `zod` (in schemas only)
- **Intra-module pattern:** `general/*` and `luca/*` import from `../base/base-agent` and `../types/agent.types` (correct paths)
- **Issues:** None. Clean module boundary.

### Module: skills (`src/skills/`)
- **Internal imports:** `base/base-skill` imports from `types/skill.types`, `types/skill.schemas`, and `../../shared/format`
- **External imports:** `zod` (in schemas only)
- **Intra-module pattern:** `general/*` and `luca/*` import from `../base/base-skill` and `../types/skill.types` (correct paths)
- **Issues:** None. Clean module boundary.

### Module: rules (`src/rules/`)
- **Internal imports:** `base/base-rule` imports from `types/rule.types`, `types/rule.schemas`, and `../../shared/format`
- **External imports:** `zod` (in schemas only)
- **Intra-module pattern:** `general/*` import from `./base/base-rule` and `./types/rule.types` (**WRONG paths**)
- **Issues:** **HIGH -- All 19 rule files in `general/` have incorrect relative import paths.** They use `./base/base-rule` (which resolves to `src/rules/general/base/base-rule`) instead of `../base/base-rule` (which would correctly resolve to `src/rules/base/base-rule`). Same issue with `./types/rule.types` vs `../types/rule.types`. The root cause is the `generate-rules-from-cursor.ts` script which generates imports with `./` prefix instead of `../`.

### Module: compilers (`src/compilers/`)
- **Internal imports:** `cursor.compiler` and `claude.compiler` import from `./base.compiler`
- **External imports:** Type-only imports from `agents/types`, `skills/types`, `rules/types`
- **Issues:** None. Cross-module type imports are intentional and appropriate.

### Module: shared (`src/shared/`)
- **Internal imports:** `format.ts` imports from `./utils`
- **External imports:** `js-yaml` (in utils only)
- **Issues:** `validation-utils.ts` inverts the dependency direction by importing FROM all module types INTO shared.

### Module: adapters (`packages/luca-framework/src/adapters/`)
- **Internal imports:** All adapters import from `../contracts/work-tracker`
- **External imports:** `execa`, `zod` (github/jira adapters)
- **Issues:** None. Clean contract-based boundary.

### Module: commands (`packages/luca-framework/src/commands/`)
- **Internal imports:** Import from `../utils/*` and `../types`
- **External imports:** `citty`, `@clack/prompts`, `fs`, `pathe`, `fs-extra`
- **Issues:** None. Clean layering.

### Module: utils (`packages/luca-framework/src/utils/`)
- **Internal imports:** Utils import from `../types` and from sibling utils
- **External imports:** Various (consola, pathe, pkg-types, fs-extra, etc.)
- **Issues:** None. Clean layering.

## Error Handling Patterns

### Current Patterns

**Pattern 1: Discriminated Union Results (adapters)**
Used consistently in `packages/luca-framework/src/adapters/`:
```typescript
type AdapterResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```
All three adapters (GitHub, Jira, Placeholder) use this pattern for every method. The factory and contract enforce this consistently.

**Pattern 2: Thrown Errors via Zod `.parse()` (base classes)**
Used in `src/agents/base/base-agent.ts`, `src/skills/base/base-skill.ts`, `src/rules/base/base-rule.ts`:
```typescript
constructor(config: AgentConfig) {
  const validatedConfig = agentConfigSchema.parse(config); // throws ZodError on failure
  this._config = validatedConfig;
}
```
Zod's `.parse()` throws on validation failure. No try/catch wrapping. This is appropriate for construction-time validation.

**Pattern 3: Thrown Error (compiler base class)**
Used in `src/compilers/base.compiler.ts`:
```typescript
protected validateFormat(format: SupportedFormat): void {
  if (format !== 'CURSOR' && format !== 'CLAUDE') {
    throw new Error(`Unsupported format: ${format}`);
  }
}
```
The only manually thrown error in the `src/` tree.

**Pattern 4: Semi-discriminated union (validation-utils)**
Used in `src/shared/validation-utils.ts`:
```typescript
function safeValidateAgentConfig(config): { success: boolean; data?: AgentConfig; error?: string }
```
This returns `{ success: boolean }` instead of the proper discriminated union `{ success: true, data } | { success: false, error }`. The `success` field is `boolean` rather than a literal type, which prevents TypeScript from narrowing the type properly.

**Pattern 5: Result objects (packages/luca-framework utils)**
Used in `packages/luca-framework/src/utils/files.ts` and `sanitize.ts`:
```typescript
return { success: true, manifest };  // files.ts
return { success: false, error: errorMessage };  // files.ts
return { success: true, data };  // sanitize.ts
return { success: false, error: ... };  // sanitize.ts
```
Similar to discriminated unions but not using the exact `AdapterResult<T>` type. `files.ts` uses `{ success: true, manifest }` instead of `{ success: true, data: manifest }`.

**Pattern 6: try/catch with logging (commands, utils)**
Used in `packages/luca-framework/src/commands/init.ts`, `update.ts`, and various utils:
```typescript
try {
  // operation
} catch (error) {
  logger.error(...)
  // handle
}
```

### Inconsistencies

1. **`validation-utils.ts` uses `{ success: boolean }` instead of discriminated union literal types.** The `safeSanitizeJsonParse`, `safeValidateAgentConfig`, `safeValidateSkillConfig`, and `safeValidateRuleConfig` functions all return `{ success: boolean; data?: T; error?: string }`. This means TypeScript cannot narrow the type when checking `result.success` -- both `data` and `error` remain optional in both branches. The adapter layer's `AdapterResult<T>` type is the correct pattern.

2. **`files.ts` uses `{ success: true, manifest }` instead of `{ success: true, data: manifest }`.** The result object shape differs from the established `AdapterResult<T>` convention by using `manifest` instead of `data` as the property name.

3. **Duplicated sanitize code.** `src/shared/validation-utils.ts` contains `sanitizeJsonParse` and `safeSanitizeJsonParse` functions that are nearly identical to the same functions in `packages/luca-framework/src/utils/sanitize.ts`. This is code duplication across the two domains.

### Recommendations

1. **Adopt `AdapterResult<T>` as the standard result type** across the entire codebase. Import or re-define it in `src/shared/` for use by validation utilities.
2. **Fix `validation-utils.ts` return types** to use proper discriminated unions with literal `true`/`false` types.
3. **Standardize the `data` property name** in result objects (replace `manifest` with `data` in files.ts or accept the deviation as intentional).
4. **Keep Zod `.parse()` throwing in constructors** -- this is appropriate for "fail fast" initialization.

## Base Class Analysis

### base-agent.ts (`src/agents/base/base-agent.ts`)
- **Lines of code:** 36
- **Abstract methods:** None (class itself is `abstract` but defines no abstract methods)
- **Concrete methods:** `constructor`, `config` (getter), `name` (getter), `description` (getter), `toCursorFormat()`, `toClaudeFormat()`
- **Implements:** `BaseAgent` interface from `agent.types.ts`
- **Assessment:** **Appropriately minimal.** The base class does exactly three things: validates config via Zod schema, stores the config, and provides format conversion methods. No business logic. Subclasses only need to provide a config object via `super()`. This is a clean "template + validation" pattern.

### base-skill.ts (`src/skills/base/base-skill.ts`)
- **Lines of code:** 36
- **Abstract methods:** None (class itself is `abstract`)
- **Concrete methods:** `constructor`, `config` (getter), `name` (getter), `description` (getter), `toCursorFormat()`, `toClaudeFormat()`
- **Implements:** `BaseSkill` interface from `skill.types.ts`
- **Assessment:** **Appropriately minimal.** Identical structure to `base-agent.ts`. Perfect symmetry across modules.

### base-rule.ts (`src/rules/base/base-rule.ts`)
- **Lines of code:** 37
- **Abstract methods:** None (class itself is `abstract`)
- **Concrete methods:** `constructor`, `config` (getter), `name` (getter), `description` (getter), `toCursorFormat()`, `toClaudeFormat()`
- **Implements:** `BaseRule` interface from `rule.types.ts`
- **Assessment:** **Appropriately minimal.** Nearly identical to agent/skill base classes. One notable difference: `name` getter derives a name from the description (`this._config.frontmatter.description.substring(0, 30).replace(/\s+/g, '-') || 'rule'`) because rules don't have a `name` frontmatter field. This is a pragmatic approach but slightly fragile -- truncating at 30 chars could produce collisions.

### base.compiler.ts (`src/compilers/base.compiler.ts`)
- **Lines of code:** 20
- **Abstract methods:** `compileAgent()`, `compileSkill()`, `compileRule()`
- **Concrete methods:** `validateFormat()` (protected)
- **Assessment:** **Appropriately minimal.** Defines the compilation contract with three abstract methods and one shared validation helper. The two implementations (CursorCompiler, ClaudeCompiler) simply delegate to the entity's own format methods after validation.

### Overall Base Class Assessment

The base classes are a strong point of the architecture. They are:
- Consistently structured across all three entity types
- Minimal (no over-abstraction)
- Use composition of Zod validation + format delegation
- Inheritance is shallow (one level) and justified

One architectural note: The `BaseCompiler.validateFormat()` is somewhat redundant since TypeScript's type system already constrains `SupportedFormat` to `'CURSOR' | 'CLAUDE'`. The runtime check is only useful if the format string comes from an untyped source.

## Public API Surface

### Root `index.ts` (`/index.ts`)
Exports everything via `export *` from:
- `src/agents/types/agent.types` -- AgentFrontmatter, AgentSection, AgentConfig, BaseAgent + schema types
- `src/skills/types/skill.types` -- SkillFrontmatter, SkillSection, SkillConfig, BaseSkill + schema types
- `src/rules/types/rule.types` -- RuleFrontmatter, RuleSection, RuleConfig, BaseRule + schema types
- `src/agents/base/base-agent` -- BaseAgentImpl class
- `src/skills/base/base-skill` -- BaseSkillImpl class
- `src/rules/base/base-rule` -- BaseRuleImpl class
- `src/compilers/base.compiler` -- BaseCompiler class, SupportedFormat type
- `src/compilers/cursor.compiler` -- CursorCompiler class
- `src/compilers/claude.compiler` -- ClaudeCompiler class
- `src/agents/luca/lu-executor.agent` -- LuExecutorAgent class
- `src/agents/luca/lu-planner.agent` -- LuPlannerAgent class
- `src/skills/luca/lu.skill` -- LuSkill class
- `src/rules/lu-workflow.rule` -- LuWorkflowRule class
- `src/shared/utils` -- formatFrontmatter function
- `src/shared/validation-utils` -- All validation and sanitize functions

**Issues:**
1. **Over-broad exposure via `export *`.** Every export from every referenced module becomes part of the public API. This includes Zod schema type re-exports (`AgentFrontmatterSchema`, `AgentSectionSchema`, `AgentConfigSchema`) which are implementation details.
2. **`formatFrontmatter` is exposed** from `src/shared/utils` -- this is an internal formatting utility, not intended for external consumers.
3. **All validation utilities are exposed**, including `sanitizeJsonParse`, `safeSanitizeJsonParse`, `stripPrototypeKeys` (if not scoped) -- some of these are internal helpers.
4. **Only luca-specific agents/skills/rules are exported.** General agents (23), general skills (37), and general rules (19) are NOT in the root index. This appears intentional -- they are available via `src/skills/index.ts` registry.

### Skills `index.ts` (`src/skills/index.ts`)
Exports:
- `BaseSkillImpl` from `./base/base-skill`
- Types: `BaseSkill, SkillConfig, SkillFrontmatter, SkillSection` from `./types/skill.types`
- `skillRegistry` -- a mapping of all 37 general skill names to their classes

**Issues:** None significant. The registry pattern is clean. However, this index does not export the `LuSkill` from `luca/lu.skill.ts` -- consumers would need to import it directly or get it from the root index.

### Package `index.ts` (`packages/luca-framework/src/index.ts`)
Exports:
- `runMain` -- CLI entry point
- `runInit` -- programmatic init function
- Types: `ProjectContext, BrandingConfig, LucaConfig, LucaManifest, FileComparison, ApprovalConfig`

**Issues:** Clean and intentional. Only the public-facing CLI API and types are exported.

### Adapters `index.ts` (`packages/luca-framework/src/adapters/index.ts`)
Exports:
- `createWorkTrackerAdapter` factory function
- `WorkTrackerConfig` interface
- Re-exports: `WorkTrackerContract, WorkTrackerType, WorkTicket, AdapterResult` from contracts
- Re-exports: All three adapter factory functions individually

**Issues:** None significant. Clean API surface.

### Doctor Checks `index.ts` (`packages/luca-framework/src/utils/doctor/checks/index.ts`)
Exports via `export *`:
- `nodeVersionCheck`, `cursorIdeCheck`, `configValidationCheck`

**Issues:** Minor -- uses `export *` which could leak internal implementation details as checks are added.

### Accidental Exposures

1. **Zod schema types** (e.g., `AgentFrontmatterSchema`, `AgentConfigSchema`) are re-exported via the type files and then via root `index.ts`. These are implementation details of the validation layer.
2. **`formatFrontmatter`** from `src/shared/utils` is not intended as a public API function but is exposed through root `index.ts`.
3. **`sanitizeJsonParse` and `safeSanitizeJsonParse`** from `src/shared/validation-utils.ts` are exposed through root `index.ts`. While useful, they're duplicated with `packages/luca-framework/src/utils/sanitize.ts`.

## Adapter Contract Analysis

### Contract Definition (`packages/luca-framework/src/contracts/work-tracker.ts`)

The contract defines:
- **Types:** `WorkTicketType`, `WorkTicketPriority`, `WorkTicket`, `AdapterResult<T>`, `WorkTrackerType`
- **Interface:** `WorkTrackerContract` with:
  - `name: WorkTrackerType` (required, readonly)
  - `getTicket(ticketId: string): Promise<AdapterResult<WorkTicket>>` (required)
  - `createBranch?(ticketId: string, branchName: string): Promise<AdapterResult<string>>` (optional)
  - `linkPR?(ticketId: string, prUrl: string): Promise<AdapterResult<void>>` (optional)
  - `validate?(): Promise<AdapterResult<boolean>>` (optional)

### Implementation Coverage

| Method | GitHub | Jira | Placeholder | Required? |
|--------|--------|------|-------------|-----------|
| `name` | 'github' | 'jira' | 'none' | Yes |
| `getTicket()` | Implemented | Implemented | Implemented | Yes |
| `createBranch()` | Implemented | **Not implemented** | **Not implemented** | No (optional) |
| `linkPR()` | Implemented (no-op) | **Not implemented** | **Not implemented** | No (optional) |
| `validate()` | Implemented | Implemented | Implemented | No (optional) |

### Gaps

1. **Jira adapter does not implement `createBranch()`.** The contract marks this as optional, and Jira doesn't have native branch creation. This is appropriate -- callers should check `if (adapter.createBranch)` before calling.

2. **Jira adapter does not implement `linkPR()`.** Again marked optional, but Jira does support linking PRs via API (remote links or development information). This could be a future enhancement.

3. **Placeholder adapter does not implement `createBranch()` or `linkPR()`.** This is correct -- placeholder should be minimal.

4. **`updateTicketStatus()` is not in the contract.** The workflow description mentions transitioning tickets (e.g., moving to "In Progress"), but there's no method for this in the contract. This could be a deliberate omission for v1.

5. **`AdapterResult<void>` for `linkPR()`.** The success case returns `{ success: true, data: undefined }` which is slightly awkward. Consider `AdapterResult<void>` or a simpler `{ success: boolean; error?: string }` for methods without meaningful return data.

### Overall Assessment

The adapter contract is well-designed. The required/optional method split is appropriate. The discriminated union result type is clean. Documentation is thorough with JSDoc. The optional method pattern (`method?()`) with caller-side checking (`if (adapter.createBranch)`) is correctly documented and follows TypeScript idioms.

## Build Script Analysis

### Scripts Found

| Script | Path | Purpose |
|--------|------|---------|
| `build-all.ts` | `scripts/build-all.ts` | Generates both Cursor and Claude format files |
| `build-claude.ts` | `scripts/build-claude.ts` | Generates Claude format files only |
| `build-cursor.ts` | `scripts/build-cursor.ts` | Generates Cursor format files only (incomplete -- no general skills) |
| `compile-all-to-cursor.ts` | `scripts/compile-all-to-cursor.ts` | Attempts dynamic discovery but doesn't actually compile (scaffold only) |
| `compile-to-cursor.ts` | `scripts/compile-to-cursor.ts` | Incomplete, references non-existent export `LuRule` |
| `prepare-compilation.ts` | `scripts/prepare-compilation.ts` | Creates build helper scripts and manifest, doesn't compile |
| `generate-agents-from-cursor.ts` | `scripts/generate-agents-from-cursor.ts` | Generates `.agent.ts` files from `.cursor/agents/*.md` |
| `generate-skills-from-cursor.ts` | `scripts/generate-skills-from-cursor.ts` | Generates `.skill.ts` files from `.cursor/skills/*/SKILL.md` |
| `generate-rules-from-cursor.ts` | `scripts/generate-rules-from-cursor.ts` | Generates `.rule.ts` files from `.cursor/rules/*.mdc` -- **has import path bug** |

**Package.json scripts:**
```json
"build": "bun run --filter '*' build",
"build:all": "bun run ./scripts/build-all.ts",
"build:claude": "bun run ./scripts/build-claude.ts",
"build:cursor": "bun run ./scripts/build-cursor.ts",
"generate:from-cursor": "bun run ./scripts/generate-agents-from-cursor.ts && bun run ./scripts/generate-skills-from-cursor.ts && bun run ./scripts/generate-rules-from-cursor.ts",
"compile:to-cursor": "bun run ./scripts/compile-all-to-cursor.ts"
```

### Consistency Issues

1. **`build-cursor.ts` is a subset of `build-all.ts`.** `build-cursor.ts` only compiles luca-specific agents, skill, and rule -- it does NOT compile the 37 general skills. Meanwhile, `build-all.ts` and `build-claude.ts` both compile all general skills. This means `build:cursor` produces incomplete output compared to `build:claude` and `build:all`.

2. **`compile-to-cursor.ts` references non-existent export.** Line 7: `import { LuRule } from './src/rules/lu-workflow.rule'` -- the actual export name is `LuWorkflowRule`, not `LuRule`. This script would fail at runtime.

3. **`compile-all-to-cursor.ts` is a scaffold, not functional.** It discovers files but only logs their names ("Discovered agent: ...") without actually compiling them. The `createBuildSystem()` function generates a JavaScript build script as a string literal, but this approach is architecturally misguided -- Bun can directly import TypeScript.

4. **`prepare-compilation.ts` is also scaffolding.** It creates additional build scripts and manifests but doesn't perform compilation. Contains dead code and TODO comments.

5. **Three scripts for similar purpose.** `compile-to-cursor.ts`, `compile-all-to-cursor.ts`, and `prepare-compilation.ts` all attempt dynamic compilation but none are fully functional. Meanwhile, `build-all.ts` achieves this via explicit imports.

6. **`generate-rules-from-cursor.ts` generates incorrect import paths.** The generated rule files use `./base/base-rule` and `./types/rule.types` paths. Since generated files go to `src/rules/general/`, the correct paths should be `../base/base-rule` and `../types/rule.types`. Compare with `generate-agents-from-cursor.ts` which correctly generates `../base/base-agent` and `generate-skills-from-cursor.ts` which correctly generates `../base/base-skill`.

7. **Inconsistent use of `fs` vs `Bun.file`.** Build scripts use Node's `fs.writeFileSync` and `fs.mkdirSync` despite the project preferring Bun APIs (per CLAUDE.md). However, this may be acceptable for build scripts since they need synchronous behavior.

8. **Build config differences.** `packages/luca-framework/build.config.ts` has `inlineDependencies: true` and explicit `externals`, while `packages/create-luca/build.config.ts` does not. This may be intentional (luca-framework has more dependencies to manage) but should be documented.

### Duplicate Build Logic

`build-all.ts` is essentially `build-cursor.ts` + `build-claude.ts` combined in one script. Rather than having three scripts that share ~80% of the same logic, a single parameterized script would be cleaner:

```
bun run ./scripts/build.ts --format cursor
bun run ./scripts/build.ts --format claude
bun run ./scripts/build.ts --format all
```

## Common Pitfalls (Architecture-Specific)

### Pitfall 1: Wrong import paths in generated rule files
**What goes wrong:** The `generate-rules-from-cursor.ts` script generates `./base/base-rule` imports. Files in `src/rules/general/` need `../base/base-rule` to resolve correctly. This means all 19 generated rule files have broken imports that would fail at compile/runtime.
**How to avoid:** Fix the generator script template to use `../base/base-rule` and `../types/rule.types`. Add a post-generation validation step that checks import resolution.

### Pitfall 2: Stale/broken build scripts
**What goes wrong:** `compile-to-cursor.ts` references `LuRule` which doesn't exist (correct name: `LuWorkflowRule`). Several other compilation scripts are non-functional scaffolding.
**How to avoid:** Remove or update non-functional scripts. Add integration tests that run each build script and verify output. Keep one canonical build script instead of multiple overlapping ones.

### Pitfall 3: Duplicated sanitize code across domains
**What goes wrong:** `sanitizeJsonParse` and `safeSanitizeJsonParse` exist in both `src/shared/validation-utils.ts` and `packages/luca-framework/src/utils/sanitize.ts`. Changes to one won't be reflected in the other. Bug fixes could miss one copy.
**How to avoid:** Since `src/` and `packages/` cannot cross-import at runtime (per MEMORY.md), the duplication is necessary for self-containment. Document this intentional duplication with a comment in both files pointing to the other copy.

### Pitfall 4: `export *` exposing internals
**What goes wrong:** Root `index.ts` uses `export *` which re-exports everything, including Zod schema inference types and internal utility functions. Consumers may start depending on these, making them hard to change.
**How to avoid:** Replace `export *` with explicit named exports in root `index.ts`. Only export the intentional public API.

### Pitfall 5: Inconsistent validation patterns
**What goes wrong:** The `safeValidate*` functions in `validation-utils.ts` return `{ success: boolean }` instead of proper discriminated unions. TypeScript cannot narrow the type, so consumers may access `data` when `success` is false.
**How to avoid:** Define a shared `Result<T>` type following the `AdapterResult<T>` pattern and use it consistently.

### Pitfall 6: Double validation in luca/* implementations
**What goes wrong:** `lu-planner.agent.ts` and `lu.skill.ts` validate config at module level (`agentConfigSchema.parse(luPlannerConfig)`) AND the base class constructor also validates. This means config is validated twice. While not harmful, it's wasted work.
**How to avoid:** Choose one validation point. Module-level validation provides earlier error detection (at import time). Constructor validation is more defensive. Pick one and document the convention.

## Recommendations Summary

| Area | Finding | Severity | Recommendation |
|------|---------|----------|----------------|
| Import paths | All 19 rules in `general/` have wrong `./` paths (should be `../`) | **HIGH** | Fix `generate-rules-from-cursor.ts` template and re-generate rules |
| Build scripts | `compile-to-cursor.ts` references non-existent `LuRule` export | **HIGH** | Fix import or remove broken script |
| Build scripts | 3 non-functional compilation scripts (scaffold only) | **MEDIUM** | Remove `compile-to-cursor.ts`, `compile-all-to-cursor.ts`, `prepare-compilation.ts` |
| Build scripts | `build-cursor.ts` doesn't compile general skills (unlike build-claude and build-all) | **MEDIUM** | Add general skill compilation to `build-cursor.ts` or consolidate scripts |
| Error handling | `validation-utils.ts` uses `{ success: boolean }` instead of discriminated union | **MEDIUM** | Change to `{ success: true; data: T } \| { success: false; error: string }` |
| Code duplication | `sanitizeJsonParse` duplicated in `src/shared/` and `packages/luca-framework/` | **MEDIUM** | Add cross-reference comments; accept as necessary for package isolation |
| Public API | Root `index.ts` uses `export *` exposing internal details | **MEDIUM** | Replace with explicit named exports |
| Dependency direction | `shared/validation-utils.ts` imports from all three modules | **LOW** | Consider moving validation utils into each module or accepting as a utility hub |
| Base class | Rule `name` getter truncates description at 30 chars (collision risk) | **LOW** | Consider adding a `name` field to rule frontmatter or generating a unique slug |
| Build config | Inconsistent unbuild configs between luca-framework and create-luca | **LOW** | Document the differences or align configurations |
| Base class | Double validation in `lu-planner.agent.ts` and `lu.skill.ts` (module-level + constructor) | **LOW** | Pick one validation point and document the convention |
| Compiler | `BaseCompiler.validateFormat()` runtime check redundant with TypeScript type | **LOW** | Keep for safety but acknowledge redundancy |

## Sources

All findings based on direct codebase analysis of the luca-framework repository at commit `f3ad837` on branch `1--luca-framework-packaging`. Files analyzed include all TypeScript source files in `src/` (78 files), `packages/` (28 files), and `scripts/` (9 files).
