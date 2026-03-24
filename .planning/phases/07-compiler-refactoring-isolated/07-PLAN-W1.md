---
phase: 7
plan: 1
type: refactor
autonomous: true
wave: 1
depends_on: []
---

# Phase 7 Plan 1: Compiler Refactoring (B08)

## Objective

Refactor `src/compilers/__helpers/compile.ts` to delegate compilation to the Claude adapter emitters from Phase 6. Remove inline compilation logic. Preserve all exports and byte-identical output.

## Context

- @.planning/todos/pending/runtime-b08-compiler-refactoring.md (exact refactored code)
- @.planning/phases/07-compiler-refactoring-isolated/07-CONTEXT.md (decisions)
- @src/compilers/\_\_helpers/compile.ts (file to refactor)
- @src/adapters/claude/agent-emitter.ts (emitAgentMarkdown)
- @src/adapters/claude/skill-emitter.ts (emitSkillMarkdown, emitSkillPluginMarkdown)
- @src/adapters/claude/claude-adapter.ts (createClaudeAdapter, compileRule)

## Tasks

### 1. Refactor compile.ts to delegate to adapter emitters (B08)

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the entire content of `src/compilers/__helpers/compile.ts` with the refactored version from the todo file. Key changes:

1. **Remove** `buildAgentFrontmatter` private function (now in agent-emitter.ts)
2. **Remove** `formatFrontmatter` import (adapter handles it)
3. **Add imports** from `~/adapters/claude/agent-emitter`, `~/adapters/claude/skill-emitter`, `~/adapters/claude/claude-adapter`
4. **Add** lazy `getClaudeAdapter()` factory for rule compilation
5. **Replace** `compileAgentClaude` body → delegates to `emitAgentMarkdown(agent)`
6. **Replace** `compileSkillClaude` body → delegates to `emitSkillMarkdown(skill)`
7. **Replace** `compileRuleClaude` body → delegates to `getClaudeAdapter().compileRule!(rule) as string`
8. **Replace** `compileAgentPlugin` body → delegates to `emitAgentMarkdown(agent)`
9. **Replace** `compileSkillPlugin` body → delegates to `emitSkillPluginMarkdown(skill)`
10. **Replace** `compileRulePlugin` body → delegates to `getClaudeAdapter().compileRule!(rule) as string`
11. **Preserve** all export signatures unchanged: SupportedFormat, validateFormat, compileAgentClaude, compileSkillClaude, compileRuleClaude, compileAgentPlugin, compileSkillPlugin, compileRulePlugin, compileAgent, compileSkill, compileRule

**plugin-registry.ts:** No changes needed — it imports from `./compile` which now delegates internally.

**Files to modify:**

- `src/compilers/__helpers/compile.ts` (refactor)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All existing exports preserved (same function names, same signatures)
- `buildAgentFrontmatter` removed from file
- `formatFrontmatter` import removed from file
- New imports from `~/adapters/claude/*` present
- `getClaudeAdapter()` lazy factory present

**NOTE:** Byte-identical output verification via `bun run build:all` + diff must be done manually outside Claude Code.

## Verification

```bash
bunx --bun tsc --noEmit
```

## Success Criteria

- compile.ts is now a ~140-line thin delegation layer (down from ~260)
- All exported function signatures unchanged
- Type-check passes
- No compilation logic remains in compile.ts
- Manual `bun run build:all` + diff verification deferred to developer

## Output Specification

- `src/compilers/__helpers/compile.ts` (modified — refactored to delegate)
