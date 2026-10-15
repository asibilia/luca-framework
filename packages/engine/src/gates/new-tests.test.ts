import { describe, expect, test } from 'bun:test'

import { addedTestNames, testNamesIn } from './new-tests'

describe('test names in a test file (#581)', () => {
    test('reads plain string names of test and it, in any quote, with modifiers', () => {
        const source = `
describe('sum', () => {
    test('adds', () => {})
    it("keeps \\"quotes\\"", () => {})
    test.skip(\`later\`, () => {})
    test.only('only this', () => {})
})`
        expect(testNamesIn({ source })).toEqual([
            'adds',
            'keeps "quotes"',
            'later',
            'only this',
        ])
    })

    test('skips template names with ${} and test.each tables, and never reads describe names', () => {
        const source =
            "test(`has ${x}`, () => {})\ntest.each([[1]])('row %p', () => {})\ndescribe('d', () => {})"
        expect(testNamesIn({ source })).toEqual([])
    })
})

describe('the tests a change added (#581)', () => {
    test('a new file adds all its tests', () => {
        expect(
            addedTestNames({
                base: null,
                current: "test('a', () => {})\ntest('b', () => {})",
            })
        ).toEqual(['a', 'b'])
    })

    test('names already in the base version are not new, wherever they moved', () => {
        expect(
            addedTestNames({
                base: "test('a', () => {})",
                current: "test('b', () => {})\ntest('a', () => {})",
            })
        ).toEqual(['b'])
    })

    test('a deleted file adds nothing', () => {
        expect(
            addedTestNames({ base: "test('a', () => {})", current: null })
        ).toEqual([])
    })
})
