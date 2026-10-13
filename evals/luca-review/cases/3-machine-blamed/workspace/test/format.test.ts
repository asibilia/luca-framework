import { describe, expect, test } from 'bun:test'

import { formatPrice } from '../src/format'

describe('formatPrice', () => {
    test('formats whole cents', () => expect(formatPrice(120)).toBe('$1.20'))
    test('formats under a dollar', () => expect(formatPrice(95)).toBe('$0.95'))
    test('rounds half a cent up', () => expect(formatPrice(100.5)).toBe('$1.01'))
})
