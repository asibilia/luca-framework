/**
 * TypeScript tech stack profile
 *
 * Bundles all TypeScript/JavaScript-specific opinionated rules into a
 * single profile that can be toggled on/off via config.
 */
import { ApiSnakeCaseRule } from "./api-snake-case.rule";
import { BunPreferenceRule } from "./bun-preference.rule";
import { FunctionalAPIReuseRule } from "./functional-api-reuse.rule";
import { ImportStandardsRule } from "./import-standards.rule";
import { LodashPreferenceRule } from "./lodash-preference.rule";
import { NoClassesRule } from "./no-classes.rule";
import { SchemaFirstParsingRule } from "./schema-first-parsing.rule";
import { UseBunRule } from "./use-bun-instead-of-node-vite-npm-pnpm.rule";

import type { TechStackProfile } from "../profile.types";

/**
 * TypeScript profile containing 8 opinionated rules for
 * TypeScript/JavaScript development conventions.
 */
export const typescriptProfile: TechStackProfile = {
  name: "typescript",
  description: "TypeScript/JavaScript conventions and best practices",
  rules: {
    "api-snake-case": () => new ApiSnakeCaseRule(),
    "bun-preference": () => new BunPreferenceRule(),
    "functional-api-reuse": () => new FunctionalAPIReuseRule(),
    "import-standards": () => new ImportStandardsRule(),
    "lodash-preference": () => new LodashPreferenceRule(),
    "no-classes": () => new NoClassesRule(),
    "schema-first-parsing": () => new SchemaFirstParsingRule(),
    "use-bun-instead-of-node-vite-npm-pnpm": () => new UseBunRule(),
  },
};
