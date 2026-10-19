/**
 * Pure: which worktree paths each role may create, change, or delete.
 */
import { basename, isAbsolute, normalize, relative, resolve } from 'node:path'

import { isWriter, type GuardArgs } from './guard-roles'

import {
    featureMapPath,
    isFeatureMapFolder,
    type EngineConfig,
} from '../config/engine-config'
import { testFilesAmong } from '../gates/test-runner'

/**
 * Worktree-relative, `..` resolved. `null` when the path leaves the worktree.
 * macOS reaches temp folders through `/var` and `/private/var` alike, so both
 * sides drop the `/private` prefix before they are compared.
 */
export const insideWorktree = ({
    worktree,
    path,
}: {
    worktree: string
    path: string
}): string | null => {
    const canonical = (text: string) =>
        text.replace(/^\/private\/(var|tmp)(?=\/|$)/, '/$1')
    const root = canonical(resolve(worktree))
    const full = canonical(resolve(root, path))
    const inner = relative(root, full)
    if (inner.startsWith('..') || isAbsolute(inner)) return null
    return inner === '' ? '.' : inner
}

const isTestFile = ({
    path,
    config,
}: {
    path: string
    config: EngineConfig
}): boolean =>
    testFilesAmong({
        files: [path],
        test_file_patterns: config.test_file_patterns,
    }).length > 0

/**
 * Whether a clean worktree-relative path is part of the repo's feature map
 * (#583): the map file itself, or, when the map is a folder (#597), any
 * `*.md` page under it.
 */
const isFeatureMapPage = ({
    path,
    config,
}: {
    path: string
    config: EngineConfig
}): boolean => {
    const map = featureMapPath({ config })
    if (map === null) return false
    return isFeatureMapFolder({ path: map })
        ? path.startsWith(`${map}/`) && path.endsWith('.md')
        : path === map
}

/**
 * Whether a clean worktree-relative path matches the repo's
 * `test_helper_patterns` (#619): a non-test file the test-writer may write.
 */
export const isTestHelper = ({
    path,
    config,
}: {
    path: string
    config: EngineConfig
}): boolean =>
    (config.test_helper_patterns ?? []).some((pattern) =>
        new Bun.Glob(pattern).match(path)
    )

/** The lockfiles a package install writes. The engine owns them. */
export const LOCKFILES = [
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
]

/**
 * Whether a worktree-relative path is the package install's: a lockfile, or
 * anything under a `node_modules` folder. Only the engine's install gate
 * writes these; no agent does.
 *
 * @example
 * isInstallPath('bun.lock') // true
 * isInstallPath('packages/app/node_modules/zod/index.js') // true
 * isInstallPath('src/sum.ts') // false
 */
export const isInstallPath = (path: string): boolean =>
    LOCKFILES.includes(basename(path)) ||
    normalize(path).split('/').includes('node_modules')

/**
 * Whether an agent may create, change, or delete a worktree-relative path.
 * Test-writers write test files only, the feature map when the repo has
 * one (#583), or any page of a folder map (#597), and files matching
 * `test_helper_patterns` (#619); implementers write anything but test
 * files (unless they may edit tests) and test setup files; reviewers and the
 * learner write nothing. No role writes a test setup file, `.git`, what
 * the package install writes (lockfiles, `node_modules`), or outside its
 * worktree.
 *
 * @example
 * mayWrite({ role: 'test-writer', may_edit_tests: true, path: 'src/sum.test.ts', config }) // true
 * mayWrite({ role: 'implementer', may_edit_tests: false, path: 'src/sum.test.ts', config }) // false
 * mayWrite({ role: 'implementer', may_edit_tests: true, path: 'src/sum.test.ts', config }) // true: a refactor ticket
 */
export const mayWrite = ({
    role,
    may_edit_tests,
    path,
    config,
}: GuardArgs & {
    path: string
    config: EngineConfig
}): boolean => {
    if (!isWriter(role) || isAbsolute(path)) return false
    const clean = normalize(path).replace(/^\.\//, '')
    if (clean === '.' || clean.startsWith('..')) return false
    if (clean === '.git' || clean.startsWith('.git/')) return false
    if (config.test_setup_files.includes(clean)) return false
    if (isInstallPath(clean)) return false
    const test = isTestFile({ path: clean, config })
    // The test-writer may also write the repo's feature map, when it has one
    // (#583): the file, or any page of a folder map (#597); and its test
    // helpers (#619).
    if (role === 'test-writer') {
        return (
            may_edit_tests &&
            (test ||
                isFeatureMapPage({ path: clean, config }) ||
                isTestHelper({ path: clean, config }))
        )
    }
    return !test || may_edit_tests
}
