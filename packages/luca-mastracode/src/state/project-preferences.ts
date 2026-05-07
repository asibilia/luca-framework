/**
 * Project preferences schema.
 *
 * SECURITY NOTE: Content of this file is trusted (repo-local).
 * Written verbatim into MuninnDB summaries by the luca-init skill.
 * Do not include user-supplied untrusted strings without sanitization.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { atomicWriteSync } from '../util/atomic-write.js'
import { planningRoot } from '../util/phase-paths.js'

export const SectionName = z.enum(['branching', 'commits', 'pr', 'release', 'tracker'])
export type SectionName = z.infer<typeof SectionName>

const BranchingSection = z
    .object({
        types: z
            .array(z.string())
            .default(['feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'style']),
        template: z.string().default('{type}/{issue}-{slug}'),
        defaultBranch: z.string().default('main'),
        guardedBranches: z.array(z.string()).default(['main']),
    })
    .prefault({})

const CommitsSection = z
    .object({
        convention: z.enum(['conventional', 'none']).default('conventional'),
        scopes: z.array(z.string()).default([]),
    })
    .prefault({})

const PrSection = z
    .object({
        titleFormat: z.string().default('{type}({scope}): {description}'),
        baseBranch: z.string().default('main'),
    })
    .prefault({})

const ReleaseSection = z
    .object({
        tool: z.enum(['changesets', 'none', 'semantic-release']).default('none'),
        versionBump: z
            .record(z.string(), z.enum(['major', 'minor', 'patch']))
            .default({ feat: 'minor', fix: 'patch', chore: 'patch', refactor: 'patch' }),
    })
    .prefault({})

const TrackerSection = z
    .object({
        kind: z.enum(['github', 'linear', 'jira', 'none']).default('github'),
        issuePrefix: z.string().default(''),
    })
    .prefault({})

export const ProjectPreferencesSchema = z
    .object({
        schemaVersion: z.literal(1).default(1),
        branching: BranchingSection,
        commits: CommitsSection,
        pr: PrSection,
        release: ReleaseSection,
        tracker: TrackerSection,
    })
    .prefault({})

export type ProjectPreferences = z.infer<typeof ProjectPreferencesSchema>

/** Hardcoded defaults matching today's behavior. Returned by consult() when fallback:true and no prefs file. */
export const DEFAULT_PREFERENCES: ProjectPreferences = ProjectPreferencesSchema.parse({})

/** `.planning/preferences.json` — repo-local cache of project preferences. */
export function PREFERENCES_PATH(): string {
    return join(planningRoot(), 'preferences.json')
}

/** Load preferences from .planning/preferences.json. Returns null if file missing/invalid. */
export function loadProjectPreferences(): ProjectPreferences | null {
    const p = PREFERENCES_PATH()
    if (!existsSync(p)) return null
    try {
        const raw = JSON.parse(readFileSync(p, 'utf-8'))
        return ProjectPreferencesSchema.parse(raw)
    } catch {
        return null
    }
}

/** Write preferences to .planning/preferences.json (atomic). */
export function writeProjectPreferences(prefs: ProjectPreferences): void {
    const p = PREFERENCES_PATH()
    atomicWriteSync(p, JSON.stringify(prefs, null, 2) + '\n')
}
