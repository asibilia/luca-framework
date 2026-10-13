import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { Arm, Case } from './case-schema'

/** `evals/luca-review/`. */
export const EVAL_DIR = join(import.meta.dir, '..')
export const REPO_ROOT = join(EVAL_DIR, '..', '..')
export const CASES_DIR = join(EVAL_DIR, 'cases')

/** Where each setup's skill comes from: A his, pinned; B ours, where it ships; C none. */
export const skillSource = ({ arm }: { arm: Arm }): string | null => {
    if (arm === 'A') return join(EVAL_DIR, 'upstream', 'agent-review')
    if (arm === 'B') {
        return join(REPO_ROOT, 'packages', 'engine', 'skills', 'luca-review')
    }
    return null
}

/** A skill's name, from its SKILL.md frontmatter. */
export const skillName = ({ skill_dir }: { skill_dir: string }): string => {
    const text = readFileSync(join(skill_dir, 'SKILL.md'), 'utf8')
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? ''
    const name = /^name: ([a-z0-9-]+)$/m.exec(frontmatter)?.[1]
    if (name === undefined) {
        throw new Error(
            `${join(skill_dir, 'SKILL.md')} has no name in its frontmatter`
        )
    }
    return name
}

/** The eval's state folder: `$LUCA_EVALS_DIR`, else `~/.local/state/luca/evals`. */
export const evalsRoot = (): string =>
    process.env.LUCA_EVALS_DIR ??
    join(homedir(), '.local', 'state', 'luca', 'evals')

/**
 * A run's folder, such as `<evals root>/r1/3B2`. Short on purpose: Claude
 * Code names its transcript folders after the path.
 */
export const runRoot = ({
    round,
    case_id,
    arm,
    rep,
}: {
    round: string
    case_id: string
    arm: Arm
    rep: number
}): string =>
    join(evalsRoot(), round, `${case_id.split('-')[0] ?? case_id}${arm}${rep}`)

/** Said to every setup, so all three work in the same place. */
export const WORKSPACE_RULES =
    'Work only inside this folder. Put any scratch files, extra workspaces or temporary folders inside it, for example under ./tmp. When you are done, end with a short report for the owner.'

/** The prompt a run gets: the task, the skill clause for A and B, and the workspace rules. */
export const taskPrompt = ({
    the_case,
    skill_name,
}: {
    the_case: Case
    skill_name: string | null
}): string =>
    [
        the_case.task,
        ...(skill_name === null
            ? []
            : [the_case.skill_clause.replaceAll('{skill}', skill_name)]),
        WORKSPACE_RULES,
    ].join('\n\n')

const isTestFile = (path: string): boolean => /\.test\.[cm]?[jt]sx?$/.test(path)

/** Copies a setup's skill into `ws` as a project skill, leaving its tests out. Its name, or null for C. */
export const installSkill = async ({
    skill_dir,
    ws,
}: {
    skill_dir: string | null
    ws: string
}): Promise<string | null> => {
    if (skill_dir === null) return null
    const name = skillName({ skill_dir })
    await cp(skill_dir, join(ws, '.claude', 'skills', name), {
        recursive: true,
        filter: (path) => !isTestFile(path),
    })
    return name
}

/** Every file under `dir`, sorted, as paths relative to it; top-level folders in `skip` are left out. */
export const filesUnder = ({
    dir,
    skip = [],
}: {
    dir: string
    skip?: string[]
}): string[] => {
    const walk = (folder: string, prefix: string): string[] =>
        readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
            const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
            if (entry.isDirectory()) {
                return prefix === '' && skip.includes(entry.name)
                    ? []
                    : walk(join(folder, entry.name), path)
            }
            return entry.isFile() ? [path] : []
        })
    return walk(dir, '').sort()
}

export const sha256 = ({ bytes }: { bytes: Uint8Array | string }): string =>
    new Bun.CryptoHasher('sha256').update(bytes).digest('hex')

/** Each file under `ws`, but the installed skill, with its SHA-256: so we can tell later which files the run wrote. */
export const workspaceHashes = ({
    ws,
}: {
    ws: string
}): Record<string, string> =>
    Object.fromEntries(
        filesUnder({ dir: ws, skip: ['.claude'] }).map(
            (path): [string, string] => [
                path,
                sha256({ bytes: readFileSync(join(ws, path)) }),
            ]
        )
    )

const git = ({ args }: { args: string[] }): string => {
    const out = Bun.spawnSync(['git', '-C', REPO_ROOT, ...args])
    if (out.exitCode !== 0) {
        throw new Error(
            `git ${args.join(' ')} failed: ${out.stderr.toString()}`
        )
    }
    return out.stdout.toString()
}

const writeFile = async ({ path, text }: { path: string; text: string }) => {
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, text)
}

/**
 * Builds a run's folder at `root`:
 * - `ws/` holds the case's `workspace/`, its git files and diff, the planted changes, its `notes/`, and the setup's skill.
 * - `out/`, `tmp/` and `reviews/` start empty.
 *
 * It refuses a root that exists, so no result is ever overwritten. It also refuses a case whose `absent_commands` are installed, or whose plants match nothing.
 */
export const buildWorkspace = async ({
    the_case,
    case_dir,
    root,
    skill_dir,
}: {
    the_case: Case
    case_dir: string
    root: string
    skill_dir: string | null
}): Promise<{
    ws: string
    out: string
    skill_name: string | null
    baseline: Record<string, string>
}> => {
    if (existsSync(root)) {
        throw new Error(`${root} already exists: use a new round or rep`)
    }
    const present = the_case.absent_commands.filter(
        (command) => Bun.which(command) !== null
    )
    if (present.length > 0) {
        throw new Error(
            `case ${the_case.id} needs these commands not installed: ${present.join(', ')}`
        )
    }
    const ws = join(root, 'ws')
    const out = join(root, 'out')
    for (const dir of [ws, out, join(root, 'tmp'), join(root, 'reviews')]) {
        await mkdir(dir, { recursive: true })
    }
    await cp(join(case_dir, 'workspace'), ws, { recursive: true })
    for (const file of the_case.git_files) {
        await writeFile({
            path: join(ws, file.into),
            text: git({ args: ['show', `${file.commit}:${file.path}`] }),
        })
    }
    const diff = the_case.git_diff
    if (diff !== null) {
        await writeFile({
            path: join(ws, diff.into),
            text: git({
                args: ['show', '--format=', diff.commit, '--', ...diff.paths],
            }),
        })
    }
    for (const plant of the_case.plants) {
        const hits = filesUnder({ dir: ws }).filter((path) =>
            readFileSync(join(ws, path), 'utf8').includes(plant.find)
        )
        if (hits.length === 0) {
            throw new Error(
                `case ${the_case.id}: the plant "${plant.find}" matches nothing`
            )
        }
        for (const path of hits) {
            await Bun.write(
                join(ws, path),
                readFileSync(join(ws, path), 'utf8').replaceAll(
                    plant.find,
                    plant.replace
                )
            )
        }
    }
    if (existsSync(join(case_dir, 'notes'))) {
        await cp(join(case_dir, 'notes'), join(ws, 'notes'), {
            recursive: true,
        })
    }
    const skill_name = await installSkill({ skill_dir, ws })
    return { ws, out, skill_name, baseline: workspaceHashes({ ws }) }
}

/** The run's environment: its own temp folder and its own review root. */
export const runEnv = ({
    root,
}: {
    root: string
}): Record<string, string | undefined> => ({
    ...process.env,
    TMPDIR: join(root, 'tmp'),
    LUCA_REVIEWS_DIR: join(root, 'reviews'),
})
