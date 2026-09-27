#!/usr/bin/env bun
/**
 * Plans the release workflow's run on a push to `main`, from
 * `changeset status` and npm's registry. It writes these outputs to
 * `$GITHUB_OUTPUT` (or prints them, run by hand):
 *
 *   pending   `true` when changesets that release something are pending:
 *             open or update the Version PR. Empty changesets don't count.
 *   title     the Version PR's title and commit message, such as
 *             `chore(release): version packages (luca@14.0.0-alpha.0)`
 *   version   the publish package's version
 *   publish   `true` when no changesets are pending and that version isn't
 *             on npm yet: run the publish job
 *
 * Usage: bun scripts/release-plan.ts
 */
import { appendFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

const REPO_ROOT = join(import.meta.dir, '..')
const LUCA_MANIFEST = join(REPO_ROOT, 'packages', 'luca', 'package.json')

/** npm's public registry. */
const NPM_REGISTRY = 'https://registry.npmjs.org'

const TITLE = 'chore(release): version packages'

const StatusSchema = z.looseObject({
    changesets: z.array(
        z.looseObject({
            id: z.string(),
            releases: z.array(z.looseObject({ name: z.string() })),
        })
    ),
    releases: z.array(
        z.looseObject({
            name: z.string(),
            oldVersion: z.string(),
            newVersion: z.string(),
        })
    ),
})

const ManifestSchema = z.looseObject({ name: z.string(), version: z.string() })

/** The release plan `changeset status` makes from the pending changesets. */
const releasePlan = async ({ work_dir }: { work_dir: string }) => {
    const output = join(work_dir, 'status.json')
    const child = Bun.spawn(
        [process.execPath, 'x', 'changeset', 'status', `--output=${output}`],
        { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' }
    )
    const exit_code = await child.exited
    if (exit_code !== 0) {
        throw new Error(`changeset status exited ${exit_code}`)
    }
    return StatusSchema.parse(await Bun.file(output).json())
}

/** Whether npm's registry has this version of the package. */
const onNpm = async ({
    name,
    version,
}: {
    name: string
    version: string
}): Promise<boolean> => {
    const url = `${NPM_REGISTRY}/${name.replace('/', '%2f')}/${version}`
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (response.status === 404) return false
    if (!response.ok) {
        throw new Error(
            `Couldn't read ${name}@${version} from npm (${response.status} ${response.statusText})`
        )
    }
    return true
}

/**
 * The Version PR's title, naming each package it bumps without its scope.
 *
 * @example
 * versionTitle([{ name: '@alecsibilia/luca', oldVersion: '13.0.1', newVersion: '14.0.0-alpha.0' }])
 * // 'chore(release): version packages (luca@14.0.0-alpha.0)'
 */
const versionTitle = (releases: z.infer<typeof StatusSchema>['releases']) => {
    const bumped = releases
        .filter((release) => release.newVersion !== release.oldVersion)
        .map(
            (release) =>
                `${release.name.replace(/^@[^/]+\//, '')}@${release.newVersion}`
        )
    return bumped.length === 0 ? TITLE : `${TITLE} (${bumped.join(', ')})`
}

const plan = async ({ work_dir }: { work_dir: string }) => {
    const status = await releasePlan({ work_dir })
    const manifest = ManifestSchema.parse(await Bun.file(LUCA_MANIFEST).json())
    // Empty changesets (`changeset add --empty`) don't count: changesets/action
    // skips the Version PR when every changeset is empty, so counting them
    // would block both the Version PR and the publish job.
    const pending = status.changesets.some(
        (changeset) => changeset.releases.length > 0
    )
    const publish = !pending && !(await onNpm(manifest))
    return {
        pending: String(pending),
        title: versionTitle(status.releases),
        version: manifest.version,
        publish: String(publish),
    }
}

const work_dir = await mkdtemp(join(tmpdir(), 'luca-release-plan-'))
try {
    const lines = Object.entries(await plan({ work_dir })).map(
        ([key, value]) => `${key}=${value}\n`
    )
    const github_output = process.env.GITHUB_OUTPUT
    if (github_output !== undefined) {
        await appendFile(github_output, lines.join(''))
    }
    process.stdout.write(lines.join(''))
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
} finally {
    await rm(work_dir, { recursive: true, force: true })
}
