/**
 * Shared naming conversion utilities for generator scripts.
 *
 * Extracts the duplicated kebab-to-camelCase logic used by both
 * generate-agents-from-cursor.ts and generate-skills-from-cursor.ts.
 */

/**
 * Convert a kebab-case name to a camelCase identifier with a suffix.
 *
 * @param kebabName - The kebab-case input (e.g. "code-simplifier")
 * @param suffix - The suffix to append (e.g. "Agent", "Skill")
 * @returns camelCase identifier (e.g. "codeSimplifierAgent")
 */
export function toCamelCaseWithSuffix(
  kebabName: string,
  suffix: string,
): string {
  return (
    kebabName.replace(/-([a-z])/g, (_: string, letter: string) =>
      letter.toUpperCase(),
    ) + suffix
  );
}

/**
 * Convert a kebab-case name to a camelCase config variable name.
 *
 * @param kebabName - The kebab-case input (e.g. "code-simplifier")
 * @returns camelCase identifier with "Config" suffix (e.g. "codeSimplifierConfig")
 */
export function toConfigName(kebabName: string): string {
  return (
    kebabName.replace(/-([a-z])/g, (_: string, l: string) => l.toUpperCase()) +
    "Config"
  );
}
