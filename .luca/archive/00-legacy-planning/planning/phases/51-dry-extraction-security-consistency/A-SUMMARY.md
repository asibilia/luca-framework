---
id: 51-A
status: complete
tasks_completed: [T1, T2, T3, T4, T5, T6]
files_changed:
  - scripts/parse-frontmatter.ts (created)
  - scripts/generate-rules-from-cursor.ts (modified)
  - scripts/generate-agents-from-cursor.ts (modified)
  - scripts/generate-skills-from-cursor.ts (modified)
---

# Summary: Plan 51-A — Extract Shared Frontmatter Parsing Utility

## Outcome

Extracted the duplicated frontmatter parsing logic (~30 lines of identical YAML-like parsing code) from three generate scripts into a single shared utility at `scripts/parse-frontmatter.ts`. All three scripts now delegate to `parseFrontmatter()` instead of inline parsing. All `fs/promises` imports updated to use `node:` prefix. Build, typecheck, and tests pass with zero regressions.

## Tasks Completed

### T1: Created scripts/parse-frontmatter.ts

- Exported `parseFrontmatter()` function with `ParsedFrontmatter` and `ParseFrontmatterOptions` interfaces.
- Supports `fallbackDescription` option for files without frontmatter (used by rules script).
- Internal helpers: `parseFrontmatterBlock()`, `coerceValue()`, `extractFallbackDescription()`.
- Full JSDoc documentation on all exports.

### T2: Refactored generate-rules-from-cursor.ts

- Replaced `import { mkdir, readdir } from "fs/promises"` with `from "node:fs/promises"`.
- Added `import { parseFrontmatter } from "./parse-frontmatter"`.
- Replaced 77-line `parseRuleMarkdown` function with 17-line version using shared utility.
- Uses `{ fallbackDescription: true }` to preserve fallback behavior for .mdc files without frontmatter.

### T3: Refactored generate-agents-from-cursor.ts

- Replaced `import { mkdir, readdir } from "fs/promises"` with `from "node:fs/promises"`.
- Added `import { parseFrontmatter } from "./parse-frontmatter"`.
- Replaced 59-line `parseAgentMarkdown` function with 16-line version using shared utility.

### T4: Refactored generate-skills-from-cursor.ts

- Replaced `import { mkdir, readdir, stat, access } from "fs/promises"` with `from "node:fs/promises"`.
- Added `import { parseFrontmatter } from "./parse-frontmatter"`.
- Replaced 54-line `parseSkillMarkdown` function with 11-line version using shared utility.

### T5: All three generate scripts now use `node:fs/promises` prefix (verified by grep).

### T6: Final verification

- **tsc --noEmit**: PASS — zero type errors.
- **bun test**: PASS — 1763 tests passed, 0 failed, 6 skipped.
- **bun run build:all**: PASS — 327 files generated.
- **grep checks**: Zero inline frontmatter parsing, zero `fs/promises` without `node:` prefix.

## Deviations

None. All tasks completed as planned.

## Files Changed

- `scripts/parse-frontmatter.ts` — new shared frontmatter parsing utility
- `scripts/generate-rules-from-cursor.ts` — refactored to use shared utility
- `scripts/generate-agents-from-cursor.ts` — refactored to use shared utility
- `scripts/generate-skills-from-cursor.ts` — refactored to use shared utility
