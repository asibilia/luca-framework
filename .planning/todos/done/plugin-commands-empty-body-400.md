---
title: Fix plugin commands/ empty body causing API 400 errors
area: distribution
created: 2026-02-12
source: conversation (live testing of plugin in another project)
---

## Context

When testing the Luca plugin via `claude --plugin-dir ~/Github/luca-framework/dist/plugin` in another project, invoking any command (e.g., `/luca:lu-new-project`, `/luca:lu`) returns API 400 errors:

- `cache_control cannot be set for empty text blocks`
- `text content blocks must be non-empty`

## Root Cause

`generateCommandMarkdown()` in `scripts/build-shared.ts:214-219` intentionally generates frontmatter-only files with no body:

```typescript
export function generateCommandMarkdown(
  skillName: string,
  description: string,
): string {
  return `---\ndescription: ${description}\n---\n`;
}
```

All 38 files in `dist/plugin/commands/` are empty stubs. Claude Code loads command markdown and sends body content to the API. Empty body = empty text block = 400 rejection.

The original design assumed commands were just registration metadata and skills/ held the real content. But Claude Code doesn't fall through from a command stub to the matching skill — it sends the command file content directly.

## Recommended Fix

**Remove `commands/` generation entirely.** Per Claude Code docs, `commands/` is the legacy approach — "commands are simple markdown files (legacy; use skills/ for new skills)". The `skills/{name}/SKILL.md` files already handle both auto-invocation and user-invokable slash commands. The commands directory is redundant and actively breaking the plugin.

Changes needed:

1. **build-all.ts**: Remove the section that generates `dist/plugin/commands/` (around line 517-562)
2. **build-shared.ts**: Remove or deprecate `generateCommandMarkdown()` and `COMMAND_EXCLUDED_SKILLS`
3. **plugin.json**: Remove the `"commands"` array
4. **check-drift.ts**: Remove drift entries for `dist/plugin/commands/` files
5. **check-drift.test.ts**: Update plugin file count expectations
6. **Rebuild and retest** with `claude --plugin-dir`

## Notes

- The skills/ directory already has full SKILL.md content for every command
- Claude Code docs say commands/ is legacy; skills/ is the current approach
- This also addresses the review finding that plugin.json lists bare names instead of paths in the commands array
- After fix, verify with `claude plugin validate` and live `--plugin-dir` testing
