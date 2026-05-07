import type { ProjectPreferences } from '../../state/project-preferences.js'

/**
 * Fixture (a): luca-framework single-rule fallback (current Phase A behavior).
 *
 * Exercises the tool-default path: branchTypes[] is omitted, so resolveBranching
 * falls through to `branching.fallback` (also omitted) and ultimately the
 * built-in tool default rule.
 */
export const LUCA_FRAMEWORK_PREFERENCES: ProjectPreferences = {
    schemaVersion: 1,
    branching: {
        types: ['feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'style'],
        template: '{type}/{issue}-{slug}',
        defaultBranch: 'main',
        guardedBranches: ['main'],
        confirmBaseBeforeCreate: false,
        // No branchTypes[] — exercises the tool-default path.
    },
    commits: { convention: 'conventional', scopes: [] },
    pr: { titleFormat: '{type}({scope}): {description}', baseBranch: 'main' },
    release: {
        tool: 'changesets',
        versionBump: { feat: 'minor', fix: 'patch', chore: 'patch', refactor: 'patch' },
    },
    tracker: { kind: 'github', issuePrefix: '' },
}
