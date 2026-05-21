# Phase 7 — Compiler Refactoring: Context

## Phase Scope

Refactor `src/compilers/__helpers/compile.ts` to delegate to Claude adapter emitters from Phase 6. Single plan item (B08). Byte-identical output constraint.

## Decisions

### 1. Delegation pattern [researched — todo prescribes exact code]

Replace inline compilation functions with delegations to adapter emitters:

- `compileAgentClaude` → `emitAgentMarkdown` from `~/adapters/claude/agent-emitter`
- `compileSkillClaude` → `emitSkillMarkdown` from `~/adapters/claude/skill-emitter`
- `compileRuleClaude` → `getClaudeAdapter().compileRule!(rule)`
- `compileSkillPlugin` → `emitSkillPluginMarkdown` from `~/adapters/claude/skill-emitter`
- `buildAgentFrontmatter` removed entirely (lives in agent-emitter.ts now)

### 2. Lazy adapter instantiation [researched — todo prescribes pattern]

Use `getClaudeAdapter()` with lazy initialization to avoid circular deps at module load time. Rule compilation delegates through the full adapter instance rather than a separate emitter.

### 3. T3-to-T3 cross-import is allowed [verified]

`compilers` (T3) importing from `adapters` (T3) is same-tier. The enforcement script checks `sourceTier < targetTier`, so 3→3 passes. Entity isolation only applies to T2.

### 4. plugin-registry.ts unchanged [verified]

No changes needed — it already imports from `./compile`, which now delegates internally.

### 5. Manual verification required [constraint]

`bun run build:all` + diff verification MUST happen outside Claude Code (crashes the session). The developer already ran `bun run build:all` before this session to verify Phase 6 output.

## Deferred Ideas

None.
