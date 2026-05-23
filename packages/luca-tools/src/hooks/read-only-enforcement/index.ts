/**
 * read-only-enforcement hook — `PreToolUse` on write-class tool calls.
 *
 * Fires on `Write`, `Edit`, and `NotebookEdit` invocations. The handler
 * loads `.luca/state.json`, calls `enforceReadOnly()` from
 * `@alecsibilia/luca-core/orchestration`, and exits 0 (allow) or 2
 * (block + stderr).
 *
 * Why three separate `defineHook` registrations instead of one with a
 * pipe-OR matcher: Claude Code matchers are per-tool-name strings; the
 * emitter (`compile/emit-hook.ts`) keys hook entries by `event` and
 * lets the harness do the matcher match. A single hook with
 * `matcher: 'Write|Edit|NotebookEdit'` is supported by the harness's
 * regex matching, but emitting three distinct slices makes the merged
 * settings.json easier to reason about (one slice per tool, one entry
 * per matcher) and matches the pattern the hand-written precedent in
 * `packages/luca-framework/.claude/settings.json` used for the
 * pre-restructure stage-gate hook. Three slices also keep timeouts and
 * statusMessages independently tunable later without a refactor.
 *
 * Why NOT Bash: the algorithm's `bash-mutate` class is real, but
 * pre-classifying a Bash command requires the same shell parser the
 * stage-gate hook already ships (`classify-bash-command` in luca-cli).
 * For Phase E-2, scope is narrowed to the three native write tools.
 * The stage-gate hook (luca-cli) covers Bash mutation enforcement via
 * the STAGE_TOOL_MATRIX in REVIEWING/PLANNING phases — defense in
 * depth without re-implementing the parser here. If a future increment
 * needs Bash coverage in this hook, the parser is already available in
 * luca-cli and can be lifted into a shared luca-core helper.
 *
 * Why a separate hook (vs. piggy-backing on the stage-gate hook in
 * luca-cli):
 *
 *   - The stage-gate hook is a luca-cli internal that runs via
 *     `luca hook stage-gate` and depends on every luca-cli code path
 *     being installed. This hook is a portable, declaratively-defined
 *     Claude Code hook compiled by luca-tools, distributable via the
 *     artifact pipeline (`luca init` in Phase F-2). Consumer repos
 *     that don't (yet) install the full luca-cli still get the
 *     read-only contract.
 *   - The algorithm in luca-core is narrower and easier to reason
 *     about than the full matrix — one yes/no per (step, tool).
 *     Surfacing it as its own hook keeps the contract visible in
 *     settings.json.
 *   - Two enforcers on the same call are intentional defense in
 *     depth: either one rejecting is sufficient to block, and both
 *     read from the same canonical state.
 */
import { defineHook } from '../../define/hook.ts'

/**
 * Tool names this hook gates. Single source of truth — the three hook
 * definitions below all reference this list to keep matchers in sync
 * with the handler's classifier (which uses the same identifiers).
 */
const GATED_TOOLS = ['Write', 'Edit', 'NotebookEdit'] as const

/** Common metadata shared across the three per-tool definitions. */
const COMMON = {
    description:
        'PreToolUse guard for native write tools — blocks Write/Edit/NotebookEdit when the current pipelineStep is read-only (PLANNING or REVIEWING).',
    runtime: 'bun-script' as const,
    handler: '.claude/hooks/read-only-enforcement.ts',
    timeoutMs: 5000,
    background: false,
}

export const readOnlyEnforcementWriteHook = defineHook({
    id: 'read-only-enforcement-write',
    event: 'PreToolUse',
    matcher: GATED_TOOLS[0],
    ...COMMON,
})

export const readOnlyEnforcementEditHook = defineHook({
    id: 'read-only-enforcement-edit',
    event: 'PreToolUse',
    matcher: GATED_TOOLS[1],
    ...COMMON,
})

export const readOnlyEnforcementNotebookEditHook = defineHook({
    id: 'read-only-enforcement-notebook-edit',
    event: 'PreToolUse',
    matcher: GATED_TOOLS[2],
    ...COMMON,
})

/**
 * The full set of read-only-enforcement hook definitions, in stable
 * registration order. Re-exported by the hooks barrel for the
 * `ARTIFACTS` manifest.
 */
export const READ_ONLY_ENFORCEMENT_HOOKS = [
    readOnlyEnforcementWriteHook,
    readOnlyEnforcementEditHook,
    readOnlyEnforcementNotebookEditHook,
] as const
