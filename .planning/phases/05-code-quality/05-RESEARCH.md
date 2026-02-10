# Phase 5 Research: Code Quality Audit

## TypeScript Strict Check (`bunx tsc --noEmit --strict`)

**Total errors: 266**

| Location | Errors | Nature |
|----------|--------|--------|
| `src/agents/general/*.agent.ts` | ~180 | Markdown-in-strings: backticks, special chars in template literal content sections |
| `src/skills/general/*.skill.ts` | ~60 | Same — content-heavy files with embedded markdown |
| `src/rules/general/*.rule.ts` | ~20 | Same — rule content with code examples |
| `src/skills/luca/lu.skill.ts` | ~6 | Same |
| `packages/luca-framework/src/**` | **0** | Clean |
| `src/shared/**` | **0** | Clean |
| `src/compilers/**` | **0** | Clean |
| `src/*/base/**` | **0** | Clean |
| `src/*/types/**` | **0** | Clean |

**Conclusion:** All errors are in content files (agents, skills, rules with large markdown strings). Core framework infrastructure is error-free under strict mode. These content files contain template literals with embedded markdown/code examples that trip up TypeScript's parser but don't affect runtime behavior.

---

## `any` Type Audit

**Total: 13 actual usages across 8 files**

### Type definition index signatures (3 occurrences)
- `src/agents/types/agent.types.ts:13` — `[key: string]: any`
- `src/skills/types/skill.types.ts:12` — `[key: string]: any`
- `src/rules/types/rule.types.ts:12` — `[key: string]: any`

### Utility functions using `Record<string, any>` (8 occurrences)
- `src/shared/utils.ts:4` — `formatFrontmatter(frontmatter: Record<string, any>)`
- `src/rules/general/functional-api-reuse.rule.ts:94-97` — 4 occurrences in object transform helpers
- `src/rules/general/api-snake-case.rule.ts:136,145` — 2 occurrences in case conversion helpers
- `src/rules/general/no-classes.rule.ts:100` — cache set method

### Agent content (2 occurrences — in markdown strings, not real types)
- `src/agents/general/code-simplifier.agent.ts:53` — in a section body string
- `src/agents/general/lu-pr-reviewer.agent.ts:103` — in a section body string

**Conclusion:** The 3 index signatures in type definitions are the only ones that matter architecturally. The `Record<string, any>` usages in utility functions could be tightened. The rest are in markdown content strings.

---

## Dead Code / Unused Exports

### Unused Functions
| File | Function | Lines |
|------|----------|-------|
| `src/shared/utils.ts` | `escapeMarkdown()` | 27-30 |
| `src/shared/utils.ts` | `generateFileName()` | 32-34 |

### Unused Constants
| File | Constant | Lines |
|------|----------|-------|
| `src/shared/constants.ts` | `CURSOR_DIR`, `AGENT_DIR`, `SKILL_DIR`, `RULE_DIR`, `LUCA_SUBDIR` | 4-9 |
| `src/shared/constants.ts` | `SUPPORTED_FORMATS` | 11-14 |

### Validation Functions (public API, unused internally)
- `src/shared/validation-utils.ts` — All 6 exported functions (`validateAgentConfig`, `safeValidateAgentConfig`, etc.) are only used in tests, not production code. They are part of the public API surface via `src/shared/validation/index.ts`.

### Duplicate Files
| Original | Duplicate | Nature |
|----------|-----------|--------|
| `src/agents/general/lu-executor.agent.ts` | `src/agents/luca/lu-executor.agent.ts` | Near-identical, both used in build scripts |
| `src/agents/general/lu-planner.agent.ts` | `src/agents/luca/lu-planner.agent.ts` | Near-identical, both used in build scripts |
| `src/rules/general/lu-workflow.rule.ts` | `src/rules/lu-workflow.rule.ts` | Near-identical |

---

## Naming & Import Consistency

### Class Naming (CRITICAL)
27+ classes have broken PascalCase conversion from kebab-case filenames:
- `code-lint.skill.ts` → `CodelintSkill` (should be `CodeLintSkill`)
- `lu-codebase-mapper.agent.ts` → `LucodebasemapperAgent` (should be `LuCodebaseMapperAgent`)
- Pattern is systematic across all `general/*.ts` files

### Import Consistency
- `import type` NOT used for type-only imports in most content files
- Path alias `~/*` configured in tsconfig but never used (all imports are relative)

### Duplicate Logic
Three base classes share nearly identical `toCursorFormat()` and `toClaudeFormat()` methods:
- `src/agents/base/base-agent.ts`
- `src/skills/base/base-skill.ts`
- `src/rules/base/base-rule.ts`

### Barrel Files
Inconsistent — `src/shared/`, `src/skills/`, `packages/*/src/adapters/` have barrel files; `src/agents/`, `src/rules/` don't.

---

## Priority Assessment

| Issue | Severity | Effort | Scope |
|-------|----------|--------|-------|
| Dead code removal | High | Low | 2 files |
| `any` in type definitions | High | Medium | 3 type files + consumers |
| Duplicate luca/ files | High | Low | 3 file pairs |
| Class naming | Medium | Medium | 27+ files (scripted fix) |
| Duplicate base class logic | Medium | Medium | 3 base classes |
| `import type` consistency | Low | Low | Scripted fix |
| Unused constants | Low | Low | 1 file |
