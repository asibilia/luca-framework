---
name: code-lint
description: Run ESLint with auto-fix on the codebase or specific path. Use when the user wants to lint code, fix linting errors, run eslint, or check code style.
---

<main>
<main>
# Code Lint

Run ESLint with auto-fix on the codebase.

## Instructions

1. **Determine target**: Use user-specified path or entire codebase
2. **Run lint command**:
   - Full codebase: `bun run lint`
   - Specific path: `bun run --cwd [path] lint`
3. **Report results**: List fixed issues and remaining errors
4. **Suggest fixes** for remaining issues

## Workspace-specific examples

```bash
bun run --cwd apps/admin-ui lint
bun run --cwd packages-ui/components lint
```
</main>
</main>