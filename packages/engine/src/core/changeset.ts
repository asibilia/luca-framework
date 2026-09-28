import maxBy from 'lodash/maxBy'
import uniq from 'lodash/uniq'

import type { SpecSnapshot } from '../intake/intake-schemas'
import {
    ChangesetBumpSchema,
    type ChangesetBump,
} from '../journal/journal-record'
import { RELEASE_LABEL_PREFIX, RELEASE_LABELS } from '../tracker/tracker'

/**
 * The run's changeset (#461), in a repo with changesets: which packages it
 * names, how big their bump is, and its text. Pure; `execute-changeset.ts`
 * reads the repo and commits it.
 */

/** Where a repo keeps its changesets config; with it, runs write a changeset. */
export const CHANGESET_CONFIG = '.changeset/config.json'

/** A workspace package: its name and its folder, relative to the repo. */
export type WorkspacePackage = { name: string; dir: string }

/**
 * The bump a spec's `release:*` label names, or patch with no label.
 * (Intake refuses a spec with two.)
 *
 * @example
 * releaseBump({ labels: ['ready-for-agent', 'release:minor'] }) // 'minor'
 * releaseBump({ labels: ['ready-for-agent'] }) // 'patch'
 */
export const releaseBump = ({
    labels,
}: {
    labels: string[]
}): ChangesetBump => {
    const label = RELEASE_LABELS.find((known) => labels.includes(known))
    return label === undefined
        ? 'patch'
        : ChangesetBumpSchema.parse(label.slice(RELEASE_LABEL_PREFIX.length))
}

/**
 * The changeset step for a spec: its bump, its summary (the spec's title
 * with a link to it), and its commit message.
 */
export const changesetStep = ({
    spec,
}: {
    spec: SpecSnapshot
}): { bump: ChangesetBump; summary: string; message: string } => ({
    bump: releaseBump({ labels: spec.labels }),
    summary:
        spec.url === ''
            ? `${spec.title} (#${spec.number})`
            : `${spec.title} ([#${spec.number}](${spec.url}))`,
    message: `chore: add the changeset for #${spec.number} ${spec.title}`,
})

/**
 * Where the run's changeset goes: one file per run, so a restarted run
 * finds its own, and two runs on the same spec never clash.
 *
 * @example
 * changesetPath({ spec_number: 10, run_id: 'luca-20260101-120000-abcd' })
 * // '.changeset/luca-spec-10-luca-20260101-120000-abcd.md'
 */
export const changesetPath = ({
    spec_number,
    run_id,
}: {
    spec_number: number
    run_id: string
}): string =>
    `.changeset/luca-spec-${spec_number}-${run_id.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}.md`

/**
 * The packages owning these changed files (a file belongs to the package
 * with the deepest folder holding it), minus the ones the changesets config
 * ignores (names or globs), sorted. Files under `.changeset/` never count.
 *
 * @example
 * changedPackages({
 *     packages: [{ name: '@acme/a', dir: 'packages/a' }, { name: '@acme/b', dir: 'packages/b' }],
 *     files: ['packages/a/index.ts', 'README.md'],
 *     ignore: [],
 * }) // ['@acme/a']
 */
export const changedPackages = ({
    packages,
    files,
    ignore,
}: {
    packages: WorkspacePackage[]
    files: string[]
    ignore: string[]
}): string[] => {
    const owner = (file: string) =>
        maxBy(
            packages.filter(
                ({ dir }) => dir === '' || file.startsWith(`${dir}/`)
            ),
            ({ dir }) => dir.length
        )
    const ignored = ignore.map((pattern) => new Bun.Glob(pattern))
    return uniq(
        files
            .filter((file) => !file.startsWith('.changeset/'))
            .flatMap((file) => {
                const found = owner(file)
                return found === undefined ? [] : [found.name]
            })
    )
        .filter((name) => !ignored.some((glob) => glob.match(name)))
        .toSorted()
}

/**
 * A changeset's text: front matter naming each package with the bump, then
 * the summary. `release:none` gets no changeset at all (#476), so it has no
 * text.
 *
 * @example
 * changesetText({ packages: ['@acme/a'], bump: 'minor', summary: 'Add a' })
 * // '---\n"@acme/a": minor\n---\n\nAdd a\n'
 */
export const changesetText = ({
    packages,
    bump,
    summary,
}: {
    packages: string[]
    bump: Exclude<ChangesetBump, 'none'>
    summary: string
}): string => {
    const releases = packages.map(
        (name) => `${JSON.stringify(name)}: ${bump}\n`
    )
    return `---\n${releases.join('')}---\n\n${summary}\n`
}
