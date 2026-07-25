import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The `## Compact Instructions` section header. Presence of this exact header
 * marks the block as already seeded — the guard for idempotent re-runs.
 */
export const COMPACT_INSTRUCTIONS_HEADER = '## Compact Instructions'

/**
 * The managed `## Compact Instructions` block appended to a consumer repo's
 * `CLAUDE.md`. It instructs the next agent, on compaction, to preserve/recall
 * pipeline handoff state by LOOKUP LOCATION — never literal values, since the
 * vault is `null` at init time and the run id is assigned per-run.
 */
export const COMPACT_INSTRUCTIONS_BLOCK =
    `${COMPACT_INSTRUCTIONS_HEADER}\n\n` +
    'When compacting, preserve and recall:\n\n' +
    '- The current `pipelineStep` and `currentPhase` — read `.luca/state.json`.\n' +
    '- The run id — read `.luca/state.json` → `sessionId`.\n' +
    '- The MuninnDB repo vault — read `.luca/config.json` → `muninn.vault`.\n' +
    '- Decisions and blockers for the active phase — recall the MuninnDB memory\n' +
    '  concept `session:phase-boundary-handoff` from the repo vault above.\n'

/**
 * Ensure the consumer repo's `CLAUDE.md` carries the managed
 * `## Compact Instructions` block so the next agent can rehydrate pipeline
 * handoff state after a context compaction.
 *
 * Idempotent: the block is appended only when the `## Compact Instructions`
 * header is absent, so re-running `luca init` never duplicates it and never
 * fights a user-modified copy (an existing header — even edited — is left
 * untouched). Creates `CLAUDE.md` if missing.
 *
 * @param cwd - Project root containing `CLAUDE.md`.
 * @param log - Optional progress logger.
 */
export async function ensureCompactInstructions(
    cwd: string,
    log: (msg: string) => void = () => {}
): Promise<void> {
    const claudeMdPath = join(cwd, 'CLAUDE.md')
    const content = existsSync(claudeMdPath)
        ? await readFile(claudeMdPath, 'utf-8')
        : ''

    // Header present on its own line (even if the user edited the body) →
    // nothing to do. Match on a line boundary so a deeper heading like
    // `### Compact Instructions Notes` never false-positives via substring.
    const headerAlreadyPresent = content
        .split('\n')
        .some((line) => line.trim() === COMPACT_INSTRUCTIONS_HEADER)
    if (headerAlreadyPresent) return

    const leadingGap = content === '' || content.endsWith('\n') ? '' : '\n'
    const blockSeparator = content === '' ? '' : '\n'
    await writeFile(
        claudeMdPath,
        content + leadingGap + blockSeparator + COMPACT_INSTRUCTIONS_BLOCK
    )
    log(`  write: ${claudeMdPath} (+Compact Instructions)`)
}
