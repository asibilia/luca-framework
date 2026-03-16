---
description: Prevent direct edits to generated shell wrapper files
alwaysApply: true
---

# Prevent direct edits to generated shell wrapper files

## rule

- **NEVER edit files in `.claude/hooks/` or `.claude/statusline.sh` directly**
  - These `.sh` files are **generated output** produced by `bun run build:all`
  - The source of truth is TypeScript files in `src/hooks/scripts/`
  - Direct edits to `.sh` files will be **silently overwritten** on the next build
  - To modify hook behavior: edit `src/hooks/scripts/{hook-name}.ts`, then run `bun run build:all`
  - To modify shell wrapper generation: edit `src/hooks/__helpers/generate-shell-wrappers.ts`
  - The same applies to all generated output directories: `.claude/`, `.cursor/`, `.pi/`
  - Use `bun run check:drift` to verify generated output matches source