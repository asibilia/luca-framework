/**
 * Rules loader — reads bundled `alwaysApply` rules and concatenates them into
 * an instruction block that gets appended to every mode agent's prompt.
 *
 * Reads from the installed `.mastracode/rules/` directory (synced from
 * bundled rules at startup) with a fallback to the bundled directory.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { stringifyError } from '@alecsibilia/luca-core'

/**
 * Parse YAML-ish frontmatter from a rule .md file.
 * Returns { frontmatter, body } where frontmatter is a simple key-value map.
 * Handles the subset we need (description, alwaysApply) without a full YAML parser.
 */
export function parseRuleFrontmatter(content: string): {
    frontmatter: Record<string, string>
    body: string
} {
    const fm: Record<string, string> = {}
    if (!content.startsWith('---')) return { frontmatter: fm, body: content }
    // Match closing --- on its own line to avoid false matches inside values
    const endMatch = content.match(/\r?\n---\s*(?:\r?\n|$)/)
    if (!endMatch || endMatch.index === undefined)
        return { frontmatter: fm, body: content }
    const endIdx = endMatch.index
    const fmBlock = content.slice(3, endIdx).trim()
    for (const line of fmBlock.split('\n')) {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue
        const key = line.slice(0, colonIdx).trim()
        const val = line
            .slice(colonIdx + 1)
            .trim()
            .replace(/^["']|["']$/g, '')
        fm[key] = val
    }
    return {
        frontmatter: fm,
        body: content.slice(endIdx + endMatch[0].length).trim(),
    }
}

/**
 * Load all rules with `alwaysApply: true` from a directory and return their
 * bodies concatenated into a single instruction block.
 */
export function loadAlwaysApplyRules(): string {
    const installedDir = join(process.cwd(), '.mastracode', 'rules')
    const bundledDir = join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        'rules'
    )
    const rulesDir = existsSync(installedDir) ? installedDir : bundledDir
    if (!existsSync(rulesDir)) return ''

    const blocks: string[] = []
    for (const file of readdirSync(rulesDir).sort()) {
        if (!file.endsWith('.md')) continue
        try {
            const raw = readFileSync(join(rulesDir, file), 'utf-8')
            const { frontmatter, body } = parseRuleFrontmatter(raw)
            if (frontmatter.alwaysApply === 'true' && body) {
                blocks.push(body)
            }
        } catch (error) {
            console.warn(
                `[luca] Warning: failed to load rule "${file}": ${stringifyError(error)}`
            )
        }
    }
    return blocks.length > 0 ? blocks.join('\n\n') : ''
}
