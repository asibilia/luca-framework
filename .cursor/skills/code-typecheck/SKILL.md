---
name: "code-typecheck"
description: "Run TypeScript type checking on the codebase or specific workspace. Use when the user wants to typecheck, check types, run tsc, find type errors, or verify TypeScript."
---

<main>
# Code Typecheck

Run TypeScript type checking on the codebase.

## Instructions

1. **Determine scope**:
   - Specific workspace: `bun run --cwd [workspace] tsc --noEmit`
   - Full codebase: `bun turbo typecheck`
2. **Parse errors**: Categorize by severity and group by file
3. **Suggest fixes** for common patterns

## Notes

- Turborepo parallelizes type checking across all workspaces
- Use specific workspace path to check only that package

</main>
