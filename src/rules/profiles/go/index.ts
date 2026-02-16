/**
 * Go tech stack profile
 *
 * Placeholder profile for Go-specific opinionated rules.
 * Rules will be added as they are defined (e.g., error handling patterns,
 * package organization, interface conventions, etc.).
 */
import type { TechStackProfile } from "../profile.types";

/**
 * Go profile — currently empty, ready for rule population.
 *
 * To add rules:
 * 1. Create src/rules/profiles/go/<rule-name>.rule.ts
 * 2. Import and add the factory to the rules map below
 */
export const goProfile: TechStackProfile = {
  name: "go",
  description: "Go conventions and best practices",
  rules: {},
};
