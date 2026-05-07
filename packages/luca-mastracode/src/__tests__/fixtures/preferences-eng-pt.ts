import type { ProjectPreferences } from '../../state/project-preferences.js'

/**
 * Fixture (b): ENG/PT multi-rule (the project that triggered PT-12458).
 *
 *  - ENG-* tickets are RC branches; base/prBase = main.
 *  - PT-* tickets are feature branches off ENG-*--release if currently on one,
 *    else 'ask'.
 *  - guardedBranches includes 'main' AND a release-branch literal so that
 *    assert-not-default refuses commits on a release branch.
 */
export const ENG_PT_PREFERENCES: ProjectPreferences = {
    schemaVersion: 1,
    branching: {
        types: ['feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'style'],
        template: '{type}/{issue}-{slug}',
        defaultBranch: 'main',
        // Explicit literal so the assert-not-default test in B.4.3(ii) is mechanical.
        guardedBranches: ['main', 'ENG-1428--release'],
        confirmBaseBeforeCreate: false,
        branchTypes: [
            {
                match: '^ENG-\\d+$',
                template: '{issue}--release',
                base: { kind: 'static', value: 'main' },
                prBase: { kind: 'static', value: 'main' },
                role: 'release',
            },
            {
                match: '^PT-\\d+$',
                template: '{type}/{issue}-{slug}',
                base: {
                    kind: 'current-branch-if-matches',
                    pattern: '^ENG-\\d+--release$',
                    fallback: 'ask',
                },
                prBase: {
                    kind: 'current-branch-if-matches',
                    pattern: '^ENG-\\d+--release$',
                    fallback: 'ask',
                },
                role: 'feature',
            },
        ],
        fallback: {
            match: '^.*$',
            template: '{type}/{slug}',
            base: { kind: 'static', value: 'main' },
            prBase: { kind: 'static', value: 'main' },
            role: 'feature',
        },
    },
    commits: { convention: 'conventional', scopes: [] },
    pr: { titleFormat: '{type}({scope}): {description}', baseBranch: 'main' },
    release: {
        tool: 'changesets',
        versionBump: {
            feat: 'minor',
            fix: 'patch',
            chore: 'patch',
            refactor: 'patch',
        },
    },
    tracker: { kind: 'github', issuePrefix: '' },
}
