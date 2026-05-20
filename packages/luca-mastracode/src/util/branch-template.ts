/**
 * Render a branch template with allow-listed variables.
 *
 * Allowed placeholders: {type}, {issue}, {slug}.
 * - Missing `issue` substitutes empty string (caller may post-process trailing
 *   separators if desired).
 * - Any unknown placeholder throws — fail loud at preferences-author time
 *   rather than leaking placeholder text into branch names.
 */
export function renderTemplate(
    tpl: string,
    vars: { type: string; issue?: string; slug: string }
): string {
    const allowed = new Set(['type', 'issue', 'slug'])
    return tpl.replace(/\{([^}]+)\}/g, (_match, name: string) => {
        if (!allowed.has(name)) {
            throw new Error(`Unknown branch-template variable: {${name}}`)
        }
        if (name === 'type') return vars.type
        if (name === 'issue') return vars.issue ?? ''
        return vars.slug
    })
}
