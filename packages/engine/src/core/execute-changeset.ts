import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import sortBy from 'lodash/sortBy'
import { z } from 'zod'

import {
    CHANGESET_CONFIG,
    changedPackages,
    changesetPath,
    changesetText,
    type WorkspacePackage,
} from './changeset'
import type { BuildAction } from './decide-build'
import { need, type BuildContext } from './execute-build'

/** The part of the changesets config the engine reads: what it ignores. */
const ChangesetConfigSchema = z
    .object({ ignore: z.array(z.string()).catch([]) })
    .catch({ ignore: [] })

const ManifestSchema = z.object({
    name: z.string().optional(),
    workspaces: z
        .union([
            z.array(z.string()),
            z.object({ packages: z.array(z.string()).default([]) }),
        ])
        .optional(),
})

/** A JSON file's value, or `null` when it is missing or not JSON. */
const readJson = async (path: string): Promise<unknown> => {
    try {
        return JSON.parse(await Bun.file(path).text())
    } catch {
        return null
    }
}

const manifestAt = async (path: string) => {
    const parsed = ManifestSchema.safeParse(await readJson(path))
    return parsed.success ? parsed.data : null
}

/**
 * The repo's workspace packages, from its root `package.json`'s
 * `workspaces` (`!` patterns leave folders out). A repo without workspaces
 * is its one root package, if it has a name.
 */
export const workspacePackages = async ({
    cwd,
}: {
    cwd: string
}): Promise<WorkspacePackage[]> => {
    const root = await manifestAt(join(cwd, 'package.json'))
    if (root === null) return []
    const { name, workspaces } = root
    const patterns = Array.isArray(workspaces)
        ? workspaces
        : (workspaces?.packages ?? [])
    if (patterns.length === 0) {
        return name === undefined ? [] : [{ name, dir: '' }]
    }
    const left_out = patterns
        .filter((pattern) => pattern.startsWith('!'))
        .map((pattern) => new Bun.Glob(pattern.slice(1)))
    const found: WorkspacePackage[] = []
    for (const pattern of patterns) {
        if (pattern.startsWith('!')) continue
        const glob = new Bun.Glob(`${pattern.replace(/\/+$/, '')}/package.json`)
        for await (const file of glob.scan({ cwd })) {
            const dir = dirname(file)
            if (dir.split('/').includes('node_modules')) continue
            if (left_out.some((out) => out.match(dir))) continue
            const manifest = await manifestAt(join(cwd, file))
            if (manifest?.name === undefined) continue
            if (found.some((known) => known.dir === dir)) continue
            found.push({ name: manifest.name, dir })
        }
    }
    return sortBy(found, 'dir')
}

/**
 * Writes the run's changeset on the run branch, commits it (only it: other
 * uncommitted edits stay out, #509), and pushes the run branch, then
 * journals `changeset_written`. It names every workspace
 * package with files changed since the run branch's base, minus the ones
 * the config ignores. A redo after a crash finds its own file already
 * committed and commits nothing twice. A `release:none` spec (#476), or a
 * repo whose config is gone by now, gets no changeset.
 */
export const writeChangeset = async ({
    context,
    action,
}: {
    context: BuildContext
    action: Extract<BuildAction, { type: 'write_changeset' }>
}): Promise<void> => {
    const { journal, git, state, run_dir } = context
    const { path: cwd, base_sha } = need({
        value: state.run_branch,
        what: 'run branch',
    })
    const spec_number = need({ value: state.spec_number, what: 'spec' })
    const { bump, summary, message, branch } = action
    if (!existsSync(join(cwd, CHANGESET_CONFIG))) {
        journal.append({
            kind: 'changeset_written',
            ticket: null,
            role: null,
            content: {
                path: null,
                bump,
                packages: [],
                sha: await git.head({ cwd }),
            },
        })
        return
    }
    if (bump === 'none') {
        await git.push({ cwd, branch })
        journal.append({
            kind: 'changeset_written',
            ticket: null,
            role: null,
            content: {
                path: null,
                bump,
                packages: [],
                sha: await git.head({ cwd }),
            },
        })
        return
    }
    const { ignore } = ChangesetConfigSchema.parse(
        await readJson(join(cwd, CHANGESET_CONFIG))
    )
    const packages = changedPackages({
        packages: await workspacePackages({ cwd }),
        files: await git.filesBetween({ cwd, from: base_sha, to: 'HEAD' }),
        ignore,
    })
    const path = changesetPath({ spec_number, run_id: basename(run_dir) })
    await Bun.write(join(cwd, path), changesetText({ packages, bump, summary }))
    const changes = await git.changes({ cwd })
    if (changes.some((change) => change.path === path)) {
        // Only the changeset: any other edit left in the worktree stays out.
        await git.commitPaths({ cwd, message, paths: [path] })
    }
    await git.push({ cwd, branch })
    journal.append({
        kind: 'changeset_written',
        ticket: null,
        role: null,
        content: { path, bump, packages, sha: await git.head({ cwd }) },
    })
}
