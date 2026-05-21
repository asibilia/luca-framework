// One-shot script to seed luca-framework's own .planning/preferences.json
// via the projectPreferences tool. Run from packages/luca-mastracode:
//   bun run scripts/seed-luca-prefs.ts
//
// Outputs the tool result (JSON). The seed action also writes
// .planning/preferences.json and sets state.preferencesSeeded=true.
import type { ToolExecutionContext } from '@mastra/core/tools'

import { projectPreferencesTool } from '../src/tools/project-preferences.ts'

const payload = {
    branching: {
        defaultBranch: 'main',
        guardedBranches: ['main'],
        types: ['feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'style'],
        template: '{type}/{issue}-{slug}',
        confirmBaseBeforeCreate: false,
    },
    commits: {
        convention: 'conventional',
        scopes: ['framework', 'mastracode', 'studio', 'config', 'docs', 'repo'],
        types: ['feat', 'fix', 'refactor', 'chore', 'docs', 'test', 'style'],
        trailers: { coAuthor: true, issueRef: 'Closes #' },
        subjectMaxLength: 72,
    },
    pr: {
        titleFormat: '{type}({scope}): {description}',
        titleTemplate: '{type}({scope}): {version} #{issue} {description}',
        baseBranch: 'main',
        titleExamples: [
            'feat(mastracode): v10.2.0 #143 bundled skills system',
            'fix(framework): v9.4.1 #178 handle null vault config',
        ],
        forbidden: [
            { pattern: '\\(#\\d+\\)', reason: 'use trailer not title' },
        ],
        bodyTemplate: 'what-why-how-testplan',
        draftByDefault: true,
    },
    release: {
        tool: 'changesets',
        versionBump: {
            feat: 'minor',
            fix: 'patch',
            chore: 'patch',
            refactor: 'patch',
            docs: 'patch',
            test: 'patch',
            style: 'patch',
        },
    },
    tracker: {
        kind: 'github',
        issuePrefix: '',
        linkFormat: 'Closes #{issue}',
    },
}

const result = await projectPreferencesTool.execute!(
    { action: 'seed', payload, fallback: false },
    {} as ToolExecutionContext
)

console.log(JSON.stringify(result, null, 2))
