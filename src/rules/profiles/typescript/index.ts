/**
 * TypeScript tech stack profile
 *
 * Bundles all TypeScript/JavaScript-specific opinionated rules into a
 * single profile that can be toggled on/off via config.
 */
import { apiSnakeCaseRule } from "./api-snake-case.rule";
import { bunPreferenceRule } from "./bun-preference.rule";
import { functionalApiReuseRule } from "./functional-api-reuse.rule";
import { importStandardsRule } from "./import-standards.rule";
import { lodashPreferenceRule } from "./lodash-preference.rule";
import { noClassesRule } from "./no-classes.rule";
import { schemaFirstParsingRule } from "./schema-first-parsing.rule";
import { useBunRule } from "./use-bun-instead-of-node-vite-npm-pnpm.rule";

import type { TechStackProfile } from "../profile.schemas";

/**
 * TypeScript profile containing 8 opinionated rules for
 * TypeScript/JavaScript development conventions.
 */
export const typescriptProfile: TechStackProfile = {
  name: "typescript",
  description: "TypeScript/JavaScript conventions and best practices",
  rules: {
    "api-snake-case": () => apiSnakeCaseRule,
    "bun-preference": () => bunPreferenceRule,
    "functional-api-reuse": () => functionalApiReuseRule,
    "import-standards": () => importStandardsRule,
    "lodash-preference": () => lodashPreferenceRule,
    "no-classes": () => noClassesRule,
    "schema-first-parsing": () => schemaFirstParsingRule,
    "use-bun-instead-of-node-vite-npm-pnpm": () => useBunRule,
  },
};
