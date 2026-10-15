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
})
