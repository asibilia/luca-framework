import { describe, expect, test } from 'bun:test'

import { featureMapFiles } from './feature-map'

const MAP = `# Feature map

## Running one ticket

Reached by: \`luca run\` on a spec with one ticket.

Tests:
- \`packages/engine/src/core/run-one-ticket.e2e.test.ts\`
- \`packages/engine/src/core/decide-build.test.ts\`

Mentions \`packages/engine/src/core/decide-build.ts\` too, which is not a test file.
`

describe('the feature map (#583)', () => {
    test('lists every backticked path that matches the test file patterns', () => {
        expect(
            featureMapFiles({
                text: MAP,
                test_file_patterns: ['packages/**/*.test.ts'],
            })
        ).toEqual([
            'packages/engine/src/core/run-one-ticket.e2e.test.ts',
            'packages/engine/src/core/decide-build.test.ts',
        ])
    })

    test('a path written with a leading ./ is the path without it', () => {
        expect(
            featureMapFiles({
                text: 'Tests:\n- `./src/sum.test.ts`\n- `src/other.test.ts`',
                test_file_patterns: ['src/**/*.test.ts'],
            })
        ).toEqual(['src/sum.test.ts', 'src/other.test.ts'])
    })

    test('a file named twice, even as ./ and plain, is listed once, in the order first named', () => {
        expect(
            featureMapFiles({
                text: [
                    '- `src/sum.test.ts`',
                    '- `src/other.test.ts`',
                    '- `./src/sum.test.ts`',
                    '- `src/other.test.ts`',
                ].join('\n'),
                test_file_patterns: ['src/**/*.test.ts'],
            })
        ).toEqual(['src/sum.test.ts', 'src/other.test.ts'])
    })

    test('a map that names no test file lists none', () => {
        expect(
            featureMapFiles({
                text: '# Feature map\n\nNothing yet, see `src/sum.ts`.',
                test_file_patterns: ['src/**/*.test.ts'],
            })
        ).toEqual([])
    })
})
