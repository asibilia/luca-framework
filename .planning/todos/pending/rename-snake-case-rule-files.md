---
title: "Rename 2 rule files from snake_case to kebab-case"
area: conventions
priority: low
created: 2026-02-16
source: repo-audit
---

## Context

The project enforces kebab-case file naming. Two rule files use snake_case instead.

## Task

1. Rename `src/rules/general/cursor_rules.rule.ts` to `src/rules/general/cursor-rules.rule.ts`
2. Rename `src/rules/general/self_improve.rule.ts` to `src/rules/general/self-improve.rule.ts`
3. Update all imports referencing the old names
4. Run `bun run build:all` to regenerate outputs
5. Run `bun run check:drift` to verify

## Notes

- Use `git mv` to preserve file history
- The registry keys in `src/rules/index.ts` can stay as-is (they're string identifiers, not file paths)
- Generated output filenames in `.claude/rules/` and `.cursor/rules/` derive from rule description, not filename
