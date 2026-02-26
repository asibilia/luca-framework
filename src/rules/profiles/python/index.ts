/**
 * Python tech stack profile
 *
 * Placeholder profile for Python-specific opinionated rules.
 * Rules will be added as they are defined (e.g., PEP 8, typing conventions,
 * virtual environment preferences, etc.).
 */
import type { TechStackProfile } from "~/rules/__schemas/profile.schemas";

/**
 * Python profile — currently empty, ready for rule population.
 *
 * To add rules:
 * 1. Create src/rules/profiles/python/<rule-name>.rule.ts
 * 2. Import and add the factory to the rules map below
 */
export const pythonProfile: TechStackProfile = {
  name: "python",
  description: "Python conventions and best practices",
  rules: {},
};
