// Barrel exports for the ledger domain.
// Append-only session event log at `.luca/ledger.jsonl`.

export { LedgerEntrySchema } from './schemas.ts'
export type { LedgerEntry } from './schemas.ts'

export {
    appendLedger,
    computeSessionMetrics,
    getLedgerByEvent,
    listRuns,
    readLedger,
    readLedgerForRun,
} from './ledger.ts'
export type {
    AppendLedgerOptions,
    RunSummary,
    SessionMetrics,
} from './ledger.ts'

// Mints `state.sessionId` — the ledger's run-grouping key and the pipeline
// lock's `run_id`. Owned by the ledger domain (not telemetry) so it survives
// retirement of the local telemetry sink.
export { generateRunId } from './helpers/generate-run-id.ts'
