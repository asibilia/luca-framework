// Human-readable structured spec of the .luca/ directory contract.
// Used by `luca init`, `luca migrate-planning`, documentation generators,
// and the MCP server's validation layer to advertise the canonical layout.
//
// This object IS the documentation. If the structure changes, update here.

export const LUCA_DIR_CONTRACT = {
    version: 1,
    root: '.luca',
    rootFiles: [
        {
            file: 'state.json',
            purpose:
                'Workflow state (pipelineStep, currentPhase, iteration counters)',
        },
        {
            file: 'config.json',
            purpose:
                'Project config (vault, oversight defaults, complexity defaults)',
        },
        {
            file: 'lock.json',
            purpose: 'Pipeline lock (PID, acquired_at) — prevents concurrent runs',
        },
        {
            file: 'roadmap.md',
            purpose:
                'Active roadmap — GENERATED view of MuninnDB-backed roadmap',
            generated: true,
        },
        {
            file: 'ledger.jsonl',
            purpose: 'Append-only session/event ledger',
        },
    ],
    directories: {
        phases: {
            path: 'phases/',
            description: 'One directory per work phase: <NN-slug>/',
            slugFormat: '<NN>-<kebab-case>',
            slugExamples: ['01-auth-rewrite', '12-ws-reconnect'],
            entries: [
                { file: 'research.md', writtenBy: 'PLANNING (research step)' },
                {
                    file: 'context.md',
                    writtenBy: 'PLANNING (discuss step — user decisions)',
                },
                { file: 'plan.md', writtenBy: 'PLANNING (plan step)' },
                {
                    file: 'plan-review.md',
                    writtenBy: 'PLANNING (plan-review step)',
                },
                {
                    dir: 'execute/',
                    entries: [
                        { file: 'summary.md', writtenBy: 'EXECUTING' },
                        {
                            file: 'progress.jsonl',
                            writtenBy: 'EXECUTING (append-only wave progress)',
                        },
                        {
                            dir: 'waves/',
                            pattern: 'NN.md',
                            writtenBy: 'EXECUTING',
                        },
                    ],
                },
                {
                    dir: 'audits/',
                    pattern: '<reviewer>.md',
                    reviewerFormat: 'kebab-case',
                    reviewerExamples: [
                        'code-review',
                        'security',
                        'architect',
                        'ux',
                    ],
                    writtenBy: 'REVIEWING (one file per reviewer)',
                },
                { file: 'verify.json', writtenBy: 'REVIEWING (verify step)' },
                { file: 'learn.md', writtenBy: 'REVIEWING (learn step)' },
                {
                    file: 'confidence.jsonl',
                    purpose:
                        'Append-only per-phase confidence journal (one JSON object per line)',
                    writtenBy: 'any phase (executor/verifier/reviewer logs)',
                },
            ],
        },
        milestones: {
            path: 'milestones/',
            description:
                'Milestone-close snapshots — versioned files, no subdirectories',
            files: [
                {
                    pattern: '<v$SEMVER>-roadmap.md',
                    purpose: 'Roadmap snapshot at milestone close',
                },
                {
                    pattern: '<v$SEMVER>-audit.md',
                    purpose: 'Milestone audit summary',
                },
                {
                    pattern: '<v$SEMVER>-backlog-snapshot.json',
                    purpose:
                        'Machine-readable backlog export from MuninnDB (for hydrate)',
                },
                {
                    pattern: '<v$SEMVER>-backlog-snapshot.md',
                    purpose:
                        'Human-readable backlog export (recoverable without tooling)',
                },
            ],
        },
        telemetry: {
            path: 'telemetry/',
            description: 'Per-run JSONL event logs',
            pattern: '<runId>.jsonl',
        },
        archive: {
            path: 'archive/',
            description:
                'Phases moved here after milestone close — frozen, never resurfaces',
            entries: 'Mirrors phases/<NN-slug>/ structure',
        },
    },
    rules: [
        'No notes/, drafts/, tmp/, or other ad-hoc directories — if not in the allowlist, it does not exist.',
        'Phase slugs are <NN>-<kebab-case> with zero-padded NN derived from roadmap order — NOT LLM-named.',
        'Audit filenames are fixed by reviewer name (kebab-case) — NOT LLM-named.',
        'Wave files are NN.md (zero-padded) — NOT LLM-named.',
        'roadmap.md is GENERATED from MuninnDB; treat as build output.',
        'LLM never picks a filename: call the matching MCP tool (e.g. luca_phase_write_plan) which computes the path.',
    ],
} as const

export type LucaDirContract = typeof LUCA_DIR_CONTRACT
