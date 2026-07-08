/**
 * CLI entry point for the Luca framework.
 *
 * Defines the main `luca` command and its sub-commands (lifecycle commands
 * plus the v13 write-surface noun groups). Separated from index.ts to keep
 * the barrel pure (re-exports only).
 */

import { defineCommand, runMain as cittyRunMain } from 'citty'

import { LUCA_VERSION } from './utils/manifest'

const main = defineCommand({
    meta: {
        name: 'luca',
        version: LUCA_VERSION,
        description:
            'Luca CLI — spec-driven agentic development workflow + write surface',
    },
    subCommands: {
        init: () => import('./commands/init').then((m) => m.initCommand),
        'vault:init': () =>
            import('./commands/vault-init').then((m) => m.vaultInitCommand),
        retro: () => import('./commands/retro').then((m) => m.retroCommand),
        'claim-verify': () =>
            import('./commands/claim-verify').then((m) => m.claimVerifyCommand),
        telemetry: () =>
            import('./commands/telemetry').then((m) => m.telemetryCommand),
        rules: () => import('./commands/rules').then((m) => m.rulesCommand),
        classify: () =>
            import('./commands/classify').then((m) => m.classifyCommand),
        graph: () => import('./commands/graph').then((m) => m.graphCommand),
        doctor: () => import('./commands/doctor').then((m) => m.default),
        hook: () => import('./commands/hook').then((m) => m.hookCommand),
        repair: () => import('./commands/repair').then((m) => m.repairCommand),
        version: () =>
            import('./commands/version').then((m) => m.versionCommand),

        // DAD-P2 persistent-runner POC verbs.
        start: () => import('./commands/runner').then((m) => m.startCommand),
        stop: () => import('./commands/runner').then((m) => m.stopCommand),
        status: () => import('./commands/runner').then((m) => m.statusCommand),

        // v13 write-surface noun-group commands (structured/operational
        // mutations). The 9 freeform artifact writes are NOT here — they
        // use the native Write tool (v13 plan, Phase C).
        state: () =>
            import('./commands/write-surface/state').then(
                (m) => m.stateCommand
            ),
        phase: () =>
            import('./commands/write-surface/phase').then(
                (m) => m.phaseCommand
            ),
        plan: () =>
            import('./commands/write-surface/plan').then((m) => m.planCommand),
        roadmap: () =>
            import('./commands/write-surface/roadmap').then(
                (m) => m.roadmapCommand
            ),
        preferences: () =>
            import('./commands/write-surface/preferences').then(
                (m) => m.preferencesCommand
            ),
        todo: () =>
            import('./commands/write-surface/todo').then((m) => m.todoCommand),
        brain: () =>
            import('./commands/write-surface/brain').then(
                (m) => m.brainCommand
            ),
        'pr-review': () =>
            import('./commands/write-surface/pr-review').then(
                (m) => m.prReviewCommand
            ),
        repo: () =>
            import('./commands/write-surface/repo').then((m) => m.repoCommand),
        checks: () =>
            import('./commands/write-surface/checks').then(
                (m) => m.checksCommand
            ),
        branch: () =>
            import('./commands/write-surface/branch').then(
                (m) => m.branchCommand
            ),
        workflow: () =>
            import('./commands/write-surface/workflow').then(
                (m) => m.workflowCommand
            ),
        confidence: () =>
            import('./commands/write-surface/confidence').then(
                (m) => m.confidenceCommand
            ),
        verification: () =>
            import('./commands/write-surface/verification').then(
                (m) => m.verificationCommand
            ),
    },
})

export const runMain = () => cittyRunMain(main)

export const runInit = () => import('./commands/init').then((m) => m.runInit())
