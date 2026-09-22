import { existsSync } from 'node:fs'
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    COMMANDS,
    MODES,
    SKILLS,
    SUBAGENTS,
} from '@alecsibilia/luca-tools/artifacts'
import {
    isAgent,
    isCommand,
    isSkill,
    isSubagent,
} from '@alecsibilia/luca-tools/define'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    installSkills,
    listBundledArtifacts,
    pruneRetiredArtifacts,
    RETIRED_ARTIFACTS,
} from './install-skills.ts'
import type { RetiredArtifact } from './install-skills.ts'

/**
 * A retired entry naming something no bundle fixture ships. Injected via
 * `installSkills({ retired })` so the eviction mechanics are exercised on
 * the real call path — `RETIRED_ARTIFACTS` itself is legitimately empty
 * whenever nothing has been deleted, and the drift guard below forbids
 * padding it with still-bundled names to make these tests non-vacuous.
 */
const RETIRED_GONE_SKILL: readonly RetiredArtifact[] = [
    { kind: 'skill', name: 'gone-skill', retiredIn: '13.1.0' },
]

describe('installSkills', () => {
    let claudeHome: string
    let distClaude: string
    let claudeArtifactsRoot: string
    let skillsRoot: string

    beforeEach(async () => {
        claudeHome = await mkdtemp(join(tmpdir(), 'luca-claude-home-'))
        // F-2: mirror the umbrella's bundled-artifacts layout — commands
        // and agents under `<dist/claude>/.claude/`, skills under
        // `<dist/claude>/skills/`. The compiler emits both as siblings
        // of `<outputRoot>`.
        distClaude = await mkdtemp(join(tmpdir(), 'luca-dist-claude-'))
        claudeArtifactsRoot = join(distClaude, '.claude')
        skillsRoot = join(distClaude, 'skills')
        await mkdir(join(claudeArtifactsRoot, 'commands'), { recursive: true })
        await mkdir(join(claudeArtifactsRoot, 'agents'), { recursive: true })
        await mkdir(join(skillsRoot, 'luca-init'), { recursive: true })
        await writeFile(
            join(claudeArtifactsRoot, 'commands/phase-plan.md'),
            '---\nname: phase-plan\n---\nbody'
        )
        await writeFile(
            join(claudeArtifactsRoot, 'agents/luca-executor.md'),
            '---\nname: luca-executor\n---\nbody'
        )
        await writeFile(
            join(skillsRoot, 'luca-init/SKILL.md'),
            '---\nname: luca-init\ndescription: seed prefs\n---\nbody'
        )
    })

    afterEach(async () => {
        await rm(claudeHome, { recursive: true, force: true })
        await rm(distClaude, { recursive: true, force: true })
    })

    test('copies commands to <claudeHome>/commands/', async () => {
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const target = join(claudeHome, 'commands/phase-plan.md')
        expect(existsSync(target)).toBe(true)
        const content = await readFile(target, 'utf-8')
        expect(content).toContain('phase-plan')
    })

    test('copies agents to <claudeHome>/agents/', async () => {
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const target = join(claudeHome, 'agents/luca-executor.md')
        expect(existsSync(target)).toBe(true)
    })

    test('copies skill directories to <claudeHome>/skills/<name>/', async () => {
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const target = join(claudeHome, 'skills/luca-init/SKILL.md')
        expect(existsSync(target)).toBe(true)
        const content = await readFile(target, 'utf-8')
        expect(content).toContain('luca-init')
    })

    test('is idempotent — re-running does not duplicate or error', async () => {
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        expect(existsSync(join(claudeHome, 'commands/phase-plan.md'))).toBe(
            true
        )
    })

    test('preserves user-authored files not part of the install set', async () => {
        await mkdir(join(claudeHome, 'commands'), { recursive: true })
        await writeFile(
            join(claudeHome, 'commands/my-custom-command.md'),
            'user content'
        )

        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        expect(
            existsSync(join(claudeHome, 'commands/my-custom-command.md'))
        ).toBe(true)
        expect(existsSync(join(claudeHome, 'commands/phase-plan.md'))).toBe(
            true
        )
    })

    test('replaces a dangling symlink squatting a skill directory (regression: EEXIST crash)', async () => {
        // Reproduce the exact state an older dev install leaves behind: a
        // broken symlink at ~/.claude/skills/<name> pointing into a build
        // path that no longer exists. A naive `mkdir(recursive)` throws
        // EEXIST on this, which crashed `luca init`.
        await mkdir(join(claudeHome, 'skills'), { recursive: true })
        await symlink(
            join(distClaude, 'nonexistent-old-build-target'),
            join(claudeHome, 'skills/luca-init')
        )

        // Must not throw.
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const target = join(claudeHome, 'skills/luca-init/SKILL.md')
        expect(existsSync(target)).toBe(true)
        expect(await readFile(target, 'utf-8')).toContain('luca-init')
    })

    test('replaces a symlinked destination file instead of writing through it', async () => {
        // A stale symlink at a destination *file* path must be removed and
        // replaced with a real file — not followed (which would clobber the
        // link's unrelated target).
        await mkdir(join(claudeHome, 'commands'), { recursive: true })
        const foreign = join(distClaude, 'foreign-file.md')
        await writeFile(foreign, 'FOREIGN — must not be overwritten')
        await symlink(foreign, join(claudeHome, 'commands/phase-plan.md'))

        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const dest = join(claudeHome, 'commands/phase-plan.md')
        expect((await lstat(dest)).isSymbolicLink()).toBe(false)
        expect(await readFile(dest, 'utf-8')).toContain('phase-plan')
        // The symlink's original target was left untouched.
        expect(await readFile(foreign, 'utf-8')).toContain('FOREIGN')
    })

    test('overwrites existing skills with the same name (force-updates from package)', async () => {
        await mkdir(join(claudeHome, 'commands'), { recursive: true })
        await writeFile(
            join(claudeHome, 'commands/phase-plan.md'),
            'STALE OLD CONTENT'
        )

        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const content = await readFile(
            join(claudeHome, 'commands/phase-plan.md'),
            'utf-8'
        )
        expect(content).not.toContain('STALE')
        expect(content).toContain('phase-plan')
    })

    test('prunes a retired skill left behind by an older luca version', async () => {
        // `gone-skill` is on the retired list and is NOT in this run's
        // bundle, so the install path must evict it.
        await mkdir(join(claudeHome, 'skills/gone-skill'), {
            recursive: true,
        })
        await writeFile(
            join(claudeHome, 'skills/gone-skill/SKILL.md'),
            '---\nname: gone-skill\n---\nretired'
        )

        await installSkills({
            claudeHome,
            claudeArtifactsRoot,
            skillsRoot,
            retired: RETIRED_GONE_SKILL,
        })

        expect(existsSync(join(claudeHome, 'skills/gone-skill'))).toBe(false)
        // Quarantined, not destroyed — the move is reversible by hand.
        expect(
            existsSync(
                join(
                    claudeHome,
                    '.luca-retired-backup/skills/gone-skill/SKILL.md'
                )
            )
        ).toBe(true)
    })

    test('a user-authored skill with an unrelated name survives the prune', async () => {
        await mkdir(join(claudeHome, 'skills/my-custom-skill'), {
            recursive: true,
        })
        await writeFile(
            join(claudeHome, 'skills/my-custom-skill/SKILL.md'),
            'USER CONTENT'
        )
        await mkdir(join(claudeHome, 'skills/gone-skill'), {
            recursive: true,
        })
        await writeFile(
            join(claudeHome, 'skills/gone-skill/SKILL.md'),
            'retired'
        )

        await installSkills({
            claudeHome,
            claudeArtifactsRoot,
            skillsRoot,
            retired: RETIRED_GONE_SKILL,
        })

        const survivor = join(claudeHome, 'skills/my-custom-skill/SKILL.md')
        expect(existsSync(survivor)).toBe(true)
        expect(await readFile(survivor, 'utf-8')).toBe('USER CONTENT')
        // ...and the retired one still went away in the same run.
        expect(existsSync(join(claudeHome, 'skills/gone-skill'))).toBe(false)
    })

    test('prune is idempotent and never clobbers an earlier backup', async () => {
        const seed = async (body: string) => {
            await mkdir(join(claudeHome, 'skills/gone-skill'), {
                recursive: true,
            })
            await writeFile(
                join(claudeHome, 'skills/gone-skill/SKILL.md'),
                body
            )
        }
        const install = () =>
            installSkills({
                claudeHome,
                claudeArtifactsRoot,
                skillsRoot,
                retired: RETIRED_GONE_SKILL,
            })

        await seed('FIRST')
        await install()
        // A second install with nothing to prune must not throw.
        await install()
        await seed('SECOND')
        await install()

        const backups = join(claudeHome, '.luca-retired-backup/skills')
        expect(
            await readFile(join(backups, 'gone-skill/SKILL.md'), 'utf-8')
        ).toBe('FIRST')
        expect(
            await readFile(join(backups, 'gone-skill.1/SKILL.md'), 'utf-8')
        ).toBe('SECOND')
    })

    test('a live bundled skill is never pruned, whatever the retired list says', async () => {
        // The bundle fixture ships `luca-init`. Even with it wrongly on
        // the retired list, the copy must win and the artifact survive.
        await installSkills({
            claudeHome,
            claudeArtifactsRoot,
            skillsRoot,
            retired: [
                { kind: 'skill', name: 'luca-init', retiredIn: '13.1.0' },
            ],
        })

        expect(existsSync(join(claudeHome, 'skills/luca-init/SKILL.md'))).toBe(
            true
        )
        expect(existsSync(join(claudeHome, '.luca-retired-backup'))).toBe(false)
    })

    test('an un-enumerable skills source prunes NOTHING (regression: partial bundle evicted live skills)', async () => {
        // `copySkillTree` treats a missing skills source as a non-fatal
        // skip, and `listEntries` reports `skills: []` for it. Before the
        // fix, prune read that as "luca ships no skills" and quarantined
        // every retired name — including ones still shipped by a bundle
        // whose layout this luca simply could not read.
        await mkdir(join(claudeHome, 'skills/luca-init'), { recursive: true })
        await writeFile(
            join(claudeHome, 'skills/luca-init/SKILL.md'),
            'LIVE SKILL'
        )

        const logs: string[] = []
        await installSkills({
            claudeHome,
            claudeArtifactsRoot,
            skillsRoot: join(distClaude, 'skills-in-a-layout-we-cannot-read'),
            retired: [
                { kind: 'skill', name: 'luca-init', retiredIn: '13.1.0' },
            ],
            log: (m) => logs.push(m),
        })

        expect(
            await readFile(
                join(claudeHome, 'skills/luca-init/SKILL.md'),
                'utf-8'
            )
        ).toBe('LIVE SKILL')
        expect(existsSync(join(claudeHome, '.luca-retired-backup'))).toBe(false)
        expect(logs.join('\n')).toContain('retired-skills prune')
    })

    test('an un-enumerable commands source prunes NOTHING', async () => {
        await rm(join(claudeArtifactsRoot, 'commands'), {
            recursive: true,
            force: true,
        })
        await mkdir(join(claudeHome, 'commands'), { recursive: true })
        await writeFile(join(claudeHome, 'commands/lu.md'), 'LIVE COMMAND')

        await installSkills({
            claudeHome,
            claudeArtifactsRoot,
            skillsRoot,
            retired: [{ kind: 'command', name: 'lu.md', retiredIn: '13.1.0' }],
        })

        expect(
            await readFile(join(claudeHome, 'commands/lu.md'), 'utf-8')
        ).toBe('LIVE COMMAND')
        expect(existsSync(join(claudeHome, '.luca-retired-backup'))).toBe(false)
    })

    test('an un-enumerable agents source prunes NOTHING', async () => {
        await rm(join(claudeArtifactsRoot, 'agents'), {
            recursive: true,
            force: true,
        })
        await mkdir(join(claudeHome, 'agents'), { recursive: true })
        await writeFile(
            join(claudeHome, 'agents/luca-executor.md'),
            'LIVE AGENT'
        )

        await installSkills({
            claudeHome,
            claudeArtifactsRoot,
            skillsRoot,
            retired: [
                {
                    kind: 'agent',
                    name: 'luca-executor.md',
                    retiredIn: '13.1.0',
                },
            ],
        })

        expect(
            await readFile(join(claudeHome, 'agents/luca-executor.md'), 'utf-8')
        ).toBe('LIVE AGENT')
        expect(existsSync(join(claudeHome, '.luca-retired-backup'))).toBe(false)
    })
})

describe('pruneRetiredArtifacts', () => {
    let home: string

    beforeEach(async () => {
        home = await mkdtemp(join(tmpdir(), 'luca-prune-home-'))
    })

    afterEach(async () => {
        await rm(home, { recursive: true, force: true })
    })

    test('the current bundle wins — a still-shipped name is never pruned', async () => {
        await mkdir(join(home, 'skills/still-shipped'), { recursive: true })
        await writeFile(join(home, 'skills/still-shipped/SKILL.md'), 'live')

        const removed = await pruneRetiredArtifacts({
            home,
            retired: [
                { kind: 'skill', name: 'still-shipped', retiredIn: '13.1.0' },
            ],
            bundled: {
                commands: [],
                agents: [],
                skills: ['still-shipped'],
            },
        })

        expect(removed).toEqual([])
        expect(existsSync(join(home, 'skills/still-shipped/SKILL.md'))).toBe(
            true
        )
    })

    test('skips buckets the harness does not install', async () => {
        await mkdir(join(home, 'commands'), { recursive: true })
        await writeFile(join(home, 'commands/gone.md'), 'retired')

        const removed = await pruneRetiredArtifacts({
            home,
            artifacts: { agents: true, commands: false, skills: true },
            retired: [
                { kind: 'command', name: 'gone.md', retiredIn: '13.1.0' },
            ],
            bundled: { commands: [], agents: [], skills: [] },
        })

        expect(removed).toEqual([])
        expect(existsSync(join(home, 'commands/gone.md'))).toBe(true)
    })

    test('prunes retired commands and agents, reporting what moved', async () => {
        await mkdir(join(home, 'commands'), { recursive: true })
        await mkdir(join(home, 'agents'), { recursive: true })
        await writeFile(join(home, 'commands/gone.md'), 'retired command')
        await writeFile(join(home, 'agents/gone-agent.md'), 'retired agent')

        const logs: string[] = []
        const removed = await pruneRetiredArtifacts({
            home,
            retired: [
                { kind: 'command', name: 'gone.md', retiredIn: '13.1.0' },
                { kind: 'agent', name: 'gone-agent.md', retiredIn: '13.1.0' },
            ],
            bundled: { commands: [], agents: [], skills: [] },
            log: (m) => logs.push(m),
        })

        expect(removed).toEqual(['commands/gone.md', 'agents/gone-agent.md'])
        expect(existsSync(join(home, 'commands/gone.md'))).toBe(false)
        expect(existsSync(join(home, 'agents/gone-agent.md'))).toBe(false)
        expect(
            await readFile(
                join(home, '.luca-retired-backup/commands/gone.md'),
                'utf-8'
            )
        ).toBe('retired command')
        expect(logs.join('\n')).toContain('13.1.0')
    })

    test('is a no-op when nothing retired is present', async () => {
        const removed = await pruneRetiredArtifacts({
            home,
            retired: [{ kind: 'skill', name: 'absent', retiredIn: '13.1.0' }],
            bundled: { commands: [], agents: [], skills: [] },
        })

        expect(removed).toEqual([])
        expect(existsSync(join(home, '.luca-retired-backup'))).toBe(false)
    })

    test('an unknown bundle authorizes nothing — omitted `bundled` prunes nothing', async () => {
        await mkdir(join(home, 'skills/still-shipped'), { recursive: true })
        await writeFile(join(home, 'skills/still-shipped/SKILL.md'), 'live')

        const removed = await pruneRetiredArtifacts({
            home,
            retired: [
                { kind: 'skill', name: 'still-shipped', retiredIn: '13.1.0' },
            ],
        })

        expect(removed).toEqual([])
        expect(existsSync(join(home, 'skills/still-shipped/SKILL.md'))).toBe(
            true
        )
    })

    test('an unknown bundle authorizes nothing — null `bundled` prunes nothing', async () => {
        await mkdir(join(home, 'skills/still-shipped'), { recursive: true })
        await writeFile(join(home, 'skills/still-shipped/SKILL.md'), 'live')

        // `listBundledArtifacts()` returns null when the bundle can't be
        // located; that must read as "unknown", never as "ships nothing".
        const removed = await pruneRetiredArtifacts({
            home,
            retired: [
                { kind: 'skill', name: 'still-shipped', retiredIn: '13.1.0' },
            ],
            bundled: null,
        })

        expect(removed).toEqual([])
        expect(existsSync(join(home, 'skills/still-shipped/SKILL.md'))).toBe(
            true
        )
    })
})

describe('RETIRED_ARTIFACTS', () => {
    test('entries are unique per kind+name', () => {
        const keys = RETIRED_ARTIFACTS.map((a) => `${a.kind}:${a.name}`)
        expect(new Set(keys).size).toBe(keys.length)
    })

    test('command and agent entries carry the .md extension; skills do not', () => {
        for (const entry of RETIRED_ARTIFACTS) {
            if (entry.kind === 'skill') {
                expect(entry.name.endsWith('.md')).toBe(false)
            } else {
                expect(entry.name.endsWith('.md')).toBe(true)
            }
        }
    })
})

/**
 * The drift guard.
 *
 * `pruneRetiredArtifacts` skips any name still present in the bundle, so
 * a retired entry that is ALSO still shipped is a guaranteed no-op: the
 * uninstall reads as delivered and evicts nothing. The prune tests above
 * can't catch that — they drive a fixture bundle, and a fixture will
 * happily omit a name the real bundle ships. Only a comparison against
 * the shipped surface can, so it lives here.
 *
 * Two surfaces, deliberately:
 *   - the luca-tools registries are what the NEXT compile emits, so they
 *     catch a retired entry whose source was never actually deleted;
 *   - the built `dist/claude` tree is what an installing user receives,
 *     so it catches a retired entry that a stale build still ships.
 */
describe('RETIRED_ARTIFACTS drift guard', () => {
    test('names nothing still reachable from the luca-tools registries', () => {
        const live = {
            skills: SKILLS.filter(isSkill).map((s) => s.name),
            commands: COMMANDS.filter(isCommand).map((c) => `${c.name}.md`),
            agents: [
                ...SUBAGENTS.filter(isSubagent).map((s) => `${s.id}.md`),
                ...MODES.filter(isAgent).map((m) => `${m.id}.md`),
            ],
        }
        const bucketOf = {
            skill: 'skills',
            command: 'commands',
            agent: 'agents',
        } as const

        const stillShipped = RETIRED_ARTIFACTS.filter((entry) =>
            live[bucketOf[entry.kind]].includes(entry.name)
        ).map((entry) => `${entry.kind}:${entry.name}`)

        if (stillShipped.length > 0) {
            throw new Error(
                `RETIRED_ARTIFACTS names ${stillShipped.length} artifact(s) luca still ships: ` +
                    `${stillShipped.join(', ')}. The prune skips anything still bundled, so these ` +
                    `entries evict nothing while advertising an uninstall. Either delete the source ` +
                    `and its registry entry in this change, or drop the entry until that lands.`
            )
        }
        expect(stillShipped).toEqual([])
    })

    test('names nothing present in the built dist/claude bundle', async () => {
        const bundled = await listBundledArtifacts()
        // A dev tree with no umbrella build has nothing to compare
        // against; the registry assertion above still covers the case.
        if (bundled === null) return

        const stillShipped = RETIRED_ARTIFACTS.filter((entry) => {
            const bucket =
                entry.kind === 'skill'
                    ? bundled.skills
                    : entry.kind === 'command'
                      ? bundled.commands
                      : bundled.agents
            return bucket.includes(entry.name)
        }).map((entry) => `${entry.kind}:${entry.name}`)

        expect(stillShipped).toEqual([])
    })
})
