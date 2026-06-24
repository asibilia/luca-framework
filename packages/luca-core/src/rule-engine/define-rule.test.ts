import { describe, expect, test } from 'bun:test'

import { defineRule } from './define-rule.ts'
import type { RuleDefinition } from './define-rule.ts'

describe('defineRule', () => {
    const valid: RuleDefinition = {
        id: 'demo/no-foo',
        severity: 'must-fix',
        description: 'disallow foo',
        scope: '**/*.ts',
        check: () => [],
    }

    test('returns a valid rule unchanged (same reference)', () => {
        expect(defineRule(valid)).toBe(valid)
    })

    test('throws when id is missing', () => {
        expect(() => defineRule({ ...valid, id: '' })).toThrow(
            'rule.id is required'
        )
    })

    test('throws when scope is missing', () => {
        expect(() => defineRule({ ...valid, scope: '' })).toThrow(
            'scope is required'
        )
    })

    test('throws when check is not a function', () => {
        expect(() =>
            defineRule({
                ...valid,
                check: undefined as unknown as RuleDefinition['check'],
            })
        ).toThrow('check must be a function')
    })
})
