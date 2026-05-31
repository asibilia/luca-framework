import { describe, expect, test } from 'bun:test'

import { sanitizeVaultName } from './sanitize-vault-name.ts'

describe('sanitizeVaultName', () => {
    const cases: Array<[string, string]> = [
        ['My Cool App!', 'my-cool-app'],
        ['@scope/pkg', 'scope-pkg'],
        ['---trim---', 'trim'],
        ['already-kebab', 'already-kebab'],
        ['UPPER_CASE', 'upper-case'],
        ['', ''],
    ]

    for (const [input, expected] of cases) {
        test(`"${input}" -> "${expected}"`, () => {
            expect(sanitizeVaultName(input)).toBe(expected)
        })
    }
})
