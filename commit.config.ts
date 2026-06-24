import { type CommitConfig } from '@alecsibilia/commit'

const config: CommitConfig = {
    types: [
        { value: 'feat', label: '✨ A new feature' },
        { value: 'fix', label: '🐛 A bug fix' },
        { value: 'docs', label: '📚 Documentation only changes' },
        {
            value: 'style',
            label: '💎 Changes that do not affect the meaning of the code',
        },
        {
            value: 'refactor',
            label: '📦 A code change that neither fixes a bug nor adds a feature',
        },
        { value: 'test', label: '🚨 Adding missing tests' },
        {
            value: 'chore',
            label: '♻️ Changes to the build process or auxiliary tools',
        },
    ],
    scopes: [
        { value: 'cli', label: 'Luca CLI (@alecsibilia/luca, luca-cli)' },
        { value: 'core', label: 'luca-core (state machine, orchestration)' },
        { value: 'tools', label: 'luca-tools (harness instruction bodies)' },
        { value: 'config', label: 'Configuration' },
        { value: 'docs', label: 'Documentation' },
        { value: 'repo', label: 'Repository & Tooling' },
    ],
    git: {
        auto_add_all: true,
        auto_push: false,
    },
}

export default config
