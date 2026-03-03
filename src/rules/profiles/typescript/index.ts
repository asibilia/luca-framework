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

import type { TechStackProfile } from "~/rules/__schemas/profile.schemas";

/**
 * TypeScript profile containing 7 opinionated rules for
 * TypeScript/JavaScript development conventions.
 *
 * Note: use-bun-instead-of-node-vite-npm-pnpm was merged into bun-preference
 * (Phase 90-A context intelligence).
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
  },
};
