---
id: 51-A
title: "Extract shared frontmatter parsing utility from generate scripts"
wave: A
phase: 51
mode: gap_closure
complexity: MODERATE
tasks:
  - id: T1
    title: "Create shared frontmatter parsing utility in scripts/"
    file: scripts/parse-frontmatter.ts
    priority: HIGH
  - id: T2
    title: "Refactor generate-rules-from-cursor.ts to use shared utility"
    file: scripts/generate-rules-from-cursor.ts
    priority: HIGH
  - id: T3
    title: "Refactor generate-agents-from-cursor.ts to use shared utility"
    file: scripts/generate-agents-from-cursor.ts
    priority: HIGH
  - id: T4
    title: "Refactor generate-skills-from-cursor.ts to use shared utility"
    file: scripts/generate-skills-from-cursor.ts
    priority: HIGH
  - id: T5
    title: "Fix node:fs prefix in generate script imports"
    file: scripts/generate-*.ts
    priority: MEDIUM
  - id: T6
    title: "Final verification — build + test + typecheck"
    priority: HIGH
---

# Phase 51-A — Extract Shared Frontmatter Parsing Utility

## Objective

Extract the duplicated frontmatter parsing logic (~30 lines of identical YAML-like parsing code) from three generate scripts into a single shared utility. This closes:

- **HIGH #5** (Code Simplifier): Triple code duplication of frontmatter parsing, template generation, and orchestration (~150 lines) across `scripts/generate-*-from-cursor.ts`
- **MEDIUM** (DX Advocate): `fs/promises` imports without `node:` prefix in 3 files

The three scripts share identical frontmatter extraction and value-coercion logic. Extracting this into `scripts/parse-frontmatter.ts` eliminates ~60 lines of duplication (the core parsing loop appears 3 times) and provides a single place to maintain and test the parsing logic.

## Context

The three generate scripts are build-time tools invoked via `bun run generate:from-cursor` (see `package.json` line 21). They read `.mdc` / `.md` files from `.cursor/` directories, parse YAML-ish frontmatter, and emit TypeScript source files into `src/`. They feed into the build pipeline but are NOT runtime code.

**Key architectural note:** These scripts live in `scripts/` (build tooling), NOT in `src/` or `packages/`. The shared utility stays in `scripts/` to avoid cross-package import issues (per MEMORY: self-contained cross-package modules pattern).

### Duplicated Code (identical across all 3 scripts)

The frontmatter parsing loop at lines 25-52 of `generate-agents-from-cursor.ts`, lines 25-52 of `generate-skills-from-cursor.ts`, and lines 25-52 of `generate-rules-from-cursor.ts`:

```typescript
// This exact block appears in all three files:
const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
// ...
const frontmatter = frontmatterMatch[1]!;
const frontmatterLines = frontmatter.split("\n");
const parsedFrontmatter: Record<string, any> = {};
for (const line of frontmatterLines) {
  if (line.trim()) {
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const key = line.substring(0, colonIndex).trim();
      const rawValue = line.substring(colonIndex + 1).trim();
      let value: any = rawValue;
      // Handle arrays
      if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        value = rawValue
          .slice(1, -1)
          .split(",")
          .map((v) => v.trim().replace(/"/g, "").replace(/'/g, ""));
      } else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        value = rawValue.slice(1, -1);
      } else if (rawValue === "true") {
        value = true;
      } else if (rawValue === "false") {
        value = false;
      } else if (!isNaN(Number(rawValue))) {
        value = Number(rawValue);
      }
      parsedFrontmatter[key] = value;
    }
  }
}
const contentWithoutFrontmatter = content
  .substring(frontmatterMatch[0].length)
  .trim();
```

## Pitfalls

- **CAUTION:** These scripts feed the build pipeline (`bun run generate:from-cursor`). After extraction, run the full generate command to verify output is identical.
- **CAUTION:** `generate-rules-from-cursor.ts` has an extra fallback path when no frontmatter is found (lines 58-77) that the other two scripts do NOT have. The shared utility must support this optional fallback behavior via a configuration flag.
- **NOTE:** The `fs/promises` imports without `node:` prefix work in Bun but violate the project convention. Fix these as part of the refactor.
- **NOTE:** Empty string values from frontmatter (e.g., `description:`) result in empty string after `trim()`, which is falsy. The number coercion `!isNaN(Number(""))` is true since `Number("")` is 0. This is existing behavior that must be preserved (not fixed in this phase).

---

## Task T1 — Create shared frontmatter parsing utility

**File:** `scripts/parse-frontmatter.ts` (new)

### What to create

A shared module exporting the common frontmatter parsing logic:

````typescript
#!/usr/bin/env bun

/**
 * Shared frontmatter parsing utility for generate-*-from-cursor scripts.
 *
 * Extracts YAML-like frontmatter from markdown files and coerces
 * values to appropriate JavaScript types (boolean, number, array, string).
 *
 * @module scripts/parse-frontmatter
 */

/**
 * Result of parsing a markdown file with optional frontmatter.
 */
export interface ParsedFrontmatter {
  /** Parsed key-value pairs from the frontmatter block */
  frontmatter: Record<string, any>;
  /** Content after the frontmatter block (trimmed) */
  content: string;
}

/**
 * Options for frontmatter extraction behavior.
 */
export interface ParseFrontmatterOptions {
  /**
   * When true, if no frontmatter block is found, attempt to extract
   * a description from the first markdown heading or first 100 chars.
   * When false (default), throw an error if no frontmatter is found.
   */
  fallbackDescription?: boolean;
}

/**
 * Parse YAML-like frontmatter from a markdown string.
 *
 * Extracts the `---` delimited frontmatter block and coerces values:
 * - `[a, b, c]` -> string array
 * - `"quoted"` -> unquoted string
 * - `true` / `false` -> boolean
 * - Numeric strings -> number
 * - Everything else -> string
 *
 * @param content - Raw markdown content with optional frontmatter
 * @param options - Parsing options (e.g., fallbackDescription)
 * @returns Parsed frontmatter key-value pairs and remaining content
 * @throws Error if no frontmatter found and fallbackDescription is false
 *
 * @example
 * ```typescript
 * const raw = await Bun.file("rule.mdc").text();
 * const { frontmatter, content } = parseFrontmatter(raw);
 * console.log(frontmatter.description); // "My rule"
 * console.log(frontmatter.alwaysApply); // true (boolean)
 * ```
 */
export function parseFrontmatter(
  content: string,
  options: ParseFrontmatterOptions = {},
): ParsedFrontmatter {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    if (options.fallbackDescription) {
      return extractFallbackDescription(content);
    }
    throw new Error("No frontmatter found");
  }

  const frontmatterBlock = frontmatterMatch[1]!;
  const parsedFrontmatter = parseFrontmatterBlock(frontmatterBlock);
  const contentWithoutFrontmatter = content
    .substring(frontmatterMatch[0].length)
    .trim();

  return {
    frontmatter: parsedFrontmatter,
    content: contentWithoutFrontmatter,
  };
}

/**
 * Parse the inner content of a frontmatter block into key-value pairs.
 *
 * @param block - The raw text between --- delimiters
 * @returns Record of parsed key-value pairs with type coercion
 */
function parseFrontmatterBlock(block: string): Record<string, any> {
  const parsed: Record<string, any> = {};

  for (const line of block.split("\n")) {
    if (!line.trim()) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const rawValue = line.substring(colonIndex + 1).trim();

    parsed[key] = coerceValue(rawValue);
  }

  return parsed;
}

/**
 * Coerce a raw frontmatter string value to an appropriate JS type.
 *
 * @param rawValue - The raw string value from frontmatter
 * @returns Coerced value (boolean, number, string[], or string)
 */
function coerceValue(rawValue: string): any {
  // Array: [a, b, c]
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    return rawValue
      .slice(1, -1)
      .split(",")
      .map((v) => v.trim().replace(/"/g, "").replace(/'/g, ""));
  }

  // Quoted string: "value"
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return rawValue.slice(1, -1);
  }

  // Boolean
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;

  // Number
  if (!isNaN(Number(rawValue))) return Number(rawValue);

  // Plain string
  return rawValue;
}

/**
 * Extract a fallback description when no frontmatter block exists.
 *
 * Looks for the first markdown heading, or falls back to the first
 * 100 characters of the content. Used by generate-rules-from-cursor.ts
 * for .mdc files that lack a formal frontmatter block.
 *
 * @param content - Raw markdown content without frontmatter
 * @returns ParsedFrontmatter with description in frontmatter and full content
 */
function extractFallbackDescription(content: string): ParsedFrontmatter {
  let description = "";

  for (const line of content.split("\n")) {
    if (line.startsWith("# ")) {
      description = line.substring(2).trim();
      break;
    }
  }

  if (!description) {
    description = content.substring(0, 100).replace(/\n/g, " ").trim();
  }

  return {
    frontmatter: { description },
    content,
  };
}
````

### Verification

- [ ] File created at `scripts/parse-frontmatter.ts`
- [ ] `bunx --bun tsc --noEmit` compiles the new file without errors
- [ ] Exported types and functions are well-documented with JSDoc

---

## Task T2 — Refactor generate-rules-from-cursor.ts to use shared utility

**File:** `scripts/generate-rules-from-cursor.ts`
**Gap:** HIGH #5 — Frontmatter parsing duplicated

### What to change

1. **Replace the `fs/promises` import** with `node:fs/promises` and add the shared utility import:

   ```typescript
   // BEFORE
   import { mkdir, readdir } from "fs/promises";
   import path from "path";

   // AFTER
   import { mkdir, readdir } from "node:fs/promises";
   import path from "path";
   import { parseFrontmatter } from "./parse-frontmatter";
   ```

2. **Simplify `parseRuleMarkdown`** by delegating to the shared utility. This function has the `fallbackDescription` behavior, so it uses that option:

   ```typescript
   // BEFORE (lines 13-89): Full inline parsing with ~40 lines of frontmatter logic

   // AFTER
   async function parseRuleMarkdown(filePath: string): Promise<RuleData> {
     const rawContent = await Bun.file(filePath).text();
     const { frontmatter, content } = parseFrontmatter(rawContent, {
       fallbackDescription: true,
     });

     return {
       description: frontmatter.description || "Generic rule description",
       globs: frontmatter.globs
         ? Array.isArray(frontmatter.globs)
           ? frontmatter.globs
           : frontmatter.globs.split(", ")
         : undefined,
       alwaysApply: frontmatter.alwaysApply,
       content,
     };
   }
   ```

### Verification

- [ ] `bun run generate:from-cursor` completes without errors
- [ ] Generated `.rule.ts` files in `src/rules/general/` are unchanged (diff the output before/after)
- [ ] No inline frontmatter parsing remains in the file

---

## Task T3 — Refactor generate-agents-from-cursor.ts to use shared utility

**File:** `scripts/generate-agents-from-cursor.ts`
**Gap:** HIGH #5 — Frontmatter parsing duplicated

### What to change

1. **Replace the `fs/promises` import** and add shared utility:

   ```typescript
   // BEFORE
   import { mkdir, readdir } from "fs/promises";
   import path from "path";

   // AFTER
   import { mkdir, readdir } from "node:fs/promises";
   import path from "path";
   import { parseFrontmatter } from "./parse-frontmatter";
   ```

2. **Simplify `parseAgentMarkdown`** by delegating to the shared utility. This function requires frontmatter (no fallback), so it does not use the `fallbackDescription` option:

   ```typescript
   // BEFORE (lines 16-74): Full inline parsing with ~40 lines of frontmatter logic

   // AFTER
   async function parseAgentMarkdown(filePath: string): Promise<AgentData> {
     const rawContent = await Bun.file(filePath).text();
     const { frontmatter, content } = parseFrontmatter(rawContent);

     return {
       name: frontmatter.name,
       description: frontmatter.description,
       tools: frontmatter.tools
         ? frontmatter.tools.split(", ").map((t: string) => t.trim())
         : undefined,
       model: frontmatter.model,
       color: frontmatter.color,
       disableModelInvocation: frontmatter["disable-model-invocation"],
       content,
     };
   }
   ```

### Verification

- [ ] `bun run generate:from-cursor` completes without errors
- [ ] Generated `.agent.ts` files in `src/agents/general/` are unchanged
- [ ] No inline frontmatter parsing remains in the file

---

## Task T4 — Refactor generate-skills-from-cursor.ts to use shared utility

**File:** `scripts/generate-skills-from-cursor.ts`
**Gap:** HIGH #5 — Frontmatter parsing duplicated

### What to change

1. **Replace the `fs/promises` import** and add shared utility:

   ```typescript
   // BEFORE
   import { mkdir, readdir, stat, access } from "fs/promises";
   import path from "path";

   // AFTER
   import { mkdir, readdir, stat, access } from "node:fs/promises";
   import path from "path";
   import { parseFrontmatter } from "./parse-frontmatter";
   ```

2. **Simplify `parseSkillMarkdown`** by delegating to the shared utility. Like agents, this requires frontmatter (no fallback):

   ```typescript
   // BEFORE (lines 13-66): Full inline parsing with ~40 lines of frontmatter logic

   // AFTER
   async function parseSkillMarkdown(filePath: string): Promise<SkillData> {
     const rawContent = await Bun.file(filePath).text();
     const { frontmatter, content } = parseFrontmatter(rawContent);

     return {
       name: frontmatter.name,
       description: frontmatter.description,
       disableModelInvocation: frontmatter["disable-model-invocation"],
       content,
     };
   }
   ```

### Verification

- [ ] `bun run generate:from-cursor` completes without errors
- [ ] Generated `.skill.ts` files in `src/skills/general/` are unchanged
- [ ] No inline frontmatter parsing remains in the file

---

## Task T5 — Fix node:fs prefix in generate script imports

**File:** All three generate scripts
**Gap:** MEDIUM (DX Advocate) — `fs/promises` without `node:` prefix

This is handled as part of Tasks T2-T4. The `node:` prefix is applied in each refactored import line. This task exists as a verification checkpoint:

### Verification

- [ ] `grep -rn "from \"fs/promises\"" scripts/generate-*` returns no results
- [ ] All `fs/promises` imports use `node:fs/promises` prefix

---

## Task T6 — Final verification

Run the complete verification harness:

```bash
# TypeScript compilation
bunx --bun tsc --noEmit

# Full test suite
bun test

# Build pipeline — the critical path
bun run generate:from-cursor

# Verify no duplicated frontmatter parsing in generate scripts
# (each script should import from parse-frontmatter, not inline the logic)
grep -c "frontmatterMatch\[1\]" scripts/generate-*-from-cursor.ts
# Expected: 0 matches per file

# Verify node:fs prefix
grep -rn "from \"fs/promises\"" scripts/generate-*
# Expected: no results

# Verify build still works end-to-end
bun run build:all
```

### Success Criteria

- [ ] `bunx --bun tsc --noEmit` exits 0
- [ ] `bun test` exits 0 with no failures
- [ ] `bun run generate:from-cursor` produces identical output as before refactor
- [ ] `bun run build:all` succeeds
- [ ] Zero inline frontmatter parsing logic remains in generate scripts
- [ ] All `fs/promises` imports use `node:` prefix
- [ ] New `scripts/parse-frontmatter.ts` utility is well-documented
