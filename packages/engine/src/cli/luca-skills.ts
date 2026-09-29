import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { StepEnd } from './board-in-paseo'
import { reason } from './doctor-checks'

/**
 * Luca's own Claude Code skills, such as `/luca-unstick` (#504). They ship
 * in the package's `skills/` folder, next to `engine/` and `board/`
 * (`packages/engine/skills/` in the repo). `luca init` and `luca upgrade`
 * copy them to `~/.claude/skills/<skill>/`, so they work in any repo and
 * any Paseo chat, and `luca doctor` checks the copy is the one the
 * installed Luca ships (`luca doctor --fix` copies it again).
 *
 * A copy writes every file the skill ships (not its tests), over Luca's own
 * earlier copy. It never deletes, and never touches other skills.
 */

/** Luca's own skills, by folder name. */
export const LUCA_SKILLS = ['luca-unstick']

/** Test files stay in the repo: they aren't part of a skill. */
const isTestFile = (path: string) => /\.test\.[cm]?[jt]sx?$/.test(path)

/** Where Claude Code finds a user's own skills. */
export const claudeSkillsDir = ({ home }: { home: string }): string =>
    join(home, '.claude', 'skills')

/**
 * The files one skill ships, relative to its folder in `skills_dir`,
 * sorted: every file but tests. None when the folder is missing.
 *
 * @example
 * await skillFiles({ skills_dir, skill: 'luca-unstick' }) // ['SKILL.md', 'scripts/stuck-summary.ts']
 */
export const skillFiles = async ({
    skills_dir,
    skill,
}: {
    skills_dir: string
    skill: string
}): Promise<string[]> => {
    try {
        const files = await Array.fromAsync(
            new Bun.Glob('**/*').scan({
                cwd: join(skills_dir, skill),
                dot: true,
                onlyFiles: true,
            })
        )
        return files.filter((file) => !isTestFile(file)).toSorted()
    } catch {
        return []
    }
}

/** How one installed skill differs from the one Luca ships. */
export type SkillDrift = {
    skill: string
    /** Luca's install folder has no files for it. */
    unshipped: boolean
    /** Shipped files the installed copy lacks. */
    missing: string[]
    /** Shipped files whose installed copy has other content. */
    changed: string[]
}

/**
 * How each of Luca's skills in `~/.claude/skills` differs from the ones in
 * `skills_dir`; a skill that matches has empty lists. Read-only.
 */
export const skillDrift = async ({
    home,
    skills_dir,
}: {
    home: string
    skills_dir: string
}): Promise<SkillDrift[]> => {
    const drift: SkillDrift[] = []
    for (const skill of LUCA_SKILLS) {
        const files = await skillFiles({ skills_dir, skill })
        const missing: string[] = []
        const changed: string[] = []
        for (const file of files) {
            const installed = Bun.file(
                join(claudeSkillsDir({ home }), skill, file)
            )
            if (!(await installed.exists())) {
                missing.push(file)
                continue
            }
            const shipped = Bun.file(join(skills_dir, skill, file))
            if ((await installed.text()) !== (await shipped.text())) {
                changed.push(file)
            }
        }
        drift.push({ skill, unshipped: files.length === 0, missing, changed })
    }
    return drift
}

/**
 * Copies Luca's skills from `skills_dir` into `~/.claude/skills`, over
 * Luca's own earlier copy: each shipped file whose installed copy is
 * missing or differs is written. Logs one line after `prefix`. Never
 * throws.
 *
 * @example
 * await installLucaSkills({ home: homedir(), skills_dir, prefix: '[luca init]', log: console.log })
 * // [luca init] Luca's skills: installed /luca-unstick in ~/.claude/skills
 */
export const installLucaSkills = async ({
    home,
    skills_dir,
    prefix,
    log,
}: {
    home: string
    skills_dir: string
    prefix: string
    log: (line: string) => void
}): Promise<StepEnd> => {
    const say = ({ message, ok }: StepEnd): StepEnd => {
        log(message)
        return { ok, message }
    }
    try {
        const written: string[] = []
        for (const { skill, unshipped, missing, changed } of await skillDrift({
            home,
            skills_dir,
        })) {
            if (unshipped) {
                return say({
                    message: `${prefix} Luca's skills: ${skill} isn't in Luca's folder ${skills_dir}. Reinstall Luca.`,
                    ok: false,
                })
            }
            for (const file of [...missing, ...changed]) {
                const target = join(claudeSkillsDir({ home }), skill, file)
                await mkdir(dirname(target), { recursive: true })
                await Bun.write(target, Bun.file(join(skills_dir, skill, file)))
            }
            if (missing.length + changed.length > 0) written.push(skill)
        }
        return say({
            message:
                written.length === 0
                    ? `${prefix} Luca's skills: up to date`
                    : `${prefix} Luca's skills: installed ${written.map((skill) => `/${skill}`).join(', ')} in ${claudeSkillsDir({ home })}`,
            ok: true,
        })
    } catch (error) {
        return say({
            message: `${prefix} Luca's skills: ${reason(error)}`,
            ok: false,
        })
    }
}
