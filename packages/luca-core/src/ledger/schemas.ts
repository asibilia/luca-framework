/**
 * Session ledger schema.
 *
 * `.luca/ledger.jsonl` is the append-only history of a workflow session: mode
 * transitions, phase start/complete, verification results, convergence state,
 * and timing. Every entry is stamped with a `runId` so postmortem tooling can
 * isolate a single pipeline run.
 *
 * Ported from luca-mastracode `state/session-ledger.ts` (`LedgerEntry`).
 */
import { z } from 'zod'

/** A single append-only session-ledger event. */
export const LedgerEntrySchema = z.object({
    /** Event timestamp (ISO 8601). */
    timestamp: z.iso.datetime(),
    /** Run identifier — correlates ledger entries with telemetry records. */
    runId: z.string(),
    /** Event name (e.g. `mode-transition`, `phase-complete`). */
    event: z.string(),
    /** Free-form per-event payload. */
    data: z.record(z.string(), z.unknown()),
})

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>
