import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

/**
 * Postmortem vault literal — intentional-comment invariant.
 *
 * `postmortem.ts` writes pitfall payloads to the canonical `default`
 * vault for cross-project aggregation, regardless of the per-repo
 * `muninn.vault` setting. Two comment sites document the intent so
 * future readers don't "fix" this:
 *   1. JSDoc on `PostmortemReport.pitfalls`
 *   2. Inline comment at the construction site
 *
 * Both contain the literal substring `intentional`. This test guards
 * both — any edit that drops either comment fails CI, prompting
 * re-justification before the cross-project aggregation invariant
 * silently breaks.
 */

describe('postmortem.ts intentional-vault comments', () => {
    const POSTMORTEM_PATH = join(
        import.meta.dir,
        '..',
        'analysis',
        'postmortem.ts'
    )

    test('contains the `intentional` substring at least twice (JSDoc + inline)', () => {
        const source = readFileSync(POSTMORTEM_PATH, 'utf-8')
        const matches = source.match(/intentional/gi) ?? []
        expect(matches.length).toBeGreaterThanOrEqual(2)
    })

    test('JSDoc above pitfalls field mentions `intentional` and `default`', () => {
        const source = readFileSync(POSTMORTEM_PATH, 'utf-8')
        const pitfallsDeclIdx = source.indexOf('pitfalls: Array<')
        expect(pitfallsDeclIdx).toBeGreaterThan(-1)
        const jsdocRegion = source.slice(
            Math.max(0, pitfallsDeclIdx - 600),
            pitfallsDeclIdx
        )
        expect(jsdocRegion).toContain('intentional')
        expect(jsdocRegion).toContain('default')
    })

    test('inline comment above vault default literal mentions `intentional`', () => {
        const source = readFileSync(POSTMORTEM_PATH, 'utf-8')
        const constructionIdx = source.indexOf("vault: 'default' as const")
        expect(constructionIdx).toBeGreaterThan(-1)
        const commentRegion = source.slice(
            Math.max(0, constructionIdx - 400),
            constructionIdx
        )
        // Case-insensitive: the inline block uses "Intentional:" (capital
        // I as sentence start), the JSDoc uses lowercase "intentional".
        expect(commentRegion.toLowerCase()).toContain('intentional')
    })
})
