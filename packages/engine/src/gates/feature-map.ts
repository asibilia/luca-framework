import { readdir } from 'node:fs/promises'
import { join, normalize, relative } from 'node:path'

import { testFilesAmong } from './test-runner'

import { isFeatureMapFolder } from '../config/engine-config'
import { pathText } from '../git/path-text'

/**
 * The test files a feature map lists (#583): every backticked path in it that
 * matches the test file patterns, in order, once each. A path written with a
 * leading `./` counts as the path without it, as a worktree-relative path is
 * everywhere else.
 *
 * @param text - The feature map's markdown.
 * @param test_file_patterns - The engine config's test file patterns.
 * @returns The listed test files, in the order the map first names them.
 *
 * @example
 * featureMapFiles({ text: '- `src/sum.test.ts`', test_file_patterns: ['**\/*.test.ts'] }) // ['src/sum.test.ts']
 * featureMapFiles({ text: '- `./src/sum.test.ts`', test_file_patterns: ['**\/*.test.ts'] }) // ['src/sum.test.ts']
 */
export const featureMapFiles = ({
    text,
    test_file_patterns,
}: {
    text: string
    test_file_patterns: string[]
}): string[] => {
    const paths = [...text.matchAll(/`([^`\s]+)`/g)].map(([, path = '']) =>
        path.replace(/^\.\//, '')
    )
    return [...new Set(testFilesAmong({ files: paths, test_file_patterns }))]
}

/**
 * The text of every `*.md` page under a folder, nested ones too, in sorted
 * order of their paths (#597). `null` when the folder is missing or a page
 * can't be read.
 */
const folderText = async ({
    folder,
}: {
    folder: string
}): Promise<string | null> => {
    try {
        const entries = await readdir(folder, {
            recursive: true,
            withFileTypes: true,
        })
        const pages = entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
            .map((entry) =>
                relative(folder, join(entry.parentPath, entry.name))
            )
            .toSorted()
        const texts = await Promise.all(
            pages.map((page) => Bun.file(join(folder, page)).text())
        )
        return texts.join('\n')
    } catch {
        return null
    }
}

/**
 * The test files a worktree's feature map lists (#583, #597). A path ending
 * in `.md` is one file, read as it always was; any other path is a folder,
 * and every `*.md` page under it, in sorted order, together is the map.
 *
 * @param cwd - The worktree.
 * @param path - The map's worktree-relative path, as the config spells it.
 * @param test_file_patterns - The engine config's test file patterns.
 * @returns The listed test files (see `featureMapFiles`), or `null` when the
 *   map is missing or can't be read, so the red check can name it rather
 *   than crash.
 *
 * @example
 * await readFeatureMap({ cwd, path: 'docs/feature-map', test_file_patterns }) // ['src/sum.test.ts']
 */
export const readFeatureMap = async ({
    cwd,
    path,
    test_file_patterns,
}: {
    cwd: string
    path: string
    test_file_patterns: string[]
}): Promise<string[] | null> => {
    const clean = normalize(path)
    const text = isFeatureMapFolder({ path: clean })
        ? await folderText({ folder: join(cwd, clean) })
        : await pathText({ path: join(cwd, clean) })
    return text === null ? null : featureMapFiles({ text, test_file_patterns })
}
