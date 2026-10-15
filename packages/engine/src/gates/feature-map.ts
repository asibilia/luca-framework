import { testFilesAmong } from './test-runner'

/**
 * The test files a feature map lists (#583): every backticked path in it that
 * matches the test file patterns, in order, once each.
 *
 * @param text - The feature map's markdown.
 * @param test_file_patterns - The engine config's test file patterns.
 * @returns The listed test files, in the order the map first names them.
 *
 * @example
 * featureMapFiles({ text: '- `src/sum.test.ts`', test_file_patterns: ['**\/*.test.ts'] }) // ['src/sum.test.ts']
 */
export const featureMapFiles = ({
    text,
    test_file_patterns,
}: {
    text: string
    test_file_patterns: string[]
}): string[] => {
    const paths = [...text.matchAll(/`([^`\s]+)`/g)].map(
        ([, path = '']) => path
    )
    return [...new Set(testFilesAmong({ files: paths, test_file_patterns }))]
}
