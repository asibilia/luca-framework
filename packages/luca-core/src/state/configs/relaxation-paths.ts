/**
 * A single governance relaxation path: a named enforcement floor and how (if
 * at all) it can be relaxed.
 *
 *   - `gate`      — stable identifier for the enforcement point.
 *   - `floor`     — `'hard'` floors are structurally non-bypassable (no flag,
 *                   no config key, enforced by the pipeline/hook layer);
 *                   `'soft'` floors expose a deliberate, named escape hatch
 *                   (a CLI flag or a config key).
 *   - `flag`      — the literal CLI flag that relaxes a soft floor, if relaxed
 *                   by flag. Verified to exist in `source`.
 *   - `configKey` — the config key that relaxes a soft floor, if relaxed by
 *                   config rather than flag.
 *   - `source`    — repo-relative path to the source of truth for the gate.
 *   - `note`      — optional clarification of scope/caveats.
 */
export type RelaxationPath = {
    gate: string
    floor: 'hard' | 'soft'
    flag?: string
    configKey?: string
    source: string
    note?: string
}

/**
 * The closed enumeration of governance relaxation paths in Luca.
 *
 * This is the single, exhaustive catalogue of every enforcement floor and its
 * (non-)bypass story. `'hard'` entries have NO `flag`/`configKey` because they
 * are structurally non-bypassable — they are listed here precisely to document
 * that no escape hatch exists. `'soft'` entries name the exact flag or config
 * key that relaxes them, each grep-verified against its `source`.
 *
 * It is intentionally a static `readonly` array, NOT a parsed/validated schema:
 * it is authored data, the closed set is the point, and nothing here is parsed
 * from untrusted input.
 */
export const RELAXATION_PATHS: readonly RelaxationPath[] = [
    // ----- Hard floors: structurally non-bypassable -----
    {
        gate: 'pipeline-transition-legality',
        floor: 'hard',
        source: 'packages/luca-core/src/state/configs/pipeline-transitions.ts',
        note: 'Only PIPELINE_TRANSITIONS-legal step moves are permitted; no flag bypasses the transition graph.',
    },
    {
        gate: 'stage-tool-matrix',
        floor: 'hard',
        source: 'packages/luca-core/src/state/configs/stage-tool-matrix.ts',
        note: 'Per-coarse-phase tool-category allow/deny; enforced by the stage-gate hook.',
    },
    {
        gate: 'step-artifact-allowlist',
        floor: 'hard',
        source: 'packages/luca-core/src/state/configs/step-artifacts.ts',
        note: 'Only the artifact(s) legal for the current pipelineStep may be written.',
    },
    {
        gate: 'confidence-gate-ask-pause',
        floor: 'hard',
        source: 'packages/luca-cli/src/commands/write-surface/confidence.ts',
        note: 'Gate-ask routing pauses for a human even in full-auto; the ask cannot be auto-resolved.',
    },
    {
        gate: 'bash-classifier-deny',
        floor: 'hard',
        source: 'packages/luca-cli/src/hook/helpers/classify-bash-command.ts',
        note: 'Bash commands classified as mutating/commit are denied in read-only phases; no flag overrides classification.',
    },

    // ----- Soft floors: deliberate, named escape hatches -----
    {
        gate: 'iteration-caps',
        floor: 'soft',
        configKey: 'complexity',
        flag: '--complexity',
        source: 'packages/luca-core/src/state/configs/budget-matrix.ts',
        note: 'Per-complexity-level budget/iteration limits; raising complexity raises the caps.',
    },
    {
        gate: 'iteration-caps-force',
        floor: 'soft',
        flag: '--force-complex',
        source: 'packages/luca-tools/src/artifacts/skills/lu/index.ts',
        note: 'Forces a high complexity level regardless of the classify score, raising every BUDGET_BY_COMPLEXITY cap (sibling escape hatch to --complexity).',
    },
    {
        gate: 'code-review',
        floor: 'soft',
        flag: '--skip-review',
        configKey: 'workflow.code_review',
        source: 'packages/luca-tools/src/artifacts/skills/phase-execute/index.ts',
        note: 'Pipeline-reachable via /lu execute → Skill(phase-execute): --skip-review flag OR workflow.code_review: false skips the code-review gate entirely.',
    },
    {
        gate: 'uat',
        floor: 'soft',
        flag: '--skip-uat',
        configKey: 'workflow.uat_required',
        source: 'packages/luca-tools/src/artifacts/skills/phase-execute/index.ts',
        note: 'Pipeline-reachable via /lu execute → Skill(phase-execute): --skip-uat flag OR workflow.uat_required: false skips UAT entirely (verification itself still always runs).',
    },
    {
        gate: 'gap-closure-research',
        floor: 'soft',
        flag: '--gaps',
        source: 'packages/luca-tools/src/artifacts/skills/phase-plan/index.ts',
        note: 'STANDALONE phase-plan gap-closure mode — skips research, using verify.json instead. Not a /lu pipeline flag.',
    },
    {
        gate: 'research-step',
        floor: 'soft',
        flag: '--skip-research',
        source: 'packages/luca-tools/src/artifacts/skills/phase-plan/index.ts',
    },
    {
        gate: 'memory-recall',
        floor: 'soft',
        flag: '--skip-memory',
        source: 'packages/luca-tools/src/artifacts/skills/lu/index.ts',
    },
    {
        gate: 'branch-creation',
        floor: 'soft',
        flag: '--skip-branch',
        source: 'packages/luca-tools/src/artifacts/skills/lu/index.ts',
    },
    {
        gate: 'pr-comment-validation',
        floor: 'soft',
        flag: '--skip-validation',
        source: 'packages/luca-tools/src/artifacts/skills/gh-pr-address/index.ts',
    },
    {
        gate: 'oversight-pauses',
        floor: 'soft',
        configKey: 'oversight',
        source: 'packages/luca-tools/src/artifacts/skills/lu/index.ts',
        note: 'checkpoint/human-in-loop pauses; full-auto oversight removes them (gate-ask still pauses).',
    },
    {
        gate: 'verify-skip-standalone',
        floor: 'soft',
        flag: '--skip-verify',
        source: 'packages/luca-tools/src/artifacts/skills/phase-plan/index.ts',
        note: 'STANDALONE phase-plan skill only — the /lu pipeline has no verify bypass.',
    },
]
