/**
 * Doctor's `junit` check (#668): each junit test command that runs `swift
 * test` should pass `--parallel` (without it XCTest writes no JUnit file)
 * and list both of SwiftPM's files in `junit_path`.
 */
import { stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import uniq from 'lodash/uniq'

import { ok, warning, type Found } from './doctor-checks'
import { readScripts } from './setup-config'

import {
    ENGINE_CONFIG_FILE,
    junitCommands,
    type EngineConfig,
} from '../config/engine-config'

/** The shells a script may start its file with. */
const SHELLS = new Set(['bash', 'sh', 'zsh'])

const SWIFT_TESTING_SUFFIX = '-swift-testing.xml'

/** The text of the repo file at `path`, or `null` when there is no such file. */
const fileText = async ({
    repo,
    path,
}: {
    repo: string
    path: string
}): Promise<string | null> => {
    const full = join(repo, path)
    try {
        return (await stat(full)).isFile() ? await Bun.file(full).text() : null
    } catch {
        return null
    }
}

/**
 * The texts a command runs: itself; for `bun run <script>`, that script in
 * the root `package.json`; and the repo file that script starts, directly
 * or after `bash`, `sh` or `zsh`.
 */
const textsOf = async ({
    repo,
    run,
    scripts,
}: {
    repo: string
    run: string
    scripts: Record<string, string>
}): Promise<string[]> => {
    const name = /^bun\s+run\s+(\S+)/.exec(run.trim())?.[1]
    const script = name === undefined ? undefined : scripts[name]
    if (script === undefined) return [run]
    const words = script.trim().split(/\s+/)
    const first = words[0] ?? ''
    const path = SHELLS.has(first) ? words[1] : first
    const file = path === undefined ? null : await fileText({ repo, path })
    return [run, script, ...(file === null ? [] : [file])]
}

/**
 * The other file of SwiftPM's pair for a `junit_path` entry, in the same
 * folder: `core.xml` and `core-swift-testing.xml` go together. `null` for
 * a path that isn't an `.xml` file.
 */
const partnerOf = (path: string): string | null => {
    const name = basename(path)
    const partner = name.endsWith(SWIFT_TESTING_SUFFIX)
        ? `${name.slice(0, -SWIFT_TESTING_SUFFIX.length)}.xml`
        : name.endsWith('.xml')
          ? `${name.slice(0, -'.xml'.length)}${SWIFT_TESTING_SUFFIX}`
          : null
    if (partner === null) return null
    const folder = dirname(path)
    return folder === '.' ? partner : `${folder}/${partner}`
}

/**
 * The `junit` check for a config with junit commands: a warning for each
 * one that runs `swift test` without `--parallel`, and for each of
 * SwiftPM's files its `junit_path` leaves out, made into one; else OK.
 */
export const checkJunit = async ({
    repo,
    config,
}: {
    repo: string
    config: EngineConfig
}): Promise<Found> => {
    const scripts = await readScripts({ repo })
    const found: { detail: string; fix: string }[] = []
    for (const { run, junit_path } of junitCommands({ config })) {
        const texts = await textsOf({ repo, run, scripts })
        if (!texts.some((text) => text.includes('swift test'))) continue
        if (!texts.some((text) => text.includes('--parallel'))) {
            found.push({
                detail: `\`${run}\` runs swift test without --parallel, so XCTest writes no JUnit file and its results can't be read.`,
                fix: 'Add --parallel to its swift test command.',
            })
        }
        const listed = new Set(junit_path)
        const missing = uniq(
            junit_path.flatMap((path) => {
                const partner = partnerOf(path)
                return partner === null || listed.has(partner) ? [] : [partner]
            })
        )
        for (const path of missing) {
            found.push({
                detail: `\`${run}\` runs swift test, but its junit_path doesn't list ${path}.`,
                fix: `Add it to junit_path in ${ENGINE_CONFIG_FILE}: swift test writes XCTest results to core.xml and Swift Testing results to core-swift-testing.xml.`,
            })
        }
    }
    if (found.length === 0) {
        return ok(
            'Each junit test command that runs swift test uses --parallel and lists both of its JUnit files'
        )
    }
    return warning({
        detail: found.map(({ detail }) => detail).join(' '),
        fix: found.map(({ fix }) => fix).join(' '),
    })
}
