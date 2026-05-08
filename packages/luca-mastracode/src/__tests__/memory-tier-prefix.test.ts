/**
 * Memory Tier Prefix — Pattern 2 (source-level readFile + .toContain).
 *
 * Asserts:
 *   1. memory-tier-discipline.ts source contains the rule + 4 tier names + muninn_trust.
 *   2. agent-constraints.ts and subagents/shared-prefix.ts both reference MEMORY_TIER_DISCIPLINE.
 *   3. The constant fits the token budget (< 1600 chars / ~400 tokens).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'
import { describe, expect, test } from 'bun:test'

import { MEMORY_TIER_DISCIPLINE } from '../memory-tier-discipline.js'

const here = url.fileURLToPath(import.meta.url)
const SRC_ROOT = path.resolve(here, '..', '..')

describe('Memory Tier Discipline — prefix integration', () => {
    test('MEMORY_TIER_DISCIPLINE constant is well-formed', () => {
        expect(MEMORY_TIER_DISCIPLINE).toContain('## Memory Tier Discipline')
        for (const tier of ['verified', 'inferred', 'external', 'untrusted']) {
            expect(MEMORY_TIER_DISCIPLINE).toContain(tier)
        }
        expect(MEMORY_TIER_DISCIPLINE).toContain('muninn_trust')
        expect(MEMORY_TIER_DISCIPLINE).toContain('muninn_remember')
    })

    test('MEMORY_TIER_DISCIPLINE fits token budget (< 1600 chars / ~400 tokens)', () => {
        // Enforced ceiling: 1600 chars (~400 tokens). Aim for ~800 chars in
        // practice for headroom; the 1600 bound forces additions to surface
        // via test failure rather than silently bloating both prefixes.
        expect(MEMORY_TIER_DISCIPLINE.length).toBeLessThan(1600)
    })

    test('memory-tier-discipline.ts source file is present', async () => {
        const src = await readFile(
            path.join(SRC_ROOT, 'memory-tier-discipline.ts'),
            'utf-8',
        )
        expect(src).toContain('export const MEMORY_TIER_DISCIPLINE')
        expect(src).toContain('## Memory Tier Discipline')
    })

    test('agent-constraints.ts imports and uses MEMORY_TIER_DISCIPLINE', async () => {
        const src = await readFile(
            path.join(SRC_ROOT, 'agent-constraints.ts'),
            'utf-8',
        )
        expect(src).toContain(
            "from './memory-tier-discipline.js'",
        )
        expect(src).toContain('MEMORY_TIER_DISCIPLINE')
        // Two references: one import, one use inside getAgentConstraints array.
        const matches = src.match(/MEMORY_TIER_DISCIPLINE/g) ?? []
        expect(matches.length).toBeGreaterThanOrEqual(2)
    })

    test('subagents/shared-prefix.ts imports and interpolates MEMORY_TIER_DISCIPLINE', async () => {
        const src = await readFile(
            path.join(SRC_ROOT, 'subagents', 'shared-prefix.ts'),
            'utf-8',
        )
        expect(src).toContain(
            "from '../memory-tier-discipline.js'",
        )
        expect(src).toContain('${MEMORY_TIER_DISCIPLINE}')
    })

    test('SUBAGENT_SHARED_PREFIX runtime contains the tier rule', async () => {
        const { SUBAGENT_SHARED_PREFIX } = await import(
            '../subagents/shared-prefix.js'
        )
        expect(SUBAGENT_SHARED_PREFIX).toContain('Memory Tier Discipline')
        for (const tier of ['verified', 'inferred', 'external', 'untrusted']) {
            expect(SUBAGENT_SHARED_PREFIX).toContain(tier)
        }
    })

    test('getAgentConstraints() runtime contains the tier rule', async () => {
        const { getAgentConstraints } = await import(
            '../agent-constraints.js'
        )
        const out = getAgentConstraints()
        expect(out).toContain('Memory Tier Discipline')
        for (const tier of ['verified', 'inferred', 'external', 'untrusted']) {
            expect(out).toContain(tier)
        }
    })
})
