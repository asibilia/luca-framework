# Phase 19 Context: Plugin Infrastructure

## Phase Goal

Create the plugin compiler, extend the type system, and build the plugin compilation pipeline. This phase lays the foundation for packaging Luca as a Claude Code plugin.

## Key Design Decisions

1. **Plugin format reuses Claude format** — Plugin skills/agents/commands use the same markdown format as .claude/ output (H1 heading + H2 sections). The difference is directory structure, not content format.
2. **toPluginFormat() delegates to toClaudeFormat()** — Since the plugin content format matches Claude format, the base classes can reuse existing formatting. The plugin compiler handles structural differences (directory layout, manifest).
3. **Plugin output directory: dist/plugin/** — Keep plugin output separate from .claude/ and .cursor/ to avoid confusion. The `dist/` directory is conventional for build artifacts.
4. **Plugin manifest is generated, not hand-written** — Plugin.json is generated from package.json version + registry metadata.
5. **SupportedFormat extended to 'PLUGIN'** — Adds plugin as a third compilation target alongside CURSOR and CLAUDE.
6. **No changes to entity interfaces** — BaseAgent, BaseSkill, BaseRule interfaces remain unchanged. Plugin compilation uses existing toClaudeFormat() through the compiler layer, not new methods on entities.

## Plugin Spec Reference

- `.claude-plugin/plugin.json` — Only `name` is required; auto-discovery handles rest
- `skills/<name>/SKILL.md` — Same as .claude/ structure
- `agents/<name>.md` — Same as .claude/ structure
- `commands/<name>.md` — Markdown with `description` frontmatter
- `hooks/hooks.json` — Same as .claude/settings.json hooks section format
- Scripts use `${CLAUDE_PLUGIN_ROOT}` for path resolution

## Files to Create/Modify

### New Files

- `src/compilers/plugin.compiler.ts` — Plugin compiler extending BaseCompiler
- `src/compilers/plugin.types.ts` — Plugin manifest schema and types
- `scripts/build-plugin.ts` — Plugin build script

### Modified Files

- `src/compilers/base.compiler.ts` — Add 'PLUGIN' to SupportedFormat
- `scripts/build-all.ts` — Add plugin compilation step
- `package.json` — Add build:plugin script

## Relevant Existing Code

- `src/compilers/base.compiler.ts` — BaseCompiler abstract class
- `src/compilers/claude.compiler.ts` — ClaudeCompiler (closest to plugin format)
- `src/shared/format.ts` — toClaudeFormat(), toCursorFormat()
- `scripts/build-all.ts` — Unified build pipeline
- `scripts/build-utils.ts` — cleanDirectory, ensureDir utilities
- `src/hooks/index.ts` — hookRegistry, generateHooksConfig
