/**
 * Master profile registry for the Luca Framework
 *
 * Maps profile names to their TechStackProfile definitions.
 * Used by the rule registry to dynamically load profile-specific rules
 * based on the tech_stack_profiles setting in .planning/config.json.
 */
import { typescriptProfile } from "./typescript/index";
import { pythonProfile } from "./python/index";
import { goProfile } from "./go/index";
import { rustProfile } from "./rust/index";

import type { TechStackProfile } from "./profile.schemas";

// Re-export types and schemas for consumers
export type { TechStackProfile } from "./profile.schemas";
export { ProfileConfigSchema } from "./profile.schemas";
export type { ProfileConfig } from "./profile.schemas";

/**
 * Registry of all available tech stack profiles.
 *
 * To add a new profile:
 * 1. Create src/rules/profiles/<name>/index.ts
 * 2. Define the profile with its rules
 * 3. Import and add it to this registry
 */
export const profileRegistry: Record<string, () => TechStackProfile> = {
  typescript: () => typescriptProfile,
  python: () => pythonProfile,
  go: () => goProfile,
  rust: () => rustProfile,
};
