import { existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CaseSchema } from './case-schema'
import {
    REPO_ROOT,
    WORKSPACE_RULES,
    buildWorkspace,
    evalsRoot,
    runRoot,
    skillName,
    skillSource,
    taskPrompt,
} from './workspace'

const PR_531 = 'd9946f89b26b93b026acabf277f6248881991fe3'
const MAIN_AT_PLAN = '8a3bc9f06a77158bea05583ddb836f87d2f240e8'
const STUCK_SUMMARY =
    'packages/engine/skills/luca-unstick/scripts/stuck-summary.ts'

let tmp = ''

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'lr-ws-'))
    process.env.LUCA_EVALS_DIR = join(tmp, 'evals')
})

afterEach(async () => {
    delete process.env.LUCA_EVALS_DIR
    await rm(tmp, { recursive: true, force: true })
})

const sampleCase = (extra: Record<string, unknown>) =>
    CaseSchema.parse({
        id: '9-sample',
        level: 3,
        task: 'Review the change in hello.md and write outcome.md for the owner.',
        skill_clause: 'Use the {skill} skill, Level 3.',
        answer: {
            parts: [
                {
                    name: 'the-point',
                    right: 'The right answer, in full.',
                    caught_when: 'When the run says the right answer.',
                },
            ],
            false_blocker_hint: '',
        },
        marker: null,
        max_budget_usd: 5,
        ...extra,
    })

/** A case folder with `workspace/hello.md` and `notes/n.md`. */
const makeCaseDir = async (): Promise<string> => {
    const dir = join(tmp, 'case')
    await mkdir(join(dir, 'workspace'), { recursive: true })
    await mkdir(join(dir, 'notes'), { recursive: true })
    await Bun.write(join(dir, 'workspace', 'hello.md'), 'hello, world\n')
    await Bun.write(join(dir, 'notes', 'n.md'), 'my notes\n')
    return dir
}

/** A skill folder named fake-skill, with a reference file and a test file. */
const makeSkillDir = async (): Promise<string> => {
    const dir = join(tmp, 'skill')
    await mkdir(join(dir, 'references'), { recursive: true })
    await Bun.write(
        join(dir, 'SKILL.md'),
        '---\nname: fake-skill\ndescription: A fake skill for tests.\n---\n\nBody.\n'
    )
    await Bun.write(join(dir, 'references', 'r.md'), 'a reference\n')
    await Bun.write(join(dir, 'helper.test.ts'), 'test file\n')
    return dir
}

describe('taskPrompt', () => {
    test('adds the skill clause, named, only when there is a skill', () => {
        const the_case = sampleCase({})
        const with_skill = taskPrompt({ the_case, skill_name: 'luca-review' })
        expect(with_skill).toContain(the_case.task)
        expect(with_skill).toContain('Use the luca-review skill, Level 3.')
        expect(with_skill).toContain(WORKSPACE_RULES)
        const without = taskPrompt({ the_case, skill_name: null })
        expect(without).not.toContain('Use the')
        expect(without).toContain(WORKSPACE_RULES)
    })
})

describe('skills', () => {
    test('a skill is named by its frontmatter', async () => {
        expect(skillName({ skill_dir: await makeSkillDir() })).toBe(
            'fake-skill'
        )
    })

    test('a SKILL.md with no name is refused', async () => {
        const dir = join(tmp, 'nameless')
        await mkdir(dir, { recursive: true })
        await Bun.write(join(dir, 'SKILL.md'), '---\ndescription: x\n---\n')
        expect(() => skillName({ skill_dir: dir })).toThrow('no name')
    })

    test('A is the pinned upstream skill, B ours, C none', () => {
        expect(skillSource({ arm: 'A' })).toEndWith(
            join('evals', 'luca-review', 'upstream', 'agent-review')
        )
        expect(skillSource({ arm: 'B' })).toEndWith(
            join('packages', 'engine', 'skills', 'luca-review')
        )
        expect(skillSource({ arm: 'C' })).toBeNull()
    })
})

describe('runRoot', () => {
    test('is short: round, case number, setup, rep', () => {
        expect(
            runRoot({
                round: 'r1',
                case_id: '3-machine-blamed',
                arm: 'B',
                rep: 2,
            })
        ).toBe(join(tmp, 'evals', 'r1', '3B2'))
    })
})

describe('evalsRoot', () => {
    test('is $LUCA_EVALS_DIR when it is set to a folder outside the repo and ~/.claude', () => {
        expect(evalsRoot()).toBe(join(tmp, 'evals'))
    })

    test('an empty $LUCA_EVALS_DIR counts as unset, so the default is used', () => {
        process.env.LUCA_EVALS_DIR = ''
        expect(evalsRoot()).toBe(
            join(homedir(), '.local', 'state', 'luca', 'evals')
        )
    })

    test('an unset $LUCA_EVALS_DIR uses the default too', () => {
        delete process.env.LUCA_EVALS_DIR
        expect(evalsRoot()).toBe(
            join(homedir(), '.local', 'state', 'luca', 'evals')
        )
    })

    test('a relative path is refused', () => {
        process.env.LUCA_EVALS_DIR = join('relative', 'evals')
        expect(() => evalsRoot()).toThrow('absolute')
    })

    test('a folder inside this repo is refused, even one that does not exist yet', () => {
        process.env.LUCA_EVALS_DIR = join(REPO_ROOT, 'no-such-folder', 'evals')
        expect(() => evalsRoot()).toThrow('inside this repo')
    })

    test('the repo itself is refused', () => {
        process.env.LUCA_EVALS_DIR = REPO_ROOT
        expect(() => evalsRoot()).toThrow('inside this repo')
    })

    test('a symlink into the repo is followed, so it cannot hide the repo', () => {
        const link = join(tmp, 'link')
        symlinkSync(REPO_ROOT, link)
        process.env.LUCA_EVALS_DIR = join(link, 'no-such-folder')
        expect(() => evalsRoot()).toThrow('inside this repo')
    })

    test('a folder inside ~/.claude is refused', () => {
        process.env.LUCA_EVALS_DIR = join(homedir(), '.claude', 'x')
        expect(() => evalsRoot()).toThrow('inside ~/.claude')
    })

    test('a folder that only shares a name prefix with the repo is allowed', () => {
        process.env.LUCA_EVALS_DIR = `${REPO_ROOT}-evals`
        expect(evalsRoot()).toBe(`${REPO_ROOT}-evals`)
    })
})

describe('buildWorkspace', () => {
    test('copies the workspace, the notes and the skill, but not its tests', async () => {
        const case_dir = await makeCaseDir()
        const root = join(tmp, 'evals', 'r1', '9A1')
        const built = await buildWorkspace({
            the_case: sampleCase({}),
            case_dir,
            root,
            skill_dir: await makeSkillDir(),
        })
        expect(built.skill_name).toBe('fake-skill')
        expect(readFileSync(join(built.ws, 'hello.md'), 'utf8')).toBe(
            'hello, world\n'
        )
        expect(existsSync(join(built.ws, 'notes', 'n.md'))).toBe(true)
        const skill = join(built.ws, '.claude', 'skills', 'fake-skill')
        expect(existsSync(join(skill, 'SKILL.md'))).toBe(true)
        expect(existsSync(join(skill, 'references', 'r.md'))).toBe(true)
        expect(existsSync(join(skill, 'helper.test.ts'))).toBe(false)
        for (const dir of ['out', 'tmp', 'reviews']) {
            expect(existsSync(join(root, dir))).toBe(true)
        }
        expect(Object.keys(built.baseline)).toEqual(['hello.md', 'notes/n.md'])
    })

    test('with no skill (setup C) there is no .claude folder', async () => {
        const built = await buildWorkspace({
            the_case: sampleCase({}),
            case_dir: await makeCaseDir(),
            root: join(tmp, 'evals', 'r1', '9C1'),
            skill_dir: null,
        })
        expect(built.skill_name).toBeNull()
        expect(existsSync(join(built.ws, '.claude'))).toBe(false)
    })

    test('refuses a root that exists, so no result is overwritten', async () => {
        const root = join(tmp, 'evals', 'r1', '9C1')
        await mkdir(root, { recursive: true })
        await expect(
            buildWorkspace({
                the_case: sampleCase({}),
                case_dir: await makeCaseDir(),
                root,
                skill_dir: null,
            })
        ).rejects.toThrow('already exists')
    })

    test('copies files and a diff from git history', async () => {
        const built = await buildWorkspace({
            the_case: sampleCase({
                git_files: [
                    {
                        commit: MAIN_AT_PLAN,
                        path: 'CLAUDE.md',
                        into: 'sources/CLAUDE.md',
                    },
                ],
                git_diff: {
                    commit: PR_531,
                    paths: [STUCK_SUMMARY],
                    into: 'change.diff',
                },
            }),
            case_dir: await makeCaseDir(),
            root: join(tmp, 'evals', 'r1', '9C1'),
            skill_dir: null,
        })
        expect(
            readFileSync(join(built.ws, 'sources', 'CLAUDE.md'), 'utf8')
        ).toContain('Default to using Bun')
        const diff = readFileSync(join(built.ws, 'change.diff'), 'utf8')
        expect(diff).toContain(`diff --git a/${STUCK_SUMMARY}`)
        expect(diff).toContain('+export const currentRepos')
    })

    test('applies plants, and refuses one that matches nothing', async () => {
        const built = await buildWorkspace({
            the_case: sampleCase({
                plants: [{ find: 'world', replace: 'moon' }],
            }),
            case_dir: await makeCaseDir(),
            root: join(tmp, 'evals', 'r1', '9C1'),
            skill_dir: null,
        })
        expect(readFileSync(join(built.ws, 'hello.md'), 'utf8')).toBe(
            'hello, moon\n'
        )
        await expect(
            buildWorkspace({
                the_case: sampleCase({
                    plants: [{ find: 'mars', replace: 'x' }],
                }),
                case_dir: await makeCaseDir(),
                root: join(tmp, 'evals', 'r1', '9C2'),
                skill_dir: null,
            })
        ).rejects.toThrow('matches nothing')
    })

    test('refuses a case whose absent commands are installed', async () => {
        await expect(
            buildWorkspace({
                the_case: sampleCase({ absent_commands: ['git'] }),
                case_dir: await makeCaseDir(),
                root: join(tmp, 'evals', 'r1', '9C1'),
                skill_dir: null,
            })
        ).rejects.toThrow('git')
    })
})
