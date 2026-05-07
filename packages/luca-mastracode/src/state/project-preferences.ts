/**
 * Project preferences schema.
 *
 * SECURITY NOTE: Content of this file is repo-local but is DERIVED FROM GIT
 * OUTPUT during luca-init probe (branch names, commit messages, PR titles).
 * In repos cloned from external sources, those strings are UNTRUSTED.
 *
 * The schema enforces a character allowlist on every free-form field that
 * flows into the `muninnInstruction` string consumed by the LLM agent (see
 * tools/project-preferences.ts buildMuninnInstruction). Do not relax these
 * regexes / max-lengths without a security review — they are the blast-radius
 * cap on prompt-injection from a malicious git history.
 *
 * See REVIEW-1.md MUST-FIX-2/3 for the original finding.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { atomicWriteSync } from '../util/atomic-write.js'
import { planningRoot } from '../util/phase-paths.js'

export const SectionName = z.enum(['branching', 'commits', 'pr', 'release', 'tracker'])
export type SectionName = z.infer<typeof SectionName>

/**
 * Character allowlist for free-form preference strings that flow into the
 * `muninnInstruction` text consumed by the LLM agent. Permits letters,
 * digits, whitespace, and the structural punctuation needed for branch /
 * commit / PR title templates. Excludes quote chars, backticks, control
 * chars, and shell metacharacters.
 */
const SAFE_FREEFORM = z.string().max(64).regex(/^[\w\s{}/,.():\-]*$/)

const BranchingSection = z
    .object({
        types: z.array(SAFE_FREEFORM).default([
            'feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'style',
        ]),
        template: SAFE_FREEFORM.default('{type}/{issue}-{slug}'),
        defaultBranch: SAFE_FREEFORM.default('main'),
        guardedBranches: z.array(SAFE_FREEFORM).default(['main']),
    })
    .prefault({})

const CommitsSection = z
    .object({
        convention: z.enum(['conventional', 'none']).default('conventional'),
        scopes: z.array(SAFE_FREEFORM).default([]),
    })
    .prefault({})

const PrSection = z
    .object({
        titleFormat: SAFE_FREEFORM.default('{type}({scope}): {description}'),
        baseBranch: SAFE_FREEFORM.default('main'),
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
        issuePrefix: SAFE_FREEFORM.default(''),
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
