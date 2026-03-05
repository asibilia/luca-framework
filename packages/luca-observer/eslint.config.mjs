import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import importPlugin from "eslint-plugin-import";
import prettierPlugin from "eslint-plugin-prettier";
import globals from "globals";

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"],
  },

  // ── Base: eslint recommended ──────────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript recommended ────────────────────────────────────────────────
  ...tseslint.configs.recommended,

  // ── Project-wide settings ─────────────────────────────────────────────────
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        React: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // ── Next.js plugin (recommended + core-web-vitals) ────────────────────────
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },

  // ── Import ordering ───────────────────────────────────────────────────────
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          pathGroups: [
            { pattern: "bun", group: "builtin", position: "before" },
            { pattern: "bun:*", group: "builtin", position: "before" },
            { pattern: "react", group: "external", position: "before" },
            { pattern: "react-dom/**", group: "external", position: "before" },
            { pattern: "next/**", group: "external", position: "before" },
            { pattern: "~/**", group: "internal", position: "before" },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
        },
      ],
      "import/newline-after-import": "warn",
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
  },

  // ── Prettier integration ──────────────────────────────────────────────────
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": [
        "warn",
        {
          semi: true,
          singleQuote: false,
          trailingComma: "es5",
          printWidth: 80,
          tabWidth: 2,
        },
      ],
    },
  },

  // ── Project-specific rule overrides ───────────────────────────────────────
  {
    rules: {
      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Allow explicit any in this observer codebase (monitoring data is dynamic)
      "@typescript-eslint/no-explicit-any": "off",

      // Allow empty interfaces/object types for component props
      "@typescript-eslint/no-empty-object-type": "off",

      // Allow non-null assertions (common in Next.js patterns)
      "@typescript-eslint/no-non-null-assertion": "off",

      // Allow require imports for dynamic config
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
