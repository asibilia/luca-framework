/**
 * Where the `/luca-pr-prep` skill's generated files live (#738). The
 * scripts that write them (`build-pr-story.ts`, `write-story-example.ts`)
 * build their paths from these names, so the skill's folder is spelled in
 * one place.
 */
import { join } from 'node:path'

/** The folder and file names on the way to the skill's generated files. */
export const BUNDLE_PATH_PARTS = {
    skills: 'skills',
    skill: 'luca-pr-prep',
    scripts: 'scripts',
    references: 'references',
    bundle: 'pr-story.js',
    example: 'story-example.json',
} as const

/** The engine package's folder. */
export const ENGINE_DIR = join(import.meta.dir, '..')

/** The `/luca-pr-prep` skill's folder. */
export const PR_PREP_SKILL_DIR = join(
    ENGINE_DIR,
    BUNDLE_PATH_PARTS.skills,
    BUNDLE_PATH_PARTS.skill
)
