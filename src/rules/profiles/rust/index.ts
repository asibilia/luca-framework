/**
 * Rust tech stack profile
 *
 * Placeholder profile for Rust-specific opinionated rules.
 * Rules will be added as they are defined (e.g., ownership patterns,
 * error handling with Result/Option, module organization, etc.).
 */
import type { TechStackProfile } from "~/rules/__schemas/profile.schemas";

/**
 * Rust profile — currently empty, ready for rule population.
 *
 * To add rules:
 * 1. Create src/rules/profiles/rust/<rule-name>.rule.ts
 * 2. Import and add the factory to the rules map below
 */
export const rustProfile: TechStackProfile = {
  name: "rust",
  description: "Rust conventions and best practices",
  rules: {},
};
