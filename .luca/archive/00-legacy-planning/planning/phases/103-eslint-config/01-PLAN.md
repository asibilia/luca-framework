---
id: "103-01"
title: "Port ESLint config from joes-book--next into luca-observer"
phase: 103
wave: 1
complexity: SIMPLE
depends_on: []
tasks:
  - id: "103-01-1"
    title: "Install ESLint and required plugins/presets"
    goal: "Add ESLint v9, typescript-eslint, eslint-plugin-import, eslint-plugin-prettier, prettier, @next/eslint-plugin-next, @eslint/js, and globals as devDependencies in luca-observer"
    verify: "All packages appear in packages/luca-observer/package.json devDependencies; bun install succeeds"
  - id: "103-01-2"
    title: "Create eslint.config.mjs adapted for luca-observer"
    goal: "Port the eslint.config.mjs from joes-book--next, adjusting path aliases and import order groups to match luca-observer's tsconfig paths"
    verify: "packages/luca-observer/eslint.config.mjs exists and is valid ESM; bunx --bun eslint --version runs without error from the observer directory"
  - id: "103-01-3"
    title: "Add lint script to package.json"
    goal: "Add lint and lint:fix scripts to luca-observer package.json"
    verify: "bun run --filter @alecsibilia/luca-observer lint runs ESLint against src/"
  - id: "103-01-4"
    title: "Fix lint errors on existing codebase"
    goal: "Run the linter on existing luca-observer source code and fix any errors/warnings so that lint passes clean"
    verify: "bun run --filter @alecsibilia/luca-observer lint exits 0 with no errors"
---

# 103-01: Port ESLint Config from joes-book--next into luca-observer

## Goal

Port the ESLint flat config (`eslint.config.mjs`) from the `asibilia/joes-book--next` repository into `packages/luca-observer/`, installing all required dependencies and adapting the configuration for luca-observer's project structure. The end state is a working ESLint + Prettier + TypeScript + Next.js lint pipeline that passes on the existing codebase.

## Context

@packages/luca-observer/package.json -- Target package; currently has zero ESLint/Prettier deps
@packages/luca-observer/tsconfig.json -- Path aliases use `~/*` -> `./src/*` (same as source repo)
@packages/luca-observer/next.config.ts -- Next.js config (minimal, reactStrictMode only)
@packages/luca-observer/src/ -- Source tree: app/, components/, hooks/, lib/, stores/

### Source ESLint Config (joes-book--next)

The source `eslint.config.mjs` uses ESLint v9 flat config format with these plugins:

- `@eslint/js` -- ESLint core recommended rules
- `typescript-eslint` -- TypeScript parser + recommended rules
- `@next/eslint-plugin-next` -- Next.js recommended + core-web-vitals rules
- `eslint-plugin-prettier` -- Prettier as ESLint rule (format errors become lint errors)
- `eslint-plugin-import` -- Import ordering/sorting
- `globals` -- Browser globals

Key rules from source:

```javascript
// TypeScript
'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|Html$)' }],
'@typescript-eslint/no-explicit-any': ['warn'],

// Prettier (embedded config)
'prettier/prettier': ['error', {
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
    endOfLine: 'lf',
    printWidth: 80,
    tabWidth: 4,
}],

// Import order
'import/order': ['error', {
    groups: ['builtin', 'external', 'internal', 'sibling'],
    pathGroups: [
        { pattern: 'bun', group: 'external', position: 'before' },
        { pattern: 'react', group: 'external', position: 'before' },
        { pattern: '~/**', group: 'internal' },
    ],
    pathGroupsExcludedImportTypes: ['bun'],
    'newlines-between': 'always',
    alphabetize: { order: 'asc', caseInsensitive: true },
}],
```

### Required devDependencies (from source repo)

```
eslint@^9.27.0
@eslint/js@^9.27.0
typescript-eslint@^8.32.1
@next/eslint-plugin-next@^15.5.2
eslint-plugin-import@^2.31.0
eslint-plugin-prettier@^5.4.0
prettier@^3.3.3
globals (latest)
```

## Tasks

### Task 103-01-1: Install ESLint and required plugins/presets

Install all ESLint-related devDependencies into the luca-observer package.

**Steps:**

1. From repo root, run:
   ```bash
   cd packages/luca-observer && bun add -d \
     eslint@^9 \
     @eslint/js@^9 \
     typescript-eslint@^8 \
     @next/eslint-plugin-next@^15 \
     eslint-plugin-import@^2 \
     eslint-plugin-prettier@^5 \
     prettier@^3 \
     globals
   ```
2. Run `bun install` from repo root to sync lockfile
3. Verify all packages appear in `packages/luca-observer/package.json` under `devDependencies`

**Verify:**

- [ ] `eslint` in devDependencies
- [ ] `@eslint/js` in devDependencies
- [ ] `typescript-eslint` in devDependencies
- [ ] `@next/eslint-plugin-next` in devDependencies
- [ ] `eslint-plugin-import` in devDependencies
- [ ] `eslint-plugin-prettier` in devDependencies
- [ ] `prettier` in devDependencies
- [ ] `globals` in devDependencies
- [ ] `bun install` succeeds from repo root

### Task 103-01-2: Create eslint.config.mjs adapted for luca-observer

Create `packages/luca-observer/eslint.config.mjs` by porting the source config from joes-book--next. The config is nearly identical because luca-observer uses the same path alias (`~/*` -> `./src/*`), the same Next.js + TypeScript + Tailwind stack, and the same Bun runtime.

**Steps:**

1. Create `packages/luca-observer/eslint.config.mjs` with the following content (adapted from source):

```javascript
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-plugin-prettier";
import globals from "globals";
import typescript from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      "@next/next": nextPlugin,
      prettier,
      import: importPlugin,
    },
    rules: {
      // Next.js
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // TypeScript
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^(_|Html$)" },
      ],
      "@typescript-eslint/no-explicit-any": ["warn"],

      // Prettier
      "prettier/prettier": [
        "error",
        {
          semi: false,
          singleQuote: true,
          trailingComma: "es5",
          endOfLine: "lf",
          printWidth: 80,
          tabWidth: 4,
        },
      ],

      // Import order
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "sibling"],
          pathGroups: [
            {
              pattern: "bun",
              group: "external",
              position: "before",
            },
            {
              pattern: "react",
              group: "external",
              position: "before",
            },
            { pattern: "~/**", group: "internal" },
          ],
          pathGroupsExcludedImportTypes: ["bun"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
]);
```

2. Verify the config is syntactically valid: `cd packages/luca-observer && bunx --bun eslint --print-config src/app/layout.tsx`

**Adaptations from source:**

- None required. The luca-observer tsconfig uses the same `~/*` path alias, same Next.js + TypeScript stack, and same Bun runtime as joes-book--next. The config ports verbatim.

**Verify:**

- [ ] `packages/luca-observer/eslint.config.mjs` exists
- [ ] `cd packages/luca-observer && bunx --bun eslint --version` exits 0
- [ ] Config loads without errors: `cd packages/luca-observer && bunx --bun eslint --print-config src/app/layout.tsx` produces output

### Task 103-01-3: Add lint script to package.json

Add `lint` and `lint:fix` scripts to `packages/luca-observer/package.json`.

**Steps:**

1. Edit `packages/luca-observer/package.json` to add scripts:
   ```json
   {
     "scripts": {
       "dev": "next dev --port 3456",
       "build": "next build",
       "start": "next start --port 3456",
       "lint": "eslint src/",
       "lint:fix": "eslint src/ --fix"
     }
   }
   ```

**Verify:**

- [ ] `packages/luca-observer/package.json` has `lint` script
- [ ] `packages/luca-observer/package.json` has `lint:fix` script
- [ ] `bun run --filter @alecsibilia/luca-observer lint` invokes ESLint (may report errors at this stage)

### Task 103-01-4: Fix lint errors on existing codebase

Run the linter on the existing source code and fix any errors or warnings so that the lint pipeline passes clean.

**Steps:**

1. Run `cd packages/luca-observer && bun run lint` to see all errors
2. Run `cd packages/luca-observer && bun run lint:fix` to auto-fix what Prettier and import-order can handle
3. Manually fix remaining errors (likely `no-unused-vars`, `no-explicit-any`, or import issues)
4. Re-run `bun run lint` to confirm zero errors

**Expected fixes:**

- **Prettier formatting**: Auto-fixable (semicolons, quotes, trailing commas, indentation)
- **Import ordering**: Auto-fixable (reorder + add blank lines between groups)
- **Unused variables**: May need manual prefix with `_` or removal
- **Explicit any**: May need manual type annotations or `// eslint-disable-next-line` for legitimate `any` usage

**Verify:**

- [ ] `cd packages/luca-observer && bun run lint` exits 0
- [ ] No ESLint errors remain
- [ ] Warnings (if any) are intentional and documented
- [ ] `bun run --filter @alecsibilia/luca-observer build` still succeeds (no regressions from formatting changes)

## Success Criteria

- [ ] All ESLint + Prettier devDependencies installed in luca-observer package.json
- [ ] `packages/luca-observer/eslint.config.mjs` exists with flat config matching joes-book--next conventions
- [ ] `lint` and `lint:fix` scripts added to package.json
- [ ] `bun run lint` passes with zero errors on existing codebase
- [ ] `bun run build` still succeeds (no regressions from auto-formatting)
- [ ] TypeScript compilation unaffected: `bunx --bun tsc --noEmit` passes
