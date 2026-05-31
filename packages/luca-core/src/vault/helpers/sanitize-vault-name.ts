/**
 * Sanitize a string into a valid MuninnDB vault name (lowercase kebab-case).
 *
 * Lowercases, replaces every non-`[a-z0-9-]` character with `-`, collapses
 * consecutive dashes, and trims a leading/trailing dash.
 *
 * Ported from luca-mastracode `slugifySegment` (`util/phase-paths.ts`) — which
 * `state/vault.ts` re-exported under the vault-specific name.
 *
 * @example
 * sanitizeVaultName('My Cool App!')  // 'my-cool-app'
 * sanitizeVaultName('@scope/pkg')    // 'scope-pkg'
 */
export function sanitizeVaultName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}
